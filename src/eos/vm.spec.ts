import { expect } from 'chai';
import { EosVM } from './vm';
import { Memory } from '../memory';
import { NameToBigInt } from "./utils";

let vm;
let memory;
let output;

before(() => {
  console.log = (msg) => {
    output = msg;
  };
});

beforeEach(() => {
  vm = new EosVM(new Uint8Array());
  memory = Memory.create(16);
  // @ts-ignore
  vm._memory = memory;
});

afterEach(() => {
  output = '';
});

describe('eos-vm', () => {
  describe('print', () => {
    it('prints', () => {
      const buffer = Buffer.from(memory.buffer);
      buffer.set(Buffer.from([104, 101, 108, 108, 111, 0]));
      vm.imports.env.prints(0);
      expect(output).to.equal('hello');
    });

    it('prints_l', () => {
      const buffer = Buffer.from(memory.buffer);
      buffer.set(Buffer.from([104, 101, 108, 108, 111, 0]));
      vm.imports.env.prints_l(0, 4);
      expect(output).to.equal('hell');
    });

    it('printi', () => {
      vm.imports.env.printi(255n);
      expect(output).to.equal('255');
      vm.imports.env.printi(-1n);
      expect(output).to.equal('-1');
    });

    it('printui', () => {
      vm.imports.env.printui(255n);
      expect(output).to.equal('255');
      vm.imports.env.printui(-1n);
      expect(output).to.equal('18446744073709551615');
    });

    it('printi128', () => {
      const buffer = Buffer.from(memory.buffer);

      buffer.writeBigInt64LE(-1n);
      buffer.writeBigInt64LE(-1n, 8);
      vm.imports.env.printi128(0);
      expect(output).to.equal('-1');

      buffer.writeBigUInt64LE(0n);
      buffer.writeBigUInt64LE(1n << 63n, 8);
      vm.imports.env.printi128(0);
      expect(output).to.equal('-170141183460469231731687303715884105728');
    });

    it('printui128', () => {
      const buffer = Buffer.from(memory.buffer);

      buffer.writeBigInt64LE(-1n);
      buffer.writeBigInt64LE(-1n, 8);
      vm.imports.env.printui128(0);
      expect(output).to.equal('340282366920938463463374607431768211455');

      buffer.writeBigUInt64LE(0n);
      buffer.writeBigUInt64LE(1n << 63n, 8);
      vm.imports.env.printui128(0);
      expect(output).to.equal('170141183460469231731687303715884105728');
    });

    it('printsf', () => {
      vm.imports.env.printsf(1.001);
      //expect(output).to.equal('1.001000e+00');
    });

    it('printdf', () => {
      vm.imports.env.printsf(1.001);
      //expect(output).to.equal('1.001000000000000e+00');
    });

    it('printqf', () => {
      vm.imports.env.printsf(1.001);
      //expect(output).to.equal('1.000999999999999890e+00');
    });

    it('printn', () => {
      vm.imports.env.printn(NameToBigInt('alice'));
      expect(output).to.equal('alice');
      vm.imports.env.printn(NameToBigInt('.foo..z.k'));
      expect(output).to.equal('.foo..z.k');
    });

    it('printhex', () => {
      const buffer = Buffer.from(memory.buffer);
      buffer.set([161, 178, 195, 212, 0, 1, 255, 254]);
      vm.imports.env.printhex(0, 8);
      expect(output).to.equal('a1b2c3d40001fffe');
    });
  });

  describe('builtins', () => {
    it('memcpy', () => {
      const buffer = Buffer.from(memory.buffer, 0, 6);
      buffer.set([1, 2, 3, 4, 5, 6]);
      vm.imports.env.memcpy(2, 0, 4);
      expect(Buffer.compare(buffer, Buffer.from([1, 2, 1, 2, 1, 2]))).to.equal(0);
    });
  });
});
