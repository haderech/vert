import fs from "fs";
import path from "path";
import { expect } from "chai";
import { Name } from "@greymass/eosio"
import { Blockchain, nameToBigInt } from "../../dist";

const blockchain = new Blockchain()

const contractName = Name.from('test')
const fixtures = blockchain.createAccount({
  name: contractName,
  wasm: fs.readFileSync(path.join(__dirname, '/fixtures.wasm')),
  abi: fs.readFileSync(path.join(__dirname, '/fixtures.abi'), 'utf8')
});

interface Row {
  owner: string,
  value: number
}

const rows: Row[] = [
  {
    owner: 'owner1',
    value: 1
  },
  {
    owner: 'owner2',
    value: 2
  },
  {
    owner: 'owner3',
    value: 3
  },
  {
    owner: 'owner4',
    value: 4
  },
]

const rowToPrimaryKey = (row: Row) => nameToBigInt(row.owner)
const scope = nameToBigInt(contractName)

describe('fixtures_test', () => {
  it('load values and read value', async () => {
    for (const row of rows) {
      fixtures.tables.data(scope).set(rowToPrimaryKey(row), Name.from(row.owner), row)
    }

    // Test 1 row
    const oneRow = fixtures.tables.data(scope).getTableRow(rowToPrimaryKey(rows[2]))
    expect(oneRow).to.be.deep.eq({
      owner: 'owner3',
      value: 3
    })

    // Get all rows
    const allRows = fixtures.tables.data(scope).getTableRows()
    expect(allRows).to.be.deep.eq(rows)
  });
});
