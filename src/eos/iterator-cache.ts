import assert from "../assert";
import {Table} from "./table";

interface TableEndIterator {
  0: Table;
  1: number;
}

class IteratorCache<T> {
  private tableCache = new Map<number, TableEndIterator>();
  private endIteratorToTable = new Array<Table>();
  private iteratorToObject = new Array<T>();
  private objectToIterator = new Map<T, number>();

  cacheTable(table: Table): number {
    for (const [key, value] of this.tableCache) {
      if (table === value[0]) {
        return value[1];
      }
    }
    const ei = this.indexToEndIterator(this.endIteratorToTable.length);
    this.endIteratorToTable.push(table);
    this.tableCache.set(table.id, { 0: table, 1: ei });
    return ei;
  }

  getTable(id: number): Table {
    const found = this.tableCache.get(id);
    assert(found, 'an invariant was broken, table should be in cache');
    return found[0];
  }

  getEndIteratorByTableId(id: number): number {
    const found = this.tableCache.get(id);
    assert(found, 'an invariant was broken, table should be in cache');
    return found[1];
  }

  findTableByEndIterator(ei: number): Table | undefined {
    assert(ei < -1, 'not an end iterator');
    const idx = this.endIteratorToIndex(ei);
    if (idx >= this.endIteratorToTable.length) {
      return undefined;
    }
    return this.endIteratorToTable[idx];
  }

  get(iterator: number): T {
    assert(iterator !== -1, 'invalid iterator');
    assert(iterator >= 0, 'deference of end iterator');
    assert(iterator < this.iteratorToObject.length, 'iterator out of range');
    assert(this.iteratorToObject[iterator]);
    return this.iteratorToObject[iterator];
  }

  set(iterator: number, value: T) {
    this.iteratorToObject[iterator] = value;
  }

  remove(iterator: number) {
    assert(iterator != -1, 'invalid iterator');
    assert(iterator >= 0, 'cannot call remove on end iterators');
    assert(iterator < this.iteratorToObject.length, 'iterator out of range');
    const obj = this.iteratorToObject[iterator];
    if (!obj) {
      return;
    }
    this.iteratorToObject[iterator] = undefined;
    this.objectToIterator.delete(obj);
  }

  add(obj: T): number {
    const itr = this.objectToIterator.get(obj);
    if (itr) {
      return itr;
    }
    this.iteratorToObject.push(obj);
    this.objectToIterator.set(obj, this.iteratorToObject.length - 1);
    return this.iteratorToObject.length - 1;
  }

  endIteratorToIndex(ei: number) {
    return (-ei - 2);
  }

  indexToEndIterator(idx: number) {
    return -(idx + 2);
  }
}

export {
  IteratorCache,
}
