import {TableStore} from "./table";
import {Name, BlockTimestamp, Transaction, Serializer} from "@greymass/eosio";
import {Account, AccountArgs} from "./account";
import { VM } from "./vm";
import log from "loglevel";

export class Blockchain {
  accounts: { [key: string]: Account }
  timestamp: BlockTimestamp
  store: TableStore
  console: string = ''
  actionsQueue: VM.Context[] = []

  constructor ({
    accounts,
    timestamp,
    store
  }: {
    accounts?: { [key: string]: Account },
    timestamp?: BlockTimestamp,
    store?: TableStore
  } = {}) {
    this.accounts = accounts || {}
    this.timestamp = timestamp || BlockTimestamp.from(0)
    this.store = store || new TableStore()
  }

  applyTransaction (transaction: Transaction) {
    this.actionsQueue = transaction.actions.map(action => {
      const contract = this.getAccount(action.account)
      if (!contract || !contract.isContract) {
        throw new Error(`Contract ${action.account} missing for inline action`)
      }

      this.clearConsole()

      return new VM.Context({
        receiver: contract,
        firstReceiver: contract,
        action: action.name,
        data: action.data.array,
        authorization: action.authorization
      })
    })

    while(this.actionsQueue.length) {
      const action = this.actionsQueue.shift()
      log.debug(`\n\nSTART ACTION: ${action.receiver.name}::${action.action}`)
      action.receiver.vm.apply(action)
    }
  }

  public getAccount(name: Name): Account | undefined {
    return this.accounts[name.toString()]
  }

  public async createAccount(args: string | Omit<AccountArgs, "bc">): Promise<Account> {
    if (typeof args === "string") {
      args = { name: args }
    }

    args.name = Name.from(args.name)

    const account = new Account({
      ...args,
      bc: this
    })
    if (account.isContract) {
      await account.vm.ready;
    }
    
    this.accounts[account.name.toString()] = account
    
    return account
  }

  public resetStore (store?: TableStore) {
    this.store = store || new TableStore()
  }

  public clearConsole () {
    this.console = ''
  }
}