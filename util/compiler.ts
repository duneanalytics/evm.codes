import { BN } from 'ethereumjs-util'
import { IReferenceItem } from 'types'

export const compilerSemVer = 'v0.8.10'
export const compilerVersion = `soljson-${compilerSemVer}+commit.fc410830`

/**
 * Gets target EVM version from a hardfork name
 *
 * @param forkName The String harffork name
 * @returns The String matching target EVM version
 * @see https://docs.soliditylang.org/en/v0.8.10/using-the-compiler.html#target-options
 */
export const getTargetEvmVersion = (forkName: string | undefined) => {
  if (forkName === 'dao') {
    return 'homestead'
  }
  if (forkName === 'muirGlacier') {
    return 'berlin'
  }
  if (forkName === 'arrowGlacier') {
    return 'london'
  }
  return forkName
}

function toHexString(number: string, byteSize: number): string {
  let parsedNumber = null

  if (number.startsWith('0x') || number.startsWith('0X')) {
    if (!/^(0x|0X)[0-9a-fA-F]+$/.test(number)) {
      throw new Error('Not a valid hexadecimal number: ' + number)
    }

    parsedNumber = new BN(number.substring(2), 'hex')
  } else {
    if (!/^[0-9]+$/.test(number)) {
      throw new Error('Not a valid decimal number: ' + number)
    }

    parsedNumber = new BN(number)
  }

  if (parsedNumber.byteLength() > byteSize) {
    throw new Error('Value is too big for ' + byteSize + ' byte(s): ' + number)
  }

  return parsedNumber.toString('hex', byteSize * 2)
}

/**
 * Gets bytecode from mnemonic
 *
 * @param code The string code
 * @param opcodes The IReferenceItem array of opcodes
 * @returns The string bytecode
 */
export const getBytecodeFromMnemonic = (
  code: string,
  opcodes: IReferenceItem[],
) => {
  let bytecode = ''
  const lines = code.split('\n')

  for (let i = 0; i < lines.length; ++i) {
    const line = lines[i]
      .replace(/\/\/.*/, '')
      .trim()
      .toUpperCase()

    if (line.length === 0) {
      continue
    }

    if (line.startsWith('PUSH')) {
      const parts = line.split(/\s+/)

      if (parts.length !== 2) {
        throw new Error('Expect PUSH instruction followed by a number: ' + line)
      }

      const code = opcodes.find((opcode: IReferenceItem) => {
        return opcode.name === parts[0]
      })

      if (typeof code === 'undefined') {
        throw new Error('Unknown mnemonic: ' + parts[0])
      }

      const number = parseInt(parts[0].substring(4))
      bytecode += code.opcodeOrAddress + toHexString(parts[1], number)
    } else {
      const code = opcodes.find((opcode: IReferenceItem) => {
        return opcode.name === line
      })
      if (typeof code === 'undefined') {
        throw new Error('Unknown mnemonic: ' + line)
      }

      bytecode += code.opcodeOrAddress
    }
  }

  return bytecode
}
