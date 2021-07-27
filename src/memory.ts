export class Memory {
  static create(initial: number) {
    return new Memory(new WebAssembly.Memory({ initial: initial }));
  }

  constructor(private memory: WebAssembly.Memory) {}

  get buffer() {
    return this.memory.buffer;
  }

  readString(offset: number, length: number = 0) {
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

  readUint64(offset: number) {
    return Buffer.from(this.memory.buffer, offset, 8).readBigUInt64LE();
  }

  readUint128(offset: number) {
    const buffer = Buffer.from(this.memory.buffer, offset, 16);
    const low = buffer.readBigUInt64LE(0);
    const high = buffer.readBigUInt64LE(8);
    return (high << 64n) | low;
  }

  readInt128(offset: number) {
    return BigInt.asIntN(128, this.readUint128(offset));
  }

  readHex(offset: number, length: number) {
    return Buffer.from(this.memory.buffer, offset, length).toString('hex');
  }

  writeUint64(offset: number, value: bigint) {
    Buffer.from(this.memory.buffer, offset, 8).writeBigUInt64LE(value);
  }
}
