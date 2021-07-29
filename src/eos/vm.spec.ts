import fs from 'fs';
import { expect } from 'chai';
import { EosVM } from './vm';
import { Name, SymbolCode } from './types';
import { Dispatcher } from '../vert';
import { Serializer } from '@greymass/eosio';
import { TableStore } from './table';

const wasm = fs.readFileSync('contracts/eosio.token/eosio.token.wasm');
const abi = JSON.parse(fs.readFileSync('contracts/eosio.token/eosio.token.abi', 'utf8'));

let vm: Dispatcher;

function currency_stats(supply: string, max_supply: string, issuer: string) {
  return Serializer.decode({
    abi: vm.abi,
    type: 'currency_stats',
    object: {
      supply, max_supply, issuer,
    }
  });
}

function account(balance: string) {
  return Serializer.decode({
    abi: vm.abi,
    type: 'account',
    object: {
      balance,
    }
  });
}

before(async () => {
  vm = new EosVM(wasm);
  await vm.ready;
  vm.setAbi(abi);
});

afterEach(() => {
  vm.store = new TableStore();
});

describe('eos-vm', () => {
  describe('eosio.token', () => {
    it('create', () => {
      vm.create('alice', '1000.000 TKN');
      vm.apply('eosio.token', 'eosio.token', 'create');
      const stat = currency_stats('0.000 TKN', '1000.000 TKN', 'alice');
      const symcode = SymbolCode.from('TKN').toBigInt();
      expect(JSON.stringify(vm.getTableRow('eosio.token', symcode, 'stat', symcode))).to.equal(JSON.stringify(stat));
    });

    it('create: negative_max_supply', () => {
      try {
        vm.create('alice', '-1000.000 TKN');
        vm.apply('eosio.token', 'eosio.token', 'create');
      } catch (e) {
        expect(e.message).to.equal('eosio_assert: max-supply must be positive');
      }
    });

    it('create: symbol_already_exists', () => {
      vm.create('alice', '100 TKN');
      vm.apply('eosio.token', 'eosio.token', 'create');
      try {
        vm.create('alice', '100 TKN');
        vm.apply('eosio.token', 'eosio.token', 'create');
      } catch (e) {
        expect(e.message).to.equal('eosio_assert: token with symbol already exists');
      }
    });

    it('create: max_supply', () => {
      vm.create('alice', '4611686018427387903 TKN');
      vm.apply('eosio.token', 'eosio.token', 'create');
      const stat = currency_stats('0 TKN', '4611686018427387903 TKN', 'alice');
      const symcode = SymbolCode.from('TKN').toBigInt();
      expect(JSON.stringify(vm.getTableRow('eosio.token', symcode, 'stat', symcode))).to.equal(JSON.stringify(stat));

      try {
        vm.create('alice', '4611686018427387904 NKT');
        vm.apply('eosio.token', 'eosio.token', 'create');
      } catch (e) {
        expect(e.message).to.equal('eosio_assert: invalid supply');
      }
    });

    it('create: max_decimals', () => {
      vm.create('alice', '1.000000000000000000 TKN');
      vm.apply('eosio.token', 'eosio.token', 'create');
      const stat = currency_stats('0.000000000000000000 TKN', '1.000000000000000000 TKN', 'alice');
      const symcode = SymbolCode.from('TKN').toBigInt();
      expect(JSON.stringify(vm.getTableRow('eosio.token', symcode, 'stat', symcode))).to.equal(JSON.stringify(stat));

      try {
        vm.create('alice', '1.0000000000000000000 NKT');
        vm.apply('eosio.token', 'eosio.token', 'create');
      } catch (e) {
        expect(e.message).to.equal('Encoding error at root<create>.maximum_supply<asset>: Invalid asset symbol, precision too large');
      }
    });

    it('issue', () => {
      vm.create('alice', '1000.000 TKN');
      vm.apply('eosio.token', 'eosio.token', 'create');

      vm.issue('alice', '500.000 TKN', 'hola');
      vm.apply('eosio.token', 'eosio.token', 'issue');
      let stat = currency_stats('500.000 TKN', '1000.000 TKN', 'alice');
      const symcode = SymbolCode.from('TKN').toBigInt();
      expect(JSON.stringify(vm.getTableRow('eosio.token', symcode, 'stat', symcode))).to.equal(JSON.stringify(stat));
      let balance = account('500.000 TKN');
      expect(JSON.stringify(vm.getTableRow('eosio.token', Name.from('alice').toBigInt(), 'accounts', symcode)))
        .to.equal(JSON.stringify(balance));

      try {
        vm.issue('alice', '500.001 TKN', 'hola');
        vm.apply('eosio.token', 'eosio.token', 'issue');
      } catch (e) {
        expect(e.message).to.equal('eosio_assert: quantity exceeds available supply');
      }

      try {
        vm.issue('alice', '-1.000 TKN', 'hola');
        vm.apply('eosio.token', 'eosio.token', 'issue');
      } catch (e) {
        expect(e.message).to.equal('eosio_assert: must issue positive quantity');
      }

      vm.issue('alice', '1.000 TKN', 'hola');
      vm.apply('eosio.token', 'eosio.token', 'issue');
    });

    it('transfer', () => {
      vm.create('alice', '1000 CERO');
      vm.apply('eosio.token', 'eosio.token', 'create');

      vm.issue('alice', '1000 CERO', 'hola');
      vm.apply('eosio.token', 'eosio.token', 'issue');
      let stat = currency_stats('1000 CERO', '1000 CERO', 'alice');
      const symcode = SymbolCode.from('CERO').toBigInt();
      expect(JSON.stringify(vm.getTableRow('eosio.token', symcode, 'stat', symcode))).to.equal(JSON.stringify(stat));
      let balance = account('1000 CERO');
      expect(JSON.stringify(vm.getTableRow('eosio.token', Name.from('alice').toBigInt(), 'accounts', symcode)))
        .to.equal(JSON.stringify(balance));

      vm.transfer('alice', 'bob', '300 CERO', 'hola');
      vm.apply('eosio.token', 'eosio.token', 'transfer');
      balance = account('700 CERO');
      expect(JSON.stringify(vm.getTableRow('eosio.token', Name.from('alice').toBigInt(), 'accounts', symcode)))
        .to.equal(JSON.stringify(balance));
      balance = account('300 CERO');
      expect(JSON.stringify(vm.getTableRow('eosio.token', Name.from('bob').toBigInt(), 'accounts', symcode)))
        .to.equal(JSON.stringify(balance));

      try {
        vm.transfer('alice', 'bob', '701 CERO', 'hola');
        vm.apply('eosio.token', 'eosio.token', 'transfer');
      } catch (e) {
        expect(e.message).to.equal('eosio_assert: overdrawn balance');
      }

      try {
        vm.transfer('alice', 'bob', '-1000 CERO', 'hola');
        vm.apply('eosio.token', 'eosio.token', 'transfer');
      } catch (e) {
        expect(e.message).to.equal('eosio_assert: must transfer positive quantity');
      }
    });
  });
});
