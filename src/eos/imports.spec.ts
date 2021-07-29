import { expect } from 'chai';
import { EosVM } from './vm';
import { Memory } from '../memory';
import { Name } from './types';
import { Uint8ArrayFromHex, Uint8ArrayCompare } from '../util';

let vm;
let memory;

beforeEach(() => {
  vm = new EosVM(new Uint8Array());
  memory = Memory.create(256);
  // @ts-ignore
  vm._memory = memory;
});

describe('eos-vm imports', () => {
  describe('crypto', () => {
    it('recover_key', () => {
      const buffer = new Uint8Array(memory.buffer);
      const digest = Uint8ArrayFromHex('cacc5e5fdb065cb9929e57766ac740c4d21b72448b1d5d9f405e25be91857c7a');
      const signature = Uint8ArrayFromHex('00204AECCC5FB93E32C68CF4041D42CF5E18365FD4C54B5B6917418D2C99046236F61838A60E65C744162A3B2597965945E53E637FEC091CEA680153E78D004230FC');
      const publicKey = Uint8ArrayFromHex('0003DD4BD191F57FC1A5235EEC881A08C31A2FBCE198F250CDEAE98A7218D37C0C2B');
      buffer.set(digest, 0);
      buffer.set(signature, 32);
      vm.imports.env.recover_key(0, 32, 66, 98, 34);
      expect(Uint8ArrayCompare(buffer.slice(98, 132), publicKey)).to.equal(0);
    });

    it('assert_recover_key', () => {
      const buffer = new Uint8Array(memory.buffer);
      const digest = Uint8ArrayFromHex('cacc5e5fdb065cb9929e57766ac740c4d21b72448b1d5d9f405e25be91857c7a');
      const signature = Uint8ArrayFromHex('00204AECCC5FB93E32C68CF4041D42CF5E18365FD4C54B5B6917418D2C99046236F61838A60E65C744162A3B2597965945E53E637FEC091CEA680153E78D004230FC');
      const publicKey = Uint8ArrayFromHex('0003DD4BD191F57FC1A5235EEC881A08C31A2FBCE198F250CDEAE98A7218D37C0C2B');
      buffer.set(digest, 0);
      buffer.set(signature, 32);
      buffer.set(publicKey, 98);
      vm.imports.env.assert_recover_key(0, 32, 66, 98, 34); // this throws an error when failed
    });
  });

  describe('print', () => {
    it('prints', () => {
      const buffer = new Uint8Array(memory.buffer);
      buffer.set([104, 101, 108, 108, 111, 0]);
      vm.imports.env.prints(0);
      expect(vm.console).to.equal('hello');
    });

    it('prints_l', () => {
      const buffer = new Uint8Array(memory.buffer);
      buffer.set([104, 101, 108, 108, 111, 0]);
      vm.imports.env.prints_l(0, 4);
      expect(vm.console).to.equal('hell');
    });

    it('printi', () => {
      vm.imports.env.printi(255n);
      expect(vm.console).to.equal('255');
      vm.imports.env.printi(-1n);
      expect(vm.console).to.equal('-1');
    });

    it('printui', () => {
      vm.imports.env.printui(255n);
      expect(vm.console).to.equal('255');
      vm.imports.env.printui(-1n);
      expect(vm.console).to.equal('18446744073709551615');
    });

    it('printi128', () => {
      const buffer = new DataView(memory.buffer);

      buffer.setBigInt64(0, -1n, true);
      buffer.setBigInt64(8, -1n, true);
      vm.imports.env.printi128(0);
      expect(vm.console).to.equal('-1');

      buffer.setBigUint64(0, 0n, true);
      buffer.setBigUint64(8, 1n << 63n, true);
      vm.imports.env.printi128(0);
      expect(vm.console).to.equal('-170141183460469231731687303715884105728');
    });

    it('printui128', () => {
      const buffer = new DataView(memory.buffer);

      buffer.setBigInt64(0, -1n, true);
      buffer.setBigInt64(8, -1n, true);
      vm.imports.env.printui128(0);
      expect(vm.console).to.equal('340282366920938463463374607431768211455');

      buffer.setBigUint64(0, 0n, true);
      buffer.setBigUint64(8, 1n << 63n, true);
      vm.imports.env.printui128(0);
      expect(vm.console).to.equal('170141183460469231731687303715884105728');
    });

    it('printsf', () => {
      vm.imports.env.printsf(1.001);
      //expect(vm.console).to.equal('1.001000e+00');
    });

    it('printdf', () => {
      vm.imports.env.printsf(1.001);
      //expect(vm.console).to.equal('1.001000000000000e+00');
    });

    it('printqf', () => {
      vm.imports.env.printsf(1.001);
      //expect(vm.console).to.equal('1.000999999999999890e+00');
    });

    it('printn', () => {
      vm.imports.env.printn(Name.from('alice').toBigInt());
      expect(vm.console).to.equal('alice');
      vm.imports.env.printn(Name.from('.foo..z.k').toBigInt());
      expect(vm.console).to.equal('.foo..z.k');
    });

    it('printhex', () => {
      const buffer = new Uint8Array(memory.buffer);
      buffer.set([161, 178, 195, 212, 0, 1, 255, 254]);
      vm.imports.env.printhex(0, 8);
      expect(vm.console).to.equal('a1b2c3d40001fffe');
    });
  });

  describe('builtins', () => {
    it('memcpy', () => {
      const buffer = new Uint8Array(memory.buffer, 0, 6);
      buffer.set([1, 2, 3, 4, 5, 6]);
      vm.imports.env.memcpy(2, 0, 4);
      expect(Uint8ArrayCompare(buffer, new Uint8Array([1, 2, 1, 2, 1, 2]))).to.equal(0);
    });
  });
});
