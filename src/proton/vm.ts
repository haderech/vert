import assert from "../assert";
import Buffer from "../buffer";
import { log, Vert } from "../vert";
import { IndexObject, KeyValueObject, SecondaryKeyStore, Table } from "./table";
import { IteratorCache } from "./iterator-cache";
import { Action, Name, NameType, PermissionLevel, PublicKey, Serializer, Signature, Transaction, UInt64 } from "@greymass/eosio";
import { sha256, sha512, sha1, ripemd160 } from "hash.js";
import { bigIntToName, nameToBigInt, nameTypeToBigInt } from "./bn";
import { Blockchain } from "./blockchain";
import { Account } from "./account";
import { protonAssert, protonAssertMessage, protonAssertCode } from "./errors";
import { findLastIndex, isAuthoritySatisfied } from "./utils";

type ptr = number;
type i32 = number;
type i64 = bigint;
type i128 = bigint;
type f32 = number;
type f64 = number;

const owner = nameToBigInt(Name.from('owner'));
const active = nameToBigInt(Name.from('active'));

function convertToUnsigned(...values: bigint[]) {
  return values.map(v => BigInt.asUintN(64, v));
}

const SecondaryKeyConverter = {
  uint64: {
    from: (buffer: Buffer) => buffer.readBigUInt64LE(),
    to: (buffer: Buffer, value: bigint) => buffer.writeBigUInt64LE(value),
  },
  uint128: {
    from: (buffer: Buffer) => {
      const low = buffer.readBigUInt64LE(0);
      const high = buffer.readBigUInt64LE(8);
      return (high << 64n) | low;
    },
    to: (buffer: Buffer, value: bigint) => {
      buffer.writeBigUInt64LE(value & BigInt.asUintN(64, -1n), 0);
      buffer.writeBigUInt64LE(value >> 64n, 8);
    },
  },
  int128: {
    from: (buffer: Buffer) => {
      const low = buffer.readBigUInt64LE(0);
      const high = buffer.readBigUInt64LE(8);
      const int = (high << 64n) | low;
      return BigInt.asIntN(128, int);
    },
    to: (buffer: Buffer, value: bigint) => {
      buffer.writeBigUInt64LE(value, 0);
      buffer.writeBigUInt64LE(value >> 64n, 8);
    },
  },
  checksum256: {
    from: (buffer: Buffer) => {
      const low = (buffer as Uint8Array).slice(0, 16);
      const high = (buffer as Uint8Array).slice(16, 32);
      return Buffer.concat([low.reverse(), high.reverse()]);
    },
    to: (buffer: Buffer, value: Buffer) => {
      const low = (value as Uint8Array).slice(0, 16);
      const high = (value as Uint8Array).slice(16, 32);
      buffer.set(Buffer.concat([low.reverse(), high.reverse()]));
    },
  },
  double: {
    from: (buffer: Buffer): number => buffer.readDoubleLE(),
    to: (buffer: Buffer, value: number) => buffer.writeDoubleLE(value),
  },
  /*
  TODO
  LongDouble: {
  },
  */
};

class EosioExitResult extends Error {
  constructor(value: number) {
    super('eosio_exit: ' + value.toString());
    Object.setPrototypeOf(this, EosioExitResult);
  }
}

class VM extends Vert {
  // TODO
  private context: VM.Context = new VM.Context();
  private kvCache = new IteratorCache<KeyValueObject>();
  private idx64 = new IteratorCache<IndexObject<bigint>>();
  private idx128 = new IteratorCache<IndexObject<bigint>>();
  private idx256 = new IteratorCache<IndexObject<Buffer>>();
  private idxDouble = new IteratorCache<IndexObject<number>>();

  // private idxLongDouble;
  private snapshot: number = 0;
  private bc: Blockchain
  public imports

  static from(wasm: Uint8Array | Promise<Uint8Array> | VM, bc: Blockchain) {
    if (wasm instanceof VM) {
      return wasm;
    }
    return new VM(wasm, bc);
  }

