import { Common, HardforkTransitionConfig } from '@ethereumjs/common'
import { setLengthRight, BN } from 'ethereumjs-util'
import { IReferenceItem } from 'types'

interface SstoreInputs {
  newValue: string
  currentValue: string
  originalValue?: string
  cold?: string
}

interface CreateInputs {
  offset: string
  size: string
  memorySize: string
  deployedSize: string
  executionCost: string
}

interface CallInputs {
  argsOffset: string
  argsSize: string
  retOffset: string
  retSize: string
  memorySize: string
  executionCost: string
  value?: string
  empty?: string
  cold?: string
}

interface EofCreateInputs {
  offset: string
  size: string
  memorySize: string
  containerSize: string
  deployedSize: string
  executionCost: string
}

interface ExtCallInputs {
  offset: string
  size: string
  memorySize: string
  value?: string
  empty?: string
  cold?: string
  executionCost: string
}

interface AddressAccessInputs {
  cold?: string
}

const namespaces = ['gasPrices']
const reFences = /{(.+)}/
const reGasVariable = /\{\s*[a-zA-Z0-9_|]*\s*\}/g

function toWordSize(a: BN): BN {
  const wordSize = new BN(32)
  const div = a.div(wordSize)
  const mod = a.mod(wordSize)

  // Fast case - exact division
  if (mod.isZero()) {
    return div
  }

  // Round up
  return div.isNeg() ? div.isubn(1) : div.iaddn(1)
}

function memoryCost(wordSize: BN, common: Common): BN {
  const fee = Number(getCommonParam(common, 'gasPrices', 'memory'))
  const quadCoeff = Number(getCommonParam(common, 'gasPrices', 'quadCoeffDiv'))
  return wordSize.muln(fee).add(wordSize.mul(wordSize).divn(quadCoeff))
}

function memoryExtensionCost(
  offset: BN,
  byteSize: BN,
  currentMemorySize: BN,
  common: Common,
): BN {
  if (byteSize.isZero()) {
    return byteSize
  }

  const newMemoryWordSize = toWordSize(offset.add(byteSize))
  const oldMemoryWordSize = toWordSize(currentMemorySize)
  if (newMemoryWordSize.lte(oldMemoryWordSize)) {
    return new BN(0)
  }

  const newCost = memoryCost(newMemoryWordSize, common)
  const oldCost = memoryCost(oldMemoryWordSize, common)
  if (newCost.gt(oldCost)) {
    newCost.isub(oldCost)
  }
  return newCost
}

function memoryCostCopy(inputs: any, param: string, common: Common): BN {
  const paramWordCost = new BN(
    Number(getCommonParam(common, 'gasPrices', param)),
  )
  const expansionCost = memoryExtensionCost(
    new BN(inputs.offset),
    new BN(inputs.size),
    new BN(inputs.memorySize),
    common,
  )
  return expansionCost.iadd(paramWordCost.mul(toWordSize(new BN(inputs.size))))
}

function addressAccessCost(common: Common, inputs: AddressAccessInputs): BN {
  if (inputs.cold === '1') {
    return new BN(
      Number(getCommonParam(common, 'gasPrices', 'coldaccountaccess')),
    )
  } else {
    return new BN(
      Number(getCommonParam(common, 'gasPrices', 'warmstorageread')),
    )
  }
}

