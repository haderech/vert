import BTree, {defaultComparator as btreeDefaultComparator} from "sorted-btree";
import {log} from "./vert";
import Buffer from "./buffer";

function defaultComparator(a: any, b: any) {
  if (Buffer.isBuffer(a) && Buffer.isBuffer(b)) {
    return Buffer.compare(a, b);
  }
  return btreeDefaultComparator(a, b);
}

abstract class PrefixedStore<K,V> {
  store: Store<any,V>;
  id: number;

  set(key: K, value: V) {
    this.store.set(this.key(key), value, this);
  }
  get(key: K): V | undefined {
    return this.store.get(this.key(key));
  }
  delete(key: K) {
    this.store.delete(this.key(key));
  }
  revert(change: StoreChange) {}
  prev(key: K): V | undefined {
    const found = this.store.prev(this.key(key));
    if (found) {
      const [key, value] = found;
      if (!defaultComparator(this.prefix(), this.parsePrefix(key))) {
        return value;
      }
    }
    return;
  }
  next(key: K): V | undefined {
    const found = this.store.next(this.key(key));
    if (found) {
      const [key, value] = found;
      if (!defaultComparator(this.prefix(), this.parsePrefix(key))) {
        return value;
      }
    }
    return;
  }
  lowerbound(key: K): V | undefined {
    if (this.store.has(this.key(key))) {
      return this.store.get(this.key(key));
    }
    return this.next(key);
  }
  upperbound(key: K) {
    return this.next(key);
  }
  penultimate(): V | undefined {
    const key = this.key(this.highestKey());
    if (this.store.has(key)) {
      return this.store.get(key);
    }
    const kv = this.store.prev(key);
    if (kv) {
      const [key, value] = kv;
      if (!defaultComparator(this.prefix(), this.parsePrefix(key))) {
        return value;
      }
    }
    return;
  }
  abstract prefix(): any;
  abstract key(key: K): any;
  abstract lowestKey(): any;
  abstract highestKey(): any;
  abstract parsePrefix(key: any): any;

  protected constructor(store: Store<any,V>, options?: any) {
    this.store = store;
  }
}

class Store<K,V> {
  private readonly store: BTree<K,V>;
  private prefixes = new BTree<any,PrefixedStore<any,V>>(undefined, defaultComparator);
  private prefixesIndex = new Map<number,PrefixedStore<any,V>>();
  private changes = new Array<StoreChange>();
  private isReverting = false;
  private _seq = 0;

  constructor(private Prefix, compare: any = defaultComparator) {
    this.store = new BTree<K,V>(undefined, compare);
  }

  set seq(seq: number) {
    if (!this.isReverting) {
      throw new Error('do not access');
    }
    this._seq = seq;
  }

  get seq(): number {
    return this._seq;
  }

  createPrefix(prefix: any, options?: any) {
    let prefixedStore = this.prefixes.get(prefix);
    if (prefixedStore) {
      throw new Error('prefix uniqueness violation');
    }
    this.changes.push(new CreatePrefixChange({ prefix }));
    prefixedStore = new this.Prefix(this, options);
    prefixedStore.id = this._seq++;
    this.prefixes.set(prefix, prefixedStore);
    this.prefixesIndex.set(prefixedStore.id, prefixedStore);
    return prefixedStore;
  }

  deletePrefix(prefix: any) {
    let prefixedStore = this.prefixes.get(prefix);
    if (!prefixedStore) {
      throw new Error('non-existent prefix');
    }
    this.changes.push(new DeletePrefixChange({ prefixedStore }));
    this.prefixesIndex.delete(prefixedStore.id);
    this.prefixes.delete(prefix);
  }

  getPrefix(prefix: any) {
    return this.prefixes.get(prefix);
  }

  getPrefixById(id: number) {
    return this.prefixesIndex.get(id);
  }

