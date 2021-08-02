const fs = require('fs');
const { Eos } = require('@turnpike/vert');
const { expect } = require('chai');

const testName = Eos.Name.from('test');

let foo;

before(async () => {
  const wasm = fs.readFileSync('../build/foo/foo.wasm');
  const abi = fs.readFileSync('../build/foo/foo.abi', 'utf8');

  // contract is considered as being deployed on 'test' account
  foo = new Eos.Contract('test', wasm, abi);
  await foo.vm.ready;
});

beforeEach(() => {
  // reset store
  foo.vm.store = new Eos.TableStore();
});

describe('foo_test', () => {
  it('require authorization', () => {
    try {
      // try storing value with the wrong permission
      foo.actions.store('alice', 1).apply('bob@active');
    } catch (e) {
      expect(e.message).to.equal('missing required authority');
    }
  });

  it('non-negative value', () => {
    try {
      // try storing a negative value
      foo.actions.store('alice', -1).apply('alice@active');
    } catch (e) {
      expect(e.message).to.be.equal('eosio_assert: require non-negative value');
    }
  });

  it('store value normally', () => {
    // if the argument of apply is omitted, it would be considered as `{contract}@active`
    foo.actions.store('test', 2).apply();
    // retrieve a row from table `data` with the scope `test` & the primary key `test`
    const data = foo.tables.data(testName.toBigInt()).get(testName.toBigInt());
    expect(data).to.deep.equal({ owner: testName, value: Eos.Int64.from(2) });
  });
});