function sstoreCost(common: Common, inputs: SstoreInputs): BN {
  if (common.hardfork() === 'constantinople') {
    if (inputs.newValue === inputs.currentValue) {
      return new BN(
        Number(getCommonParam(common, 'gasPrices', 'netSstoreNoopGas')),
      )
    } else if (inputs.currentValue === inputs.originalValue) {
      if (inputs.originalValue === '0') {
        return new BN(
          Number(getCommonParam(common, 'gasPrices', 'netSstoreInitGas')),
        )
      } else {
        return new BN(
          Number(getCommonParam(common, 'gasPrices', 'netSstoreCleanGas')),
        )
      }
    } else {
      return new BN(
        Number(getCommonParam(common, 'gasPrices', 'netSstoreDirtyGas')),
      )
    }
  } else if (common.gteHardfork('istanbul')) {
    if (inputs.newValue === inputs.currentValue) {
      if (common.gteHardfork('berlin') && inputs.cold !== '1') {
        return new BN(
          Number(getCommonParam(common, 'gasPrices', 'warmstorageread')),
        )
      } else {
        return new BN(
          Number(getCommonParam(common, 'gasPrices', 'sstoreNoopGasEIP2200')),
        )
      }
    } else if (inputs.currentValue === inputs.originalValue) {
      if (inputs.originalValue === '0') {
        return new BN(
          Number(getCommonParam(common, 'gasPrices', 'sstoreInitGasEIP2200')),
        )
      } else {
        return new BN(
          Number(getCommonParam(common, 'gasPrices', 'sstoreCleanGasEIP2200')),
        )
      }
    } else {
      return new BN(
        Number(getCommonParam(common, 'gasPrices', 'sstoreDirtyGasEIP2200')),
      )
    }
  } else {
    if (inputs.newValue !== '0' && inputs.currentValue === '0') {
      return new BN(Number(getCommonParam(common, 'gasPrices', 'sstoreSet')))
    } else {
      return new BN(Number(getCommonParam(common, 'gasPrices', 'sstoreReset')))
    }
  }
}

function createCost(common: Common, inputs: CreateInputs): BN {
  const expansionCost = memoryExtensionCost(
    new BN(inputs.offset),
    new BN(inputs.size),
    new BN(inputs.memorySize),
    common,
  )
  const depositCost = new BN(inputs.deployedSize).imuln(
    Number(getCommonParam(common, 'gasPrices', 'createData')),
  )

  const result = expansionCost
    .iadd(depositCost)
    .iadd(new BN(inputs.executionCost))

  if (common.gteHardfork('shanghai')) {
    const initCodeCost = new BN(
      toWordSize(new BN(inputs.size)).imuln(
        Number(getCommonParam(common, 'gasPrices', 'initCodeWordCost')),
      ),
    )
    result.iadd(initCodeCost)
  }

  return result
}

function callCost(common: Common, inputs: CallInputs): BN {
  const argsOffset = new BN(inputs.argsOffset)
  const argsSize = new BN(inputs.argsSize)
  const retOffset = new BN(inputs.retOffset)
  const retSize = new BN(inputs.retSize)
  let result = null

  if (argsOffset.add(argsSize).gt(retOffset.add(retSize))) {
    result = memoryExtensionCost(
      argsOffset,
      argsSize,
      new BN(inputs.memorySize),
      common,
    )
  } else {
    result = memoryExtensionCost(
      retOffset,
      retSize,
      new BN(inputs.memorySize),
      common,
    )
  }

  result.iadd(new BN(inputs.executionCost))

  if (typeof inputs.value !== 'undefined' && inputs.value !== '0') {
    result.iaddn(
      Number(getCommonParam(common, 'gasPrices', 'callValueTransfer')),
    )
    result.isubn(Number(getCommonParam(common, 'gasPrices', 'callStipend')))
  }

  if (common.gteHardfork('spuriousDragon')) {
    if (inputs.empty === '1' && inputs.value !== '0') {
      result.iadd(
        new BN(Number(getCommonParam(common, 'gasPrices', 'callNewAccount'))),
      )
    }
  } else if (inputs.empty === '1') {
    result.iadd(
      new BN(Number(getCommonParam(common, 'gasPrices', 'callNewAccount'))),
    )
  }

  if (common.gteHardfork('berlin')) {
    result.iadd(addressAccessCost(common, inputs))
  }

  return result
}

const eofCreateCost = (common: Common, inputs: EofCreateInputs): BN => {
  const expansionCost = memoryExtensionCost(
    new BN(inputs.offset),
    new BN(inputs.size),
    new BN(inputs.memorySize),
    common,
  )

  const keccak256WordCost = new BN(
    Number(getCommonParam(common, 'gasPrices', 'keccak256WordGas')),
  )
  const hashingCost = keccak256WordCost.mul(
    toWordSize(new BN(inputs.containerSize)),
  )

  const depositCost = new BN(inputs.deployedSize).imuln(
    Number(getCommonParam(common, 'gasPrices', 'createDataGas')),
  )

  const result = expansionCost
    .iadd(hashingCost)
    .iadd(new BN(inputs.executionCost))
    .iadd(depositCost)

  return result
}

