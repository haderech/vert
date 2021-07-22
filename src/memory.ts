export class Memory {
  static create(initial: number) {
    return new Memory(new WebAssembly.Memory({ initial: initial }));
  }

  constructor(private memory: WebAssembly.Memory) {}

  get buffer() {
    return this.memory.buffer;
  }

  public readString(offset: number, length: number = 0) {
    if (!length) {
      const memoryView = new Uint8Array(this.memory.buffer, 0, this.memory.buffer.byteLength);
      for (let i = offset; i < memoryView.length; ++i) {
        if (!memoryView[i]) {
          length = i - offset;
          break;
        }
      }
    }
    return Buffer.from(new Uint8Array(this.memory.buffer, offset, length)).toString();
  }
}
