import {CreateItemChange, DeleteItemChange, PrefixedStore, Store, StoreChange} from "../store";
import {log} from "../vert";
import BTree from "sorted-btree";
import {ABI, Name, Serializer, UInt64} from "@greymass/eosio";
import Buffer from "../buffer";
import { bigIntToBn, nameToBigInt } from "./bn";
import { Blockchain } from "./blockchain";

class KeyValueObject {
  id: number = 0;
  tableId: number;
  primaryKey: bigint;
  payer: bigint;
  value: Uint8Array;

  constructor (args: Partial<KeyValueObject>) {
    Object.assign(this, args)
  }

  clone(): KeyValueObject {
    const kv = new KeyValueObject({
      id: this.id,
      tableId: this.tableId,
      primaryKey: this.primaryKey,
      payer: this.payer,
      value: this.value
    });

    return kv;
  }
}

class Table extends PrefixedStore<bigint,KeyValueObject> {
  private _code: bigint;
  private _scope: bigint;
  private _table: bigint;
  private payer: bigint;
  private _prefix?: Buffer;
  private seq = 0;
  private _size = 0;

  static serializePrefix(code: bigint, scope: bigint, table: bigint): Buffer {
    let buf = Buffer.alloc(24);
    buf.writeBigUInt64BE(code);
    buf.writeBigUInt64BE(scope, 8);
    buf.writeBigUInt64BE(table, 16);
    return buf;
  }

  static bigintToBuffer(v: bigint): Buffer {
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64BE(v);
    return buffer;
  }

  constructor(store: TableStore, options?: any) {
    super(store, options);
    this._code = options.code;
    this._scope = options.scope;
    this._table = options.table;
    this.payer = options.payer;
    this._prefix = options.prefix;
  }

  get code(): bigint {
    return this._code;
  }

  get scope(): bigint {
    return this._scope;
  }

  get table(): bigint {
    return this._table;
  }

  get size(): number {
    return this._size;
  }

  prefix(): Buffer {
    if (!this._prefix) {
      this._prefix = Table.serializePrefix(this.code, this.scope, this.table);
    }
    return this._prefix;
  }

  key(key: bigint) {
    return Buffer.concat([this.prefix(), Table.bigintToBuffer(key)]);
  }

  lowestKey(): bigint {
    return 0n;
  }

  highestKey(): bigint {
    return 18446744073709551615n;
  }

  parsePrefix(key: Buffer) {
    return key.slice(0, 24);
  }

  set(key: bigint, value: KeyValueObject) {
    const prev = this.get(key);
    super.set(key, value);
    if (!prev) {
      value.id = this.seq++;
      this._size++;
    }
  }

  delete(key: bigint) {
    super.delete(key);
    this._size--;
    if (this._size === 0) {
      this.store.deletePrefix(this.prefix());
    }
  }

  has(key: bigint) {
    return !!this.get(key);
  }

  revert(change: StoreChange) {
    if (change instanceof CreateItemChange) {
      this.seq--;
      this._size--;
    } else if (change instanceof DeleteItemChange) {
      this._size++;
    }
  }
}

class IndexObject<K> implements IndexKey<K> {
  tableId: number;
  primaryKey: bigint;
  payer: bigint;
  secondaryKey: K;

  static compareTable(a, b) {
    return (a.tableId < b.tableId) ? -1 : (a.tableId > b.tableId) ? 1 : 0;
  }

  static compare(a, b): number {
    return IndexObject.compareTable(a, b) ||
      ((a.primaryKey < b.primaryKey) ? -1 : (a.primaryKey > b.primaryKey) ? 1 : 0);
  }

  static comparePrimitives(a, b) {
    return IndexObject.compareTable(a, b) ||
      ((a.secondaryKey < b.secondaryKey) ? -1 : (a.secondaryKey > b.secondaryKey) ? 1 : IndexObject.compare(a, b));
  }

  static compareBuffer(a: IndexObject<Buffer>, b: IndexObject<Buffer>) {
    return IndexObject.compareTable(a, b) ||
      Buffer.compare(a.secondaryKey, b.secondaryKey) || IndexObject.compare(a, b);
  }

  clone(): IndexObject<K> {
    const obj = { ...this };
    if (obj.secondaryKey instanceof Uint8Array) {
      obj.secondaryKey = (obj.secondaryKey as Uint8Array).slice() as any as K;
      return obj;
    }
  }
}

