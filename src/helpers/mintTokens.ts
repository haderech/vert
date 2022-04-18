import { Account } from "../proton"

/**
 * Create a contract, issue tokens, and transfer them to the accounts you want to mint to
 * @param {Account} contract - Account - the contract to mint tokens to
 * @param {string} symbol - The symbol of the token to mint.
 * @param {number} precision - The number of decimal places to use for the token.
 * @param {number} maxSupply - The maximum amount of tokens that can be created.
 * @param {number} amountToMintToEach - The amount of tokens to mint to each account.
 * @param {Account[]} accountsToMintTo - An array of accounts to mint tokens to.
 */
export const mintTokens = async (contract: Account, symbol: string, precision: number, maxSupply: number, amountToMintToEach: number, accountsToMintTo: Account[]) => {
  await contract.actions.create([contract.name, `${maxSupply.toFixed(precision)} ${symbol}`]).send()
  await contract.actions.issue([contract.name, `${maxSupply.toFixed(precision)} ${symbol}`, '']).send()
  for (const accountToMintTo of accountsToMintTo) {
    await contract.actions.transfer([contract.name, accountToMintTo.name, `${amountToMintToEach.toFixed(precision)} ${symbol}`, '']).send()
  }
}
