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

  constructor(bytes: Uint8Array | ReadableStream) {
    let instantiate;
    if (bytes instanceof Uint8Array) {
      instantiate = WebAssembly.instantiate;
    } else {
      instantiate = WebAssembly.instantiateStreaming;
    }
    this.ready = new Promise((resolve) => {
      // HACK: Use setTimeout to access derived class imports in base class constructor
      setTimeout(() => {
        instantiate(bytes, this.imports)
          .then(result => {
            this.module = result.module;
            this.instance = result.instance;
            this._memory = new Memory(this.instance.exports.memory as WebAssembly.Memory);
            resolve();
        });
      });
    });
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