const extCallCost = (common: Common, inputs: ExtCallInputs): BN => {
  const result = memoryExtensionCost(
    new BN(inputs.offset),
    new BN(inputs.size),
    new BN(inputs.memorySize),
    common,
  )

  if (typeof inputs.value !== 'undefined' && inputs.value !== '0') {
    result.iaddn(
      Number(getCommonParam(common, 'gasPrices', 'callValueTransferGas')),
    )
  }

  if (common.gteHardfork('berlin')) {
    result.iadd(addressAccessCost(common, inputs))
  }

  if (inputs.empty === '1' && inputs.value !== '0') {
    result.iadd(
      new BN(Number(getCommonParam(common, 'gasPrices', 'callNewAccountGas'))),
    )
  }

  result.iadd(new BN(inputs.executionCost))

  return result
}

export const calculateDynamicFee = (
  opcodeOrPrecompiled: IReferenceItem,
  common: Common,
  inputs: any,
) => {
  if (opcodeOrPrecompiled.opcodeOrAddress.startsWith('0x')) {
    return calculatePrecompiledDynamicFee(opcodeOrPrecompiled, common, inputs)
  } else {
    return calculateOpcodeDynamicFee(opcodeOrPrecompiled, common, inputs)
  }
}

export const calculateDynamicRefund = (
  opcode: IReferenceItem,
  common: Common,
  inputs: any,
) => {
  let result = null
  switch (opcode.opcodeOrAddress) {
    case '55': {
      if (common.hardfork() === 'constantinople') {
        if (inputs.newValue === inputs.currentValue) {
          result = new BN(0)
        } else if (inputs.currentValue === inputs.originalValue) {
          if (inputs.originalValue !== '0' && inputs.newValue === '0') {
            result = new BN(
              Number(
                getCommonParam(common, 'gasPrices', 'netSstoreClearRefund'),
              ),
            )
          } else {
            result = new BN(0)
          }
        } else {
          result = new BN(0)
          if (inputs.originalValue !== '0') {
            if (inputs.currentValue === '0') {
              result.isubn(
                Number(
                  getCommonParam(common, 'gasPrices', 'netSstoreClearRefund'),
                ),
              )
            } else if (inputs.newValue === '0') {
              result.iaddn(
                Number(
                  getCommonParam(common, 'gasPrices', 'netSstoreClearRefund'),
                ),
              )
            }
          }
          if (inputs.newValue === inputs.originalValue) {
            if (inputs.originalValue === '0') {
              result.iaddn(
                Number(
                  getCommonParam(
                    common,
                    'gasPrices',
                    'netSstoreResetClearRefund',
                  ),
                ),
              )
            } else {
              result.iaddn(
                Number(
                  getCommonParam(common, 'gasPrices', 'netSstoreResetRefund'),
                ),
              )
            }
          }
        }
      } else if (common.gteHardfork('istanbul')) {
        if (inputs.newValue === inputs.currentValue) {
          result = new BN(0)
        } else if (inputs.currentValue === inputs.originalValue) {
          if (inputs.originalValue !== '0' && inputs.newValue === '0') {
            result = new BN(
              Number(
                getCommonParam(common, 'gasPrices', 'sstoreClearRefundEIP2200'),
              ),
            )
          } else {
            result = new BN(0)
          }
        } else {
          result = new BN(0)
          if (inputs.originalValue !== '0') {
            if (inputs.currentValue === '0') {
              result.isubn(
                Number(
                  getCommonParam(
                    common,
                    'gasPrices',
                    'sstoreClearRefundEIP2200',
                  ),
                ),
              )
            } else if (inputs.newValue === '0') {
              result.iaddn(
                Number(
                  getCommonParam(
                    common,
                    'gasPrices',
                    'sstoreClearRefundEIP2200',
                  ),
                ),
              )
            }
          }
          if (inputs.newValue === inputs.originalValue) {
            if (inputs.originalValue === '0') {
              if (common.gteHardfork('berlin') && inputs.cold !== '1') {
                result
                  .iaddn(
                    Number(
                      getCommonParam(
                        common,
                        'gasPrices',
                        'sstoreInitGasEIP2200',
                      ),
                    ),
                  )
                  .isubn(
                    Number(
                      getCommonParam(common, 'gasPrices', 'warmstorageread'),
                    ),
                  )
              } else {
                result.iaddn(
                  Number(
                    getCommonParam(
                      common,
                      'gasPrices',
                      'sstoreInitRefundEIP2200',
                    ),
                  ),
                )
              }
            } else {
              if (common.gteHardfork('berlin') && inputs.cold !== '1') {
                result
                  .iaddn(
                    Number(getCommonParam(common, 'gasPrices', 'sstoreReset')),
                  )
                  .isubn(
                    Number(getCommonParam(common, 'gasPrices', 'coldsload')),
                  )
                  .isubn(
                    Number(
                      getCommonParam(common, 'gasPrices', 'warmstorageread'),
                    ),
                  )
              } else {
                result.iaddn(
                  Number(
                    getCommonParam(
                      common,
                      'gasPrices',
                      'sstoreCleanRefundEIP2200',
                    ),
                  ),
                )
              }
            }
          }
        }
      } else {
        if (inputs.newValue === '0' && inputs.currentValue !== '0') {
          result = new BN(
            Number(getCommonParam(common, 'gasPrices', 'sstoreRefund')),
          )
        } else {
          result = new BN(0)
        }
      }
      break
    }
    case 'ff': {
      if (common.gteHardfork('london')) {
        return null
      } else {
        result = new BN(
          Number(getCommonParam(common, 'gasPrices', 'selfdestructRefund')),
        )
      }
      break
    }
    default:
      return null
  }
  return result.toString()
}

