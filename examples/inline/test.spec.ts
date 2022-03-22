import fs from "fs";
import { expect } from "chai";
import { Eos } from "../../dist";

const { Blockchain } = Eos;

const blockchain = new Blockchain()

let sender, receiver, notified1, notified2, notified3, notified4;

const strToAccount = (str: string, inline: boolean = false) => blockchain.createAccount({
  name: str,
  wasm: fs.readFileSync(`${str}.wasm`),
  abi: fs.readFileSync(`${str}.abi`, 'utf8'),
  sendsInline: inline
})

before(async () => {
  sender = await strToAccount('sender', true);
  receiver = await strToAccount('receiver');
  notified1 = await strToAccount('notified1', true)
  notified2 = await strToAccount('notified2', true)
  notified3 = await strToAccount('notified3')
  notified4 = await strToAccount('notified4')
});

beforeEach(() => {
  blockchain.resetStore()
});

describe('inlines_test', () => {
  it('check inline action and recipient ordering', () => {
    sender.actions.send1(['sender', 0]).send();
    expect(blockchain.console).to.eq(" 1  2  3  4  5  6  7  8  9  10 ")
  });
});
