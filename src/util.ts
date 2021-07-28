function hexToUint8Array(hex: string): Uint8Array {
  if (hex.length === 0) return new Uint8Array();
  if (hex.length % 2 === 1) hex = '0' + hex;
  return new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
}

function compareUint8Array(a: Uint8Array, b: Uint8Array) {
  const va = uint8ArrayToDataView(a);
  const vb = uint8ArrayToDataView(b);
  for (let i = 0; i < va.byteLength && i < vb.byteLength; ++i) {
    if (va.getUint8(i) < vb.getUint8(i)) return -1;
    else if (va.getUint8(i) > vb.getUint8(i)) return 1;
  }
  return va.byteLength < vb.byteLength ? -1 : va.byteLength > vb.byteLength ? 1 : 0;
}

function uint8ArrayToDataView(u8: Uint8Array): DataView {
  return new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
}

export {
  hexToUint8Array,
  compareUint8Array,
  uint8ArrayToDataView,
}
