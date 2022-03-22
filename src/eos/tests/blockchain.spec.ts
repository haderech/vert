import fs from "fs";
import { expect } from "chai";
import { Blockchain } from "../blockchain";
import { Asset, Name } from "@greymass/eosio";
import { nameToBigInt, symbolCodeToBigInt } from "../bn";
import { Account } from "../account";
import { eosio_assert } from "../errors";

/**
 * Initialize
 */
const blockchain = new Blockchain()
let eosioToken: Account;

before(async () => {
  eosioToken = await blockchain.createAccount({
    name: Name.from('eosio.token'),
    wasm: fs.readFileSync('contracts/eosio.token/eosio.token.wasm'),
    abi: fs.readFileSync('contracts/eosio.token/eosio.token.abi', 'utf8'),
  })
  await blockchain.createAccount('alice')
  await blockchain.createAccount('bob')
});

beforeEach(() => {
  blockchain.resetStore()
})

/**
 * Helpers
 */
const getStat = (symcode: string) => {
  const symcodeBigInt = symbolCodeToBigInt(Asset.SymbolCode.from(symcode));
  return eosioToken.tables.stat(symcodeBigInt).getJSON(symcodeBigInt)
}

const getAccount = (accountName: string, symcode: string) => {
  const accountBigInt = nameToBigInt(Name.from(accountName));
  const symcodeBigInt = symbolCodeToBigInt(Asset.SymbolCode.from(symcode));
  return eosioToken.tables.accounts(accountBigInt).getJSON(symcodeBigInt)
}

function currency_stats(supply: string, max_supply: string, issuer: string) {
  return {
    supply, max_supply, issuer,
  };
}

function account(balance: string) {
  return {
    balance,
  };
}

/**
 * Tests
 */
describe('eos-vm', () => {
  describe('eosio.token', () => {
    it('create', () => {
      const symcode = 'TKN';

      eosioToken.actions.create(['alice', `1000.000 ${symcode}`]).send();
      expect(getStat(symcode)).to.be.deep.equal(currency_stats('0.000 TKN', '1000.000 TKN', 'alice'))
    });

    it('create: negative_max_supply', () => {
      try {
        eosioToken.actions.create(['alice', '-1000.000 TKN']).send();
      } catch (e) {
        expect(e.message).to.equal(eosio_assert('max-supply must be positive'));
      }
    });

    it('create: symbol_already_exists', () => {
      const action = eosioToken.actions.create(['alice', '100 TKN'])
      
      action.send();

      try {
        action.send();
      } catch (e) {
        expect(e.message).to.equal(eosio_assert('token with symbol already exists'));
      }
    });

    it('create: max_supply', () => {
      const symcode = 'TKN';

      eosioToken.actions.create(['alice', `4611686018427387903 ${symcode}`]).send();
      expect(getStat(symcode)).to.be.deep.equal(currency_stats('0 TKN', '4611686018427387903 TKN', 'alice'))

      try {
        eosioToken.actions.create(['alice', '4611686018427387904 NKT']).send();
      } catch (e) {
        expect(e.message).to.equal(eosio_assert('invalid supply'));
      }
    });

    it('create: max_decimals', () => {
      const symcode = 'TKN';

      eosioToken.actions.create(['alice', `1.000000000000000000 ${symcode}`]).send();

      expect(getStat(symcode)).to.be.deep.equal(currency_stats('0.000000000000000000 TKN', '1.000000000000000000 TKN', 'alice'))

      try {
        eosioToken.actions.create(['alice', '1.0000000000000000000 NKT']).send();
      } catch (e) {
        expect(e.message).to.equal('Encoding error at root<create>.maximum_supply<asset>: Invalid asset symbol, precision too large');
      }
    });

    it('issue', () => {
      const symcode = 'TKN';

      eosioToken.actions.create(['alice', `1000.000 ${symcode}`]).send();
      eosioToken.actions.issue(['alice', `500.000 ${symcode}`, 'hola']).send('alice@active');
      
      expect(getStat(symcode)).to.be.deep.equal(currency_stats('500.000 TKN', '1000.000 TKN', 'alice'))
      expect(getAccount('alice', symcode)).to.be.deep.equal(account('500.000 TKN'))

      try {
        eosioToken.actions.issue(['alice', '500.001 TKN', 'hola']).send('alice@active');
      } catch (e) {
        expect(e.message).to.equal('eosio_assert: quantity exceeds available supply');
      }

      try {
        eosioToken.actions.issue(['alice', '-1.000 TKN', 'hola']).send('alice@active');
      } catch (e) {
        expect(e.message).to.equal('eosio_assert: must issue positive quantity');
      }

      // Check whether action succeeds without exceptions
      eosioToken.actions.issue(['alice', '1.000 TKN', 'hola']).send('alice@active');
    });

    it('transfer', () => {
      const symcode = 'CERO';

      eosioToken.actions.create(['alice', `1000 ${symcode}`]).send();
      eosioToken.actions.issue(['alice', `1000 ${symcode}`, 'hola']).send('alice@active');
      expect(getStat(symcode)).to.be.deep.equal(currency_stats('1000 CERO', '1000 CERO', 'alice'))
      expect(getAccount('alice', symcode)).to.be.deep.equal(account('1000 CERO'))

      eosioToken.actions.transfer(['alice', 'bob', '300 CERO', 'hola']).send('alice@active');
      expect(getAccount('alice', symcode)).to.be.deep.equal(account('700 CERO'))
      expect(getAccount('bob', symcode)).to.be.deep.equal(account('300 CERO'))

      try {
        eosioToken.actions.transfer(['alice', 'bob', '701 CERO', 'hola']).send('alice@active');
      } catch (e) {
        expect(e.message).to.equal('eosio_assert: overdrawn balance');
      }

      try {
        eosioToken.actions.transfer(['alice', 'bob', '-1000 CERO', 'hola']).send('alice@active');
      } catch (e) {
        expect(e.message).to.equal('eosio_assert: must transfer positive quantity');
      }
    });
  });
});