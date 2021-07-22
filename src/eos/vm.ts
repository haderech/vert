import assert from 'assert';
import { ABI, Serializer } from '@greymass/eosio';
import { log, Vert } from '../vert';
import { nameToBigInt64 } from "./utils";
import { Table, KeyValueObject } from './table';
import { IteratorCache } from "./iterator-cache";

type i32 = number;
type i64 = bigint;
type f32 = number;
type f64 = number;

function findTable(code: bigint, scope: bigint, table: bigint): Table | undefined {
  return Table.find(code, scope, table);
}

function findOrCreateTable(code: bigint, scope: bigint, table: bigint, payer: bigint): Table {
  let tab = Table.find(code, scope, table);
  if (!tab) {
    tab = Table.create(code, scope, table, payer);
  }
  return tab;
}

class EosVMContext {
  receiver: bigint;
  first_receiver?: bigint;
  timestamp: bigint;
  data?: Uint8Array;
}

export class EosVM extends Vert {
  // TODO
  private context: EosVMContext = new EosVMContext();
  private kvCache = new IteratorCache<KeyValueObject>();
  private abi: any;

  protected imports = {
    env: {
      // action
      read_action_data: (msg, len) => {
        log.debug('read_action_data');
        if (!len) {
          return this.context.data.length;
        }
        const size = Math.min(len, this.context.data.length);
        const buffer = new Uint8Array(this.memory.buffer, msg, len);
        buffer.set(this.context.data.subarray(0, size));
        return size;
      }
      ,
      action_data_size: () => {
        log.debug('action_data_size');
        return this.context.data.length;
      },
      require_recipient: (name) => {
        log.debug('require_recipient');
        // TODO
      },
      require_auth: (name) => {
        log.debug('require_auth');
        // TODO
      },
      has_auth: (name) => {
        log.debug('has_auth');
        // TODO
        return true;
      },
      require_auth2: (name, permission) => {
        log.debug('require_auth2');
        // TODO
      },
      is_account: (name) => {
        log.debug('is_account');
        // TODO
        return true;
      },
      current_receiver: () => {
        log.debug('current_receiver');
        return this.context.receiver;
      },

      // db
      db_store_i64: (scope, table, payer, id, data, len) => {
        log.debug('db_store_i64');
        const tab = findOrCreateTable(this.context.receiver, scope, table, payer);
        assert(payer !== 0n, 'must specify a valid account to pay for new record');
        assert(!tab.has(id), 'key uniqueness violation');
        const kv = new KeyValueObject();
        kv.tableId = tab.id;
        kv.primaryKey = id;
        kv.payer = payer;
        kv.value = new Uint8Array(this.memory.buffer, data, len).slice();
        tab.set(id, kv);
        this.kvCache.cacheTable(tab);
        return this.kvCache.add(kv);
      },
      db_update_i64: (iterator, payer, data, len) => {
        log.debug('db_update_i64');
        const kvPrev = this.kvCache.get(iterator);
        const kv = kvPrev.clone();
        const tab = this.kvCache.getTable(kv.tableId);
        assert(tab.code === this.context.receiver, 'db access violation');
        if (payer) {
          kv.payer = payer;
        }
        kv.value = new Uint8Array(this.memory.buffer, data, len).slice();
        tab.set(kv.primaryKey, kv);
      },
      db_remove_i64: (iterator) => {
        log.debug('db_remove_i64');
        const kv = this.kvCache.get(iterator);
        const tab = this.kvCache.getTable(kv.tableId);
        assert(tab.code === this.context.receiver, 'db access violation');
        tab.delete(kv.primaryKey);
        this.kvCache.remove(iterator);
      },
      db_get_i64: (iterator, data, len) => {
        log.debug('db_get_i64');
        const kv = this.kvCache.get(iterator);
        if (!len) {
          return kv.value.length;
        }
        const size = Math.min(len, kv.value.length);
        const buffer = new Uint8Array(this.memory.buffer, data, len);
        buffer.set(kv.value.subarray(0, size));
        return size;
      },
      db_next_i64: (iterator, primary) => {
        log.debug('db_next_i64');
        if (iterator < -1) return -1;
        const kv = this.kvCache.get(iterator);
        const value = Table.getById(kv.tableId).next(kv.primaryKey);
        if (!value) {
          return this.kvCache.getEndIteratorByTableId(kv.tableId);
        }
        const buffer = Buffer.alloc(8);
        buffer.writeBigInt64LE(value.primaryKey);
        new Uint8Array(this.memory.buffer, primary, 8).set(buffer);
        return this.kvCache.add(kv);
      },
      db_find_i64: (code, scope, table, id) => {
        log.debug('db_find_i64');
        const tab = findTable(code, scope, table);
        if (!tab) return -1;
        const ei = this.kvCache.cacheTable(tab);
        const kv = tab.get(id);
        if (!kv) return ei;
        return this.kvCache.add(kv);
      },
      db_end_i64: (code, scope, table) => {
        log.debug('db_end_i64');
        const tab = findTable(code, scope, table);
        if (!tab) return -1;
        return this.kvCache.cacheTable(tab);
      },

      // print
      prints: (msg: i32) => {
        log.debug('prints');
        console.info(this.memory.readString(msg));
      },
      prints_l: (msg: i32, len: i32) => {
        log.debug('prints_l');
        console.info(this.memory.readString(msg, len));
      },
      printi: (value: i64) => {
      },
      printui: (value: i64) => {
      },
      printi128: (value: i32) => {
      },
      printui128: (value: i32) => {
      },
      printsf: (value: f32) => {
      },
      printdf: (value: f64) => {
      },
      printqf: (value: i32) => {
      },
      printn: (value: i64) => {
      },
      printhex: (data: i32, len: i32) => {
      },

      // system
      abort: () => {
        log.debug('abort');
        // TODO
        throw new Error('not implemented');
      },
      eosio_assert: (test, msg) => {
        log.debug('eosio_assert');
        assert(test, 'eosio_assert: ' + this.memory.readString(msg));
      },
      eosio_assert_message: (test, msg, msg_len) => {
        log.debug('eosio_assert_message');
        assert(test, 'eosio_assert_message: ' + this.memory.readString(msg, msg_len));
      },
      eosio_assert_code: (test, code) => {
        log.debug('eosio_assert_code');
        assert(test, `eosio_assert_code: ${code}`);
      },
      eosio_exit: (code) => {
        log.debug('eosio_exit');
        // TODO
        throw new Error('not implemented');
      },
      current_time: () => {
        log.debug('current_time');
        return this.context.timestamp;
      },

      memcpy: (dest, src, count) => {
        log.debug('memcpy');
        const destination = new Uint8Array(this.memory.buffer, dest, count);
        const source = new Uint8Array(this.memory.buffer, src, count);
        destination.set(source);
        return dest;
      },
    },
  };

