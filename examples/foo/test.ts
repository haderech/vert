import fs from "fs";
import { expect } from "chai";
import { Name, Int64 } from "@greymass/eosio"
import { Eos } from "../../";

const { Contract, TableStore, nameToBigInt } = Eos;

const testName = Name.from('test');

let foo;

const wasm = fs.readFileSync('foo.wasm');
const abi = fs.readFileSync('foo.abi', 'utf8');

before(async () => {
  foo = new Contract(testName, wasm, abi);
  await foo.vm.ready;
});

beforeEach(() => {
  // reset store
  foo.vm.store = new TableStore();
});

describe('foo_test', () => {
  it('require authorization', () => {
    try {
      // try storing value with the wrong permission
      foo.actions.store(['alice', 1]).apply('bob@active');
    } catch (e) {
      expect(e.message).to.equal('missing required authority');
    }
  });

  it('non-negative value', () => {
    try {
      // try storing a negative value
      foo.actions.store(['alice', -1]).apply('alice@active');
    } catch (e) {
      expect(e.message).to.equal('eosio_assert: require non-negative value');
    }
  });

  it('store value normally', () => {
    // if the argument of apply is omitted, it would be considered as `{contract}@active`
    foo.actions.store(['test', 2]).apply();
    // retrieve a row from table `data` with the scope `test` & the primary key `test`
    const data = foo.tables.data(nameToBigInt(testName)).get(nameToBigInt(testName));
    expect(data).to.deep.equal({ owner: testName, value: Int64.from(2) });
  });
});
