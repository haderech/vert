import fs from "fs";
import path from "path";
import { expect } from "chai";
import { Blockchain } from "../../dist";

const blockchain = new Blockchain()

const strToAccount = (str: string, inline: boolean = false) => blockchain.createAccount({
  name: str,
  wasm: fs.readFileSync(path.join(__dirname, `/${str}.wasm`)),
  abi: fs.readFileSync(path.join(__dirname, `/${str}.abi`), 'utf8'),
  sendsInline: inline
})

const sender = strToAccount('sender', true);
const receiver = strToAccount('receiver');
const notified1 = strToAccount('notified1', true)
const notified2 = strToAccount('notified2', true)
const notified3 = strToAccount('notified3')
const notified4 = strToAccount('notified4')


beforeEach(() => {
  blockchain.resetTables()
});

describe('inlines_test', () => {
  it('check inline action and recipient ordering', async () => {
    await sender.actions.send1(['sender', 0]).send();
    expect(blockchain.console).to.eq(" 1  2  3  4  5  6  7  8  9  10 ")
  });
});
