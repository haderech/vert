import { Serializer, Name } from "@greymass/eosio";

export function NameToBigInt(name: string): bigint {
  return Buffer.from(Serializer.encode({
    type: 'name',
    object: name,
  }).array).readBigUInt64LE();
}

export function BigIntToName(name: bigint): Name {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(name);
  return Serializer.decode({
    type: 'name',
    data: buffer,
  });
}

export function SymbolCodeToBigint(symbol: string): bigint {
  return Buffer.from(Serializer.encode({
    type: 'symbol_code',
    object: symbol,
  }).array).readBigUInt64LE();
}
