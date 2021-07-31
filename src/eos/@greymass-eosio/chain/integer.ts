import {ABISerializableObject} from '../serializer/serializable'
import {ABIDecoder} from '../serializer/decoder'
import {ABIEncoder} from '../serializer/encoder'
import {isInstanceOf, secureRandom} from '../utils'

type IntType = Int | number | string | bigint

interface IntDescriptor {
    isSigned: boolean
    byteWidth: number
}

/**
 * How to handle integer overflow.
 * - `throw`: Throws an error if value overflows (or underflows).
 * - `truncate`: Truncates or extends bit-pattern with sign extension (C++11 behavior).
 * - `clamp`: Clamps the value within the supported range.
 */
export type OverflowBehavior = 'throw' | 'truncate' | 'clamp'

/**
 * How to handle remainder when dividing integers.
 * - `floor`: Round down to nearest integer.
 * - `round`: Round to nearest integer.
 * - `ceil`: Round up to nearest integer.
 */
export type DivisionBehavior = 'floor' | 'round' | 'ceil'

/**
 * Binary integer with the underlying value represented by a BN.js instance.
 * Follows C++11 standard for arithmetic operators and conversions.
 * @note This type is optimized for correctness not speed, if you plan to manipulate
 *       integers in a tight loop you're advised to use the underlying BN.js value or
 *       convert to a JavaScript number first.
 */
export class Int implements ABISerializableObject {
    static abiName = '__int'
    static isSigned: boolean
    static byteWidth: number

    /** Largest value that can be represented by this integer type. */
    static get max() {
        return 2n ** (BigInt(this.byteWidth * 8 - (this.isSigned ? 1 : 0))) - (this.isSigned ? 1n : 0n)
    }

    /** Smallest value that can be represented by this integer type. */
    static get min() {
        return this.isSigned ? -this.max - 1n : 0n
    }

    /** Add `lhs` to `rhs` and return the resulting value. */
    static add(lhs: Int, rhs: Int, overflow: OverflowBehavior = 'truncate'): Int {
        return Int.operator(lhs, rhs, overflow, (a, b) => a + b)
    }

    /** Add `lhs` to `rhs` and return the resulting value. */
    static sub(lhs: Int, rhs: Int, overflow?: OverflowBehavior): Int {
        return Int.operator(lhs, rhs, overflow, (a, b) => a - b)
    }

    /** Multiply `lhs` by `rhs` and return the resulting value. */
    static mul(lhs: Int, rhs: Int, overflow?: OverflowBehavior): Int {
        return Int.operator(lhs, rhs, overflow, (a, b) => a * b)
    }

    /**
     * Divide `lhs` by `rhs` and return the quotient, dropping the remainder.
     * @throws When dividing by zero.
     */
    static div(lhs: Int, rhs: Int, overflow?: OverflowBehavior): Int {
        return Int.operator(lhs, rhs, overflow, (a, b) => {
            if (b === 0n) {
                throw new Error('Division by zero')
            }
            return a / b
        })
    }

    /**
     * Divide `lhs` by `rhs` and return the quotient + remainder rounded to the closest integer.
     * @throws When dividing by zero.
     */
    static divRound(lhs: Int, rhs: Int, overflow?: OverflowBehavior): Int {
        return Int.operator(lhs, rhs, overflow, (a, b) => {
            if (b === 0n) {
                throw new Error('Division by zero')
            }
            const dm = { div: a / b, mod: a % b }
            if (dm.mod === 0n) return dm.div
            return b / dm.mod <= 2 ? dm.div + 1n : dm.div
        })
    }

    /**
     * Divide `lhs` by `rhs` and return the quotient + remainder rounded up to the closest integer.
     * @throws When dividing by zero.
     */
    static divCeil(lhs: Int, rhs: Int, overflow?: OverflowBehavior): Int {
        return Int.operator(lhs, rhs, overflow, (a, b) => {
            if (b === 0n) {
                throw new Error('Division by zero')
            }
            const dm = { div: a / b, mod: a % b }
            if (dm.mod === 0n) return dm.div
            return dm.div + 1n
        })
    }

