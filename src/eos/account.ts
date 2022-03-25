import { VM } from "./vm";
import { TableView } from "./table";
import { API, ABI, Name, NameType, PermissionLevel, PermissionLevelType, Serializer, Transaction, ABIDef } from "@greymass/eosio";
import { nameToBigInt } from "./bn";
import { Blockchain } from "./blockchain";
import { generatePermissions, addInlinePermission } from "./utils";

export type AccountArgs = Omit<Partial<Account>, 'name'|'abi'> & {
  name: NameType,
  abi?: ABIDef;
  sendsInline?: boolean;
}

export class Account {
  readonly name: Name;
  readonly bc: Blockchain;
  readonly abi?: ABI;
  readonly wasm?: Uint8Array | ReadableStream;
  readonly actions: any = {};
  readonly tables: { [key: string]: (scope?: bigint) => TableView } = {};
  public permissions: API.v1.AccountPermission[];
  public vm?: VM;

  constructor (args: AccountArgs) {
    args.name = Name.from(args.name)

    if (args.abi) {
      args.abi = ABI.from(args.abi)
    }

    if (!args.permissions) {
      args.permissions = generatePermissions(args.name)
    }

    if (args.sendsInline) {
      addInlinePermission(args.name, args.permissions)
    }

    Object.assign(this, args)

    // If contract
    if (this.isContract) {
      this.buildActions()
      this.buildTables()
    }
  }

  get isContract () {
    return !!this.abi
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