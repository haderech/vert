import BN from "bn.js";
import { Name, UInt64, NameType, Asset } from "@greymass/eosio";

export function bnToBigInt (num: BN): bigint {
    return BigInt(num.toString())
}

export function bigIntToBn (num: bigint): BN {
    return new BN(num.toString())
}

export function nameToBigInt (name: NameType): bigint {
    return bnToBigInt(Name.from(name).value.value)
}

export function bigIntToName (name: bigint): Name {
    return Name.from(UInt64.from(bigIntToBn(name)))
}

export function nameTypeToBigInt (nameType: NameType): bigint {
    return nameToBigInt(Name.from(nameType))
}

export function symbolCodeToBigInt (symbolCode: Asset.SymbolCode): bigint {
    return bnToBigInt(symbolCode.value.value)
}
