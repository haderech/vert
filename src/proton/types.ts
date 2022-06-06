import { Struct, PermissionLevel, UInt16, TypeAlias, Authority, Name, Action } from "@greymass/eosio";
import { VM } from "./vm";

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

export type ExecutionTrace = {
    contract: Name,
    action: Name,
    isInline: boolean,
    isNotification: boolean,
    firstReceiver: Name,
    sender: Name,
    authorization: PermissionLevel[],
    data: Action,
    actionOrder: number,
    executionOrder: number
}