/*
 * Calculates dynamic gas fee
 *
 * @param opcode The IReferenceItem
 * @param common The Common object
 * @param inputs The Object of user inputs based on the `dynamicFee` inputs
 *                 in the opcodes.json. If empty, we want to return the minimum fee for that code.
 *
 * @returns The String representation of the gas fee.
 *
 * Fee calculation is based on the ethereumjs-vm functions,
 * See: https://github.com/ethereumjs/ethereumjs-monorepo/blob/master/packages/vm/src/evm/opcodes/functions.ts
 */
export const calculateOpcodeDynamicFee = (
  opcode: IReferenceItem,
  common: Common,
  inputs: any,
) => {
  let result = null
  switch (opcode.opcodeOrAddress) {
    case '0a': {
      const exponent = new BN(inputs.exponent)
      const gasPrice = Number(getCommonParam(common, 'gasPrices', 'expByte'))
      result = new BN(exponent.byteLength()).imuln(gasPrice)
      break
    }
    case '20': {
      result = memoryCostCopy(inputs, 'keccak256Word', common)
      break
    }
    case '31':
    case '3b':
    case '3f': {
      if (common.gteHardfork('berlin')) {
        result = addressAccessCost(common, inputs)
      } else {
        result = new BN(0)
      }
      break
    }
    case '37':
    case '39':
    case '3e': {
      result = memoryCostCopy(inputs, 'copy', common)
      break
    }
    case '3c': {
      result = memoryCostCopy(inputs, 'copy', common)

      if (common.gteHardfork('berlin')) {
        result.iadd(addressAccessCost(common, inputs))
      }
      break
    }
    case '51':
    case '52': {
      // If no value is provided, we want a value that gives us the minimum cost
      result = memoryExtensionCost(
        new BN(inputs.offset),
        new BN(32),
        new BN(inputs.memorySize || 32),
        common,
      )
      break
    }
    case '53': {
      // If no value is provided, we want a value that gives us the minimum cost
      result = memoryExtensionCost(
        new BN(inputs.offset),
        new BN(1),
        new BN(inputs.memorySize || 32),
        common,
      )
      break
    }
    case '54': {
      if (common.gteHardfork('berlin')) {
        if (inputs.cold === '1') {
          result = new BN(
            Number(getCommonParam(common, 'gasPrices', 'coldsload')),
          )
        } else {
          result = new BN(
            Number(getCommonParam(common, 'gasPrices', 'warmstorageread')),
          )
        }
      } else {
        result = new BN(0)
      }
      break
    }
    case '55': {
      result = sstoreCost(common, inputs)

      if (common.gteHardfork('berlin') && inputs.cold === '1') {
        result.iaddn(Number(getCommonParam(common, 'gasPrices', 'coldsload')))
      }
      break
    }
    case '5e': {
      const destOffset = new BN(inputs.destOffset)
      const offset = new BN(inputs.offset)
      const size = new BN(inputs.size)
      const currentMemorySize = new BN(inputs.memorySize)
      const maxOffset = BN.max(offset, destOffset)

      const wordsCopied = toWordSize(size).mul(new BN(3))
      const memoryExpansionCost = memoryExtensionCost(
        new BN(maxOffset),
        new BN(size),
        new BN(currentMemorySize),
        common,
      )
      result = wordsCopied.add(memoryExpansionCost)
      break
    }
    case 'a0':
    case 'a1':
    case 'a2':
    case 'a3':
    case 'a4': {
      const topicsCount = new BN(opcode.opcodeOrAddress, 'hex').isubn(0xa0)
      const expansionCost = memoryExtensionCost(
        new BN(inputs.offset),
        new BN(inputs.size),
        new BN(inputs.memorySize),
        common,
      )
      result = new BN(Number(getCommonParam(common, 'gasPrices', 'logTopic')))
        .imul(topicsCount)
        .iadd(expansionCost)
        .iadd(
          new BN(inputs.size).muln(
            Number(getCommonParam(common, 'gasPrices', 'logData')),
          ),
        )
      break
    }
    case 'd3': {
      result = memoryCostCopy(inputs, 'datacopyGas', common)
      break
    }
    case 'ec': {
      result = eofCreateCost(common, inputs)
      break
    }
    case 'ee': {
      result = memoryExtensionCost(
        new BN(inputs.auxDataOffset),
        new BN(inputs.auxDataSize),
        new BN(inputs.memorySize),
        common,
      )
      break
    }
    case 'f0': {
      result = createCost(common, inputs)
      break
    }
    case 'f1':
    case 'f2':
    case 'f4':
    case 'fa': {
      result = callCost(common, inputs)
      break
    }
    case 'f8':
    case 'f9':
    case 'fb': {
      result = extCallCost(common, inputs)
      break
    }
    case 'f3':
    case 'fd': {
      result = memoryExtensionCost(
        new BN(inputs.offset),
        new BN(inputs.size),
        new BN(inputs.memorySize),
        common,
      )
      break
    }
    case 'f5': {
      result = createCost(common, inputs).iadd(
        toWordSize(new BN(inputs.size)).imuln(
          Number(getCommonParam(common, 'gasPrices', 'keccak256Word')),
        ),
      )
      break
    }
    case 'fe': {
      // If no value is provided, we want a value that gives us the minimum cost, which in this case is everything
      if (inputs.remaining) {
        result = new BN(inputs.remaining)
      } else {
        return 'NaN'
      }
      break
    }
    case 'ff': {
      if (inputs.empty === '1' && inputs.hasNoBalance !== '1') {
        result = new BN(
          Number(getCommonParam(common, 'gasPrices', 'callNewAccount')),
        )
      } else {
        result = new BN(0)
      }

      if (common.gteHardfork('berlin') && inputs.cold === '1') {
        result.iaddn(
          Number(getCommonParam(common, 'gasPrices', 'coldaccountaccess')),
        )
      }
      break
    }
    default:
      result = new BN(0)
  }

  return result.iaddn(opcode.staticFee || 0).toString()
}