  constructor(wasm: Uint8Array | Promise<Uint8Array>, bc: Blockchain) {
    const imports = {
      env: {
        // action
        read_action_data: (msg: ptr, len: i32): i32 => {
          log.debug('read_action_data');
          if (!len) {
            return this.context.data.length;
          }
          const size = Math.min(len, this.context.data.length);
          Buffer.from_(this.memory.buffer, msg, len).set(this.context.data.subarray(0, size));
          return size;
        }
        ,
        action_data_size: (): i32 => {
          log.debug('action_data_size');
          return this.context.data.length;
        },
        require_auth: (_name: i64): void => {
          const [name] = convertToUnsigned(_name);
          log.debug(`require_auth: ${bigIntToName(name)}`);
  
          let hasAuth = false;
          for (const auth of this.context.authorization) {
            if (nameToBigInt(auth.actor) === name) {
              const permission = nameToBigInt(auth.permission);
              if (permission === active || permission === owner) {
                hasAuth = true;
                break;
              }
            }
          }
  
          assert(hasAuth, `missing required authority ${bigIntToName(name)}`);
        },
        has_auth: (_name: i64): boolean => {
          const [name] = convertToUnsigned(_name);
          log.debug(`has_auth: ${bigIntToName(name)}`);
  
          let hasAuth = false;
          for (const auth of this.context.authorization) {
            if (nameToBigInt(auth.actor) === name) {
              const perm = nameToBigInt(auth.permission);
              if (perm === active || perm === owner) {
                hasAuth = true;
                break;
              }
            }
          }
          return hasAuth;
        },
        require_auth2: (_name: i64, _permission: i64): void => {
          const [name, permission] = convertToUnsigned(_name, _permission);
          log.debug(`require_auth2: ${bigIntToName(name)}@${bigIntToName(permission)}`);
  
          let hasAuth = false;
          for (const auth of this.context.authorization) {
            if (nameToBigInt(auth.actor) === name) {
              const perm = nameToBigInt(auth.permission);
              if (perm === permission) {
                hasAuth = true;
                break;
              }
            }
          }
          assert(hasAuth, `missing required authority ${bigIntToName(name)}@${bigIntToName(permission)}`);
        },
        is_account: (name: i64): boolean => {
          log.debug('is_account');
  
          const [accountNameBigInt] = convertToUnsigned(name)
          const accountName = bigIntToName(accountNameBigInt)
          return !!this.bc.getAccount(accountName)
        },
  
        require_recipient: (name: i64): void => {
          log.debug('require_recipient');
  
          const [accountNameBigInt] = convertToUnsigned(name)
          const accountName = bigIntToName(accountNameBigInt)
  
          const account = this.bc.getAccount(accountName)
          if (!account) {
            throw new Error(`Account ${accountName} missing for require_recipient`)
          }
  
          if (account.isContract && !account.name.equals(this.context.receiver.name)) {
            log.debug(`-> Current: ${this.context.receiver.name}::${this.context.action}`);
            log.debug(`-> Notify Action: ${account.name}::${this.context.action}`);
            log.debug(`-> Notify Data Size: ${this.context.data.length}`);
  
            const context = new VM.Context({
              receiver: account,
              firstReceiver: this.context.receiver,
              action: this.context.action,
              data: this.context.data,
              authorization: []
            })
  
            this.bc.notificationsQueue.push(context)
          }
        },
  
        send_inline: (action: ptr, size: i32): void => {
          log.debug('send_inline');
  
          const inlineBuffer = Buffer.from_(this.memory.buffer, action, size)
          const decodedAction = Serializer.decode({
            data: inlineBuffer,
            type: Action,
          })

          log.debug(`-> Current: ${this.context.receiver.name}::${this.context.action}`);
          log.debug(`-> Inline Action: ${decodedAction.account}::${decodedAction.name}`);
          log.debug(`-> Authority: ${decodedAction.authorization}`);
          log.debug(`-> Inline Action Size: ${decodedAction.data.array.length}`);
  
          // Check contract exists
          const contract = this.bc.getAccount(decodedAction.account)
          if (!contract || !contract.isContract) {
            throw new Error(`Contract ${decodedAction.account} is missing for inline action`)
          }
  
          const context = new VM.Context({
            sender: this.context.receiver.name,
            receiver: contract,
            firstReceiver: contract,
            action: decodedAction.name,
            data: decodedAction.data.array.slice(),
            decodedData: decodedAction.decodeData(contract.abi) as any,
            authorization: decodedAction.authorization
          })
          this.context.actionsQueue.push(context)
        },
        send_context_free_inline: (action: ptr, size: i32): void => {
          log.debug('send_context_free_inline');
          // TODO
          throw new Error('send_context_free_inline is not implemented')
        },
        publication_time: (): i64 => {
          log.debug('publication_time');
          // TODO
          throw new Error('publication_time is not implemented: Deferred TXs are deprecated')
          return 0n;
        },
        current_receiver: (): i64 => {
          log.debug('current_receiver');
          return BigInt.asIntN(64, this.context.receiver.toBigInt());
        },
        set_action_return_value: (value: ptr, size: i32): void => {
          log.debug('set_action_return_value');
          // TODO
          throw new Error('set_action_return_value is not implemented')
        },
  
        // chain
        get_active_producers: (producers: ptr, len: i32): i32 => {
          log.debug('get_active_producers');
          return 0;
        },
  
        // crypto
        assert_sha256: (data: ptr, len: i32, hash: ptr): void => {
          log.debug('assert_sha256');
          const result = new Uint8Array(sha256().update(Buffer.from_(this.memory.buffer, data, len)).digest());
          if (Buffer.compare(result, Buffer.from_(this.memory.buffer, hash, 32))) {
            throw new Error('hash mismatch');
          }
        },
        assert_sha1: (data: ptr, len: i32, hash: ptr): void => {
          log.debug('assert_sha1');
          const result = new Uint8Array(sha1().update(Buffer.from_(this.memory.buffer, data, len)).digest());
          if (Buffer.compare(result, Buffer.from_(this.memory.buffer, hash, 20))) {
            throw new Error('hash mismatch');
          }
        },
        assert_sha512: (data: ptr, len: i32, hash: ptr): void => {
          log.debug('assert_sha512');
          const result = new Uint8Array(sha512().update(Buffer.from_(this.memory.buffer, data, len)).digest());
          if (Buffer.compare(result, Buffer.from_(this.memory.buffer, hash, 64))) {
            throw new Error('hash mismatch');
          }
        },
        assert_ripemd160: (data: ptr, len: i32, hash: ptr): void => {
          log.debug('assert_ripemd160');
          const result = new Uint8Array(ripemd160().update(Buffer.from_(this.memory.buffer, data, len)).digest());
          if (Buffer.compare(result, Buffer.from_(this.memory.buffer, hash, 20))) {
            throw new Error('hash mismatch');
          }
        },
        sha256: (data: ptr, len: i32, hash: ptr): void => {
          log.debug('sha256');
          Buffer.from_(this.memory.buffer, hash, 32).set(new Uint8Array(sha256().update(Buffer.from_(this.memory.buffer, data, len)).digest()));
        },
        sha1: (data: ptr, len: i32, hash: ptr): void => {
          log.debug('sha1');
          Buffer.from_(this.memory.buffer, hash, 20).set(new Uint8Array(sha1().update(Buffer.from_(this.memory.buffer, data, len)).digest()));
        },
        sha512: (data: ptr, len: i32, hash: ptr): void => {
          log.debug('sha512');
          Buffer.from_(this.memory.buffer, hash, 64).set(new Uint8Array(sha512().update(Buffer.from_(this.memory.buffer, data, len)).digest()));
        },
        ripemd160: (data: ptr, len: i32, hash: ptr): void => {
          log.debug('ripemd160');
          Buffer.from_(this.memory.buffer, hash, 20).set(new Uint8Array(ripemd160().update(Buffer.from_(this.memory.buffer, data, len)).digest()));
        },
        recover_key: (digest: ptr, sig: ptr, siglen: i32, pub: ptr, publen: i32): i32 => {
          log.debug('recover_key');
          const signature = Buffer.from_(this.memory.buffer, sig, siglen);
          assert(signature[0] === 0, 'unsupported signature type');
          const publicKey = Signature.from({
            type: 'K1',
            r: signature.slice(2, 34),
            s: signature.slice(34, 66),
            recid: (signature[1] - 27) & 0x3,
          }).recoverDigest(Buffer.from_(this.memory.buffer, digest, 32)).data.array;
          const size = Math.min(publicKey.length + 1, publen);
          Buffer.from_(this.memory.buffer, pub, publen).set(publicKey.slice(0, size - 1), 1);
          return size;
        },
        assert_recover_key: (digest: ptr, sig: ptr, siglen: i32, pub: ptr, publen: i32): void => {
          log.debug('assert_recover_key');
          const signature = Buffer.from_(this.memory.buffer, sig, siglen);
          assert(signature[0] === 0, 'unsupported signature type');
          const publicKey = Buffer.from_(this.memory.buffer, pub, publen);
          assert(publicKey[0] === 0, 'unsupported public key type');
          assert(Signature.from({
            type: 'K1',
            r: signature.slice(2, 34),
            s: signature.slice(34, 66),
            recid: (signature[1] - 27) & 0x3,
          }).verifyDigest(
            Buffer.from_(this.memory.buffer, digest, 32),
            PublicKey.from({ type: 'K1', compressed: publicKey.slice(1) })
          ), 'recovered key is different from expected one');
        },
  
        // db
        db_store_i64: (_scope: i64, _table: i64, _payer: i64, _id: i64, data: ptr, len: i32): i32 => {
          const [scope, table, payer, id] = convertToUnsigned(_scope, _table, _payer, _id);
          log.debug(`db_store_i64: Scope ${bigIntToName(scope)} | Table ${bigIntToName(table)} | ID: ${id}`);
  
          const tab = this.findOrCreateTable(this.context.receiver.name, bigIntToName(scope), bigIntToName(table), bigIntToName(payer));
          assert(payer !== 0n, 'must specify a valid account to pay for new record');
          assert(!tab.has(id), 'key uniqueness violation');
          const kv = new KeyValueObject({
            tableId: tab.id,
            primaryKey: id,
            payer,
            value: new Uint8Array(this.memory.buffer, data, len).slice()
          });
          kv.tableId = tab.id;
          kv.primaryKey = id;
          kv.payer = payer;
          kv.value = new Uint8Array(this.memory.buffer, data, len).slice();
          tab.set(id, kv);
          this.kvCache.cacheTable(tab);
          return this.kvCache.add(kv);
        },
        db_update_i64: (iterator: i32, _payer: i64, data: ptr, len: i32): void => {
          log.debug(`db_update_i64: Iterator ${iterator}`);
          const payer = BigInt.asUintN(64, _payer);
  
          const kvPrev = this.kvCache.get(iterator);
          const kv = kvPrev.clone();
          const tab = this.kvCache.getTable(kv.tableId);
          assert(tab.code === this.context.receiver.toBigInt(), 'db access violation');
          if (payer) {
            kv.payer = payer;
          }
          kv.value = new Uint8Array(this.memory.buffer, data, len).slice();
          tab.set(kv.primaryKey, kv);
          this.kvCache.set(iterator, kv);
        },
        db_remove_i64: (iterator: i32): void => {
          log.debug(`db_remove_i64: Iterator ${iterator}`);
          const kv = this.kvCache.get(iterator);
          const tab = this.kvCache.getTable(kv.tableId);
          assert(tab.code === this.context.receiver.toBigInt(), 'db access violation');
          tab.delete(kv.primaryKey);
          this.kvCache.remove(iterator);
        },
        db_get_i64: (iterator: i32, data: ptr, len: i32): i32 => {
          log.debug(`db_get_i64: Iterator ${iterator}`);
          const kv = this.kvCache.get(iterator);
          if (!len) {
            return kv.value.length;
          }
          const size = Math.min(len, kv.value.length);
          Buffer.from_(this.memory.buffer, data, len).set(kv.value.subarray(0, size));
          return size;
        },
        db_next_i64: (iterator: i32, primary: ptr): i32 => {
          log.debug(`db_next_i64: Iterator ${iterator}`);
          if (iterator < -1) return -1;
          const kv = this.kvCache.get(iterator);
          const kvNext = this.bc.store.getTableById(kv.tableId).next(kv.primaryKey);
          if (!kvNext) {
            return this.kvCache.getEndIteratorByTableId(kv.tableId);
          }
          this.memory.writeUInt64(primary, kvNext.primaryKey);
          return this.kvCache.add(kvNext);
        },
        db_previous_i64: (iterator: i32, primary: ptr): i32 => {
          log.debug(`db_previous_i64: Iterator ${iterator}`);
          if (iterator < -1) {
            const tab = this.kvCache.findTableByEndIterator(iterator);
            assert(tab, 'not a valid end iterator');
            const kv = tab.penultimate();
            if (!kv) return -1;
            this.memory.writeUInt64(primary, kv.primaryKey);
            return this.kvCache.add(kv);
          }
          const kv = this.kvCache.get(iterator);
          const kvPrev = this.bc.store.getTableById(kv.tableId).prev(kv.primaryKey);
          if (!kvPrev) {
            return -1;
          }
          this.memory.writeUInt64(primary, kvPrev.primaryKey);
          return this.kvCache.add(kvPrev);
        },
        db_find_i64: (_code: i64, _scope: i64, _table: i64, _id: i64): i32 => {
          const [code, scope, table, id] = convertToUnsigned(_code, _scope, _table, _id);
          log.debug(`db_find_i64: Contract ${bigIntToName(code)} | Scope ${bigIntToName(scope)} | Table ${bigIntToName(table)} | ID: ${id}`);
  
          const tab = this.findTable(bigIntToName(code), bigIntToName(scope), bigIntToName(table));
          if (!tab) return -1;
          const ei = this.kvCache.cacheTable(tab);
          const kv = tab.get(id);
          if (!kv) return ei;
          return this.kvCache.add(kv);
        },
        db_lowerbound_i64: (_code: i64, _scope: i64, _table: i64, _id: i64): i32 => {
          const [code, scope, table, id] = convertToUnsigned(_code, _scope, _table, _id);
          log.debug(`db_lowerbound_i64: Contract ${bigIntToName(code)} | Scope ${bigIntToName(scope)} | Table ${bigIntToName(table)} | ID: ${id}`);
  
          const tab = this.bc.store.findTable(code, scope, table);
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
          const [code, scope, table, id] = convertToUnsigned(_code, _scope, _table, _id);
          log.debug(`db_upperbound_i64: Contract ${bigIntToName(code)} | Scope ${bigIntToName(scope)} | Table ${bigIntToName(table)} | ID: ${id}`);
  
          const tab = this.bc.store.findTable(code, scope, table);
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
          const [code, scope, table] = convertToUnsigned(_code, _scope, _table);
          log.debug(`db_end_i64: Contract ${bigIntToName(code)} | Scope ${bigIntToName(scope)} | Table ${bigIntToName(table)}`);
  
          const tab = this.findTable(bigIntToName(code), bigIntToName(scope), bigIntToName(table));
          if (!tab) return -1;
          return this.kvCache.cacheTable(tab);
        },
        // uint64_t secondary index api
        db_idx64_store: (_scope: bigint, _table: bigint, _payer: bigint, _id: bigint, secondary: ptr): i32 => {
          const [scope, table, payer, id] = convertToUnsigned(_scope, _table, _payer, _id);
          log.debug(`db_idx64_store: Scope ${bigIntToName(scope)} | Table ${bigIntToName(table)} | Payer ${bigIntToName(payer)} | ID ${id}`);
  
          const itr = this.genericIndex.store(
            this.bc.store.idx64, this.idx64,
            scope, table, payer, id, Buffer.from_(this.memory.buffer, secondary, 8), SecondaryKeyConverter.uint64);
          return itr;
        },
        db_idx64_update: (iterator: number, _payer: bigint, secondary: ptr): void => {
          log.debug('db_idx64_update');
          const payer = BigInt.asUintN(64, _payer);
          this.genericIndex.update(this.bc.store.idx64, this.idx64, iterator, payer,
            Buffer.from_(this.memory.buffer, secondary, 8), SecondaryKeyConverter.uint64);
        },
        db_idx64_remove: (iterator: number): void => {
          log.debug('db_idx64_remove');
          this.genericIndex.remove(this.bc.store.idx64, this.idx64, iterator);
        },
        db_idx64_find_secondary: (_code: bigint, _scope: bigint, _table: bigint, secondary: ptr, primary: ptr): i32 => {
          log.debug('db_idx64_find_secondary');
          const [code, scope, table] = convertToUnsigned(_code, _scope, _table);
  
          return this.genericIndex.find_secondary(this.bc.store.idx64, this.idx64,
            code, scope, table, Buffer.from_(this.memory.buffer, secondary, 8), primary, SecondaryKeyConverter.uint64);
        },
        db_idx64_find_primary: (_code: bigint, _scope: bigint, _table: bigint, secondary: ptr, _primary: bigint): i32 => {
          log.debug('db_idx64_find_primary');
          const [code, scope, table, primaryKey] = convertToUnsigned(_code, _scope, _table, _primary);
  
          return this.genericIndex.find_primary(this.bc.store.idx64, this.idx64,
            code, scope, table, Buffer.from_(this.memory.buffer, secondary, 8), primaryKey, SecondaryKeyConverter.uint64);
        },
        db_idx64_lowerbound: (_code: bigint, _scope: bigint, _table: bigint, secondary: ptr, primary: ptr): i32 => {
          log.debug('db_idx64_lowerbound');
          const [code, scope, table] = convertToUnsigned(_code, _scope, _table);
  
          return this.genericIndex.lowerbound_secondary(this.bc.store.idx64, this.idx64,
            code, scope, table, Buffer.from_(this.memory.buffer, secondary, 8), primary, SecondaryKeyConverter.uint64);
        },
        db_idx64_upperbound: (_code: bigint, _scope: bigint, _table: bigint, secondary: ptr, primary: ptr): i32 => {
          log.debug('db_idx64_upperbound');
          const [code, scope, table] = convertToUnsigned(_code, _scope, _table);
  
          return this.genericIndex.upperbound_secondary(this.bc.store.idx64, this.idx64,
            code, scope, table, Buffer.from_(this.memory.buffer, secondary, 8), primary, SecondaryKeyConverter.uint64);
        },
        db_idx64_end: (_code: bigint, _scope: bigint, _table: bigint): i32 => {
          log.debug('db_idx64_end');
          const [code, scope, table] = convertToUnsigned(_code, _scope, _table);
  
          return this.genericIndex.end_secondary(this.bc.store.idx64, this.idx64, code, scope, table);
        },
        db_idx64_next: (iterator: number, primary: ptr): i32 => {
          log.debug('db_idx64_next');
          return this.genericIndex.next_secondary(this.bc.store.idx64, this.idx64, iterator, primary);
        },
        db_idx64_previous: (iterator: number, primary: ptr): i32 => {
          log.debug('db_idx64_previous');
          return this.genericIndex.previous_secondary(this.bc.store.idx64, this.idx64, iterator, primary);
        },
  
        // uint128_t secondary index api
        db_idx128_store: (_scope: bigint, _table: bigint, _payer: bigint, _id: bigint, secondary: ptr): i32 => {
          log.debug(`db_idx128_store:  Scope ${bigIntToName(_scope)} | Table ${bigIntToName(_table)} | Secondary ${SecondaryKeyConverter.uint128.from(Buffer.from_(this.memory.buffer, secondary, 16))}`)
          const [scope, table, payer, id] = convertToUnsigned(_scope, _table, _payer, _id);
  
          const itr = this.genericIndex.store(
            this.bc.store.idx128, this.idx128,
            scope, table, payer, id, Buffer.from_(this.memory.buffer, secondary, 16), SecondaryKeyConverter.uint128);
          return itr;
        },
        db_idx128_update: (iterator: number, _payer: bigint, secondary: ptr): void => {
          log.debug('db_idx128_update');
          const payer = BigInt.asUintN(64, _payer);
          this.genericIndex.update(this.bc.store.idx128, this.idx128, iterator, payer,
            Buffer.from_(this.memory.buffer, secondary, 16), SecondaryKeyConverter.uint128);
        },
        db_idx128_remove: (iterator: number): void => {
          log.debug('db_idx128_remove');
          this.genericIndex.remove(this.bc.store.idx128, this.idx128, iterator);
        },
        db_idx128_find_secondary: (_code: bigint, _scope: bigint, _table: bigint, secondary: ptr, primary: ptr): i32 => {
          log.debug('db_idx128_find_secondary: ', SecondaryKeyConverter.uint128.from(Buffer.from_(this.memory.buffer, secondary, 16)));
          const [code, scope, table] = convertToUnsigned(_code, _scope, _table);
  
          return this.genericIndex.find_secondary(this.bc.store.idx128, this.idx128,
            code, scope, table, Buffer.from_(this.memory.buffer, secondary, 16), primary, SecondaryKeyConverter.uint128);
        },
        db_idx128_find_primary: (_code: bigint, _scope: bigint, _table: bigint, secondary: ptr, _primary: bigint): i32 => {
          log.debug(`db_idx128_find_primary: Code ${bigIntToName(_code)} | Scope ${bigIntToName(_scope)} | Table ${bigIntToName(_table)} | Primary ${_primary} | Secondary ${SecondaryKeyConverter.uint128.from(Buffer.from_(this.memory.buffer, secondary, 16))}`)
          const [code, scope, table, primaryKey] = convertToUnsigned(_code, _scope, _table, _primary);
  
          return this.genericIndex.find_primary(this.bc.store.idx128, this.idx128,
            code, scope, table, Buffer.from_(this.memory.buffer, secondary, 16), primaryKey, SecondaryKeyConverter.uint128);
        },
        db_idx128_lowerbound: (_code: bigint, _scope: bigint, _table: bigint, secondary: ptr, primary: ptr): i32 => {
          log.debug(`db_idx128_lowerbound: Code ${bigIntToName(_code)} | Scope ${bigIntToName(_scope)} | Table ${bigIntToName(_table)} | Secondary ${SecondaryKeyConverter.uint128.from(Buffer.from_(this.memory.buffer, secondary, 16))}`)
          const [code, scope, table] = convertToUnsigned(_code, _scope, _table);
  
          return this.genericIndex.lowerbound_secondary(this.bc.store.idx128, this.idx128,
            code, scope, table, Buffer.from_(this.memory.buffer, secondary, 16), primary, SecondaryKeyConverter.uint128);
        },
        db_idx128_upperbound: (_code: bigint, _scope: bigint, _table: bigint, secondary: ptr, primary: ptr): i32 => {
          log.debug(`db_idx128_upperbound: Code ${bigIntToName(_code)} | Scope ${bigIntToName(_scope)} | Table ${bigIntToName(_table)} | Secondary ${SecondaryKeyConverter.uint128.from(Buffer.from_(this.memory.buffer, secondary, 16))}`)
          const [code, scope, table] = convertToUnsigned(_code, _scope, _table);
  
          return this.genericIndex.upperbound_secondary(this.bc.store.idx128, this.idx128,
            code, scope, table, Buffer.from_(this.memory.buffer, secondary, 16), primary, SecondaryKeyConverter.uint128);
        },
        db_idx128_end: (_code: bigint, _scope: bigint, _table: bigint): i32 => {
          log.debug('db_idx128_end');
          const [code, scope, table] = convertToUnsigned(_code, _scope, _table);
  
          return this.genericIndex.end_secondary(this.bc.store.idx128, this.idx128, code, scope, table);
        },
        db_idx128_next: (iterator: number, primary: ptr): i32 => {
          log.debug('db_idx128_next');
          return this.genericIndex.next_secondary(this.bc.store.idx128, this.idx128, iterator, primary);
        },
        db_idx128_previous: (iterator: number, primary: ptr): i32 => {
          log.debug('db_idx128_previous');
          return this.genericIndex.previous_secondary(this.bc.store.idx128, this.idx128, iterator, primary);
        },
  
        // 256-bit secondary index api
        db_idx256_store: (_scope: bigint, _table: bigint, _payer: bigint, _id: bigint, secondary: ptr): i32 => {
          log.debug('db_idx256_store');
          const [scope, table, payer, id] = convertToUnsigned(_scope, _table, _payer, _id);
  
          const itr = this.genericIndex.store(
            this.bc.store.idx256, this.idx256,
            scope, table, payer, id, Buffer.from_(this.memory.buffer, secondary, 32), SecondaryKeyConverter.checksum256);
          return itr;
        },
        db_idx256_update: (iterator: number, _payer: bigint, secondary: ptr): void => {
          log.debug('db_idx256_update');
          const payer = BigInt.asUintN(64, _payer);
          this.genericIndex.update(this.bc.store.idx256, this.idx256, iterator, payer,
            Buffer.from_(this.memory.buffer, secondary, 32), SecondaryKeyConverter.checksum256);
        },
        db_idx256_remove: (iterator: number): void => {
          log.debug('db_idx256_remove');
          this.genericIndex.remove(this.bc.store.idx256, this.idx256, iterator);
        },
        db_idx256_find_secondary: (_code: bigint, _scope: bigint, _table: bigint, secondary: ptr, primary: ptr): i32 => {
          log.debug('db_idx256_find_secondary');
          const [code, scope, table] = convertToUnsigned(_code, _scope, _table);
  
          return this.genericIndex.find_secondary(this.bc.store.idx256, this.idx256,
            code, scope, table, Buffer.from_(this.memory.buffer, secondary, 32), primary, SecondaryKeyConverter.checksum256);
        },
        db_idx256_find_primary: (_code: bigint, _scope: bigint, _table: bigint, secondary: ptr, _primary: bigint): i32 => {
          log.debug('db_idx256_find_primary');
          const [code, scope, table, primaryKey] = convertToUnsigned(_code, _scope, _table, _primary);
  
          return this.genericIndex.find_primary(this.bc.store.idx256, this.idx256,
            code, scope, table, Buffer.from_(this.memory.buffer, secondary, 32), primaryKey, SecondaryKeyConverter.checksum256);
        },
        db_idx256_lowerbound: (_code: bigint, _scope: bigint, _table: bigint, secondary: ptr, primary: ptr): i32 => {
          log.debug('db_idx256_lowerbound');
          const [code, scope, table] = convertToUnsigned(_code, _scope, _table);
  
          return this.genericIndex.lowerbound_secondary(this.bc.store.idx256, this.idx256,
            code, scope, table, Buffer.from_(this.memory.buffer, secondary, 32), primary, SecondaryKeyConverter.checksum256);
        },
        db_idx256_upperbound: (_code: bigint, _scope: bigint, _table: bigint, secondary: ptr, primary: ptr): i32 => {
          log.debug('db_idx256_upperbound');
          const [code, scope, table] = convertToUnsigned(_code, _scope, _table);
  
          return this.genericIndex.upperbound_secondary(this.bc.store.idx256, this.idx256,
            code, scope, table, Buffer.from_(this.memory.buffer, secondary, 32), primary, SecondaryKeyConverter.checksum256);
        },
        db_idx256_end: (_code: bigint, _scope: bigint, _table: bigint): i32 => {
          log.debug('db_idx256_end');
          const [code, scope, table] = convertToUnsigned(_code, _scope, _table);
  
          return this.genericIndex.end_secondary(this.bc.store.idx256, this.idx256, code, scope, table);
        },
        db_idx256_next: (iterator: number, primary: ptr): i32 => {
          log.debug('db_idx256_next');
          return this.genericIndex.next_secondary(this.bc.store.idx256, this.idx256, iterator, primary);
        },
        db_idx256_previous: (iterator: number, primary: ptr): i32 => {
          log.debug('db_idx256_previous');
          return this.genericIndex.previous_secondary(this.bc.store.idx256, this.idx256, iterator, primary);
        },
  
        // double secondary index api
        db_idx_double_store: (_scope: bigint, _table: bigint, _payer: bigint, _id: bigint, secondary: ptr): i32 => {
          log.debug('db_idx_double_store');
          const [scope, table, payer, id] = convertToUnsigned(_scope, _table, _payer, _id);
  
          const itr = this.genericIndex.store(
            this.bc.store.idxDouble, this.idxDouble,
            scope, table, payer, id, Buffer.from_(this.memory.buffer, secondary, 8), SecondaryKeyConverter.double);
          return itr;
        },
        db_idx_double_update: (iterator: number, _payer: bigint, secondary: ptr): void => {
          log.debug('db_idx_double_update');
          const payer = BigInt.asUintN(64, _payer);
          this.genericIndex.update(this.bc.store.idxDouble, this.idxDouble, iterator, payer,
            Buffer.from_(this.memory.buffer, secondary, 8), SecondaryKeyConverter.double);
        },
        db_idx_double_remove: (iterator: number): void => {
          log.debug('db_idx_double_remove');
          this.genericIndex.remove(this.bc.store.idxDouble, this.idxDouble, iterator);
        },
        db_idx_double_find_secondary: (_code: bigint, _scope: bigint, _table: bigint, secondary: ptr, primary: ptr): i32 => {
          log.debug('db_idx_double_find_secondary');
          const [code, scope, table] = convertToUnsigned(_code, _scope, _table);
  
          return this.genericIndex.find_secondary(this.bc.store.idxDouble, this.idxDouble,
            code, scope, table, Buffer.from_(this.memory.buffer, secondary, 8), primary, SecondaryKeyConverter.double);
        },
        db_idx_double_find_primary: (_code: bigint, _scope: bigint, _table: bigint, secondary: ptr, _primary: bigint): i32 => {
          log.debug('db_idx_double_find_primary');
          const [code, scope, table, primaryKey] = convertToUnsigned(_code, _scope, _table, _primary);
  
          return this.genericIndex.find_primary(this.bc.store.idxDouble, this.idxDouble,
            code, scope, table, Buffer.from_(this.memory.buffer, secondary, 8), primaryKey, SecondaryKeyConverter.double);
        },
        db_idx_double_lowerbound: (_code: bigint, _scope: bigint, _table: bigint, secondary: ptr, primary: ptr): i32 => {
          log.debug('db_idx_double_lowerbound');
          const [code, scope, table] = convertToUnsigned(_code, _scope, _table);
  
          return this.genericIndex.lowerbound_secondary(this.bc.store.idxDouble, this.idxDouble,
            code, scope, table, Buffer.from_(this.memory.buffer, secondary, 8), primary, SecondaryKeyConverter.double);
        },
        db_idx_double_upperbound: (_code: bigint, _scope: bigint, _table: bigint, secondary: ptr, primary: ptr): i32 => {
          log.debug('db_idx_double_upperbound');
          const [code, scope, table] = convertToUnsigned(_code, _scope, _table);
  
          return this.genericIndex.upperbound_secondary(this.bc.store.idxDouble, this.idxDouble,
            code, scope, table, Buffer.from_(this.memory.buffer, secondary, 8), primary, SecondaryKeyConverter.double);
        },
        db_idx_double_end: (_code: bigint, _scope: bigint, _table: bigint): i32 => {
          log.debug('db_idx_double_end');
          const [code, scope, table] = convertToUnsigned(_code, _scope, _table);
  
          return this.genericIndex.end_secondary(this.bc.store.idxDouble, this.idxDouble, code, scope, table);
        },
        db_idx_double_next: (iterator: number, primary: ptr): i32 => {
          log.debug('db_idx_double_next');
          return this.genericIndex.next_secondary(this.bc.store.idxDouble, this.idxDouble, iterator, primary);
        },
        db_idx_double_previous: (iterator: number, primary: ptr): i32 => {
          log.debug('db_idx_double_previous');
          return this.genericIndex.previous_secondary(this.bc.store.idxDouble, this.idxDouble, iterator, primary);
        },
  
        // long double secondary index api
        /*
        db_idx_long_double_store: () => {},
        db_idx_long_double_update: () => {},
        db_idx_long_double_remove: () => {},
        db_idx_long_double_find_secondary: () => {},
        db_idx_long_double_find_primary: () => {},
        db_idx_long_double_lowerbound: () => {},
        db_idx_long_double_upperbound: () => {},
        db_idx_long_double_end: () => {},
        db_idx_long_double_next: () => {},
        db_idx_long_double_previous: () => {},
        */
  
        // permission
        check_transaction_authorization: (
          txData: ptr, txSize: i32,
          pubkeysData: ptr, pubkeysSize: i32,
          permsData: ptr, permsSize: i32
        ): i32 => {
          log.debug('check_transaction_authorization');
          // TODO
          throw new Error('check_transaction_authorization is not implemented')
          return 1;
        },
        check_permission_authorization: (
          account: i64, permission: i64,
          pubkeysData: ptr, pubkeysSize: i32,
          permsData: ptr, permsSize: i32,
          delayUs: i64
        ): i32 => {
          log.debug('check_permission_authorization');
          // TODO
          throw new Error('check_permission_authorization is not implemented')
          return 1;
        },
        get_permission_last_used: (account: i64, permission: i64): i64 => {
          log.debug('get_permission_last_used');
          // TODO
          throw new Error('get_permission_last_used is not implemented')
          return 0n;
        },
        get_account_creation_time: (_name: i64): i64 => {
          log.debug('get_account_creation_time');

          const [name] = convertToUnsigned(_name);
          const account = this.bc.getAccount(bigIntToName(name))
          if (!account) {
            throw new Error(`Account ${name} is missing for get_account_creation_time`)
          }

          return BigInt(account.creationTime.toMilliseconds()) * 1000n;
        },
  
        // print
        prints: (msg: i32): void => {
          const str = this.memory.readString(msg)
          log.debug('prints', str);
          this.bc.console += str;
        },
        prints_l: (msg: i32, len: i32): void => {
          const str = this.memory.readString(msg, len)
          log.debug('prints_l', str);
          this.bc.console += str;
        },
        printi: (value: i64): void => {
          const str = value.toString()
          log.debug('printi', str);
          this.bc.console += str;
        },
        printui: (value: i64): void => {
          const str = BigInt.asUintN(64, value).toString()
          log.debug('printui', str);
          this.bc.console += str;
        },
        printi128: (value: i32): void => {
          const str = this.memory.readInt128(value).toString()
          log.debug('printi128', str);
          this.bc.console += str;
        },
        printui128: (value: i32): void => {
          const str = this.memory.readUInt128(value).toString()
          log.debug('printui128', str);
          this.bc.console += str;
        },
        printsf: (value: f32): void => {
          // TODO: print to fit precision
          const str = value.toString()
          log.debug('printsf', str);
          this.bc.console += str;
        },
        printdf: (value: f64): void => {
          // TODO: print to fit precision
          const str = value.toString()
          log.debug('printsdf', str);
          this.bc.console += str;
        },
        printqf: (value: i32): void => {
          // TODO: print to fit precision
          const str = value.toString()
          log.debug('printsqf', str);
          this.bc.console += str;
        },
        printn: (value: i64): void => {
          const str = bigIntToName(value).toString()
          log.debug('printn', str);
          this.bc.console += str;
        },
        printhex: (data: i32, len: i32): void => {
          const str = this.memory.readHex(data, len)
          log.debug('printhex', str);
          this.bc.console += str;
        },
  
        // TODO: privileged APIs
        set_proposed_producers: (data: ptr, size: number): bigint => { return 0n; },
        set_blockchain_parameters_packed: (data: ptr, len: number): void => {},
        get_blockchain_parameters_packed: (data: ptr, len: number): number => { return 0; },
  
        // TODO: security_group APIs
  
        // system
        eosio_assert: (test: i32, msg: ptr): void => {
          // log.debug('eosio_assert');
          if (!test) {
            throw new Error(protonAssert(this.memory.readString(msg)))
          }
        },
        eosio_assert_message: (test: i32, msg: ptr, msg_len: i32): void => {
          // log.debug('eosio_assert_message');
          if (!test) {
            throw new Error(protonAssertMessage(this.memory.readString(msg, msg_len)))
          }
        },
        eosio_assert_code: (test: i32, code: i64): void => {
          // log.debug('eosio_assert_code');
          if (!test) {
            throw new Error(protonAssertMessage(protonAssertCode(BigInt.asUintN(64, code))))
          }
        },
        eosio_exit: (code: i32): void => {
          log.debug('eosio_exit');
          // HACK: throw error to stop wasm execution forcibly
          throw new EosioExitResult(code);
        },
        current_time: (): i64 => {
          log.debug('current_time', BigInt(this.bc.timestamp.toMilliseconds()) * 1000n);
          return BigInt(this.bc.timestamp.toMilliseconds()) * 1000n;
        },
        is_feature_activated: (digest: ptr): boolean => {
          log.debug('is_feature_activated');
          throw new Error('is_feature_activated is not implemented')
          return false;
        },
        get_sender: (): i64 => {
          log.debug('get_sender');
          return BigInt.asIntN(64, nameToBigInt(this.context.sender));
        },
  
        // transaction
        send_deferred: (sender: ptr, payer: i64, tx: ptr, size: i32, replace: i32) => {
          log.debug('send_deferred');
          // TODO
          throw new Error('send_deferred is not implemented: Deferred TXs are deprecated')
        },
        cancel_deferred: (sender: ptr): i32 => {
          log.debug('cancel_deferred');
          // TODO
          throw new Error('cancel_deferred is not implemented: Deferred TXs are deprecated')
          return 0;
        },
        read_transaction: (data: ptr, buffer_size: i32): i32 => {
          log.debug('read_transaction');

          const trx = Serializer.encode({object: this.context.transaction}).array;
  
          const s = trx.length
          if (buffer_size == 0) return s;

          const copy_size = Math.min(buffer_size, s)
          const destination = new Uint8Array(this.memory.buffer, data, copy_size);
          destination.set(trx.slice(0, copy_size));

          return copy_size
        },
        transaction_size: (): i32 => {
          return Serializer.encode({object: this.context.transaction}).array.length
        },
        tapos_block_num: (): i32 => {
          log.debug('tapos_block_num');
          return this.context.transaction.ref_block_num.toNumber()
        },
        tapos_block_prefix: (): i32 => {
          log.debug('tapos_block_prefix');
          return this.context.transaction.ref_block_prefix.toNumber()
        },
        expiration: (): i32 => {
          log.debug('expiration');
          return this.context.transaction.expiration.value.toNumber()
        },
        get_action: (type: i32, index: i32, buffer: ptr, buffer_size: i32): i32 => {
          log.debug('get_action');

          const trx = this.context.transaction
          let action: Action

          if (type == 0) {
            if (index >= trx.context_free_actions.length) {
              return -1
            }
            action = trx.context_free_actions[index]
          }
          else if (type == 1) {
            if (index >= trx.actions.length) {
              return -1
            }
            action = trx.actions[index]
          }

          if (!action) {
            throw new Error('action is not found')
          }

          const packed = Serializer.encode({ object: action }).array
          const ps = packed.length
          if (ps <= buffer_size) {
            const destination = new Uint8Array(this.memory.buffer, buffer, buffer_size);
            destination.set(packed);
          }
          return ps
        },
        get_context_free_data: (index: i32, buffer: ptr, size: i32): i32 => {
          log.debug('get_context_free_data');
          // TODO
          throw new Error('get_context_free_data is not implemented')
          return 0;
        },
  
        // builtins
        abort: () => {
          log.debug('abort');
          throw new Error('abort');
        },
        memmove: (dest: ptr, src: ptr, count: i32): ptr => {
          // log.debug('memmove');
          const destination = new Uint8Array(this.memory.buffer, dest, count);
          const source = new Uint8Array(this.memory.buffer, src, count);
          destination.set(source);
          return dest;
        },
        memset: (dest: ptr, ch: i32, count: i32): ptr => {
          // log.debug('memset');
          const destination = new Uint8Array(this.memory.buffer, dest, count);
          const source = Buffer.alloc(count, ch);
          destination.set(source);
          return dest;
        },
        memcpy: (dest: ptr, src: ptr, count: i32): ptr => {
          // log.debug('memcpy');
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
        __ashlti3: () => { throw new Error("Not implemented _ashlti3") },
        __ashrti3: () => { throw new Error("Not implemented _ashrti3") },
        __lshlti3: () => { throw new Error("Not implemented _lshlti3") },
        __lshrti3: () => { throw new Error("Not implemented _lshrti3") },
        __divti3: (ret: ptr, _la: i64, _ha: i64, _lb: i64, _hb: i64): void => { 
          const [la, ha, lb, hb] = convertToUnsigned(_la, _ha, _lb, _hb);

          let lhs: i128 = BigInt(ha)
          let rhs: i128 = BigInt(hb)

          lhs = BigInt.asUintN(128, lhs << BigInt(64));
          lhs = BigInt.asUintN(128, lhs | la);
         
          rhs = BigInt.asUintN(128, rhs << BigInt(64));
          rhs = BigInt.asUintN(128, rhs | lb);
         
          lhs = BigInt.asUintN(128, lhs / rhs);

          const retBuffer = Buffer.from_(this.memory.buffer, ret, 16)
          SecondaryKeyConverter.int128.to(retBuffer, lhs)
        },
        __udivti3: (ret: ptr, _la: i64, _ha: i64, _lb: i64, _hb: i64): void => { 
          const [la, ha, lb, hb] = convertToUnsigned(_la, _ha, _lb, _hb);

          let lhs: i128 = BigInt(ha)
          let rhs: i128 = BigInt(hb)

          lhs = BigInt.asUintN(128, lhs << BigInt(64));
          lhs = BigInt.asUintN(128, lhs | la);
         
          rhs = BigInt.asUintN(128, rhs << BigInt(64));
          rhs = BigInt.asUintN(128, rhs | lb);
         
          lhs = BigInt.asUintN(128, lhs / rhs);

          const retBuffer = Buffer.from_(this.memory.buffer, ret, 16)
          SecondaryKeyConverter.uint128.to(retBuffer, lhs)
        },
        __multi3: (ret: ptr, _la: i64, _ha: i64, _lb: i64, _hb: i64): void => { 
          const [la, ha, lb, hb] = convertToUnsigned(_la, _ha, _lb, _hb);

          let lhs: i128 = BigInt(ha)
          let rhs: i128 = BigInt(hb)

          lhs = BigInt.asUintN(128, lhs << BigInt(64));
          lhs = BigInt.asUintN(128, lhs | la);
         
          rhs = BigInt.asUintN(128, rhs << BigInt(64));
          rhs = BigInt.asUintN(128, rhs | lb);
         
          lhs = BigInt.asUintN(128, lhs * rhs);

          const retBuffer = Buffer.from_(this.memory.buffer, ret, 16)
          SecondaryKeyConverter.int128.to(retBuffer, lhs)
        },
        __modti3: (ret: ptr, _la: i64, _ha: i64, _lb: i64, _hb: i64) => {
          const [la, ha, lb, hb] = convertToUnsigned(_la, _ha, _lb, _hb);

          let lhs: i128 = BigInt(ha)
          let rhs: i128 = BigInt(hb)

          lhs = BigInt.asUintN(128, lhs << BigInt(64));
          lhs = BigInt.asUintN(128, lhs | la);
         
          rhs = BigInt.asUintN(128, rhs << BigInt(64));
          rhs = BigInt.asUintN(128, rhs | lb);
         
          lhs = BigInt.asUintN(128, lhs % rhs);

          const retBuffer = Buffer.from_(this.memory.buffer, ret, 16)
          SecondaryKeyConverter.int128.to(retBuffer, lhs)
         },
        __umodti3: (ret: ptr, _la: i64, _ha: i64, _lb: i64, _hb: i64) => {
          const [la, ha, lb, hb] = convertToUnsigned(_la, _ha, _lb, _hb);

          let lhs: i128 = BigInt(ha)
          let rhs: i128 = BigInt(hb)

          lhs = BigInt.asUintN(128, lhs << BigInt(64));
          lhs = BigInt.asUintN(128, lhs | la);
         
          rhs = BigInt.asUintN(128, rhs << BigInt(64));
          rhs = BigInt.asUintN(128, rhs | lb);
         
          lhs = BigInt.asUintN(128, lhs % rhs);

          const retBuffer = Buffer.from_(this.memory.buffer, ret, 16)
          SecondaryKeyConverter.uint128.to(retBuffer, lhs)
         },
        __addtf3: (a: ptr, b: i64, c: i64, d: i64, e: i64): void => { throw new Error("Not implemented _addtf3: (a: ptr, b: i64, c: i64, d: i64, e: i64)") },
        __subtf3: (a: ptr, b: i64, c: i64, d: i64, e: i64): void => { throw new Error("Not implemented _subtf3: (a: ptr, b: i64, c: i64, d: i64, e: i64)") },
        __multf3: (a: ptr, b: i64, c: i64, d: i64, e: i64): void => { throw new Error("Not implemented _multf3: (a: ptr, b: i64, c: i64, d: i64, e: i64)") },
        __divtf3: (a: ptr, b: i64, c: i64, d: i64, e: i64): void => { throw new Error("Not implemented _divtf3: (a: ptr, b: i64, c: i64, d: i64, e: i64)") },
        __negtf2: () => { throw new Error("Not implemented _negtf2") },
        __extendsftf2: (a: ptr, b: f32): void => { throw new Error("Not implemented _extendsftf2: (a: ptr, b: f32)") },
        __extenddftf2: (a: ptr, b: f64): void => { throw new Error("Not implemented _extenddftf2: (a: ptr, b: f64)") },
        __trunctfdf2: (a: i64, b: i64): f64 => { throw new Error("Not implemented __trunctfdf2"); return 0.0; },
        __trunctfsf2: (a: i64, b: i64): f32 => { throw new Error("Not implemented __trunctfsf2"); return 0.0; },
        __fixtfsi: () => { throw new Error("Not implemented _fixtfsi") },
        __fixtfdi: () => { throw new Error("Not implemented _fixtfdi") },
        __fixtfti: () => { throw new Error("Not implemented _fixtfti") },
        __fixunstfsi: () => { throw new Error("Not implemented _fixunstfsi") },
        __fixunstfdi: () => { throw new Error("Not implemented _fixunstfdi") },
        __fixunstfti: () => { throw new Error("Not implemented _fixunstfti") },
        __fixsfti: () => { throw new Error("Not implemented _fixsfti") },
        __fixdfti: () => { throw new Error("Not implemented _fixdfti") },
        __fixunssfti: () => { throw new Error("Not implemented _fixunssfti") },
        __fixunsdfti: () => { throw new Error("Not implemented _fixunsdfti") },
        __floatsidf: () => { throw new Error("Not implemented _floatsidf") },
        __floatsitf: (a: ptr, b: i32): void => { throw new Error("Not implemented _floatsitf: (a: ptr, b: i32)") },
        __floatditf: () => { throw new Error("Not implemented _floatditf") },
        __floatunsitf: (a: ptr, b: i32): void => { throw new Error("Not implemented _floatunsitf: (a: ptr, b: i32)") },
        __floatunditf: () => { throw new Error("Not implemented _floatunditf") },
        __floattidf: () => { throw new Error("Not implemented _floattidf") },
        __floatuntidf: () => { throw new Error("Not implemented _floatuntidf") },
        __cmptf2: () => { throw new Error("Not implemented _cmptf2") },
        __eqtf2: (a: i64, b: i64, c: i64, d: i64): i32 => { return 0; },
        __netf2: (a: i64, b: i64, c: i64, d: i64): i32 => { return 0; },
        __getf2: (a: i64, b: i64, c: i64, d: i64): i32 => { return 0; },
        __gttf2: () => { throw new Error("Not implemented _gttf2") },
        __letf2: (a: i64, b: i64, c: i64, d: i64): i32 => { return 0; },
        __lttf2: () => { throw new Error("Not implemented _lttf2") },
        __unordtf2: () => { throw new Error("Not implemented _unordtf2") },
      },
    };

    super(imports, wasm);
    this.imports = imports;
    this.bc = bc;
  }

  private findTable(code: NameType, scope: NameType, table: NameType): Table | undefined {
    return this.bc.store.findTable(nameTypeToBigInt(code), nameTypeToBigInt(scope), nameTypeToBigInt(table));
  }

  private findOrCreateTable(code: NameType, scope: NameType, table: NameType, payer: NameType): Table {
    let tab = this.bc.store.findTable(nameTypeToBigInt(code), nameTypeToBigInt(scope), nameTypeToBigInt(table));
    if (!tab) {
      tab = this.bc.store.createTable(nameTypeToBigInt(code), nameTypeToBigInt(scope), nameTypeToBigInt(table), nameTypeToBigInt(payer));
    }
    return tab;
  }

  private genericIndex = {
    store: <K,>(
      index: SecondaryKeyStore<K>,
      cache: IteratorCache<IndexObject<K>>,
      scope: bigint, table: bigint, payer: bigint, id: bigint, secondary: Buffer, conv
    ) => {
      assert(payer !== 0n, 'must specify a valid account to pay for new record');
      const tab = this.findOrCreateTable(this.context.receiver.name, bigIntToName(scope), bigIntToName(table), bigIntToName(payer));
      const obj = new IndexObject<K>({
        tableId: tab.id,
        primaryKey: id,
        secondaryKey: conv.from(secondary),
        payer,
      });
      index.set(undefined, obj);
      cache.cacheTable(tab);
      return cache.add(obj);
    },
    update: <K,>(
      index: SecondaryKeyStore<K>,
      cache: IteratorCache<IndexObject<K>>,
      iterator: number, payer: bigint, secondary: Buffer, conv
    ) => {
      const obj = cache.get(iterator);
      const tab = cache.getTable(obj.tableId);
      assert(tab.code === this.context.receiver.toBigInt(), 'db access violation');
      if (payer === 0n) {
        payer = obj.payer;
      }
      const newObj = obj.clone();
      newObj.secondaryKey = conv.from(secondary);
      newObj.payer = payer;
      index.set(obj, newObj);
      cache.set(iterator, newObj);
    },
    remove: <K,>(
      index: SecondaryKeyStore<K>,
      cache: IteratorCache<IndexObject<K>>,
      iterator: number
    ) => {
      const obj = cache.get(iterator);
      const tab = cache.getTable(obj.tableId);
      assert(tab.code === this.context.receiver.toBigInt(), 'db access violation');
      index.delete(obj);
      cache.remove(iterator);
    },
    find_secondary: <K,>(
      index: SecondaryKeyStore<K>,
      cache: IteratorCache<IndexObject<K>>,
      code: bigint, scope: bigint, table: bigint, secondary: Buffer, primary: ptr, conv
    ) => {
      const tab = this.findTable(bigIntToName(code), bigIntToName(scope), bigIntToName(table));
      if (!tab) {
        return -1;
      }
      const ei = cache.cacheTable(tab);
      const obj = index.secondary.get({
        tableId: tab.id,
        primaryKey: 0n,
        secondaryKey: conv.from(secondary),
        ignorePrimaryKey: true,
      });
      if (!obj) {
        return ei;
      }
      this.memory.writeUInt64(primary, obj.primaryKey);
      return cache.add(obj);
    },
    lowerbound_secondary: <K,>(
      index: SecondaryKeyStore<K>,
      cache: IteratorCache<IndexObject<K>>,
      code: bigint, scope: bigint, table: bigint, secondary: Buffer, primary: ptr, conv
    ) => {
      const tab = this.findTable(bigIntToName(code), bigIntToName(scope), bigIntToName(table));
      if (!tab) {
        return -1;
      }
      const ei = cache.cacheTable(tab);
      const obj = index.secondary.lowerbound({
        tableId: tab.id,
        primaryKey: 0n,
        secondaryKey: conv.from(secondary),
        ignorePrimaryKey: true,
      });
      if (!obj) return ei;
      this.memory.writeUInt64(primary, obj.primaryKey);
      conv.to(secondary, obj.secondaryKey);
      return cache.add(obj);
    },
    upperbound_secondary: <K,>(
      index: SecondaryKeyStore<K>,
      cache: IteratorCache<IndexObject<K>>,
      code: bigint, scope: bigint, table: bigint, secondary: Buffer, primary: ptr, conv
    ) => {
      const tab = this.findTable(bigIntToName(code), bigIntToName(scope), bigIntToName(table));
      if (!tab) {
        return -1;
      }
      const ei = cache.cacheTable(tab);
      const obj = index.secondary.upperbound({
        tableId: tab.id,
        primaryKey: 0n,
        secondaryKey: conv.from(secondary),
        ignorePrimaryKey: true,
      });
      if (!obj) return ei;
      this.memory.writeUInt64(primary, obj.primaryKey);
      conv.to(secondary, obj.secondaryKey);
      return cache.add(obj);
    },
    end_secondary: <K,>(
      index: SecondaryKeyStore<K>,
      cache: IteratorCache<IndexObject<K>>,
      code: bigint, scope: bigint, table: bigint
    ) => {
      const tab = this.findTable(bigIntToName(code), bigIntToName(scope), bigIntToName(table));
      if (!tab) {
        return -1;
      }
      return cache.cacheTable(tab);
    },
    next_secondary: <K,>(
      index: SecondaryKeyStore<K>,
      cache: IteratorCache<IndexObject<K>>,
      iterator: number, primary: ptr
    ) => {
      if (iterator < -1) {
        return -1;
      }
      const obj = cache.get(iterator);
      const objNext = index.secondary.next(obj);
      if (!objNext) {
        return cache.getEndIteratorByTableId(obj.tableId);
      }
      this.memory.writeUInt64(primary, objNext.primaryKey);
      return cache.add(objNext);
    },
    previous_secondary: <K,>(
      index: SecondaryKeyStore<K>,
      cache: IteratorCache<IndexObject<K>>,
      iterator: number, primary: ptr
    ) => {
      if (iterator < -1) {
        const tab = cache.findTableByEndIterator(iterator);
        assert(tab, 'not a valid end iterator');
        const obj = index.secondary.penultimate(tab.id);
        if (!obj) {
          return -1;
        }
        this.memory.writeUInt64(primary, obj.primaryKey);
        return cache.add(obj);
      }
      const obj = cache.get(iterator);
      const objPrev = index.secondary.prev(obj);
      if (!objPrev) {
        return -1;
      }
      this.memory.writeUInt64(primary, objPrev.primaryKey);
      return cache.add(objPrev);
    },
    find_primary: <K,>(
      index: SecondaryKeyStore<K>,
      cache: IteratorCache<IndexObject<K>>,
      code: bigint, scope: bigint, table: bigint, secondary: Buffer, primary: bigint, conv
    ) => {
      const tab = this.findTable(bigIntToName(code), bigIntToName(scope), bigIntToName(table));
      if (!tab) {
        return -1;
      }
      const ei = cache.cacheTable(tab);
      const obj = index.get({
        tableId: tab.id,
        primaryKey: primary
      });
      if (!obj) {
        return ei;
      }
      conv.to(secondary, obj.secondaryKey);
      return cache.add(obj);
    },
  };

  apply(context: VM.Context) {
    this.snapshot = this.bc.store.snapshot();
    this.context = context;
    
    // Check authorization
    for (const auth of this.context.authorization) {
      // Check actor exists
      const account = this.bc.getAccount(auth.actor)
      if (!account) {
        throw new Error(`Account ${auth.actor} is missing for inline action`)
      }

      // Check permission exists
      const accountPermission = account.permissions.find(permission => permission.perm_name.equals(auth.permission))
      if (!accountPermission) {
        throw new Error(`Account ${auth.actor} has no permission ${auth.permission}`)
      }

      // Inline action
      if (this.context.isInline) {
        const satisfied = isAuthoritySatisfied(accountPermission.required_auth, PermissionLevel.from({
          actor: this.context.sender,
          permission: 'eosio.code'
        }))
        if (!satisfied) {
          throw new Error(`Permission ${auth.actor}@${accountPermission.perm_name} is not satisfied by ${this.context.receiver.name}@eosio.code`)
        }
      }
    }
    
    // Apply
    try {
      (this.instance.exports.apply as CallableFunction)(
        this.context.receiver.toBigInt(),
        this.context.firstReceiver.toBigInt(),
        nameToBigInt(this.context.action)
      );
    } catch (e) {
      if (!(e instanceof EosioExitResult)) {
        this.revert();
        throw e;
      }
    } finally {
      this.finalize();
    }
  }

  revert() {
    this.bc.store.revertTo(this.snapshot);
  }

  finalize() {
    this.kvCache = new IteratorCache<KeyValueObject>();
    this.idx64 = new IteratorCache<IndexObject<bigint>>();
    this.idx128 = new IteratorCache<IndexObject<bigint>>();
    this.idx256 = new IteratorCache<IndexObject<Buffer>>();
    this.idxDouble = new IteratorCache<IndexObject<number>>();
  }
}

namespace VM {
  export class Context {
    sender: Name = new Name(UInt64.from(0));
    firstReceiver: Account;
    // tx: Transaction; TODO

    receiver: Account;
    action: Name;
    data: Uint8Array;
    authorization: PermissionLevel[] = [];
    actionsQueue: VM.Context[] = []
    transaction: Transaction;
    decodedData: Action

    constructor(init?: Partial<Context>) {
      Object.assign(this, init);
    }

    get isInline () {
      return !this.sender.equals(new Name(UInt64.from(0)))
    }

    get isNotification () {
      return !this.receiver.name.equals(this.firstReceiver.name)
    }
  }
}

export {
  VM,
}