  setAbi(abi: any) {
    this.abi = ABI.from(abi);
    this.abi.actions.forEach((action) => {
      const resolved = this.abi.resolveType(action.name);
      Object.assign(this, {
        [resolved.name]: (...args: any[]) => {
          const data: Record<string, any> = {};
          args.forEach((arg, i) => data[resolved.fields[i].name] = arg);
          this.context.data = Serializer.encode({
            abi: this.abi,
            type: action.name,
            object: data,
          }).array;
        }
      });
    });
  }

  apply(receiver: string, first_receiver: string, action: string) {
    this.context.receiver = nameToBigInt64(receiver);
    this.context.first_receiver = nameToBigInt64(first_receiver);
    (this.instance.exports.apply as CallableFunction)(
      this.context.receiver,
      this.context.first_receiver,
      nameToBigInt64(action));
    this.finalize();
  }

  finalize() {
    this.kvCache = new IteratorCache<KeyValueObject>();
  }

  getTableRow(code: string, scope: bigint, table: string, primaryKey: bigint): any {
    const tab = findTable(nameToBigInt64(code), scope, nameToBigInt64(table));
    const kv = tab?.get(primaryKey);
    if (!kv) {
      return;
    }
    let type;
    for (const t of this.abi.tables) {
      if (table == t.name) {
        type = t.type;
        break;
      }
    }
    if (!type) {
      return;
    }
    return Serializer.decode({
      abi: this.abi,
      data: kv.value,
      type: type,
    });
  }
}
