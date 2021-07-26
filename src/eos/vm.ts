import assert from 'assert';
import { ABI, Serializer } from '@greymass/eosio';
import { log, Vert } from '../vert';
import { nameToBigInt64 } from "./utils";
import { Table, KeyValueObject } from './table';
import { IteratorCache } from "./iterator-cache";
import crypto from 'crypto';

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
        Buffer.from(this.memory.buffer, msg, len).set(this.context.data.subarray(0, size));
        return size;
      }
      ,
      action_data_size: (): i32 => {
        log.debug('action_data_size');
        return this.context.data.length;
      },
      require_recipient: (name: i64): void => {
        log.debug('require_recipient');
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
        log.debug('send_inline');
        // TODO
      },
      send_context_free_inline: (action: ptr, size: i32): void => {
        log.debug('send_context_free_inline');
        // TODO
      },
      publication_time: (): i64 => {
        log.debug('publication_time');
        // TODO
        return 0n;
      },
      current_receiver: (): i64 => {
        log.debug('current_receiver');
        return BigInt.asIntN(64, this.context.receiver);
      },
      set_action_return_value: (value: ptr, size: i32): void => {
        log.debug('set_action_return_value');
        // TODO
      },

      // chain
      get_active_producers: (producers: ptr, len: i32): i32 => {
        log.debug('get_active_producers');
        return 0;
      },

      // crypto
      assert_sha256: (data: ptr, len: i32, hash: ptr): void => {
        log.debug('assert_sha256');
        const result = crypto.createHash('sha256').update(Buffer.from(this.memory.buffer, data, len)).digest();
        if (Buffer.compare(result, Buffer.from(this.memory.buffer, hash, 32))) {
          throw new Error('hash mismatch');
        }
      },
      assert_sha1: (data: ptr, len: i32, hash: ptr): void => {
        log.debug('assert_sha1');
        const result = crypto.createHash('sha1').update(Buffer.from(this.memory.buffer, data, len)).digest();
        if (Buffer.compare(result, Buffer.from(this.memory.buffer, hash, 20))) {
          throw new Error('hash mismatch');
        }
      },
      assert_sha512: (data: ptr, len: i32, hash: ptr): void => {
        log.debug('assert_sha512');
        const result = crypto.createHash('sha512').update(Buffer.from(this.memory.buffer, data, len)).digest();
        if (Buffer.compare(result, Buffer.from(this.memory.buffer, hash, 64))) {
          throw new Error('hash mismatch');
        }
      },
      assert_ripemd160: (data: ptr, len: i32, hash: ptr): void => {
        log.debug('assert_ripemd160');
        const result = crypto.createHash('ripemd160').update(Buffer.from(this.memory.buffer, data, len)).digest();
        if (Buffer.compare(result, Buffer.from(this.memory.buffer, hash, 20))) {
          throw new Error('hash mismatch');
        }
      },
      sha256: (data: ptr, len: i32, hash: ptr): void => {
        log.debug('sha256');
        Buffer.from(this.memory.buffer, hash, 32).set(
          crypto
            .createHash('sha256')
            .update(Buffer.from(this.memory.buffer, data, len))
            .digest()
        );
      },
      sha1: (data: ptr, len: i32, hash: ptr): void => {
        log.debug('sha1');
        Buffer.from(this.memory.buffer, hash, 20).set(
          crypto
            .createHash('sha1')
            .update(Buffer.from(this.memory.buffer, data, len))
            .digest()
        );
      },
      sha512: (data: ptr, len: i32, hash: ptr): void => {
        log.debug('sha512');
        Buffer.from(this.memory.buffer, hash, 64).set(
          crypto
            .createHash('sha512')
            .update(Buffer.from(this.memory.buffer, data, len))
            .digest()
        );
      },
      ripemd160: (data: ptr, len: i32, hash: ptr): void => {
        log.debug('ripemd160');
        Buffer.from(this.memory.buffer, hash, 20).set(
          crypto
            .createHash('ripemd160')
            .update(Buffer.from(this.memory.buffer, data, len))
            .digest()
        );
      },
      recover_key: (digest: ptr, sig: ptr, siglen: i32, pub: ptr, publen: i32): i32 => {
        log.debug('recover_key');
        return 0;
      },
      assert_recover_key: (digest: ptr, sig: ptr, siglen: i32, pub: ptr, publen: i32): void => {
        log.debug('assert_recover_key');
      },

      // db
      db_store_i64: (_scope: i64, _table: i64, _payer: i64, _id: i64, data: ptr, len: i32): i32 => {
        log.debug('db_store_i64');
        const scope = BigInt.asUintN(64, _scope);
        const table = BigInt.asUintN(64, _table);
        const payer = BigInt.asUintN(64, _payer);
        const id = BigInt.asUintN(64, _id);

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
      db_update_i64: (iterator: i32, _payer: i64, data: ptr, len: i32): void => {
        log.debug('db_update_i64');
        const payer = BigInt.asUintN(64, _payer);

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
        Buffer.from(this.memory.buffer, data, len).set(kv.value.subarray(0, size));
        return size;
      },
      db_next_i64: (iterator: i32, primary: ptr): i32 => {
        log.debug('db_next_i64');
        if (iterator < -1) return -1;
        const kv = this.kvCache.get(iterator);
        const kvNext = Table.getById(kv.tableId).next(kv.primaryKey);
        if (!kvNext) {
          return this.kvCache.getEndIteratorByTableId(kv.tableId);
        }
        Buffer.from(this.memory.buffer, primary, 8).writeBigUInt64LE(kvNext.primaryKey);
        return this.kvCache.add(kvNext);
      },
      db_previous_i64: (iterator: i32, primary: ptr): i32 => {
        log.debug('db_previous_i64');
        if (iterator < -1) {
          const tab = this.kvCache.findTableByEndIterator(iterator);
          assert(tab, 'not a valid end iterator');
          const kv = tab.penultimate();
          if (!kv) return -1;
          Buffer.from(this.memory.buffer, primary, 8).writeBigUInt64LE(kv.primaryKey);
          return this.kvCache.add(kv);
        }
        const kv = this.kvCache.get(iterator);
        const kvPrev = Table.getById(kv.tableId).prev(kv.primaryKey);
        if (!kvPrev) {
          return -1;
        }
        Buffer.from(this.memory.buffer, primary, 8).writeBigUInt64LE(kvPrev.primaryKey);
        return this.kvCache.add(kvPrev);
      },
      db_find_i64: (_code: i64, _scope: i64, _table: i64, _id: i64): i32 => {
        log.debug('db_find_i64');
        const code = BigInt.asUintN(64, _code);
        const scope = BigInt.asUintN(64, _scope);
        const table = BigInt.asUintN(64, _table);
        const id = BigInt.asUintN(64, _id);

        const tab = findTable(code, scope, table);
        if (!tab) return -1;
        const ei = this.kvCache.cacheTable(tab);
        const kv = tab.get(id);
        if (!kv) return ei;
        return this.kvCache.add(kv);
      },
      db_lowerbound_i64: (_code: i64, _scope: i64, _table: i64, _id: i64): i32 => {
        log.debug('db_lowerbound_i64');
        const code = BigInt.asUintN(64, _code);
        const scope = BigInt.asUintN(64, _scope);
        const table = BigInt.asUintN(64, _table);
        const id = BigInt.asUintN(64, _id);

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
      db_upperbound_i64: (_code: i64, _scope: i64, _table: i64, _id: i64): i32 => {
        log.debug('db_upperbound_i64');
        const code = BigInt.asUintN(64, _code);
        const scope = BigInt.asUintN(64, _scope);
        const table = BigInt.asUintN(64, _table);
        const id = BigInt.asUintN(64, _id);

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
      db_end_i64: (_code: i64, _scope: i64, _table: i64): i32 => {
        log.debug('db_end_i64');
        const code = BigInt.asUintN(64, _code);
        const scope = BigInt.asUintN(64, _scope);
        const table = BigInt.asUintN(64, _table);

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
        log.debug('check_transaction_authorization');
        // TODO
        return 1;
      },
      check_permission_authorization: (
        account: i64, permission: i64,
        pubkeysData: ptr, pubkeysSize: i32,
        permsData: ptr, permsSize: i32,
        delayUs: i64): i32 => {
        log.debug('check_permission_authorization');
        // TODO
        return 1;
      },
      get_permission_last_used: (account: i64, permission: i64): i64 => {
        log.debug('get_permission_last_used');
        // TODO
        return 0n;
      },
      get_account_creation_time: (account: i64): i64 => {
        log.debug('get_account_creation_time');
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
        log.debug('printi');
        console.log(value.toString());
      },
      printui: (value: i64): void => {
        log.debug('printui');
        console.log(BigInt.asUintN(64, value).toString());
      },
      printi128: (value: i32): void => {
        log.debug('printi128');
        console.log(this.memory.readInt128(value).toString());
      },
      printui128: (value: i32): void => {
        log.debug('printui128');
        console.log(this.memory.readUint128(value).toString());
      },
      printsf: (value: f32): void => {
        log.debug('printsf');
        console.log(value);
      },
      printdf: (value: f64): void => {
        log.debug('printdf');
        console.log(value);
      },
      printqf: (value: i32): void => {
        log.debug('printdf');
      },
      printn: (value: i64): void => {
        log.debug('printn');
      },
      printhex: (data: i32, len: i32): void => {
        log.debug('printhex');
        console.log(this.memory.readHex(data, len));
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
        assert(test, `eosio_assert_code: ${BigInt.asUintN(64, code)}`);
      },
      eosio_exit: (code: i32): void => {
        log.debug('eosio_exit');
        // TODO
        throw new Error('not implemented');
      },
      current_time: (): i64 => {
        log.debug('current_time');
        return BigInt.asIntN(64, this.context.timestamp);
      },
      is_feature_activated: (digest: ptr): boolean => {
        log.debug('is_feature_activated');
        // TODO
        return true;
      },
      get_sender: (): i64 => {
        log.debug('get_sender');
        // TODO
        return 0n;
      },

      // transaction
      send_deferred: (sender: ptr, payer: i64, tx: ptr, size: i32, replace: i32) => {
        log.debug('send_deferred');
        // TODO
      },
      cancel_deferred: (sender: ptr): i32 => {
        log.debug('cancel_deferred');
        // TODO
        return 0;
      },
      read_transaction: (buffer: ptr, size: i32): i32 => {
        log.debug('read_transaction');
        // TODO
        return 0;
      },
      transaction_size: (): i32 => {
        log.debug('transaction_size');
        // TODO
        return 0;
      },
      tapos_block_num: (): i32 => {
        log.debug('tapos_block_num');
        // TODO
        return 0;
      },
      tapos_block_prefix: (): i32 => {
        log.debug('tapos_block_prefix');
        // TODO
        return 0;
      },
      expiration: (): i32 => {
        log.debug('expiration');
        // TODO
        return 0;
      },
      get_action: (type: i32, index: i32, buffer: ptr, size: i32): i32 => {
        log.debug('get_action');
        // TODO
        return 0;
      },
      get_context_free_data: (index: i32, buffer: ptr, size: i32): i32 => {
        log.debug('get_context_free_data');
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
        if ((dest - src) < count && (dest - src) >= 0) {
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
      __ashlti3: () => {},
      __ashrti3: () => {},
      __lshlti3: () => {},
      __lshrti3: () => {},
      __divti3: () => {},
      __udivti3: () => {},
      __multi3: () => {},
      __modti3: () => {},
      __umodti3: () => {},
      __addtf3: () => {}, //
      __subtf3: () => {}, //
      __multf3: () => {}, //
      __divtf3: () => {}, //
      __negtf2: () => {},
      __extendsftf2: () => {}, //
      __extenddftf2: () => {}, //
      __trunctfdf2: () => {}, //
      __trunctfsf2: () => {}, //
      __fixtfsi: () => {},
      __fixtfdi: () => {},
      __fixtfti: () => {},
      __fixunstfsi: () => {},
      __fixunstfdi: () => {},
      __fixunstfti: () => {},
      __fixsfti: () => {},
      __fixdfti: () => {},
      __fixunssfti: () => {},
      __fixunsdfti: () => {},
      __floatsidf: () => {},
      __floatsitf: () => {}, //
      __floatditf: () => {},
      __floatunsitf: () => {}, //
      __floatunditf: () => {},
      __floattidf: () => {},
      __floatuntidf: () => {},
      __cmptf2: () => {},
      __eqtf2: () => {}, //
      __netf2: () => {}, //
      __getf2: () => {}, //
      __gttf2: () => {},
      __letf2: () => {}, //
      __lttf2: () => {},
      __unordtf2: () => {},
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