    /**
     * Can be used to implement custom operator.
     * @internal
     */
    static operator(
        lhs: Int,
        rhs: Int,
        overflow: OverflowBehavior = 'truncate',
        fn: (lhs: bigint, rhs: bigint) => bigint
    ) {
        const {a, b} = convert(lhs, rhs)
        const type = a.constructor as typeof Int
        const result = fn(a.value, b.value)
        return type.from(result, overflow)
    }

    /**
     * Create a new instance from value.
     * @param value Value to create new Int instance from, can be a string, number,
     *              little-endian byte array or another Int instance.
     * @param overflow How to handle integer overflow, default behavior is to throw.
     */
    static from<T extends typeof Int>(
        this: T,
        value: IntType | Uint8Array,
        overflow?: OverflowBehavior
    ): InstanceType<T>
    static from(value: any, overflow?: OverflowBehavior): unknown
    static from(value: IntType | Uint8Array, overflow?: OverflowBehavior): any {
        if (isInstanceOf(value, this)) {
            return value
        }
        let fromType: IntDescriptor = this
        let bn: bigint
        if (isInstanceOf(value, Int)) {
            fromType = value.constructor as typeof Int
            bn = value.value
        } else if (value instanceof Uint8Array) {
            bn = BN.fromUint8Array(value, fromType.byteWidth, fromType.isSigned)
        } else {
            if (
                (typeof value === 'string' && !/[0-9]+/.test(value)) ||
                (typeof value === 'number' && !Number.isFinite(value))
            ) {
                throw new Error('Invalid number')
            }
            bn = typeof value === 'bigint' ? value : BigInt(value)
            if (bn < 0n && !fromType.isSigned) {
                fromType = {byteWidth: fromType.byteWidth, isSigned: true}
            }
        }
        switch (overflow) {
            case 'clamp':
                bn = clamp(bn, this.min, this.max)
                break
            case 'truncate':
                bn = truncate(bn, fromType, this)
                break
        }
        return new this(bn)
    }

    static fromABI<T extends typeof Int>(this: T, decoder: ABIDecoder): InstanceType<T>
    static fromABI(decoder: ABIDecoder): unknown
    static fromABI(decoder: ABIDecoder) {
        return this.from(decoder.readArray(this.byteWidth))
    }

    static random<T extends typeof Int>(this: T): InstanceType<T>
    static random(): unknown
    static random() {
        return this.from(secureRandom(this.byteWidth))
    }

    /**
     * The underlying BN.js instance – don't modify this
     * directly – take a copy first using `.clone()`.
     */
    value: bigint

    /**
     * Create a new instance, don't use this directly. Use the `.from` factory method instead.
     * @throws If the value over- or under-flows the integer type.
     */
    constructor(value: bigint) {
        const self = this.constructor as typeof Int
        if (self.isSigned === undefined || self.byteWidth === undefined) {
            throw new Error('Cannot instantiate abstract class Int')
        }
        if (value > self.max) {
            throw new Error(`Number ${value} overflows ${self.abiName}`)
        }
        if (value < self.min) {
            throw new Error(`Number ${value} underflows ${self.abiName}`)
        }
        this.value = value
    }

    /**
     * Cast this integer to other type.
     * @param overflow How to handle overflow, default is to preserve bit-pattern (C++11 behavior).
     */
    cast<T extends typeof Int>(type: T, overflow?: OverflowBehavior): InstanceType<T>
    cast(type: typeof Int, overflow: OverflowBehavior = 'truncate'): InstanceType<typeof Int> {
        if (this.constructor === type) {
            return this
        }
        return type.from(this, overflow)
    }

    /** Number as bytes in little endian (matches memory layout in C++ contract). */
    get byteArray(): Uint8Array {
        const self = this.constructor as typeof Int
        return BN.toUint8Array(this.value, self.byteWidth, self.isSigned)
    }

