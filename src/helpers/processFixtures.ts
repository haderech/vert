import { Account, Blockchain } from "../eos"
import { expect } from "chai";
import { createContract } from "./createContract";

export interface Fixtures {
    contracts: {
        name: string,
        path: string,
        sendsInline: boolean,
    }[],
    accounts: string[],
    beforeEach: {
        helper: string
    }[],
    tests: {
        description: string;
        cases: {
            title: string;
            actions: {
                contract: string;
                action: string;
                data: object | any[]
                authorization: string
                expectErrorMessage?: string
            }[],
        }[]
    }[]
}

/* Create Contracts and accounts */
export const processFixtures = (fixture: Fixtures) => {
    const blockchain = new Blockchain()

    const accounts: { [key: string]: Account } = {}
    for (const contract of fixture.contracts) {
        accounts[contract.name.toString()] = createContract(blockchain, contract.name, contract.path, contract.sendsInline)
    }
    for (const account of fixture.accounts) {
        accounts[account] = blockchain.createAccount(account)
    }

    beforeEach(async () => {
        for (const beforeEach of fixture.beforeEach) {
            if (beforeEach.helper === "resetTables") {
                blockchain.resetTables()
            }
        }
    })

    fixture.tests.forEach(test => describe(test.description, () => {
        test.cases.forEach(testCase => it(testCase.title, async () => {
            for (const action of testCase.actions) {
                const promise = accounts[action.contract].actions[action.action](action.data).send(action.authorization)
                if (!action.expectErrorMessage) {
                    await promise
                } else {
                    await promise
                        .then(() => { throw new Error(`Was expecting to fail with ${action.expectErrorMessage}`) })
                        .catch((e: any) => expect(e.message).to.be.deep.eq(action.expectErrorMessage))
                }
            }
        }))
    }))
}