import { expect } from "chai";
import { Name } from "@greymass/eosio";
import { VM } from "../vm";
import { Memory } from "../../memory";
import Buffer from "../../buffer";
import { nameToBigInt } from "../bn";
import { Blockchain } from "../blockchain";

const bc = new Blockchain()

let vm;
let memory;

beforeEach(() => {
  bc.clearConsole()
  vm = VM.from(new Uint8Array(), bc);
  memory = Memory.create(256);
  // @ts-ignore
  vm._memory = memory;
});

describe('eos-vm imports', () => {
  describe('crypto', () => {
    it('assert_sha256', () => {
      const buffer = Buffer.from_(memory.buffer);
      const preimage = Buffer.from_('vert');
      const digest = Buffer.from_('6a103aecbd239f79ce183fc33649b71783a61711afb291524c97af442deb33a5', 'hex');
      buffer.set(preimage, 0);
      buffer.set(digest, 4);
      vm.imports.env.assert_sha256(0, 4, 4);
    });

    it('assert_sha1', () => {
      const buffer = Buffer.from_(memory.buffer);
      const preimage = Buffer.from_('vert');
      const digest = Buffer.from_('a0d6b8b8b6ff239253dbc1af10337dabd12f2236', 'hex');
      buffer.set(preimage, 0);
      buffer.set(digest, 4);
      vm.imports.env.assert_sha1(0, 4, 4);
    });

    it('assert_sha512', () => {
      const buffer = Buffer.from_(memory.buffer);
      const preimage = Buffer.from_('vert');
      const digest = Buffer.from_('1841ac5b16fe341194f6dd18ad361025c88547320bef8080847e4db5042270e40f07b3666b5cf5e75d2830523d7d96aae574b2511f4de7ee2e89698cf4bb701e', 'hex');
      buffer.set(preimage, 0);
      buffer.set(digest, 4);
      vm.imports.env.assert_sha512(0, 4, 4);
    });

    it('assert_ripemd160', () => {
      const buffer = Buffer.from_(memory.buffer);
      const preimage = Buffer.from_('vert');
      const digest = Buffer.from_('a59355085d66e2a954081e9892980b8b61bf25c1', 'hex');
      buffer.set(preimage, 0);
      buffer.set(digest, 4);
      vm.imports.env.assert_ripemd160(0, 4, 4);
    });

    it('recover_key', () => {
      const buffer = Buffer.from_(memory.buffer);
      const digest = Buffer.from_('cacc5e5fdb065cb9929e57766ac740c4d21b72448b1d5d9f405e25be91857c7a', 'hex');
      const signature = Buffer.from_('00204AECCC5FB93E32C68CF4041D42CF5E18365FD4C54B5B6917418D2C99046236F61838A60E65C744162A3B2597965945E53E637FEC091CEA680153E78D004230FC', 'hex');
      const publicKey = Buffer.from_('0003DD4BD191F57FC1A5235EEC881A08C31A2FBCE198F250CDEAE98A7218D37C0C2B', 'hex');
      buffer.set(digest, 0);
      buffer.set(signature, 32);
      vm.imports.env.recover_key(0, 32, 66, 98, 34);
      expect(Buffer.compare(buffer.slice(98, 132), publicKey)).to.equal(0);
    });

    it('assert_recover_key', () => {
      const buffer = Buffer.from_(memory.buffer);
      const digest = Buffer.from_('cacc5e5fdb065cb9929e57766ac740c4d21b72448b1d5d9f405e25be91857c7a', 'hex');
      const signature = Buffer.from_('00204AECCC5FB93E32C68CF4041D42CF5E18365FD4C54B5B6917418D2C99046236F61838A60E65C744162A3B2597965945E53E637FEC091CEA680153E78D004230FC', 'hex');
      const publicKey = Buffer.from_('0003DD4BD191F57FC1A5235EEC881A08C31A2FBCE198F250CDEAE98A7218D37C0C2B', 'hex');
      buffer.set(digest, 0);
      buffer.set(signature, 32);
      buffer.set(publicKey, 98);
      vm.imports.env.assert_recover_key(0, 32, 66, 98, 34); // this throws an error when failed
    });
  });

  describe('print', () => {
    it('prints', () => {
      const buffer = Buffer.from_(memory.buffer);
      buffer.set(Buffer.from_([104, 101, 108, 108, 111, 0]));
      vm.imports.env.prints(0);
      expect(bc.console).to.equal('hello');
    });

    it('prints_l', () => {
      const buffer = Buffer.from_(memory.buffer);
      buffer.set(Buffer.from_([104, 101, 108, 108, 111, 0]));
      vm.imports.env.prints_l(0, 4);
      expect(bc.console).to.equal('hell');
    });

    it('printi', () => {
      vm.imports.env.printi(255n);
      expect(bc.console).to.equal('255');

      bc.clearConsole()

      vm.imports.env.printi(-1n);
      expect(bc.console).to.equal('-1');
    });

    it('printui', () => {
      vm.imports.env.printui(255n);
      expect(bc.console).to.equal('255');

      bc.clearConsole()

      vm.imports.env.printui(-1n);
      expect(bc.console).to.equal('18446744073709551615');
    });

    it('printi128', () => {
      const buffer = Buffer.from_(memory.buffer);

      buffer.writeBigInt64LE(-1n);
      buffer.writeBigInt64LE(-1n, 8);
      vm.imports.env.printi128(0);
      expect(bc.console).to.equal('-1');

      bc.clearConsole()

      buffer.writeBigUInt64LE(0n);
      buffer.writeBigUInt64LE(1n << 63n, 8);
      vm.imports.env.printi128(0);
      expect(bc.console).to.equal('-170141183460469231731687303715884105728');
    });

    it('printui128 1', () => {
      const buffer = Buffer.from_(memory.buffer);

      buffer.writeBigInt64LE(-1n);
      buffer.writeBigInt64LE(-1n, 8);
      vm.imports.env.printui128(0);
      expect(bc.console).to.equal('340282366920938463463374607431768211455');

      bc.clearConsole()

      buffer.writeBigUInt64LE(0n);
      buffer.writeBigUInt64LE(1n << 63n, 8);
      vm.imports.env.printui128(0);
      expect(bc.console).to.equal('170141183460469231731687303715884105728');
    });

    /*
    it('printsf', () => {
      vm.imports.env.printsf(1.001);
      expect(bc.console).to.equal('1.001000e+00');
    });

    it('printdf', () => {
      vm.imports.env.printdf(1.001);
      expect(bc.console).to.equal('1.001000000000000e+00');
    });

    it('printqf', () => {
      vm.imports.env.printqf(1.001);
      expect(bc.console).to.equal('1.000999999999999890e+00');
    });
    */

    it('printn', () => {
      vm.imports.env.printn(nameToBigInt(Name.from('alice')));
      expect(bc.console).to.equal('alice');

      bc.clearConsole()

      vm.imports.env.printn(nameToBigInt(Name.from('.foo..z.k')));
      expect(bc.console).to.equal('.foo..z.k');
    });

    it('printhex', () => {
      const buffer = Buffer.from_(memory.buffer);
      buffer.set([161, 178, 195, 212, 0, 1, 255, 254]);
      vm.imports.env.printhex(0, 8);
      expect(bc.console).to.equal('a1b2c3d40001fffe');
    });
  });

  describe('builtins', () => {
    it('memcpy', () => {
      const buffer = Buffer.from_(memory.buffer, 0, 6);
      buffer.set([1, 2, 3, 4, 5, 6]);
      vm.imports.env.memcpy(2, 0, 4);
      expect(Buffer.compare(buffer, Buffer.from_([1, 2, 1, 2, 1, 2]))).to.equal(0);
    });
  });
});