  set(key: K, value: V, prefixedStorage?: any) {
    const prev = this.store.get(key);
    if (prev) {
      this.changes.push(new UpdateItemChange({ key, value: prev }));
    } else {
      this.changes.push(new CreateItemChange({ key, prefixedStorage }));
    }
    this.store.set(key, value);
  }

  get(key: K) {
    return this.store.get(key);
  }

  has(key: K) {
    return this.store.has(key);
  }

  delete(key: K) {
    let value = this.store.get(key);
    if (!value) {
      throw new Error('try deleting non-existent item');
    }
    this.changes.push(new DeleteItemChange({ key, value }));
    this.store.delete(key);
  }

  prev(key: K) {
    return this.store.nextLowerPair(key);
  }

  next(key: K) {
    return this.store.nextHigherPair(key);
  }

  snapshot() {
    return this.changes.length;
  }

  revertTo(snapshot: number = 0) {
    this.isReverting = true;
    const store = {
      store: this,
      internal: this.store,
      prefixes: this.prefixes,
      prefixesIndex: this.prefixesIndex,
    };
    for (let i = this.changes.length - 1; i >= snapshot; --i) {
      this.changes[i].revert(store);
    }
    this.changes = this.changes.slice(0, snapshot);
    this.isReverting = false;
  }

  pushChanges(...changes: StoreChange[]) {
    this.changes.push(...changes);
  }
}

interface StoreChange {
  revert: any,
}

class CreatePrefixChange implements StoreChange {
  prefix: any;
  constructor(init?: Partial<CreatePrefixChange>) {
    Object.assign(this, init);
  }
  revert(store) {
    log.debug('revert prefix creation');
    let prefixedStore = store.store.getPrefix(this.prefix);
    if (!prefixedStore) {
      throw new Error('revert stack is corrupted');
    }
    store.prefixesIndex.delete(prefixedStore.id);
    store.prefixes.delete(this.prefix);
    store.store.seq--;
  }
}

class DeletePrefixChange implements StoreChange {
  prefixedStore: any;
  constructor(init?: Partial<DeletePrefixChange>) {
    Object.assign(this, init);
  }
  revert(store) {
    log.debug('revert prefix deletion');
    let prefixedStore = store.store.getPrefix(this.prefixedStore.prefix());
    if (prefixedStore) {
      throw new Error('revert stack is corrupted');
    }
    store.prefixes.set(this.prefixedStore.prefix(), this.prefixedStore);
    store.prefixesIndex.set(this.prefixedStore.id, this.prefixedStore);
  }
}

class CreateItemChange implements StoreChange {
  key: any;
  prefixedStorage?: any;
  constructor(init?: Partial<CreateItemChange>) {
    Object.assign(this, init);
  }
  revert(store) {
    log.debug('revert item creation');
    if (!store.internal.delete(this.key)) {
      throw new Error('revert stack is corrupted');
    }
    if (this.prefixedStorage) {
      this.prefixedStorage.revert(this);
    }
  }
}

class UpdateItemChange implements StoreChange {
  key: any;
  value: any;
  constructor(init?: Partial<UpdateItemChange>) {
    Object.assign(this, init);
  }
  revert(store) {
    log.debug('revert item update');
    if (!store.internal.has(this.key)) {
      throw new Error('revert stack is corrupted');
    }
    store.internal.set(this.key, this.value);
  }
}

class DeleteItemChange implements StoreChange {
  key: any;
  value: any;
  constructor(init?: Partial<DeleteItemChange>) {
    Object.assign(this, init);
  }
  revert(store) {
    log.debug('revert item deletion');
    if (!store.internal.has(this.key)) {
      throw new Error('revert stack is corrupted');
    }
    store.internal.set(this.key, this.value);
  }
}

export {
  PrefixedStore,
  Store,
  StoreChange,
  CreatePrefixChange,
  DeletePrefixChange,
  CreateItemChange,
  UpdateItemChange,
  DeleteItemChange,
}