function getAdjustedExponentLength(exponent: BN): BN {
  const expLen = new BN(exponent.byteLength())
  let firstExpBytes = Buffer.from(exponent.toArray().slice(0, 32)) // first word of the exponent data
  firstExpBytes = setLengthRight(firstExpBytes, 32) // reading past the data reads virtual zeros
  let firstExpBN = new BN(firstExpBytes)
  let max32expLen = 0
  if (expLen.ltn(32)) {
    max32expLen = 32 - expLen.toNumber()
  }
  firstExpBN = firstExpBN.shrn(8 * Math.max(max32expLen, 0))

  let bitLen = -1
  while (firstExpBN.gtn(0)) {
    bitLen = bitLen + 1
    firstExpBN = firstExpBN.ushrn(1)
  }
  let expLenMinus32OrZero = expLen.subn(32)
  if (expLenMinus32OrZero.ltn(0)) {
    expLenMinus32OrZero = new BN(0)
  }
  const eightTimesExpLenMinus32OrZero = expLenMinus32OrZero.muln(8)
  const adjustedExpLen = eightTimesExpLenMinus32OrZero
  if (bitLen > 0) {
    adjustedExpLen.iaddn(bitLen)
  }
  return adjustedExpLen
}

function multComplexity(x: BN): BN {
  let fac1
  let fac2
  if (x.lten(64)) {
    return x.sqr()
  } else if (x.lten(1024)) {
    // return Math.floor(Math.pow(x, 2) / 4) + 96 * x - 3072
    fac1 = x.sqr().divn(4)
    fac2 = x.muln(96)
    return fac1.add(fac2).subn(3072)
  } else {
    // return Math.floor(Math.pow(x, 2) / 16) + 480 * x - 199680
    fac1 = x.sqr().divn(16)
    fac2 = x.muln(480)
    return fac1.add(fac2).subn(199680)
  }
}

