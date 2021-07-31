const encoder = new TextEncoder();
const decoder = new TextDecoder();

export default class Buffer extends Uint8Array {
  view?: DataView;

  static from_(buffer: any): Buffer;
  static from_(buffer: string, encoding: string): Buffer;
  static from_(buffer: ArrayBuffer, byteOffset: number): Buffer;
  static from_(buffer: ArrayBuffer, byteOffset: number, length: number): Buffer;
  static from_(buffer: any, enc?: any, length?: any): Buffer {
    if (typeof buffer === 'string') {
      switch (enc) {
        case 'hex':
          {
            if (buffer.length === 0) return new Buffer();
            if (buffer.length % 2 === 1) buffer = '0' + buffer;
            return new Buffer(buffer.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
          }
        default:
          return new Buffer(encoder.encode(buffer));
      }
    }
    return new Buffer(buffer, enc, length);
  };

  static alloc(size: number, fill = 0) {
    const buffer = new Buffer(size);
    buffer.fill(fill);
    return buffer;
  }

  static isBuffer(obj: any) {
    return obj instanceof Buffer;
  }

  static compare(buf1: Buffer | Uint8Array, buf2: Buffer | Uint8Array) {
    for (let i = 0; i < buf1.byteLength && i < buf2.byteLength; ++i) {
      if (buf1[i] < buf2[i]) return -1;
      else if (buf1[i] > buf2[i]) return 1;
    }
    return buf1.byteLength < buf2.byteLength ? -1 : buf1.byteLength > buf2.byteLength ? 1 : 0;
  }

  static concat(list: (Buffer | Uint8Array)[]): Buffer {
    let size = 0;
    for (let i = 0; i < list.length; ++i) {
      size += list[i].length;
    }
    const buffer = new Buffer(size);
    let offset = 0;
    for (let i = 0; i < list.length; ++i) {
      buffer.set(list[i], offset);
      offset += list[i].length;
    }
    return buffer;
  }

  readBigInt64LE(offset = 0): bigint {
    if (!this.view) {
      this.view = new DataView(this.buffer, this.byteOffset, this.length);
    }
    return this.view.getBigInt64(offset, true);
  }

  writeBigInt64LE(value: bigint, offset = 0): void{
    if (!this.view) {
      this.view = new DataView(this.buffer, this.byteOffset, this.length);
    }
    this.view.setBigInt64(offset, value, true);
  }

  readBigUInt64LE(offset = 0): bigint {
    if (!this.view) {
      this.view = new DataView(this.buffer, this.byteOffset, this.length);
    }
    return this.view.getBigUint64(offset, true);
  }

  writeBigUInt64LE(value: bigint, offset = 0): void{
    if (!this.view) {
      this.view = new DataView(this.buffer, this.byteOffset, this.length);
    }
    this.view.setBigUint64(offset, value, true);
  }

  writeBigUInt64BE(value: bigint, offset = 0): void {
    if (!this.view) {
      this.view = new DataView(this.buffer, this.byteOffset, this.length);
    }
    this.view.setBigUint64(offset, value);
  }

  readDoubleLE(offset = 0): number {
    if (!this.view) {
      this.view = new DataView(this.buffer, this.byteOffset, this.length);
    }
    return this.view.getFloat64(offset);
  }

  writeDoubleLE(value: number, offset = 0): void {
    if (!this.view) {
      this.view = new DataView(this.buffer, this.byteOffset, this.length);
    }
    this.view.setFloat64(value, offset);
  }

  toString(encoding = 'utf8'): string {
    switch (encoding) {
    case 'hex':
      return [...this].map(x => x.toString(16).padStart(2, '0')).join('');
    default:
      return decoder.decode(this);
    }
  }
}

