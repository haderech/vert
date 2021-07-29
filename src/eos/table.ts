import { Store, PrefixedStore, StoreChange, CreateItemChange, DeleteItemChange } from "../store";
import BTree from 'sorted-btree';
import { log } from '../vert';
import { compareUint8Array, concatUint8Array, uint8ArrayToDataView } from "../util";

export class KeyValueObject {
  id: number;
  tableId: number;
  primaryKey: bigint;
  payer: bigint;
  value: Uint8Array;

  clone(): KeyValueObject {
    const kv = new KeyValueObject();
    kv.id = this.id;
    kv.tableId = this.tableId;
    kv.primaryKey = this.primaryKey;
    kv.payer = this.payer;
    kv.value = this.value.slice();
    return kv;
  }
}

export class Table extends PrefixedStore<bigint,KeyValueObject> {
  private _code: bigint;
  private _scope: bigint;
  private _table: bigint;
  private payer: bigint;
  private _prefix?: Uint8Array;
  private seq = 0;
  private _size = 0;

  static create(code: bigint, scope: bigint, table: bigint, payer: bigint, store: TableStore = tableStore): Table {
    const prefix = Table.serializePrefix(code, scope, table);
    const tab = store.createPrefix(Table.serializePrefix(code, scope, table)) as Table;
    tab._code = code;
    tab._scope = scope;
    tab._table = table;
    tab.payer = payer;
    tab._prefix = prefix;
    return tab;
  }

  static find(code: bigint, scope: bigint, table: bigint, store: TableStore = tableStore) {
    return store.getPrefix(Table.serializePrefix(code, scope, table)) as Table;
  }

  static getById(id: number, store: TableStore = tableStore) {
    return store.getPrefixById(id) as Table;
  }

  static serializePrefix(code: bigint, scope: bigint, table: bigint): Uint8Array {
    const buffer = new Uint8Array(24);
    const view = uint8ArrayToDataView(buffer);
    view.setBigUint64(0, code, true);
    view.setBigUint64(8, scope, true);
    view.setBigUint64(16, table, true);
    return buffer;
  }

  static bigintToBuffer(v: bigint): Uint8Array {
    const buffer = new Uint8Array(8);
    uint8ArrayToDataView(buffer).setBigUint64(0, v);
    return buffer;
  }

  static idx64(store: TableStore = tableStore): Index64 {
    return store.idx64;
  }

  static idx128(store: TableStore = tableStore): Index128 {
    return store.idx128;
  }

  static idx256(store: TableStore = tableStore): Index256 {
    return store.idx256;
  }

  static idxDouble(store: TableStore = tableStore): IndexDouble {
    return store.idxDouble;
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

  prefix(): Uint8Array {
    if (!this._prefix) {
      this._prefix = Table.serializePrefix(this.code, this.scope, this.table);
    }
    return this._prefix;
  }

  key(key: bigint): Uint8Array {
    return concatUint8Array([this.prefix(), Table.bigintToBuffer(key)]);
  }

  lowestKey(): bigint {
    return 0n;
  }

  highestKey(): bigint {
    return 18446744073709551615n;
  }

  parsePrefix(key: Uint8Array): Uint8Array {
    //return key.slice(0, 24);
    return new Uint8Array(key.buffer, key.byteOffset, 24);
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

export class IndexObject<K> implements IndexKey<K> {
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

  static compareBuffer(a: IndexObject<Uint8Array>, b: IndexObject<Uint8Array>) {
    return IndexObject.compareTable(a, b) ||
      compareUint8Array(a.secondaryKey, b.secondaryKey) || IndexObject.compare(a, b);
  }

  clone(): IndexObject<K> {
    const obj = { ...this };
    if (obj.secondaryKey instanceof Uint8Array) {
      obj.secondaryKey = (obj.secondaryKey as Uint8Array).slice() as any as K;
      return obj;
    }
  }
}

export interface IndexPrimaryKey {
  tableId: number;
  primaryKey: bigint;
}

export interface IndexKey<K> extends IndexPrimaryKey {
  secondaryKey: K;
}

export class SecondaryKeyStore<K> {
  byPrimary: BTree<IndexPrimaryKey,IndexObject<K>>;
  bySecondary: BTree<IndexKey<K>,IndexObject<K>>;

  constructor(comparePrimary, compareSecondary, private parent = tableStore) {
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

export class Index64 extends SecondaryKeyStore<bigint> {
  constructor() {
    super(IndexObject.compare, IndexObject.comparePrimitives);
    this.secondary.lowest = 0n;
    this.secondary.highest = BigInt.asUintN(64, -1n);
  }
}

export class Index128 extends SecondaryKeyStore<bigint> {
  constructor() {
    super(IndexObject.compare, IndexObject.comparePrimitives);
    this.secondary.lowest = 0n;
    this.secondary.highest = BigInt.asUintN(128, -1n);
  }
}

export class Index256 extends SecondaryKeyStore<Uint8Array> {
  constructor() {
    super(IndexObject.compare, IndexObject.compareBuffer);
    this.secondary.lowest = new Uint8Array(32);
    this.secondary.lowest.fill(0);
    this.secondary.highest = new Uint8Array(32);
    this.secondary.highest.fill(255);
  }
}

export class IndexDouble extends SecondaryKeyStore<number> {
  constructor() {
    super(IndexObject.compare, IndexObject.comparePrimitives);
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

export class TableStore extends Store<Uint8Array,KeyValueObject> {
  idx64 = new Index64();
  idx128 = new Index128();
  idx256 = new Index256();
  idxDouble = new IndexDouble();
  // private idxLongDouble;
}

export const tableStore = new TableStore(Table);
