import { Struct, PermissionLevel, UInt16, TypeAlias } from "@greymass/eosio";

@TypeAlias('weight_type')
export class Weight extends UInt16 {}

@Struct.type('permission_level_weight')
export class PermissionLevelWeight extends Struct {
    @Struct.field(PermissionLevel) permission!: PermissionLevel
    @Struct.field(Weight) weight!: Weight
}