import { Store, PrefixedStore, StoreChange, CreateItemChange, DeleteItemChange } from "../store";

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
  private _prefix?: Buffer;
  private seq = 0;
  private _size = 0;

  static create(code: bigint, scope: bigint, table: bigint, payer: bigint): Table {
    const prefix = Table.serializePrefix(code, scope, table);
    const tab = <Table>Tables.createPrefix(Table.serializePrefix(code, scope, table));
    tab._code = code;
    tab._scope = scope;
    tab._table = table;
    tab.payer = payer;
    tab._prefix = prefix;
    return tab;
  }

  static find(code: bigint, scope: bigint, table: bigint) {
    return <Table>Tables.getPrefix(Table.serializePrefix(code, scope, table));
  }

  static getById(id: number) {
    return <Table>Tables.getPrefixById(id);
  }

  static serializePrefix(code: bigint, scope: bigint, table: bigint): Buffer {
    let buf = Buffer.alloc(24);
    buf.writeBigInt64BE(code);
    buf.writeBigInt64BE(scope, 8);
    buf.writeBigInt64BE(table, 16);
    return buf;
  }

  static bigintToBuffer(v: bigint): Buffer {
    const buffer = Buffer.alloc(8);
    buffer.writeBigInt64BE(v);
    return buffer;
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
      Tables.deletePrefix(this.prefix());
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

export const Tables = new Store<Buffer,KeyValueObject>(Table);
