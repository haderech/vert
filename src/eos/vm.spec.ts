import fs from 'fs';
import { expect } from 'chai';
import { EosVM } from './vm';
import { Name, SymbolCode, Int64 } from './types';
import { Dispatcher } from '../vert';

const wasm = fs.readFileSync('contracts/eosio.token/eosio.token.wasm');
const abi = JSON.parse(fs.readFileSync('contracts/eosio.token/eosio.token.abi', 'utf8'));

let vm: Dispatcher;

before(async () => {
  vm = new EosVM(wasm);
  await vm.ready;
  vm.setAbi(abi);
});

describe('eos-vm', () => {
  it('eosio.token', () => {
    vm.create('eosio', '1000000000.0000 EOS');
    vm.apply('eosio.token', 'eosio.token', 'create');

    vm.issue('eosio', '10000.0000 EOS', '');
    vm.apply('eosio.token', 'eosio.token', 'issue');

    vm.transfer('eosio', 'alice', '1.0000 EOS', '');
    vm.apply('eosio.token', 'eosio.token', 'transfer');

    const obj = vm.getTableRow('eosio.token', Name.from('alice').toBigInt(), 'accounts', SymbolCode.from('EOS').toBigInt());
    expect(obj.balance.units).to.deep.equal(Int64.from(10000n));
  });
});
 
