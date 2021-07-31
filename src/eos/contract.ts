import {VM} from "./vm";
import {TableStore, TableView} from "./table";
import {ABI, Name, Serializer} from "./@greymass-eosio";

class Action {
  constructor(private vm: VM, private context: VM.Context) {
  }

  apply() {
    this.vm.apply(this.context);
  }
}

class Contract {
  readonly vm: VM;
  readonly abi: ABI;
  readonly actions: any = {};
  readonly tables: any = {};

  constructor(name: string, wasm: Uint8Array, abi: ABI | string, store?: TableStore);
  constructor(name: string, wasm: VM, abi: ABI | string, store?: TableStore);
  constructor(public readonly name: string, wasm: any, abi: ABI | string, store = new TableStore()) {
    if (wasm instanceof VM) {
      this.vm = wasm;
    } else {
      this.vm = new VM(wasm, store);
    }
    if (typeof abi === 'string') {
      this.abi = ABI.from(JSON.parse(abi));
    } else {
      this.abi = abi;
    }

    this.abi.actions.forEach((action) => {
      const resolved = this.abi.resolveType(action.name as string);
      Object.assign(this.actions, {
        [resolved.name]: (...args: any[]) => {
          const data: Record<string, any> = {};
          args.forEach((arg, i) => data[resolved.fields[i].name] = arg);
          const serializedData = Serializer.encode({
            abi: this.abi,
            type: action.name as string,
            object: data,
          }).array;
          return new Action(this.vm, new VM.Context({
            receiver: Name.from(this.name).toBigInt(),
            first_receiver: Name.from(this.name).toBigInt(),
            action: Name.from(resolved.name).toBigInt(),
            data: serializedData,
          }));
        }
      });
    });

    this.abi.tables.forEach((table) => {
      const resolved = this.abi.resolveType(table.name as string);
      Object.assign(this.tables, {
        [resolved.name]: (scope: bigint): TableView | undefined => {
          const tab = this.vm.store.findTable(Name.from(this.name).toBigInt(), scope, Name.from(resolved.name).toBigInt());
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
