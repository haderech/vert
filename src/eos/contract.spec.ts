import fs from "fs";
import {expect} from "chai";
import {Contract} from "./contract";
import {Asset, Name, Serializer} from "./@greymass-eosio";
import {TableStore} from "./table";

let eosioToken;

const wasm = fs.readFileSync('contracts/eosio.token/eosio.token.wasm');
const abi = fs.readFileSync('contracts/eosio.token/eosio.token.abi', 'utf8');

before(async () => {
  eosioToken = new Contract('eosio.token', wasm, abi);
  await eosioToken.vm.ready;
});

afterEach(() => {
  eosioToken.vm.store = new TableStore();
});

describe('eos-vm', () => {
  describe('eosio.token', () => {
    it('create', () => {
      const symcode = Asset.SymbolCode.from('TKN').toBigInt();

      eosioToken.actions.create('alice', '1000.000 TKN').apply();
      expectSameObjects(
        eosioToken.tables.stat(symcode).get(symcode),
        currency_stats('0.000 TKN', '1000.000 TKN', 'alice')
      );
    });

    it('create: negative_max_supply', () => {
      try {
        eosioToken.actions.create('alice', '-1000.000 TKN').apply();
      } catch (e) {
        expect(e.message).to.equal('eosio_assert: max-supply must be positive');
      }
    });

    it('create: symbol_already_exists', () => {
      eosioToken.actions.create('alice', '100 TKN').apply();
      try {
        eosioToken.actions.create('alice', '100 TKN').apply();
      } catch (e) {
        expect(e.message).to.equal('eosio_assert: token with symbol already exists');
      }
    });

    it('create: max_supply', () => {
      const symcode = Asset.SymbolCode.from('TKN').toBigInt();

      eosioToken.actions.create('alice', '4611686018427387903 TKN').apply();
      expectSameObjects(
        eosioToken.tables.stat(symcode).get(symcode),
        currency_stats('0 TKN', '4611686018427387903 TKN', 'alice'),
      );

      try {
        eosioToken.actions.create('alice', '4611686018427387904 NKT').apply();
      } catch (e) {
        expect(e.message).to.equal('eosio_assert: invalid supply');
      }
    });

    it('create: max_decimals', () => {
      const symcode = Asset.SymbolCode.from('TKN').toBigInt();

      eosioToken.actions.create('alice', '1.000000000000000000 TKN').apply();
      expectSameObjects(
        eosioToken.tables.stat(symcode).get(symcode),
        currency_stats('0.000000000000000000 TKN', '1.000000000000000000 TKN', 'alice'),
      );

      try {
        eosioToken.actions.create('alice', '1.0000000000000000000 NKT').apply();
      } catch (e) {
        expect(e.message).to.equal('Encoding error at root<create>.maximum_supply<asset>: Invalid asset symbol, precision too large');
      }
    });

    it('issue', () => {
      const symcode = Asset.SymbolCode.from('TKN').toBigInt();

      eosioToken.actions.create('alice', '1000.000 TKN').apply();

      eosioToken.actions.issue('alice', '500.000 TKN', 'hola').apply('alice@active');
      expectSameObjects(
        eosioToken.tables.stat(symcode).get(symcode),
        currency_stats('500.000 TKN', '1000.000 TKN', 'alice'),
      );
      expectSameObjects(
        eosioToken.tables.accounts(Name.from('alice').toBigInt()).get(symcode),
        account('500.000 TKN')
      );

      try {
        eosioToken.actions.issue('alice', '500.001 TKN', 'hola').apply('alice@active');
      } catch (e) {
        expect(e.message).to.equal('eosio_assert: quantity exceeds available supply');
      }

      try {
        eosioToken.actions.issue('alice', '-1.000 TKN', 'hola').apply('alice@active');
      } catch (e) {
        expect(e.message).to.equal('eosio_assert: must issue positive quantity');
      }

      // Check whether action succeeds without exceptions
      eosioToken.actions.issue('alice', '1.000 TKN', 'hola').apply('alice@active');
    });

    it('transfer', () => {
      const symcode = Asset.SymbolCode.from('CERO').toBigInt();

      eosioToken.actions.create('alice', '1000 CERO').apply();

      eosioToken.actions.issue('alice', '1000 CERO', 'hola').apply('alice@active');
      expectSameObjects(
        eosioToken.tables.stat(symcode).get(symcode),
        currency_stats('1000 CERO', '1000 CERO', 'alice')
      );
      expectSameObjects(
        eosioToken.tables.accounts(Name.from('alice').toBigInt()).get(symcode),
        account('1000 CERO')
      );

      eosioToken.actions.transfer('alice', 'bob', '300 CERO', 'hola').apply('alice@active');
      expectSameObjects(
        eosioToken.tables.accounts(Name.from('alice').toBigInt()).get(symcode),
        account('700 CERO')
      );
      expectSameObjects(
        eosioToken.tables.accounts(Name.from('bob').toBigInt()).get(symcode),
        account('300 CERO')
      );

      try {
        eosioToken.actions.transfer('alice', 'bob', '701 CERO', 'hola').apply('alice@active');
      } catch (e) {
        expect(e.message).to.equal('eosio_assert: overdrawn balance');
      }

      try {
        eosioToken.actions.transfer('alice', 'bob', '-1000 CERO', 'hola').apply('alice@active');
      } catch (e) {
        expect(e.message).to.equal('eosio_assert: must transfer positive quantity');
      }
    });
  });
});

function currency_stats(supply: string, max_supply: string, issuer: string) {
  return Serializer.decode({
    abi: abi,
    type: 'currency_stats',
    object: {
      supply, max_supply, issuer,
    }
  });
}

function account(balance: string) {
  return Serializer.decode({
    abi: abi,
    type: 'account',
    object: {
      balance,
    }
  });
}

function expectSameObjects(a: any, b: any) {
  expect(JSON.stringify(a)).to.equal(JSON.stringify(b));
}
