import bunyan from 'bunyan';

export const log = bunyan.createLogger({ name: 'blanc-vm' });
log.level(process.env.LOG_LEVEL);

export type Dispatcher = Record<string, any>;

export class Vert {
  protected module: WebAssembly.Module;
  protected instance: WebAssembly.Instance;
  protected memory: WebAssembly.Memory;
  protected imports: any;

  public ready: Promise<void>;

  constructor(bytes: Uint8Array) {
    this.ready = new Promise((resolve, reject) => {
      // HACK: Use setTimeout to access derived class imports in base class constructor
      setTimeout(() => {
        WebAssembly.instantiate(bytes, this.imports)
          .then(result => {
            this.module = result.module;
            this.instance = result.instance;
            this.memory = this.instance.exports.memory as WebAssembly.Memory;
            resolve();
          }, error => {
            reject(error);
          });
      });
    });
  }

  protected readString(offset: number, length: number = 0) {
    if (this.memory) {
      if (!length) {
        const memoryView = new Uint8Array(this.memory.buffer, 0, this.memory.buffer.byteLength);
        for (let i = offset; i < memoryView.length; ++i) {
          if (!memoryView[i]) {
            length = i - offset + 1;
            break;
          }
        }
      }
      return Buffer.from(new Uint8Array(this.memory.buffer, offset, length)).toString();
    }
  }
}
