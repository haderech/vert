import { VM } from "./vm";
import { TableStore, TableView } from "./table";
import { API, ABI, Authority, Name, NameType, PermissionLevel, PermissionLevelType, Serializer, Transaction } from "@greymass/eosio";
import { nameToBigInt } from "./bn";
import { Blockchain } from "./blockchain";
import { PermissionLevelWeight } from "./types";

export interface AccountArgs {
  name: NameType,
  permissions?: API.v1.AccountPermission[],
  wasm?: Uint8Array | ReadableStream | VM,
  abi?: ABI | string;
  store?: TableStore;
  bc: Blockchain;
  sendsInline?: boolean;
}

export class Account {
  readonly name: Name;
  readonly permissions: API.v1.AccountPermission[];
  readonly bc: Blockchain;

  // Contract only
  readonly abi?: ABI;
  readonly actions?: any = {};
  readonly tables?: any = {};
  readonly vm?: VM;

  constructor (accountArgs: AccountArgs) {
    if (accountArgs.abi) {
      accountArgs.abi = ABI.from(accountArgs.abi)
    }

    if (!accountArgs.permissions) {
      const defaultPerms = [
        { perm_name: 'owner', parent: '' },
        { perm_name: 'active', parent: 'owner' }
      ]
      accountArgs.permissions = defaultPerms.map(({ perm_name, parent }) => API.v1.AccountPermission.from({
        perm_name,
        parent,
        required_auth: Authority.from({
          threshold: 1,
          accounts: [{
            weight: 1,
            permission: PermissionLevel.from({
              actor: accountArgs.name,
              permission: perm_name
            })
          }]
        })
      }))
    }

    if (accountArgs.sendsInline) {
      const activePerm = accountArgs.permissions.find(perm => perm.perm_name.equals(Name.from("active")))
      activePerm.required_auth.accounts.push(PermissionLevelWeight.from({
        weight: 1,
        permission: PermissionLevel.from({
          actor: accountArgs.name,
          permission: 'eosio.code'
        })
      }))
      activePerm.required_auth.sort()
    }

    accountArgs.name = Name.from(accountArgs.name)
    Object.assign(this, accountArgs)

    // If contract
    if (this.isContract) {
      this.buildActions()
      this.buildTables()

      this.vm = VM.from(accountArgs.wasm, this.bc);
    }
  }

  get isContract () {
    return !!this.abi
  }

  toBigInt () {
    return nameToBigInt(this.name)
  }

  buildActions () {
    this.abi.actions.forEach((action) => {
      const resolved = this.abi.resolveType(action.name.toString());
      
      this.actions[resolved.name] = (actionData: any[] | object) => {
        const data: Record<string, any> = {};

        if (Array.isArray(actionData)) {
          actionData.forEach((arg, i) => data[resolved.fields[i].name] = arg);
        } else {
          for (const field of resolved.fields) {
            if (!field.type.isOptional && !actionData.hasOwnProperty(field.name)) {
              throw new Error(`Missing field ${field.name} on action ${action.name}`);
            }
  
            if (actionData.hasOwnProperty(field.name)) {
              data[field.name] = actionData[field.name]
            }
          }
        }

        const serializedData = Serializer.encode({
          abi: this.abi,
          type: action.name as string,
          object: data,
        }).array;

        return {
          send: (authorization?: PermissionLevelType) => {
            this.bc.applyTransaction(Transaction.from({
              actions: [{
                account: this.name,
                name: Name.from(action.name),
                data: serializedData,
                authorization: [PermissionLevel.from(authorization || {
                  actor: this.name,
                  permission: 'active'
                })]
              }],
              expiration: 0,
              ref_block_num: 0,
              ref_block_prefix: 0,
            }))
          }
        }
      }
    });
  }

  buildTables () {
    this.abi.tables.forEach((table) => {
      const resolved = this.abi.resolveType(table.name as string);

      this.tables[resolved.name] = (scope: bigint): TableView | undefined => {
        const tab = this.bc.store.findTable(nameToBigInt(this.name), scope, nameToBigInt(Name.from(resolved.name)));
        if (tab) {
          return new TableView(tab, this.abi);
        }
        return;
      }
    });
  }
}

export function isAuthoritySatisfied (authority: Authority, permission: PermissionLevel) {
  const weight = authority.accounts.reduce((acc, account) => {
    if (account.permission.equals(permission)) {
      acc += account.weight.toNumber()
    }

    return acc
  }, 0)

  return weight >= authority.threshold.toNumber()
}