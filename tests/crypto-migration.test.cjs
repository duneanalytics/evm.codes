const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')
const { decodeAbiParameters, encodeFunctionData } = require('viem')

// Load the same TypeScript helper used by the editor without adding a test runner.
require.extensions['.ts'] = (module, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  })
  module._compile(outputText, filename)
}
const { encodeArguments, parseArguments } = require('../util/abi.ts')
const { getBytecodeFromMnemonic } = require('../util/compiler.ts')

const word = (hex) => hex.padStart(64, '0')

test('ABI integer, boolean, address and byte arguments retain their values', () => {
  const parameters = [
    { type: 'uint256' },
    { type: 'int256' },
    { type: 'bool' },
    { type: 'address' },
    { type: 'bytes2' },
  ]
  const address = '0x0000000000000000000000000000000000001234'
  const data = encodeArguments(parameters, [
    '9007199254740993',
    '-1',
    'false',
    address,
    '0xabcd',
  ])
  assert.equal(
    data,
    '0x' +
      word('20000000000001') +
      'f'.repeat(64) +
      word('0') +
      word('1234') +
      'abcd'.padEnd(64, '0'),
  )
  assert.deepEqual(decodeAbiParameters(parameters, data), [
    9007199254740993n,
    -1n,
    false,
    address,
    '0xabcd',
  ])
  assert.throws(() => encodeArguments([{ type: 'uint8' }], ['256']))
  assert.throws(() => encodeArguments([{ type: 'bool' }], ['invalid']))
  assert.throws(() => encodeArguments([{ type: 'uint256' }], []))
})

test('function selectors and dynamic constructor arguments encode correctly', () => {
  const inputs = [{ name: 'value', type: 'uint256' }]
  assert.equal(
    encodeFunctionData({
      abi: [
        {
          type: 'function',
          name: 'set',
          inputs,
          outputs: [],
          stateMutability: 'nonpayable',
        },
      ],
      functionName: 'set',
      args: parseArguments(inputs, ['42']),
    }),
    '0x60fe47b1' + word('2a'),
  )
  const parameters = [{ type: 'string' }, { type: 'bytes' }]
  assert.deepEqual(
    decodeAbiParameters(
      parameters,
      encodeArguments(parameters, ['hello', '0x1234']),
    ),
    ['hello', '0x1234'],
  )
  assert.equal(encodeArguments([], []), '0x')
})

test('mnemonic numeric conversion preserves large integers and overflow checks', () => {
  const opcodes = [{ name: 'PUSH8', opcodeOrAddress: '67' }]
  assert.equal(
    getBytecodeFromMnemonic('PUSH8 9007199254740993', opcodes),
    '670020000000000001',
  )
  assert.equal(
    getBytecodeFromMnemonic('PUSH8 0xffffffffffffffff', opcodes),
    '67ffffffffffffffff',
  )
  assert.throws(
    () => getBytecodeFromMnemonic('PUSH8 18446744073709551616', opcodes),
    /too big/,
  )
})

test('modexp gas calculation preserves exponent padding at word boundaries', () => {
  const { calculatePrecompiledDynamicFee } = require('../util/gas.ts')
  for (const berlin of [false, true]) {
    const divisor = berlin ? 3 : 20
    const common = { param: () => BigInt(divisor), gteHardfork: () => berlin }
    for (const bits of [0, 1, 7, 8, 248, 255, 256, 264]) {
      const exponent = 1n << BigInt(bits)
      const expected = Math.floor(((berlin ? 16 : 1024) * bits) / divisor)
      assert.equal(
        calculatePrecompiledDynamicFee({ opcodeOrAddress: '0x05' }, common, {
          exponent: exponent.toString(),
          Bsize: '32',
          Msize: '32',
        }),
        String(berlin ? Math.max(200, expected) : expected),
      )
    }
  }
})

test('generated worker loads a compiler, compiles Solidity, and reports failures', () => {
  const responses = []
  let listener
  let loads = 0
  const context = vm.createContext({
    console,
    TextDecoder,
    TextEncoder,
    WebAssembly,
    setTimeout,
    clearTimeout,
    self: {
      addEventListener: (_, callback) => {
        listener = callback
      },
      postMessage: (message) => responses.push(message),
    },
    importScripts: (url) => {
      assert.equal(
        url,
        'https://binaries.soliditylang.org/bin/soljson-v0.8.23+commit.f704f362.js',
      )
      loads++
      context.self.Module = require('solc/soljson.js')
    },
  })
  vm.runInContext(fs.readFileSync('public/solcWorker.js', 'utf8'), context)
  const input = {
    language: 'Solidity',
    sources: {
      'Test.sol': {
        content:
          'pragma solidity >=0.8.0; contract Test { function value() public pure returns (uint) { return 42; } }',
      },
    },
    settings: { outputSelection: { '*': { '*': ['evm.bytecode.object'] } } },
  }
  listener({ data: { jobId: 1, version: '0.8.23', stdJson: input } })
  assert.ok(
    responses[0].result.contracts['Test.sol'].Test.evm.bytecode.object.length >
      0,
  )
  listener({
    data: { jobId: 2, version: '0.8.23', stdJson: JSON.stringify(input) },
  })
  assert.equal(loads, 1)
  assert.equal(responses[1].jobId, 2)
  listener({ data: { jobId: 3 } })
  assert.equal(responses[2].error, 'no version or standard json specified')
  listener({
    data: {
      jobId: 4,
      version: '0.8.23',
      stdJson: {
        ...input,
        sources: { 'bad.sol': { content: 'not solidity' } },
      },
    },
  })
  assert.ok(
    responses[3].result.errors.some((error) => error.severity === 'error'),
  )
})
