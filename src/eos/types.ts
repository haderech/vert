import {
  NameType,
  Name as GmName,
  Asset,
  Int,
  UInt64 as GmUInt64,
  Int64 as GmInt64
} from "@greymass/eosio";

class Name extends GmName {
  static from(value: NameType | bigint): Name {
    if (typeof value === 'bigint') {
      const buffer = Buffer.alloc(8);
      buffer.writeBigUInt64LE(value);
      value = GmUInt64.from(buffer);
    }
    return new Name(GmName.from(value).value);
  }
  toBigInt(): bigint {
    return this.value.value.toBuffer('le', 8).readBigUInt64LE();
  }
}

class SymbolCode extends Asset.SymbolCode {
  static from(value: Asset.SymbolCodeType | bigint): SymbolCode {
    if (typeof value === 'bigint') {
      const buffer = Buffer.alloc(8);
      buffer.writeBigUInt64LE(value);
      value = GmUInt64.from(buffer);
    }
    return new SymbolCode(Asset.SymbolCode.from(value).value);
  }
  toBigInt(): bigint {
    return this.value.value.toBuffer('le', 8).readBigUInt64LE();
  }
}

type IntType = Int | number | string;

class UInt64 extends GmUInt64 {
  static from(value: IntType | Uint8Array | bigint): UInt64 {
    if (typeof value === 'bigint') {
      const buffer = Buffer.alloc(8);
      buffer.writeBigUInt64LE(value);
      value = GmUInt64.from(buffer).value;
    }
    return new UInt64(value);
  }
  toBigInt(): bigint {
    return this.value.toBuffer('le', 8).readBigUInt64LE();
  }
}

class Int64 extends GmInt64 {
  static from(value: IntType | Uint8Array | bigint): Int64 {
    if (typeof value === 'bigint') {
      const buffer = Buffer.alloc(8);
      buffer.writeBigInt64LE(value);
      value = GmInt64.from(buffer).value;
    }
    return new Int64(value);
  }
  toBigInt(): bigint {
    return this.value.toBuffer('le', 8).readBigInt64LE();
  }
}

export {
  Name,
  SymbolCode,
  UInt64,
  Int64,
}
