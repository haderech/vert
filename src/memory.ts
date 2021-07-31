import Buffer from "./buffer";

export class Memory {
  static create(initial: number): Memory {
    return new Memory(new WebAssembly.Memory({ initial: initial }));
  }

  constructor(private memory: WebAssembly.Memory) {}

  get buffer() {
    return this.memory.buffer;
  }

  readString(offset: number, length: number = 0): string {
    if (!length) {
      const memoryView = new Uint8Array(this.memory.buffer, 0, this.memory.buffer.byteLength);
      for (let i = offset; i < memoryView.length; ++i) {
        if (!memoryView[i]) {
          length = i - offset;
          break;
        }
      }
    }
    return Buffer.from_(this.memory.buffer, offset, length).toString();
  }

  readUInt64(offset: number): bigint {
    return Buffer.from_(this.memory.buffer, offset, 8).readBigUInt64LE();
  }

  readUInt128(offset: number): bigint {
    const buffer = Buffer.from_(this.memory.buffer, offset, 16);
    const low = buffer.readBigUInt64LE(0);
    const high = buffer.readBigUInt64LE(8);
    return (high << 64n) | low;
  }

  readInt128(offset: number): bigint {
    return BigInt.asIntN(128, this.readUInt128(offset));
  }

  readHex(offset: number, length: number): string {
    return Buffer.from_(this.memory.buffer, offset, length).toString('hex');
  }

  writeUInt64(offset: number, value: bigint): void {
    Buffer.from_(this.memory.buffer, offset, 8).writeBigUInt64LE(value);
  }
}
