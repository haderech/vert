import bunyan from "bunyan";
import {Memory} from "./memory";

let log = bunyan.createLogger({ name: 'vert' });
log.level(process.env.LOG_LEVEL);

class Vert {
  protected module: WebAssembly.Module;
  protected instance: WebAssembly.Instance;
  protected _memory: Memory;
  protected imports: any;

  public ready: Promise<void>;

  get memory() {
    return this._memory;
  }

  constructor(bytes: Uint8Array) {
    this.ready = new Promise((resolve, reject) => {
      // HACK: Use setTimeout to access derived class imports in base class constructor
      setTimeout(() => {
        WebAssembly.instantiate(bytes, this.imports)
          .then(result => {
            this.module = result.module;
            this.instance = result.instance;
            this._memory = new Memory(this.instance.exports.memory as WebAssembly.Memory);
            resolve();
          }, error => {
            reject(error);
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