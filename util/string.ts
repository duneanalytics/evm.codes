import hljs from 'highlight.js/lib/core'
import hljsDefineSolidity from 'highlightjs-solidity'
import { IMemoryWord } from 'types'

import hljsDefineBytecode from '../bytecode.js'
import hljsDefineMnemonic from '../mnemonic.js'

const reHex = /^[0-9a-fA-F]+$/
const reFullHex = /^(0x|0X)([0-9a-fA-F][0-9a-fA-F])+$/

// Add Solidity to Highlight
hljsDefineSolidity(hljs)
hljs.registerLanguage('mnemonic', hljsDefineMnemonic)
hljs.registerLanguage('bytecode', hljsDefineBytecode)

/**
 * Checks whether text is empty.
 */
export const isEmpty = (text: string) => {
  return !text || text.length === 0
}

/**
 * Converts number to a hex representation with double-digit formatting.
 */
export const toHex = (text: string | number) => {
  let hex = Number(text).toString(16)
  if (hex.length < 2) {
    hex = '0' + hex
  }
  return hex
}

/**
 * Checks whether text is in hex format.
 */
export const isHex = (text: string) => {
  return reHex.test(text)
}

/**
 * Checks whether text is in full hex format, starting with 0x
 */
export const isFullHex = (text: string) => {
  return reFullHex.test(text)
}

/**
 * Formats the code with Highlight.js for a given language extension.
 *
 * @param text The text to be highlighted.
 * @param extension One of the supported highlight.js language extensions w/o dot.
 * @returns Highlighted text.
 */
export const codeHighlight = (text: string, extension: string) => {
  return hljs.highlight(text, {
    language: extension,
    ignoreIllegals: true,
  })
}

/**
 * Converts buffer to string.
 */
export const fromBuffer = (buf: Buffer) => {
  let result = ''
  buf.forEach((value) => {
    result += value.toString(16).padStart(2, '0')
  })
  return result
}

const EVM_MEMORY_WORD_BYTES = 32
const EVM_MEMORY_WORD_HEX_LENGTH = EVM_MEMORY_WORD_BYTES * 2

const normalizeMemoryWordHex = (wordHex: string) =>
  wordHex
    .padEnd(EVM_MEMORY_WORD_HEX_LENGTH, '0')
    .slice(0, EVM_MEMORY_WORD_HEX_LENGTH)

/**
 * Splits EVM memory into 32-byte words keyed by byte offset (00, 20, 40, …).
 */
export const formatEvmMemory = (hex: string): IMemoryWord[] => {
  if (!hex || hex.length === 0) {
    return [{ offset: '00', data: '' }]
  }

  const totalBytes = hex.length / 2
  const offsetWidth = Math.max(
    2,
    Math.max(0, totalBytes - 1).toString(16).length,
  )
  const words: IMemoryWord[] = []

  for (
    let hexIndex = 0;
    hexIndex < hex.length;
    hexIndex += EVM_MEMORY_WORD_HEX_LENGTH
  ) {
    const byteOffset = hexIndex / 2
    const offset = byteOffset.toString(16).padStart(offsetWidth, '0')
    const wordHex = hex.slice(hexIndex, hexIndex + EVM_MEMORY_WORD_HEX_LENGTH)
    words.push({
      offset,
      data: normalizeMemoryWordHex(wordHex),
    })
  }

  return words
}

/**
 * Creates a RC key from string prefix and index.
 */
export const toKeyIndex = (prefix: string, index: number) => {
  return [prefix, index].join('-')
}

/**
 * Creates a query string from an object.
 */
export const objToQueryString = (params: any) => {
  return Object.keys(params)
    .map((key) => (!isEmpty(params[key]) ? key + '=' + params[key] : null))
    .filter((param) => param !== null)
    .join('&')
}
