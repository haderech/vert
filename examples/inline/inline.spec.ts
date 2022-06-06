import fs from "fs";
import path from "path";
import { expect } from "chai";
import { Blockchain } from "../../dist";
import { Name, PermissionLevel, Serializer, Transaction, UInt64 } from "@greymass/eosio"

const blockchain = new Blockchain()

const strToAccount = (str: string) => blockchain.createAccount({
  name: str,
  wasm: fs.readFileSync(path.join(__dirname, `output/${str}.wasm`)),
  abi: fs.readFileSync(path.join(__dirname, `output/${str}.abi`), 'utf8'),
  sendsInline: true
})

const accounts = {}
const accountz = ['r1', 'r2', 'i11', 'i14', 'i21', 'i112', 'i121', 'i131', 'i141', 'i1211', 'i1222', 'n12', 'n13', 'n22', 'n111', 'n122', 'n132', 'n142', 'n1212', 'n1221']

for (const account of accountz) {
  accounts[account] =  strToAccount(account);
}

beforeEach(() => {
  blockchain.resetTables()
});

describe('inlines_test', () => {
  it('check inline action and recipient ordering', async () => {
    const serializedData = Serializer.encode({
      abi: accounts['r1'].abi,
      type: 'send',
      object: { value: 3 },
    }).array;

    await blockchain.applyTransaction(Transaction.from({
      expiration: 0,
      ref_block_num: 0,
      ref_block_prefix: 0,
      actions: [
        {
          account: Name.from('r1'),
          name: Name.from('send'),
          authorization: [PermissionLevel.from({
            actor: 'r1',
            permission: 'active'
          })],
          data: serializedData
        },
        {
          account: Name.from('r2'),
          name: Name.from('send'),
          authorization: [PermissionLevel.from({
            actor: 'r2',
            permission: 'active'
          })],
          data: serializedData
        }
      ]
    }, Object.entries(accounts).map(([_, __]: any) => {
      __.abi.contract = _
      return __.abi
    })))

    expect(blockchain.console).to.eq(" 1  5  12  9  14  10  2  3  4  15  17  16  6  8  7  13  11  18  20  19 ")
  });
});