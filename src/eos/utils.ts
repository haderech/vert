import { Name, API, Authority, PermissionLevel } from "@greymass/eosio";
import { AccountPermission, PermissionLevelWeight } from "./types";

/**
* Returns the index of the last element in the array where predicate is true, and -1
* otherwise.
* @param array The source array to search in
* @param predicate find calls predicate once for each element of the array, in descending
* order, until it finds one where predicate returns true. If such an element is found,
* findLastIndex immediately returns that element index. Otherwise, findLastIndex returns -1.
*/
export function findLastIndex<T>(array: Array<T>, predicate: (value: T, index: number, obj: T[]) => boolean): number {
    let l = array.length;
    while (l--) {
        if (predicate(array[l], l, array))
            return l;
    }
    return -1;
}

/**
 * It generates a list of permissions for a given account name
 * @param {Name} name - The name of the account to create.
 * @returns The `generatePermissions` function returns an array of `AccountPermission` objects.
 */
// @ts-ignore
export const generatePermissions = (name: Name) => {
    const defaultPerms = [
      { perm_name: 'owner', parent: '' },
      { perm_name: 'active', parent: 'owner' }
    ]
  
    return defaultPerms.map(({ perm_name, parent }) => AccountPermission.from({
        perm_name,
        parent,
        required_auth: Authority.from({
          threshold: 1,
          accounts: [{
            weight: 1,
            permission: PermissionLevel.from({
              actor: name,
              permission: perm_name
            })
          }]
        })
    }))
}
  
/**
 * Add the permission `eosio.code` to the `active` permission of the account `name`
 * @param {Name} name - The name of the account to be created.
 * @param {API.v1.AccountPermission[]} permissions - The permissions to add to the account.
 */
export const addInlinePermission = (name: Name, permissions: API.v1.AccountPermission[]) => {
    const activePerm = permissions.find(perm => perm.perm_name.equals(Name.from("active")))
    activePerm.required_auth.accounts.push(PermissionLevelWeight.from({
      weight: 1,
      permission: PermissionLevel.from({
        actor: name,
        permission: 'eosio.code'
      })
    }))
    activePerm.required_auth.sort()
}

/**
 * Given an authority and a permission level,
 * return true if the permission level is satisfied by the authority
 * @param {Authority} authority - The authority to check against.
 * @param {PermissionLevel} permission - PermissionLevel
 */
export function isAuthoritySatisfied (authority: Authority, permission: PermissionLevel) {
    const weight = authority.accounts.reduce((acc, account) => {
        if (account.permission.equals(permission)) {
            acc += account.weight.toNumber()
        }

        return acc
    }, 0)

    return Boolean(weight >= authority.threshold.toNumber())
}
  