    /**
     * Compare two integers, if strict is set to true the test will only consider integers
     * of the exact same type. I.e. Int64.from(1).equals(UInt64.from(1)) will return false.
     */
    equals(other: IntType | Uint8Array, strict = false) {
        const self = this.constructor as typeof Int
        if (strict === true && isInstanceOf(other, Int)) {
            const otherType = other.constructor as typeof Int
            if (self.byteWidth !== otherType.byteWidth || self.isSigned !== otherType.isSigned) {
                return false
            }
        }
        try {
            return this.value === self.from(other).value
        } catch {
            return false
        }
    }

    /** Mutating add. */
    add(num: IntType) {
        this.value = this.operator(num, Int.add).value
    }

    /** Non-mutating add. */
    adding(num: IntType) {
        return this.operator(num, Int.add)
    }

    /** Mutating subtract. */
    subtract(num: IntType) {
        this.value = this.operator(num, Int.sub).value
    }

    /** Non-mutating subtract. */
    subtracting(num: IntType) {
        return this.operator(num, Int.sub)
    }

    /** Mutating multiply. */
    multiply(by: IntType) {
        this.value = this.operator(by, Int.mul).value
    }

    /** Non-mutating multiply. */
    multiplying(by: IntType) {
        return this.operator(by, Int.mul)
    }

    /**
     * Mutating divide.
     * @param behavior How to handle the remainder, default is to floor (round down).
     * @throws When dividing by zero.
     */
    divide(by: IntType, behavior?: DivisionBehavior) {
        this.value = this.dividing(by, behavior).value
    }

    /**
     * Non-mutating divide.
     * @param behavior How to handle the remainder, default is to floor (round down).
     * @throws When dividing by zero.
     */
    dividing(by: IntType, behavior?: DivisionBehavior) {
        let op = Int.div
        switch (behavior) {
            case 'ceil':
                op = Int.divCeil
                break
            case 'round':
                op = Int.divRound
                break
        }
        return this.operator(by, op)
    }

    /**
     * Run operator with C++11 implicit conversion.
     * @internal
     */
    private operator(other: IntType, fn: (lhs: Int, rhs: Int) => Int): this {
        let rhs: Int
        if (isInstanceOf(other, Int)) {
            rhs = other
        } else {
            rhs = Int64.from(other, 'truncate')
        }
        return fn(this, rhs).cast(this.constructor as typeof Int) as this
    }

    /**
     * Convert to a JavaScript number.
     * @throws If the number cannot be represented by 53-bits.
     **/
    toNumber() {
        return Number(this.value)
    }

    toString() {
        return this.value.toString()
    }

    [Symbol.toPrimitive](type: string) {
        if (type === 'number') {
            return this.toNumber()
        } else {
            return this.toString()
        }
    }

    toABI(encoder: ABIEncoder) {
        encoder.writeArray(this.byteArray)
    }

    toJSON() {
        // match FCs behavior and return strings for anything above 32-bit
        const self = this.constructor as typeof Int
        if (self.byteWidth > 4) {
            return this.value.toString()
        } else {
            return this.toNumber()
        }
    }
}

export type Int8Type = Int8 | IntType
export class Int8 extends Int {
    static abiName = 'int8'
    static byteWidth = 1
    static isSigned = true
}

export type Int16Type = Int16 | IntType
export class Int16 extends Int {
    static abiName = 'int16'
    static byteWidth = 2
    static isSigned = true
}

export type Int32Type = Int32 | IntType
export class Int32 extends Int {
    static abiName = 'int32'
    static byteWidth = 4
    static isSigned = true
}

export type Int64Type = Int64 | IntType
export class Int64 extends Int {
    static abiName = 'int64'
    static byteWidth = 8
    static isSigned = true
}

export type Int128Type = Int128 | IntType
export class Int128 extends Int {
    static abiName = 'int128'
    static byteWidth = 16
    static isSigned = true
}

export type UInt8Type = UInt8 | IntType
export class UInt8 extends Int {
    static abiName = 'uint8'
    static byteWidth = 1
    static isSigned = false
}

