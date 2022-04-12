import fs from "fs";
import path from "path";
import { expect } from "chai";
import { Name, Int64 } from "@greymass/eosio"
import { Blockchain, nameToBigInt, proton_assert } from "../../dist";

const blockchain = new Blockchain()

const testName = Name.from('test')
const foo = blockchain.createAccount({
  name: testName,
  wasm: fs.readFileSync(path.join(__dirname, '/foo.wasm')),
  abi: fs.readFileSync(path.join(__dirname, '/foo.abi'), 'utf8')
});
blockchain.createAccount('alice')
blockchain.createAccount('bob')

beforeEach(() => {
  blockchain.resetTables()
});

describe('foo_test', () => {
  it('require authorization', async () => {
    try {
      // try storing value with the wrong permission
      await foo.actions.store(['alice', 1]).send('bob@active');
    } catch (e) {
      expect(e.message).to.equal('missing required authority alice');
    }
  });

  it('non-negative value', async () => {
    try {
      // try storing a negative value
      await foo.actions.store(['alice', -1]).send('alice@active');
    } catch (e) {
      expect(e.message).to.equal(proton_assert('require non-negative value'));
    }
  });

  it('store value normally', async () => {
    // if the argument of apply is omitted, it would be considered as `{contract}@active`
    await foo.actions.store(['test', 2]).send();
    
    // retrieve a row from table `data` with the scope `test` & the primary key `test`
    const data = foo.tables.data(nameToBigInt(testName)).get(nameToBigInt(testName));
    expect(data).to.deep.equal({ owner: testName, value: Int64.from(2) });
  });
});
