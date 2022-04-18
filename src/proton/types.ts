import { Struct, PermissionLevel, UInt16, TypeAlias, Authority, Name } from "@greymass/eosio";

@TypeAlias('weight_type')
export class Weight extends UInt16 {}

@Struct.type('permission_level_weight')
export class PermissionLevelWeight extends Struct {
    @Struct.field(PermissionLevel) permission!: PermissionLevel
    @Struct.field(Weight) weight!: Weight
}

@Struct.type('account_permission')
export class AccountPermission extends Struct {
    @Struct.field('name') perm_name!: Name
    @Struct.field('name') parent!: Name
    @Struct.field(Authority) required_auth!: Authority
}