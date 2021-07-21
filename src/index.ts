import fs from 'fs';
import EosioTokenABI from './eosio.token.json';
import { Dispatcher } from './vert';
import { EosVM } from './eos/vm';
import { nameToBigInt64, symbolCodeToBigInt64 } from './eos/utils';

const bytes = fs.readFileSync('eosio.token.wasm');

let vm: Dispatcher = new EosVM(bytes);

(async () => {
  await vm.ready;
  try {
    vm.setAbi(EosioTokenABI);

    vm.create('eosio', '1000000000.0000 EOS');
    vm.apply('eosio.token', 'eosio.token', 'create');

    vm.issue('eosio', '10000.0000 EOS', '');
    vm.apply('eosio.token', 'eosio.token', 'issue');

    vm.transfer('eosio', 'alice', '1.0000 EOS', '');
    vm.apply('eosio.token', 'eosio.token', 'transfer');

    console.log(vm.getTableRow('eosio.token', nameToBigInt64('alice'), 'accounts', symbolCodeToBigInt64('EOS')));
  } catch (e) {
    console.log(e.message);
  }
})();
