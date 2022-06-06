import fs from "fs";
import { expect } from "chai";
import { Asset, Name } from "@greymass/eosio";
import { Blockchain } from "../blockchain";
import { nameToBigInt, symbolCodeToBigInt } from "../bn";
import { protonAssert } from "../errors";

/**
 * Initialize
 */
const blockchain = new Blockchain()
const eosioToken = blockchain.createAccount({
  name: Name.from('eosio.token'),
  wasm: fs.readFileSync('contracts/eosio.token/eosio.token.wasm'),
  abi: fs.readFileSync('contracts/eosio.token/eosio.token.abi', 'utf8'),
});
blockchain.createAccount('alice')
blockchain.createAccount('bob')

beforeEach(() => {
  blockchain.resetTables()
})

/**
 * Helpers
 */
const getStat = (symcode: string) => {
  const symcodeBigInt = symbolCodeToBigInt(Asset.SymbolCode.from(symcode));
  return eosioToken.tables.stat(symcodeBigInt).getTableRow(symcodeBigInt)
}

const getAccount = (accountName: string, symcode: string) => {
  const accountBigInt = nameToBigInt(Name.from(accountName));
  const symcodeBigInt = symbolCodeToBigInt(Asset.SymbolCode.from(symcode));
  return eosioToken.tables.accounts(accountBigInt).getTableRow(symcodeBigInt)
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
    it('create', async () => {
      const symcode = 'TKN';

      await eosioToken.actions.create(['alice', `1000.000 ${symcode}`]).send();
      expect(getStat(symcode)).to.be.deep.equal(currency_stats('0.000 TKN', '1000.000 TKN', 'alice'))
    });

    it('create: negative_max_supply', async () => {
      try {
        await eosioToken.actions.create(['alice', '-1000.000 TKN']).send();
      } catch (e) {
        expect(e.message).to.equal(protonAssert('max-supply must be positive'));
      }
    });

    it('create: symbol_already_exists', async () => {
      const action = eosioToken.actions.create(['alice', '100 TKN'])
      
      await action.send();

      try {
        await action.send();
      } catch (e) {
        expect(e.message).to.equal(protonAssert('token with symbol already exists'));
      }
    });

    it('create: max_supply', async () => {
      const symcode = 'TKN';

      await eosioToken.actions.create(['alice', `4611686018427387903 ${symcode}`]).send();
      expect(getStat(symcode)).to.be.deep.equal(currency_stats('0 TKN', '4611686018427387903 TKN', 'alice'))

      try {
        await eosioToken.actions.create(['alice', '4611686018427387904 NKT']).send();
      } catch (e) {
        expect(e.message).to.equal(protonAssert('invalid supply'));
      }
    });

    it('create: max_decimals', async () => {
      const symcode = 'TKN';

      await eosioToken.actions.create(['alice', `1.000000000000000000 ${symcode}`]).send();

      expect(getStat(symcode)).to.be.deep.equal(currency_stats('0.000000000000000000 TKN', '1.000000000000000000 TKN', 'alice'))

      try {
        await eosioToken.actions.create(['alice', '1.0000000000000000000 NKT']).send();
      } catch (e) {
        expect(e.message).to.equal('Encoding error at root<create>.maximum_supply<asset>: Invalid asset symbol, precision too large');
      }
    });

    it('issue', async () => {
      const symcode = 'TKN';

      await eosioToken.actions.create(['alice', `1000.000 ${symcode}`]).send();
      await eosioToken.actions.issue(['alice', `500.000 ${symcode}`, 'hola']).send('alice@active');
      
      expect(getStat(symcode)).to.be.deep.equal(currency_stats('500.000 TKN', '1000.000 TKN', 'alice'))
      expect(getAccount('alice', symcode)).to.be.deep.equal(account('500.000 TKN'))

      try {
        await eosioToken.actions.issue(['alice', '500.001 TKN', 'hola']).send('alice@active');
      } catch (e) {
        expect(e.message).to.equal(protonAssert('quantity exceeds available supply'));
      }

      try {
        await eosioToken.actions.issue(['alice', '-1.000 TKN', 'hola']).send('alice@active');
      } catch (e) {
        expect(e.message).to.equal(protonAssert('must issue positive quantity'));
      }

      // Check whether action succeeds without exceptions
      await eosioToken.actions.issue(['alice', '1.000 TKN', 'hola']).send('alice@active');
    });

    it('transfer', async () => {
      const symcode = 'CERO';

      await eosioToken.actions.create(['alice', `1000 ${symcode}`]).send();
      await eosioToken.actions.issue(['alice', `1000 ${symcode}`, 'hola']).send('alice@active');
      expect(getStat(symcode)).to.be.deep.equal(currency_stats('1000 CERO', '1000 CERO', 'alice'))
      expect(getAccount('alice', symcode)).to.be.deep.equal(account('1000 CERO'))

      await eosioToken.actions.transfer(['alice', 'bob', '300 CERO', 'hola']).send('alice@active');
      expect(getAccount('alice', symcode)).to.be.deep.equal(account('700 CERO'))
      expect(getAccount('bob', symcode)).to.be.deep.equal(account('300 CERO'))

      try {
        await eosioToken.actions.transfer(['alice', 'bob', '701 CERO', 'hola']).send('alice@active');
      } catch (e) {
        expect(e.message).to.equal(protonAssert('overdrawn balance'));
      }

      try {
        await eosioToken.actions.transfer(['alice', 'bob', '-1000 CERO', 'hola']).send('alice@active');
      } catch (e) {
        expect(e.message).to.equal(protonAssert('must transfer positive quantity'));
      }
    });
  });
});