function multComplexityEIP2565(x: BN): BN {
  const words = x.addn(7).divn(8)
  return words.mul(words)
}

/*
 * Calculates dynamic gas fee for precompiled contracts
 *
 * @param opcode The IReferenceItem
 * @param common The Common object
 * @param inputs The Object of user inputs based on the `dynamicFee` inputs
 *                 in the precompiled.json. If empty, we want to return the minimum fee for that code.
 *
 * @returns The String representation of the gas fee.
 *
 * Fee calculation is based on the ethereumjs-vm functions,
 * See: https://github.com/ethereumjs/ethereumjs-monorepo/blob/master/packages/vm/src/evm/precompiles/index.ts
 */
export const calculatePrecompiledDynamicFee = (
  precompiled: IReferenceItem,
  common: Common,
  inputs: any,
) => {
  let result = null
  switch (precompiled.opcodeOrAddress) {
    case '0x01': {
      result = new BN(Number(getCommonParam(common, 'gasPrices', 'ecRecover')))
      break
    }
    case '0x02': {
      result = toWordSize(new BN(inputs.size))
        .imuln(Number(getCommonParam(common, 'gasPrices', 'sha256Word')))
        .iaddn(Number(getCommonParam(common, 'gasPrices', 'sha256')))
      break
    }
    case '0x03': {
      result = toWordSize(new BN(inputs.size))
        .imuln(Number(getCommonParam(common, 'gasPrices', 'ripemd160Word')))
        .iaddn(Number(getCommonParam(common, 'gasPrices', 'ripemd160')))
      break
    }
    case '0x04': {
      result = toWordSize(new BN(inputs.size))
        .imuln(Number(getCommonParam(common, 'gasPrices', 'identityWord')))
        .iaddn(Number(getCommonParam(common, 'gasPrices', 'identity')))
      break
    }
    case '0x05': {
      const Gquaddivisor = Number(
        getCommonParam(common, 'gasPrices', 'modexpGquaddivisor'),
      )
      result = getAdjustedExponentLength(new BN(inputs.exponent))

      let maxLen = new BN(inputs.Bsize)
      const mLen = new BN(inputs.Msize)
      if (maxLen.lt(mLen)) {
        maxLen = mLen
      }

      if (common.gteHardfork('berlin')) {
        result.imul(multComplexityEIP2565(maxLen)).idivn(Gquaddivisor)
        if (result.ltn(200)) {
          result = new BN(200)
        }
      } else {
        result.imul(multComplexity(maxLen)).idivn(Gquaddivisor)
      }
      break
    }
    case '0x06': {
      if (inputs.invalid === '1') {
        result = new BN(inputs.remaining)
      } else {
        result = new BN(Number(getCommonParam(common, 'gasPrices', 'ecAdd')))
      }
      break
    }
    case '0x07': {
      if (inputs.invalid === '1') {
        result = new BN(inputs.remaining)
      } else {
        result = new BN(Number(getCommonParam(common, 'gasPrices', 'ecMul')))
      }
      break
    }
    case '0x08': {
      const inputDataSize = Math.floor(parseInt(inputs.size || 0) / 192)
      result = new BN(
        Number(getCommonParam(common, 'gasPrices', 'ecPairing')) +
          inputDataSize *
            Number(getCommonParam(common, 'gasPrices', 'ecPairingWord')),
      )
      break
    }
    case '0x09': {
      result = new BN(
        Number(getCommonParam(common, 'gasPrices', 'blake2Round')),
      )
      result.imul(new BN(inputs.rounds))
      break
    }
    case '0x0a': {
      result = new BN(
        Number(
          getCommonParam(
            common,
            'gasPrices',
            'kzgPointEvaluationGasPrecompilePrice',
          ),
        ),
      )
      break
    }
    case '0x0b': {
      // BLS12_G1ADD
      result = new BN(375)
      break
    }
    case '0x0c': {
      // BLS12_G1MSM
      const inputLength = parseInt(inputs.size || '0')
      const k = Math.floor(inputLength / 160) // number of point-scalar pairs (128 + 32 bytes)
      let dynamicGas = 0

      if (k > 0) {
        // G1 discount table from EIP-2537
        const g1Discounts = [
          1000, 949, 848, 797, 764, 750, 738, 728, 719, 712, 705, 698, 692, 687,
          682, 677, 673, 669, 665, 661, 658, 654, 651, 648, 645, 642, 640, 637,
          635, 632, 630, 627, 625, 623, 621, 619, 617, 615, 613, 611, 609, 608,
          606, 604, 603, 601, 599, 598, 596, 595, 593, 592, 591, 589, 588, 586,
          585, 584, 582, 581, 580, 579, 577, 576, 575, 574, 573, 572, 570, 569,
          568, 567, 566, 565, 564, 563, 562, 561, 560, 559, 558, 557, 556, 555,
          554, 553, 552, 551, 550, 549, 548, 547, 547, 546, 545, 544, 543, 542,
          541, 540, 540, 539, 538, 537, 536, 536, 535, 534, 533, 532, 532, 531,
          530, 529, 528, 528, 527, 526, 525, 525, 524, 523, 522, 522, 521, 520,
          520, 519,
        ]
        const discount = k <= 128 ? g1Discounts[k - 1] : 519
        dynamicGas = Math.floor((k * 12000 * discount) / 1000)
      }

      result = new BN(dynamicGas)
      break
    }
    case '0x0d': {
      // BLS12_G2ADD
      result = new BN(600)
      break
    }
    case '0x0e': {
      // BLS12_G2MSM
      const inputLength = parseInt(inputs.size || '0')
      const k = Math.floor(inputLength / 288) // number of point-scalar pairs (256 + 32 bytes)
      let dynamicGas = 0

      if (k > 0) {
        // G2 discount table from EIP-2537 (different from G1)
        const g2Discounts = [
          1000, 1000, 923, 884, 855, 832, 812, 796, 782, 770, 759, 749, 740,
          732, 724, 717, 711, 704, 699, 693, 688, 683, 679, 674, 670, 666, 663,
          659, 655, 652, 649, 646, 643, 640, 637, 634, 632, 629, 627, 624, 622,
          620, 618, 615, 613, 611, 609, 607, 606, 604, 602, 600, 598, 597, 595,
          593, 592, 590, 589, 587, 586, 584, 583, 582, 580, 579, 578, 576, 575,
          574, 573, 571, 570, 569, 568, 567, 566, 565, 563, 562, 561, 560, 559,
          558, 557, 556, 555, 554, 553, 552, 552, 551, 550, 549, 548, 547, 546,
          545, 545, 544, 543, 542, 541, 541, 540, 539, 538, 537, 537, 536, 535,
          535, 534, 533, 532, 532, 531, 530, 530, 529, 528, 528, 527, 526, 526,
          525, 524, 524,
        ]
        const discount = k <= 128 ? g2Discounts[k - 1] : 524
        dynamicGas = Math.floor((k * 22500 * discount) / 1000)
      }

      result = new BN(dynamicGas)
      break
    }
    case '0x0f': {
      // BLS12_PAIRING_CHECK
      const inputLength = parseInt(inputs.size || '0')
      const k = Math.floor(inputLength / 384) // number of G1-G2 pairs (128+256 bytes each = 384 total)
      const gas = 32600 * k + 37700
      result = new BN(gas)
      break
    }
    case '0x10': {
      // BLS12_MAP_FP_TO_G1
      result = new BN(5500)
      break
    }
    case '0x11': {
      // BLS12_MAP_FP2_TO_G2
      result = new BN(23800)
      break
    }
    case '0x100': {
      // P256VERIFY - secp256r1 signature verification
      result = new BN(6900)
      break
    }
    default:
      return 'Missing precompiled'
  }

  return result.toString()
}

