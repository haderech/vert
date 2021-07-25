import assert from 'assert';
import { ABI, Serializer } from '@greymass/eosio';
import { log, Vert } from '../vert';
import { nameToBigInt64 } from "./utils";
import { Table, KeyValueObject } from './table';
import { IteratorCache } from "./iterator-cache";

type ptr = number;
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
      read_action_data: (msg: ptr, len: i32): i32 => {
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
      action_data_size: (): i32 => {
        log.debug('action_data_size');
        return this.context.data.length;
      },
      require_recipient: (name: i64): void => {
        log.debug('require_recipient');
        // TODO
      },
      require_auth: (name: i64): void => {
        log.debug('require_auth');
        // TODO
      },
      has_auth: (name: i64): boolean => {
        log.debug('has_auth');
        // TODO
        return true;
      },
      require_auth2: (name: i64, permission: i64): void => {
        log.debug('require_auth2');
        // TODO
      },
      is_account: (name: i64): boolean => {
        log.debug('is_account');
        // TODO
        return true;
      },
      send_inline: (action: ptr, size: i32): void => {
        // TODO
      },
      send_context_free_inline: (action: ptr, size: i32): void => {
        // TODO
      },
      publication_time: (): i64 => {
        // TODO
        return 0n;
      },
      current_receiver: (): i64 => {
        log.debug('current_receiver');
        return this.context.receiver;
      },
      set_action_return_value: (value: ptr, size: i32): void => {
        // TODO
      },

      // TODO: chain APIs
      // TODO: crypto APIs

      // db
      db_store_i64: (scope: i64, table: i64, payer: i64, id: i64, data: ptr, len: i32): i32 => {
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
      db_update_i64: (iterator: i32, payer: i64, data: ptr, len: i32): void => {
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
      db_remove_i64: (iterator: i32): void => {
        log.debug('db_remove_i64');
        const kv = this.kvCache.get(iterator);
        const tab = this.kvCache.getTable(kv.tableId);
        assert(tab.code === this.context.receiver, 'db access violation');
        tab.delete(kv.primaryKey);
        this.kvCache.remove(iterator);
      },
      db_get_i64: (iterator: i32, data: ptr, len: i32): i32 => {
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
      db_next_i64: (iterator: i32, primary: ptr): i32 => {
        log.debug('db_next_i64');
        if (iterator < -1) return -1;
        const kv = this.kvCache.get(iterator);
        const value = Table.getById(kv.tableId).next(kv.primaryKey);
        if (!value) {
          return this.kvCache.getEndIteratorByTableId(kv.tableId);
        }
        const buffer = Buffer.alloc(8);
        buffer.writeBigUInt64LE(value.primaryKey);
        new Uint8Array(this.memory.buffer, primary, 8).set(buffer);
        return this.kvCache.add(kv);
      },
      db_previous_i64: (iterator: i32, primary: ptr): i32 => {
        if (iterator < -1) {
          const tab = this.kvCache.findTableByEndIterator(iterator);
          assert(tab, 'not a valid end iterator');
          const kv = tab.penultimate();
          if (!kv) return -1;
          Buffer.from(this.memory.buffer, primary, 8).writeBigUInt64LE(kv.primaryKey);
          return this.kvCache.add(kv);
        }
        let kv = this.kvCache.get(iterator);
        const tab = Table.getById(kv.tableId);
        kv = tab.prev(kv.primaryKey);
        if (!kv) {
          return -1;
        }
        Buffer.from(this.memory.buffer, primary, 8).writeBigUInt64LE(kv.primaryKey);
        return this.kvCache.add(kv);
      },
      db_find_i64: (code: i64, scope: i64, table: i64, id: i64): i32 => {
        log.debug('db_find_i64');
        const tab = findTable(code, scope, table);
        if (!tab) return -1;
        const ei = this.kvCache.cacheTable(tab);
        const kv = tab.get(id);
        if (!kv) return ei;
        return this.kvCache.add(kv);
      },
      db_lowerbound_i64: (code: i64, scope: i64, table: i64, id: i64): i32 => {
        const tab = Table.find(code, scope, table);
        if (!tab) {
          return -1;
        }
        const ei = this.kvCache.cacheTable(tab);
        const kv = tab.lowerbound(id);
        if (!kv) {
          return ei;
        }
        return this.kvCache.add(kv);
      },
      db_upperbound_i64: (code: i64, scope: i64, table: i64, id: i64): i32 => {
        const tab = Table.find(code, scope, table);
        if (!tab) {
          return -1;
        }
        const ei = this.kvCache.cacheTable(tab);
        const kv = tab.upperbound(id);
        if (!kv) {
          return ei;
        }
        return this.kvCache.add(kv);
      },
      db_end_i64: (code: i64, scope: i64, table: i64): i32 => {
        log.debug('db_end_i64');
        const tab = findTable(code, scope, table);
        if (!tab) return -1;
        return this.kvCache.cacheTable(tab);
      },
      // TODO: DB secondary index APIs

      // permission
      check_transaction_authorization: (
        txData: ptr, txSize: i32,
        pubkeysData: ptr, pubkeysSize: i32,
        permsData: ptr, permsSize: i32): i32 => {
        // TODO
        return 1;
      },
      check_permission_authorization: (
        account: i64, permission: i64,
        pubkeysData: ptr, pubkeysSize: i32,
        permsData: ptr, permsSize: i32,
        delayUs: i64): i32 => {
        // TODO
        return 1;
      },
      get_permission_last_used: (account: i64, permission: i64): i64 => {
        // TODO
        return 0n;
      },
      get_account_creation_time: (account: i64): i64 => {
        // TODO
        return 0n;
      },

      // print
      prints: (msg: i32): void => {
        log.debug('prints');
        console.log(this.memory.readString(msg));
      },
      prints_l: (msg: i32, len: i32): void => {
        log.debug('prints_l');
        console.log(this.memory.readString(msg, len));
      },
      printi: (value: i64): void => {
      },
      printui: (value: i64): void => {
      },
      printi128: (value: i32): void => {
      },
      printui128: (value: i32): void => {
      },
      printsf: (value: f32): void => {
      },
      printdf: (value: f64): void => {
      },
      printqf: (value: i32): void => {
      },
      printn: (value: i64): void => {
      },
      printhex: (data: i32, len: i32): void => {
      },

      // TODO: privileged APIs
      // TODO: security_group APIs

      // system
      eosio_assert: (test: i32, msg: ptr): void => {
        log.debug('eosio_assert');
        assert(test, 'eosio_assert: ' + this.memory.readString(msg));
      },
      eosio_assert_message: (test: i32, msg: ptr, msg_len: i32): void => {
        log.debug('eosio_assert_message');
        assert(test, 'eosio_assert_message: ' + this.memory.readString(msg, msg_len));
      },
      eosio_assert_code: (test: i32, code: i64): void => {
        log.debug('eosio_assert_code');
        assert(test, `eosio_assert_code: ${code}`);
      },
      eosio_exit: (code: i32): void => {
        log.debug('eosio_exit');
        // TODO
        throw new Error('not implemented');
      },
      current_time: (): i64 => {
        log.debug('current_time');
        return this.context.timestamp;
      },
      is_feature_activated: (digest: ptr): boolean => {
        // TODO
        return true;
      },
      get_sender: (): i64 => {
        // TODO
        return 0n;
      },

      // transaction
      send_deferred: (sender: ptr, payer: i64, tx: ptr, size: i32, replace: i32) => {
        // TODO
      },
      cancel_deferred: (sender: ptr): i32 => {
        // TODO
        return 0;
      },
      read_transaction: (buffer: ptr, size: i32): i32 => {
        // TODO
        return 0;
      },
      transaction_size: (): i32 => {
        // TODO
        return 0;
      },
      tapos_block_num: (): i32 => {
        // TODO
        return 0;
      },
      tapos_block_prefix: (): i32 => {
        // TODO
        return 0;
      },
      expiration: (): i32 => {
        // TODO
        return 0;
      },
      get_action: (type: i32, index: i32, buffer: ptr, size: i32): i32 => {
        // TODO
        return 0;
      },
      get_context_free_data: (index: i32, buffer: ptr, size: i32): i32 => {
        // TODO
        return 0;
      },

      // builtins
      abort: () => {
        log.debug('abort');
        // TODO
        throw new Error('not implemented');
      },
      memmove: (dest: ptr, src: ptr, count: i32): ptr => {
        log.debug('memmove');
        const destination = new Uint8Array(this.memory.buffer, dest, count);
        const source = new Uint8Array(this.memory.buffer, src, count);
        destination.set(source);
        return dest;
      },
      memset: (dest: ptr, ch: i32, count: i32): ptr => {
        log.debug('memset');
        const destination = new Uint8Array(this.memory.buffer, dest, count);
        const source = Buffer.alloc(count, ch);
        destination.set(source);
        return dest;
      },
      memcpy: (dest: ptr, src: ptr, count: i32): ptr => {
        log.debug('memcpy');
        // HACK: imitate copying to overlapped destination
        if ((dest - src) < count) {
          const cpy = (d, s, c) => {
            if (c <= 0) {
              return;
            }
            const size = Math.min(d - s, c);
            const destination = new Uint8Array(this.memory.buffer, d, size);
            const source = new Uint8Array(this.memory.buffer, s, size);
            destination.set(source);
            cpy(d + size, s + size, c - size);
          };
          cpy(dest, src, count);
        } else {
          const destination = new Uint8Array(this.memory.buffer, dest, count);
          const source = new Uint8Array(this.memory.buffer, src, count);
          destination.set(source);
        }
        return dest;
      },

      // TODO: compiler-rt APIs
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