interface IndexPrimaryKey {
  tableId: number;
  primaryKey: bigint;
}

interface IndexKey<K> extends IndexPrimaryKey {
  secondaryKey: K;
}

class SecondaryKeyStore<K> {
  byPrimary: BTree<IndexPrimaryKey,IndexObject<K>>;
  bySecondary: BTree<IndexKey<K>,IndexObject<K>>;

  constructor(private parent: TableStore, comparePrimary, compareSecondary) {
    this.byPrimary = new BTree<IndexPrimaryKey,IndexObject<K>>(undefined, comparePrimary);
    this.bySecondary = new BTree<IndexKey<K>,IndexObject<K>>(undefined, compareSecondary);
  }

  get(key: IndexPrimaryKey) {
    return this.byPrimary.get(key);
  }

  set(key: IndexKey<K> | undefined, newKey: IndexObject<K>, isReverting: boolean = false) {
    if (key && this.bySecondary.has(key)) {
      if (!isReverting) {
        this.parent.pushChanges(new UpdateSecondaryKeyChange({
          key: this.bySecondary.get(key), newKey: newKey, keystore: this }));
      }
      this.bySecondary.delete(key);
    } else if (!isReverting) {
      this.parent.pushChanges(new CreateSecondaryKeyChange({ key: newKey, keystore: this }));
    }
    this.bySecondary.set(newKey, newKey);
    this.byPrimary.set(newKey, newKey);
  }

  delete(key: IndexKey<K>, isReverting: boolean = false) {
    if (!isReverting) {
      this.parent.pushChanges(new DeleteSecondaryKeyChange({ key: this.byPrimary.get(key), keystore: this }));
    }
    this.bySecondary.delete(key);
    this.byPrimary.delete(key);
  }

  next(key: IndexPrimaryKey) {
    const kv = this.byPrimary.nextHigherPair(key);
    if (kv) {
      const [_, value] = kv;
      if (value.tableId === key.tableId) {
        return value;
      }
    }
    return;
  }

  lowerbound(key: IndexPrimaryKey) {
    if (this.byPrimary.has(key)) {
      return this.byPrimary.get(key);
    }
    return this.next(key);
  }

  upperbound(key: IndexPrimaryKey) {
    return this.next(key);
  }

  secondary = {
    lowest: undefined,
    highest: undefined,
    get: (key: IndexKey<K>) => {
      return this.bySecondary.get(key);
    },
    penultimate: (tableId: number) => {
      const highestKey: IndexKey<K> = {
        tableId,
        primaryKey: BigInt.asUintN(64, -1n),
        secondaryKey: this.secondary.highest,
      };
      const idx = this.secondary.get(highestKey);
      if (idx) {
        return idx;
      }
      return this.secondary.prev(highestKey);
    },
    lowerbound: (key: IndexKey<K>) => {
      if (this.bySecondary.has(key)) {
        return this.bySecondary.get(key);
      }
      return this.secondary.next(key);
    },
    upperbound: (key: IndexKey<K>) => {
      return this.secondary.next(key);
    },
    prev: (key: IndexKey<K>) => {
      const kv = this.bySecondary.nextLowerPair(key);
      if (kv) {
        const [_, value] = kv;
        if (value.tableId === key.tableId) {
          return value;
        }
      }
      return;
    },
    next: (key: IndexKey<K>) => {
      const kv = this.bySecondary.nextHigherPair(key);
      if (kv) {
        const [_, value] = kv;
        if (value.tableId === key.tableId) {
          return value;
        }
      }
      return;
    },
  };
}

class Index64 extends SecondaryKeyStore<bigint> {
  constructor(store: TableStore) {
    super(store, IndexObject.compare, IndexObject.comparePrimitives);
    this.secondary.lowest = 0n;
    this.secondary.highest = BigInt.asUintN(64, -1n);
  }
}

class Index128 extends SecondaryKeyStore<bigint> {
  constructor(store: TableStore) {
    super(store, IndexObject.compare, IndexObject.comparePrimitives);
    this.secondary.lowest = 0n;
    this.secondary.highest = BigInt.asUintN(128, -1n);
  }
}

class Index256 extends SecondaryKeyStore<Buffer> {
  constructor(store: TableStore) {
    super(store, IndexObject.compare, IndexObject.compareBuffer);
    this.secondary.lowest = Buffer.alloc(32, 0);
    this.secondary.highest = Buffer.alloc(32, 255);
  }
}