export type UInt16Type = UInt16 | IntType
export class UInt16 extends Int {
    static abiName = 'uint16'
    static byteWidth = 2
    static isSigned = false
}

export type UInt32Type = UInt32 | IntType
export class UInt32 extends Int {
    static abiName = 'uint32'
    static byteWidth = 4
    static isSigned = false
}

export type UInt64Type = UInt64 | IntType
export class UInt64 extends Int {
    static abiName = 'uint64'
    static byteWidth = 8
    static isSigned = false
}

export type UInt128Type = UInt128 | IntType
export class UInt128 extends Int {
    static abiName = 'uint128'
    static byteWidth = 16
    static isSigned = false
}

export type VarIntType = VarInt | IntType
export class VarInt extends Int {
    static abiName = 'varint32'
    static byteWidth = 32
    static isSigned = true

    static fromABI(decoder: ABIDecoder) {
        return new this(BigInt(decoder.readVarint32()))
    }

    toABI(encoder: ABIEncoder) {
        encoder.writeVarint32(Number(this))
    }
}
export type VarUIntType = VarUInt | IntType
export class VarUInt extends Int {
    static abiName = 'varuint32'
    static byteWidth = 32
    static isSigned = false

    static fromABI(decoder: ABIDecoder) {
        return new this(BigInt(decoder.readVaruint32()))
    }

    toABI(encoder: ABIEncoder) {
        encoder.writeVaruint32(Number(this))
    }
}

export type AnyInt =
    | Int8Type
    | Int16Type
    | Int32Type
    | Int64Type
    | Int128Type
    | UInt8Type
    | UInt16Type
    | UInt32Type
    | UInt64Type
    | UInt128Type
    | VarIntType
    | VarUIntType

/** Clamp number between min and max. */
function clamp(num: bigint, min: bigint, max: bigint) {
    return BN.min(BN.max(num, min), max)
}

/**
 * Create new BN with the same bit pattern as the passed value,
 * extending or truncating the value’s representation as necessary.
 */
function truncate(value: bigint, from: IntDescriptor, to: IntDescriptor): bigint {
    const fill = value < 0 ? 255 : 0
    const fromBytes = BN.toUint8Array(value, from.byteWidth, from.isSigned)
    const toBytes = new Uint8Array(to.byteWidth)
    toBytes.fill(fill)
    toBytes.set(fromBytes.slice(0, to.byteWidth))
    return BN.fromUint8Array(toBytes, to.byteWidth, to.isSigned)
}

/** C++11 implicit integer conversions. */
function convert(a: Int, b: Int) {
    // The integral promotions (4.5) shall be performed on both operands.
    a = promote(a)
    b = promote(b)

    const aType = a.constructor as typeof Int
    const bType = b.constructor as typeof Int

    // If both operands have the same type, no further conversion is needed
    if (aType !== bType) {
        // Otherwise, if both operands have signed integer types or both have unsigned integer types,
        // the operand with the type of lesser integer conversion rank shall be converted to the type
        // of the operand with greater rank.
        if (aType.isSigned === bType.isSigned) {
            if (aType.byteWidth > bType.byteWidth) {
                b = b.cast(aType)
            } else if (bType.byteWidth > aType.byteWidth) {
                a = a.cast(bType)
            }
        } else {
            // Otherwise, if the operand that has unsigned integer type has rank greater than or equal
            // to the rank of the type of the other operand, the operand with signed integer type
            // shall be converted to the type of the operand with unsigned integer type.
            if (aType.isSigned === false && aType.byteWidth >= bType.byteWidth) {
                b = b.cast(aType)
            } else if (bType.isSigned === false && bType.byteWidth >= aType.byteWidth) {
                a = a.cast(bType)
            } else {
                // Otherwise, if the type of the operand with signed integer type can represent all of the
                // values of the type of the operand with unsigned integer type, the operand with unsigned
                // integer type shall be converted to the type of the operand with signed integer type.
                if (
                    aType.isSigned === true &&
                    aType.max >= bType.max &&
                    aType.min <= bType.min
                ) {
                    b = b.cast(aType)
                } else if (
                    bType.isSigned === true &&
                    bType.max >= aType.max &&
                    bType.min <= aType.min
                ) {
                    a = a.cast(bType)
                } else {
                    // Otherwise, both operands shall be converted to the unsigned integer type
                    // corresponding to the type of the operand with signed integer type.
                    // ---
                    // Dead code: this can't happen™ with the types we have.
                    // ---
                    // const signedType = aType.isSigned ? aType : bType
                    // let unsignedType: typeof Int
                    // switch (signedType.byteWidth) {
                    //     case 4:
                    //         unsignedType = UInt32
                    //         break
                    //     case 8:
                    //         unsignedType = UInt64
                    //         break
                    //     case 16:
                    //         unsignedType = UInt128
                    //         break
                    //     default:
                    //         throw new Error(
                    //             `No corresponding unsigned type for ${signedType.abiName}`
                    //         )
                    // }
                    // a = a.cast(unsignedType)
                    // b = b.cast(unsignedType)
                }
            }
        }
    }
    return {a, b}
}

