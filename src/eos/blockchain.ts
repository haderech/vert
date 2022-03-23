import { TableStore } from "./table";
import { Name, Transaction, TimePoint, TimePointSec } from "@greymass/eosio";
import { Account, AccountArgs } from "./account";
import { VM } from "./vm";
import log from "loglevel";

export class Blockchain {
  accounts: { [key: string]: Account }
  timestamp: TimePoint
  store: TableStore
  console: string = ''
  actionsQueue: VM.Context[] = []

  constructor ({
    accounts,
    timestamp,
    store
  }: {
    accounts?: { [key: string]: Account },
    timestamp?: TimePoint,
    store?: TableStore
  } = {}) {
    this.accounts = accounts || {}
    this.timestamp = timestamp || TimePoint.fromMilliseconds(0)
    this.store = store || new TableStore()
  }

  public async applyTransaction (transaction: Transaction) {
    await this.resetTransaction()

    this.actionsQueue = transaction.actions.map(action => {
      const contract = this.getAccount(action.account)
      if (!contract || !contract.isContract) {
        throw new Error(`Contract ${action.account} missing for inline action`)
      }

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

  public createAccount(args: string | Omit<AccountArgs, "bc">): Account {
    if (typeof args === "string") {
      args = { name: args }
    }

    args.name = Name.from(args.name)

    const account = new Account({
      ...args,
      bc: this
    })
    
    this.accounts[account.name.toString()] = account
    
    return account
  }

  /**
   * Time
   */
  public setTime (time: TimePoint | TimePointSec) {
    this.timestamp = TimePoint.fromMilliseconds(time.toMilliseconds())
  }
  public addTime (time: TimePoint | TimePointSec) {
    this.timestamp = TimePoint.fromMilliseconds(this.timestamp.toMilliseconds() + time.toMilliseconds())
  }
  public subTime (time: TimePoint | TimePointSec) {
    if (this.timestamp.toMilliseconds() < time.toMilliseconds()) {
      throw new Error(`Blockchain time must not go negative`)
    }
    this.timestamp = TimePoint.fromMilliseconds(this.timestamp.toMilliseconds() - time.toMilliseconds())
  }

  /**
   * Reset
   */
  async resetTransaction () {
    await this.resetVm()
    this.clearConsole()
  }

  async resetVm () {
    await Promise.all(Object.values(this.accounts).map(account => account.recreateVm()))
  }

  public clearConsole () {
    this.console = ''
  }

  public resetStore (store?: TableStore) {
    this.store = store || new TableStore()
  }
}