import {Memory} from "./memory";
import logger from "loglevel";
import prefix from "loglevel-plugin-prefix";

let log = logger;
prefix.reg(log);
prefix.apply(log);

try {
  log.setLevel(process.env.LOG_LEVEL as logger.LogLevelDesc || 'warn');
} catch (e) {
}

class Vert {
  protected module: WebAssembly.Module;
  protected instance: WebAssembly.Instance;
  protected _memory: Memory;
  protected imports: any;

  public ready: Promise<void>;

  get memory() {
    return this._memory;
  }

  constructor(imports: any, bytes: Uint8Array | Promise<Uint8Array>) {
    const getReady = async () => {
      bytes = await Promise.resolve(bytes)
      const { module, instance } = await WebAssembly.instantiate(bytes, imports)
      this.module = module;
      this.instance = instance;
      this._memory = new Memory(this.instance.exports.memory as WebAssembly.Memory);
    }
    this.ready = getReady();
  }
}

namespace Vert {
  function setLogger(logger: any) {
    log = logger;
  }
}

export {
  Vert,
  log,
}
