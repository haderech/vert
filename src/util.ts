function Uint8ArrayFromHex(hex: string): Uint8Array {
  if (hex.length === 0) return new Uint8Array();
  if (hex.length % 2 === 1) hex = '0' + hex;
  return new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
}

function Uint8ArrayCompare(a: Uint8Array, b: Uint8Array) {
  const va = DataViewFromUint8Array(a);
  const vb = DataViewFromUint8Array(b);
  for (let i = 0; i < va.byteLength && i < vb.byteLength; ++i) {
    if (va.getUint8(i) < vb.getUint8(i)) return -1;
    else if (va.getUint8(i) > vb.getUint8(i)) return 1;
  }
  return va.byteLength < vb.byteLength ? -1 : va.byteLength > vb.byteLength ? 1 : 0;
}

function Uint8ArrayConcat(u8: Uint8Array[]): Uint8Array {
  let size = 0;
  for (let i = 0; i < u8.length; ++i) {
    size += u8[i].length;
  }
  const buffer = new Uint8Array(size);
  let offset = 0;
  for (let i = 0; i < u8.length; ++i) {
    buffer.set(u8[i], offset);
    offset += u8[i].length;
  }
  return buffer;
}

function DataViewFromUint8Array(u8: Uint8Array): DataView {
  return new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
}

export {
  Uint8ArrayFromHex,
  Uint8ArrayCompare,
  Uint8ArrayConcat,
  DataViewFromUint8Array,
}
