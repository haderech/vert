import {VM} from "./vm";
import {TableStore, TableView} from "./table";
import {ABI, TimePointSec, Name, NameType, PermissionLevel, PermissionLevelType, Serializer, TimePointType} from "@greymass/eosio";

class Action {
  constructor(private vm: VM, private context: VM.Context) {
  }

  apply(args?: Action.ApplyArgsType) {
    if (args) {
      if (typeof args === 'string') {
        this.context.authorization.push(PermissionLevel.from(args));
      } else {
        if (args.authorization !== undefined) {
          for (const perm of args.authorization) {
            this.context.authorization.push(PermissionLevel.from(perm));
          }
        }
        if (args.timestamp !== undefined) {
          this.context.timestamp = TimePointSec.from(args.timestamp);
        }
        if (args.first_receiver !== undefined) {
          this.context.first_receiver = Name.from(args.first_receiver);
        }
      }
    }
    if (args === undefined || this.context.authorization.length === 0) {
      this.context.authorization.push(PermissionLevel.from({
        actor: this.context.receiver,
        permission: Name.from('active'),
      }));
    }
    this.vm.apply(this.context);
  }
}

namespace Action {
  export type ApplyArgsType = ApplyArgs | string;

  export class ApplyArgs {
    first_receiver?: NameType;
    authorization?: (PermissionLevelType | string)[];
    timestamp?: TimePointType;
  }
}

class Contract {
  readonly vm: VM;
  readonly abi: ABI;
  readonly actions: any = {};
  readonly tables: any = {};

  constructor(public readonly name: Name, wasm: Uint8Array | ReadableStream | VM, abi: any, store = new TableStore()) {
    this.vm = VM.from(wasm, store);
    this.abi = ABI.from(abi);

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

        return new Action(this.vm, new VM.Context({
          receiver: Name.from(this.name),
          first_receiver: Name.from(this.name),
          action: Name.from(resolved.name),
          data: serializedData,
        }));
      }
    });

    this.abi.tables.forEach((table) => {
      const resolved = this.abi.resolveType(table.name as string);
      Object.assign(this.tables, {
        [resolved.name]: (scope: bigint): TableView | undefined => {
          const tab = this.vm.store.findTable(BigInt(Name.from(this.name).value.value.toString()), scope, BigInt(Name.from(resolved.name).value.value.toString()));
          if (tab) {
            return new TableView(tab, this.abi);
          }
          return;
        },
      });
    });
  }
}

export {
  Action,
  Contract,
}