/*
 * Parses string and replaces all dynamic gas price occurrences
 *
 * @param common The Common object
 * @param contents The String to process
 *
 * @returns The String with gas prices replaced.
 */
export const parseGasPrices = (common: Common, contents: string) => {
  return contents.replace(reGasVariable, (str) => {
    const value = str.match(reFences)
    if (!value?.[1]) {
      return str
    }

    const [namespace, key] = value[1].split('|')
    if (!namespaces.includes(namespace) || !key) {
      return str
    }

    if (namespace === 'gasPrices') {
      const gasPrice = getCommonParam(common, 'gasPrices', key)
      return gasPrice.toString()
    }
    return str
  })
}

/*
 * Finds matching fork name from the list
 *
 * @param forks The Array of known Hardforks
 * @param forkNames The Array of string fork names to match against
 * @param selectedFork The Hardfork selected by the user
 */
export const findMatchingForkName = (
  forks: HardforkTransitionConfig[],
  forkNames: string[],
  selectedFork: HardforkTransitionConfig | undefined,
) => {
  // get all known forks mapped to a block number
  const knownForksWithBlocks = forks.reduce(
    (res: { [forkName: string]: number }, fork: HardforkTransitionConfig) => {
      if (fork.block) {
        res[fork.name] = fork.block
      }
      return res
    },
    {},
  )

  // filter all forks with block number below or equal to the selected,
  // sort in descending order and pick the first found
  let foundFork: string = forkNames
    .filter(
      (forkName) =>
        knownForksWithBlocks[forkName] <= (selectedFork?.block || 0),
    )
    .sort((a, b) => knownForksWithBlocks[b] - knownForksWithBlocks[a])[0]

  // NOTE: Petersburg and Constantinople have the same block number & hash,
  // so when both are present, Constantinople is picked, so this handles it.
  if (
    selectedFork?.name === 'petersburg' &&
    forkNames.includes(selectedFork?.name)
  ) {
    foundFork = selectedFork?.name
  }

  return foundFork
}

const getCommonParam = (
  common: Common,
  topic: string,
  name: string,
): bigint => {
  const specialCases: { [key: string]: string } = {
    quadCoeffDiv: 'quadCoefficientDivGas',
    ecAdd: 'bn254AddGas',
    ecMul: 'bn254MulGas',
    ecPairing: 'bn254PairingGas',
    ecPairingWord: 'bn254PairingWordGas',
    modexpGquaddivisor: 'modexpGquaddivisorGas',
    kzgPointEvaluationGasPrecompilePrice: 'kzgPointEvaluationPrecompileGas',
  }

  if (specialCases[name]) {
    return common.param(specialCases[name])
  }

  if (name.endsWith('Gas')) {
    return common.param(name)
  }

  const formattedName = name
    .replace('Cost', '')
    .replace('Price', '')
    .replace('Gas', '')
    .concat('Gas')

  return common.param(formattedName)
}
