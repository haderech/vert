export const protonAssert = (str: string) => `eosio_assert: ${str}`
export const protonAssertMessage = (str: string) => `eosio_assert_message: ${str}`
export const protonAssertCode = (str: bigint) => `eosio_assert_code: ${str}`