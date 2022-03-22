import fs from "fs";
import { expect } from "chai";
import { Name, Int64 } from "@greymass/eosio"
import { Eos } from "../../dist";

const { Blockchain, nameToBigInt } = Eos;

const testName = Name.from('test');

let foo;

const wasm = fs.readFileSync('foo.wasm');
const abi = fs.readFileSync('foo.abi', 'utf8');

const blockchain = new Blockchain()

before(async () => {
  foo = await blockchain.createAccount({
    name: testName,
    wasm,
    abi
  })
  await blockchain.createAccount('alice')
  await blockchain.createAccount('bob')
});

beforeEach(() => {
  blockchain.resetStore()
});

describe('foo_test', () => {
  it('require authorization', () => {
    try {
      // try storing value with the wrong permission
      foo.actions.store(['alice', 1]).send('bob@active');
    } catch (e) {
      expect(e.message).to.equal('missing required authority');
    }
  });

  it('non-negative value', () => {
    try {
      // try storing a negative value
      foo.actions.store(['alice', -1]).send('alice@active');
    } catch (e) {
      expect(e.message).to.equal('eosio_assert: require non-negative value');
    }
  });

  it('store value normally', () => {
    // if the argument of apply is omitted, it would be considered as `{contract}@active`
    foo.actions.store(['test', 2]).send();
    // retrieve a row from table `data` with the scope `test` & the primary key `test`
    const data = foo.tables.data(nameToBigInt(testName)).get(nameToBigInt(testName));
    expect(data).to.deep.equal({ owner: testName, value: Int64.from(2) });
  });
});
