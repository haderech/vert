export class Memory {
  static create(initial: number) {
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
    return new TextDecoder().decode(new Uint8Array(this.memory.buffer, offset, length));
  }

  readUInt64(offset: number): bigint {
    return new DataView(this.memory.buffer, offset, 8).getBigUint64(0, true);
  }

  readUInt128(offset: number): bigint {
    const buffer = new DataView(this.memory.buffer, offset, 16);
    const low = buffer.getBigUint64(0, true);
    const high = buffer.getBigUint64(8, true);
    return (high << 64n) | low;
  }

  readInt128(offset: number): bigint {
    return BigInt.asIntN(128, this.readUInt128(offset));
  }

  readHex(offset: number, length: number): string {
    return [...new Uint8Array(this.memory.buffer, offset, length)].map(v => v.toString(16).padStart(2, '0')).join('');
  }

  writeUInt64(offset: number, value: bigint): void {
    return new DataView(this.memory.buffer, offset, 8).setBigUint64(0, value, true);
  }
}
