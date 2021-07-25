import { Serializer } from "@greymass/eosio";

export function nameToBigInt64(name: string): bigint {
  return Buffer.from(Serializer.encode({
    type: 'name',
    object: name,
  }).array).readBigUInt64LE();
}

export function symbolCodeToBigInt64(symbol: string): bigint {
  return Buffer.from(Serializer.encode({
    type: 'symbol_code',
    object: symbol,
  }).array).readBigUInt64LE();
}
