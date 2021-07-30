import {
  Asset as _Asset,
  BlockTimestamp,
  Bytes,
  Checksum160,
  Checksum256,
  Checksum512,
  ExtendedAsset,
  Float128,
  Float32,
  Float64,
  Int128,
  Int16,
  Int32,
  Int64 as _Int64,
  Int8,
  Int,
  Name as _Name,
  NameType,
  PublicKey,
  Signature,
  Struct,
  TimePoint,
  TimePointSec,
  UInt128,
  UInt16,
  UInt32,
  UInt64 as _UInt64,
  UInt8,
  VarInt,
  VarUInt,
} from "@greymass/eosio";

class Asset extends _Asset {
}

namespace Asset {
  export class SymbolCode extends _Asset.SymbolCode {
    static from(value: _Asset.SymbolCodeType | bigint): Asset.SymbolCode {
      if (typeof value === 'bigint') {
        const buffer = Buffer.alloc(8);
        buffer.writeBigUInt64LE(value);
        value = _UInt64.from(buffer);
      }
      return new Asset.SymbolCode(_Asset.SymbolCode.from(value).value);
    }

    toBigInt(): bigint {
      return this.value.value.toBuffer('le', 8).readBigUInt64LE();
    }
  }
}

type IntType = Int | number | string;

class UInt64 extends _UInt64 {
  static from(value: IntType | Uint8Array | bigint): UInt64 {
    if (typeof value === 'bigint') {
      const buffer = Buffer.alloc(8);
      buffer.writeBigUInt64LE(value);
      value = buffer;
    }
    return new UInt64(_UInt64.from(value).value);
  }
  toBigInt(): bigint {
    return this.value.toBuffer('le', 8).readBigUInt64LE();
  }
}

class Int64 extends _Int64 {
  static from(value: IntType | Uint8Array | bigint): Int64 {
    if (typeof value === 'bigint') {
      const buffer = Buffer.alloc(8);
      buffer.writeBigInt64LE(value);
      value = buffer;
    }
    return new Int64(_Int64.from(value).value);
  }
  toBigInt(): bigint {
    return this.value.toBuffer('le', 8).readBigInt64LE();
  }
}

class Name extends _Name {
  static from(value: NameType | bigint): Name {
    if (typeof value === 'bigint') {
      const buffer = Buffer.alloc(8);
      buffer.writeBigUInt64LE(value);
      value = _UInt64.from(buffer);
    }
    return new Name(_Name.from(value).value);
  }
  toBigInt(): bigint {
    return this.value.value.toBuffer('le', 8).readBigUInt64LE();
  }
}

export {
  Asset,
  BlockTimestamp,
  Bytes,
  Checksum160,
  Checksum256,
  Checksum512,
  ExtendedAsset,
  Float128,
  Float32,
  Float64,
  Int128,
  Int16,
  Int32,
  Int64,
  Int8,
  Name,
  PublicKey,
  Signature,
  Struct,
  TimePoint,
  TimePointSec,
  UInt128,
  UInt16,
  UInt32,
  UInt64,
  UInt8,
  VarInt,
  VarUInt,
}
