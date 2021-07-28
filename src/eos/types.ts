import {
  NameType,
  Name as GmName,
  Asset,
  Int,
  UInt64 as GmUInt64,
  Int64 as GmInt64
} from "@greymass/eosio";
import { uint8ArrayToDataView } from "../util";

class Name extends GmName {
  static from(value: NameType | bigint): Name {
    if (typeof value === 'bigint') {
      const buffer = new Uint8Array(8);
      const view = uint8ArrayToDataView(buffer);
      view.setBigUint64(0, value, true);
      value = GmUInt64.from(buffer);
    }
    return new Name(GmName.from(value).value);
  }
  toBigInt(): bigint {
    const buffer = this.value.value.toArrayLike(Uint8Array, 'le', 8);
    return uint8ArrayToDataView(buffer).getBigUint64(0, true);
  }
}

class SymbolCode extends Asset.SymbolCode {
  static from(value: Asset.SymbolCodeType | bigint): SymbolCode {
    if (typeof value === 'bigint') {
      const buffer = new Uint8Array(8);
      const view = uint8ArrayToDataView(buffer);
      view.setBigUint64(0, value, true);
      value = GmUInt64.from(buffer);
    }
    return new SymbolCode(Asset.SymbolCode.from(value).value);
  }
  toBigInt(): bigint {
    const buffer = this.value.value.toArrayLike(Uint8Array, 'le', 8);
    return uint8ArrayToDataView(buffer).getBigUint64(0, true);
  }
}

type IntType = Int | number | string;

class UInt64 extends GmUInt64 {
  static from(value: IntType | Uint8Array | bigint): UInt64 {
    if (typeof value === 'bigint') {
      const buffer = new Uint8Array(8);
      const view = uint8ArrayToDataView(buffer);
      view.setBigUint64(0, value, true);
      value = GmUInt64.from(buffer).value;
    }
    return new UInt64(value);
  }
  toBigInt(): bigint {
    const buffer = this.value.value.toArrayLike(Uint8Array, 'le', 8);
    return uint8ArrayToDataView(buffer).getBigUint64(0, true);
  }
}

class Int64 extends GmInt64 {
  static from(value: IntType | Uint8Array | bigint): Int64 {
    if (typeof value === 'bigint') {
      const buffer = new Uint8Array(8);
      const view = uint8ArrayToDataView(buffer);
      view.setBigInt64(0, value, true);
      value = GmInt64.from(buffer).value;
    }
    return new Int64(value);
  }
  toBigInt(): bigint {
    const buffer = this.value.value.toArrayLike(Uint8Array, 'le', 8);
    return uint8ArrayToDataView(buffer).getBigInt64(0, true);
  }
}

export {
  Name,
  SymbolCode,
  UInt64,
  Int64,
}
