import { VM } from "./vm";
import { TableView } from "./table";
import { API, ABI, Name, NameType, PermissionLevel, PermissionLevelType, Serializer, Transaction, ABIDef } from "@greymass/eosio";
import { nameToBigInt } from "./bn";
import { Blockchain } from "./blockchain";
import { generatePermissions, addInlinePermission } from "./utils";

export type AccountArgs = Omit<Partial<Account>, 'name'|'abi'|'wasm'> & {
  name: NameType,
  abi?: ABIDef | Promise<ABIDef>;
  wasm?: Uint8Array | Promise<Uint8Array>;
  sendsInline?: boolean;
}

function isPromise(promise: any) {  
  return !!promise && typeof promise.then === 'function'
}

export class Account {
  readonly name: Name;
  readonly bc: Blockchain;
  readonly actions: any = {};
  readonly tables: { [key: string]: (scope?: bigint) => TableView } = {};
  readonly permissions: API.v1.AccountPermission[] = [];

  public wasm?: Uint8Array;
  public abi?: ABI;
  public vm?: VM;

  constructor (args: AccountArgs) {
    this.name = Name.from(args.name)
    this.bc = args.bc

    // Permissions
    this.permissions = args.permissions || generatePermissions(this.name)
    if (args.sendsInline) {
      addInlinePermission(this.name, this.permissions)
    }

    if (args.abi && args.wasm) {
      if (isPromise(args.abi) || isPromise(args.wasm)) {
        Promise
          .all([args.abi, args.wasm])
          .then(([abi, wasm]) => this.setContract(abi, wasm))
      } else {
        this.setContract(args.abi as ABIDef, args.wasm as Uint8Array)
      }
    }
  }

  get isContract () {
    return !!this.abi && !!this.wasm
  }

  toBigInt () {
    return nameToBigInt(this.name)
  }

  public async recreateVm () {
    if (this.wasm) {
      this.vm = VM.from(this.wasm, this.bc);
      await this.vm.ready
    }
  }

  setContract (abi: ABIDef, wasm: Uint8Array) {
    this.abi = ABI.from(abi)
    this.wasm = wasm
    this.buildActions()
    this.buildTables()
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
          send: async (authorization?: PermissionLevelType) => {
            await this.bc.applyTransaction(Transaction.from({
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
            }), data)
          }
        }
      }
    });
  }

  buildTables () {
    this.abi.tables.forEach((table) => {
      const resolved = this.abi.resolveType(table.name as string);

      this.tables[resolved.name] = (scope: bigint = nameToBigInt(this.name)): TableView => {
        let tab = this.bc.store.findTable(nameToBigInt(this.name), scope, nameToBigInt(Name.from(resolved.name)));
        if (!tab) {
          tab = this.bc.store.createTable(nameToBigInt(this.name), scope, nameToBigInt(Name.from(resolved.name)), nameToBigInt(this.name))
        }

        return new TableView(tab, this.abi, this.bc);
      }
    });
  }
}