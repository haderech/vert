export class Memory {
  constructor(private memory: WebAssembly.Memory) {}

  get buffer() {
    return this.memory.buffer;
  }

  public readString(offset: number, length: number = 0) {
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
