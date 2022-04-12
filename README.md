# VeRT

**VM emulation RunTime for WASM-based blockchain contracts**

VeRT is a blockchain virtual machine emulator for WASM-based contracts like EOSIO. (CosmWasm and Substrate will be supported.)
It uses the built-in WebAssembly object in JavaScript, so can be executed on any modern browsers or runtime environments without additional dependencies.
It doesn't support the full specification of each blockchain state-machine, but can be used to run and test smart contracts before deployment.
The focus of VeRT is on the better compatibility than the performance, so it can be integrated with development pipelines.

- Run and test smart contracts
- Minimum dependencies (No native wrapper, docker or remote connection)
- Volatile key-value store with state rollback 

## Requirement

- WebAssembly binary with the exported memory ([blanc](https://github.com/haderech/blanc) v0.9.2 or higher)
- JavaScript runtime with WebAssembly BigInt support (nodejs v16 or higher)

## Installation

```shell
npm install @proton/vert
```

## Test

- nodejs v16 or higher

```shell
npm run test
```

- nodejs v14

```shell
node --experimental-wasm-bigint node_modules/mocha/bin/_mocha src/**/*.spec.ts -r ts-node/register
```

## License

[MIT](./LICENSE)

[@greymass-eosio](./src/eos/@greymass-eosio/LICENSE)