class IndexDouble extends SecondaryKeyStore<number> {
  constructor(store: TableStore) {
    super(store, IndexObject.compare, IndexObject.comparePrimitives);
    this.secondary.lowest = 0;
    this.secondary.highest = Number.MAX_VALUE;
  }
}

class CreateSecondaryKeyChange implements StoreChange {
  key: any;
  keystore: SecondaryKeyStore<any>;
  constructor(init?: Partial<CreateSecondaryKeyChange>) {
    Object.assign(this, init);
  }
  revert(store) {
    log.debug('revert secondary key creation');
    if (this.keystore.get(this.key)) {
      throw new Error('revert stack is corrupted');
    }
    this.keystore.delete(this.key, true);
  }
}

class UpdateSecondaryKeyChange implements StoreChange {
  key: any;
  newKey: any;
  keystore: SecondaryKeyStore<any>;
  constructor(init?: Partial<UpdateSecondaryKeyChange>) {
    Object.assign(this, init);
  }
  revert(store) {
    log.debug('revert secondary key update');
    if (!this.keystore.get(this.newKey)) {
      throw new Error('revert stack is corrupted');
    }
    this.keystore.set(this.newKey, this.key, true);
  }
}

class DeleteSecondaryKeyChange implements StoreChange {
  key: any;
  keystore: SecondaryKeyStore<any>;
  constructor(init?: Partial<DeleteSecondaryKeyChange>) {
    Object.assign(this, init);
  }
  revert(store) {
    log.debug('revert secondary key deletion');
    if (!this.keystore.get(this.key)) {
      throw new Error('revert stack is corrupted');
    }
    this.keystore.set(undefined, this.key, true);
  }
}

class TableStore extends Store<Buffer,KeyValueObject> {
  idx64 = new Index64(this);
  idx128 = new Index128(this);
  idx256 = new Index256(this);
  idxDouble = new IndexDouble(this);
  // private idxLongDouble;

  constructor(Prefix = Table) {
   super(Prefix);
  }

  createTable(code: bigint, scope: bigint, table: bigint, payer: bigint): Table {
    const prefix = Table.serializePrefix(code, scope, table);
    const tab = this.createPrefix(Table.serializePrefix(code, scope, table), {
      code, scope, table, payer, prefix,
    }) as Table;
    return tab;
  }

  findTable(code: bigint, scope: bigint, table: bigint) {
    return this.getPrefix(Table.serializePrefix(code, scope, table)) as Table;
  }

  getTableById(id: number) {
    return this.getPrefixById(id) as Table;
  }
}

class TableView {
  readonly name: string;
  readonly type: ABI.Table

  constructor(
    private tab: Table,
    private abi: ABI,
    private bc: Blockchain
  ) {
    this.name = Name.from(UInt64.from(bigIntToBn(this.tab.table))).toString();
    this.type = this.abi.tables.find((table) => table.name === this.name);
  }

  get(primaryKey: bigint): any {
    const kv: KeyValueObject | undefined = this.tab.get(primaryKey);
    if (kv) {
      return Serializer.decode({
        abi: this.abi,
        data: kv.value,
        type: this.type,
      })
    }
    return;
  }

  set(primaryKey: bigint, payer: Name, tableData: object) {
    const type = this.abi.tables.find((table) => table.name === this.name);
    if (!type) {
      throw new Error(`Table ${this.name} not found in ABI`)
    }

    const value = Serializer.encode({
      abi: this.abi,
      type: this.type,
      object: tableData
    }).array

    const kv = new KeyValueObject({
      tableId: this.tab.id,
      primaryKey,
      payer: nameToBigInt(payer),
      value,
    })

    this.tab.set(primaryKey, kv)
  }

  getTableRow(primaryKey: bigint): any {
    const value = this.get(primaryKey)
    if (value) {
      return Serializer.objectify(value)
    }
    return
  }

  getTableRows(lowerBound: bigint = BigInt(0)): any {
    const rows = []
    let kvNext = this.bc.store.getTableById(this.tab.id).next(lowerBound);
    while (kvNext) {
      rows.push(this.getTableRow(kvNext.primaryKey))
      kvNext = this.bc.store.getTableById(this.tab.id).next(kvNext.primaryKey)
    }
    return rows
  }
}

export {
  Table,
  KeyValueObject,
  IndexObject,
  SecondaryKeyStore,
  TableStore,
  TableView,
}
