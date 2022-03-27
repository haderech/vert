import * as fs from "fs";
import { Name, NameType } from "@greymass/eosio";
import fetch from "cross-fetch"
import { Blockchain } from "../eos";

/**
 * It reads a file from the file system or from the network and returns it as a Uint8Array
 * @param {string} fileName - The name of the file to read.
 * @returns A promise of a Uint8Array.
 */
export const readWasm = async (fileName: string): Promise<Uint8Array> => {
    if (!!fs.readFileSync) {
        return fs.readFileSync(fileName)
    } else {
        const res = await fetch(fileName)
        return Buffer.from(await res.arrayBuffer())
    }
}

/**
 * It reads the contents of a file and returns it as a string.
 * @param {string} fileName - The path to the ABI file.
 * @returns The ABI of the contract.
 */
export const readAbi = async (fileName: string): Promise<string> => {
    if (!!fs.readFileSync) {
        return fs.readFileSync(fileName, 'utf8')
    } else {
        const res = await fetch(fileName)
        return res.text()
    }
}

/**
 * Create a new account with the given name, wasm, and abi
 * @param {Blockchain} bc - Blockchain - the blockchain to create the contract on
 * @param {NameType} name - Name of the contract.
 * @param {string} folder - The folder name of the contract.
 * @param [sendsInline=false] - If true, the contract will send inline. If false, it will send to a new
 * account.
 * @returns The contract account.
 */
export const createContract = (bc: Blockchain, name: NameType, folder: string, sendsInline = false) => {
    return bc.createAccount({
        name: Name.from(name),
        wasm: readWasm(`${folder}.wasm`),
        abi: readAbi(`${folder}.abi`),
        sendsInline
    });
}
  
/**
 * Create a list of accounts
 * @param {Blockchain} bc - Blockchain - The blockchain that the accounts will be created on.
 * @param {string[]} accounts - An array of account names.
 * @returns An array of accounts.
 */
export const createAccounts = (bc: Blockchain, ...accounts: string[]) => {
    const createdAccounts = []
    for (const account of accounts) {
        createdAccounts.push(bc.createAccount(account))
    }
    return createdAccounts
};
  