/** C++11 integral promotion. */
function promote(n: Int) {
    // An rvalue of type char, signed char, unsigned char, short int, or
    // unsigned short int can be converted to an rvalue of type int if int
    // can represent all the values of the source type; otherwise, the source
    // rvalue can be converted to an rvalue of type unsigned int.
    let rv = n
    const type = n.constructor as typeof Int
    if (type.byteWidth < 4) {
        rv = n.cast(Int32)
    }
    return rv
}

namespace BN {
    export function max(a: bigint, b: bigint) {
        return a >= b ? a : b
    }

    export function min(a: bigint, b: bigint) {
        return a < b ? a : b
    }

    export function divmod(a: bigint, b: bigint) {
        return {
            div: a / b,
            mod: a % b,
        }
    }

    export function fromUint8Array(array: Uint8Array, byteWidth: number, isSigned = false): bigint {
        const view = new DataView(array.buffer, array.byteOffset, array.length)
        if (!isSigned) {
            switch (byteWidth) {
            case 1:
                return BigInt(view.getUint8(0))
            case 2:
                return BigInt(view.getUint16(0))
            case 4:
                return BigInt(view.getUint32(0))
            case 8:
                return view.getBigUint64(0, true)
            case 16:
                return view.getBigUint64(8, true) << 64n | view.getBigUint64(0, true)
            }
        } else {
            switch (byteWidth) {
            case 1:
                return BigInt(view.getInt8(0))
            case 2:
                return BigInt(view.getInt16(0))
            case 4:
                return BigInt(view.getInt32(0))
            case 8:
                return view.getBigInt64(0, true)
            case 16:
                return view.getBigInt64(8, true) << 64n | view.getBigInt64(0, true)
            }
        }
    }

    export function toUint8Array(value: bigint, byteWidth: number, isSigned = false): Uint8Array {
        const array = new Uint8Array(byteWidth)
        const view = new DataView(array.buffer)
        if (!isSigned) {
            switch (byteWidth) {
            case 1:
                view.setUint8(0, Number(value))
                break
            case 2:
                view.setUint16(0, Number(value))
                break
            case 4:
                view.setUint32(0, Number(value))
                break
            case 8:
                view.setBigUint64(0, value, true)
                break
            case 16:
                view.setBigUint64(0, value & BigInt.asUintN(64, -1n), true)
                view.setBigUint64(8, value >> 64n, true)
                break
            }
        } else {
            switch (byteWidth) {
            case 1:
                view.setInt8(0, Number(value))
                break
            case 2:
                view.setInt16(0, Number(value))
                break
            case 4:
                view.setInt32(0, Number(value))
                break
            case 8:
                view.setBigInt64(0, value, true)
                break
            case 16:
                view.setBigInt64(0, value & BigInt.asIntN(64, -1n), true)
                view.setBigInt64(8, value >> 64n, true)
                break
            }
        }
        return array
    }
}
