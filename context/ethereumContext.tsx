import { Buffer } from 'buffer'

import React, { createContext, useEffect, useState, useRef } from 'react'

import { Block } from '@ethereumjs/block'
import { Common, Chain, HardforkTransitionConfig } from '@ethereumjs/common'
import {
  EVM,
  EvmError,
  getActivePrecompiles,
  InterpreterStep,
} from '@ethereumjs/evm'
import { RunState } from '@ethereumjs/evm/dist/cjs/interpreter'
import { Opcode, OpcodeList } from '@ethereumjs/evm/src/opcodes'
import { TypedTransaction, TxData, TransactionFactory } from '@ethereumjs/tx'
import { Address, Account, bytesToHex } from '@ethereumjs/util'
import { RunTxOpts, VM } from '@ethereumjs/vm'
import { Common as EOFCommon } from '@ethjs-eof/common'
// @ts-ignore it confused with pre-EOF version
import { createEVM, EVM as EOFEVM } from '@ethjs-eof/evm'
// @ts-ignore it confused with pre-EOF version
import { createTxFromTxData as createTxFromTxDataEOF } from '@ethjs-eof/tx'
// @ts-ignore it confused with pre-EOF version
import { VM as EOFVM, runTx as runTxEOF } from '@ethjs-eof/vm'
import OpcodesMeta from 'opcodes.json'
import PrecompiledMeta from 'precompiled.json'
import {
  IReferenceItem,
  IReferenceItemMetaList,
  IInstruction,
  IStorage,
  IExecutionState,
  IChain,
  ITransientStorage,
} from 'types'

import {
  CURRENT_FORK,
  EOF_ENABLED_FORK,
  EOF_FORK_NAME,
  FORKS_WITH_TIMESTAMPS,
} from 'util/constants'
import {
  calculateOpcodeDynamicFee,
  calculatePrecompiledDynamicFee,
} from 'util/gas'
import { toHex, fromBuffer } from 'util/string'

let vm: VM | EOFVM
let common: Common | EOFCommon
let currentOpcodes: OpcodeList | undefined

const storageMemory = new Map()
const transientStorageMemory = new Map<string, Map<string, string>>()
const privateKey = Buffer.from(
  'e331b6d69882b4cb4ea581d88e0b604039a3de5967688d3dcffdd2270c0fd109',
  'hex',
)
const accountBalance = 18 // 1eth
const accountAddress = Address.fromPrivateKey(privateKey)
const contractAddress = Address.generate(accountAddress, 1n)
const gasLimit = 0xffffffffffffn
const postMergeHardforkNames: Array<string> = [
  'merge',
  'shanghai',
  'cancun',
  'prague',
]
export const prevrandaoDocName = '44_merge'
const EOF_EIPS = [
  663, 3540, 3670, 4200, 4750, 5450, 6206, 7069, 7480, 7620, 7692, 7698,
]

type ContextProps = {
  common: Common | EOFCommon | undefined
  chains: IChain[]
  forks: HardforkTransitionConfig[]
  selectedChain: IChain | undefined
  selectedFork: HardforkTransitionConfig | undefined
  opcodes: IReferenceItem[]
  precompiled: IReferenceItem[]
  instructions: IInstruction[]
  deployedContractAddress: string | undefined
  isExecuting: boolean
  executionState: IExecutionState
  vmError: string | undefined
  areForksLoaded: boolean

  onChainChange: (chainId: number) => void
  onForkChange: (forkName: string) => void
  transactionData: (
    byteCode: string,
    value: bigint,
    to?: Address,
  ) => Promise<TypedTransaction | TxData | undefined>
  loadInstructions: (byteCode: string) => void
  startExecution: (byteCode: string, value: bigint, data: string) => void
  startTransaction: (tx: TypedTransaction | TxData) => Promise<{
    error?: EvmError
    returnValue: Uint8Array
    createdAddress: Address | undefined
  }>
  continueExecution: () => void
  addBreakpoint: (instructionId: number) => void
  removeBreakpoint: (instructionId: number) => void
  nextExecution: () => void
  resetExecution: () => void
}

const initialExecutionState: IExecutionState = {
  stack: [],
  storage: [],
  transientStorage: [],
  memory: undefined,
  programCounter: undefined,
  totalGas: undefined,
  currentGas: undefined,
  returnValue: undefined,
}

export const EthereumContext = createContext<ContextProps>({
  common: undefined,
  chains: [],
  forks: [],
  selectedChain: undefined,
  selectedFork: undefined,
  opcodes: [],
  precompiled: [],
  instructions: [],
  deployedContractAddress: undefined,
  isExecuting: false,
  executionState: initialExecutionState,
  vmError: undefined,
  areForksLoaded: false,

  onChainChange: () => undefined,
  onForkChange: () => undefined,
  transactionData: () =>
    new Promise((resolve) => {
      resolve(undefined)
    }),
  loadInstructions: () => undefined,
  startExecution: () => undefined,
  startTransaction: () => Promise.reject(),
  continueExecution: () => undefined,
  addBreakpoint: () => undefined,
  removeBreakpoint: () => undefined,
  nextExecution: () => undefined,
  resetExecution: () => undefined,
})

export const CheckIfAfterMergeHardfork = (forkName?: string) => {
  if (forkName == null) {
    return false
  }
  return postMergeHardforkNames.indexOf(forkName) > -1
}

export const EthereumProvider: React.FC<{}> = ({ children }) => {
  const [chains, setChains] = useState<IChain[]>([])
  const [forks, setForks] = useState<HardforkTransitionConfig[]>([])
  const [selectedChain, setSelectedChain] = useState<IChain>()
  const [selectedFork, setSelectedFork] = useState<HardforkTransitionConfig>()
  const [opcodes, setOpcodes] = useState<IReferenceItem[]>([])
  const [precompiled, setPrecompiled] = useState<IReferenceItem[]>([])
  const [instructions, setInstructions] = useState<IInstruction[]>([])
  const [isExecuting, setIsExecuting] = useState(false)
  const [executionState, setExecutionState] = useState<IExecutionState>(
    initialExecutionState,
  )
  const [deployedContractAddress, setDeployedContractAddress] = useState<
    string | undefined
  >()
  const [vmError, setVmError] = useState<string | undefined>()
  const [areForksLoaded, setAreForksLoaded] = useState<boolean>(false)

  const nextStepFunction = useRef<any>()
  const isExecutionPaused = useRef(true)
  const breakpointIds = useRef<number[]>([])

  useEffect(() => {
    void (async () => {
      await initVmInstance()
      setAreForksLoaded(true)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Initializes the EVM instance.
   */
  const initVmInstance = async (fork?: string) => {
    const forkName = fork == EOF_FORK_NAME ? EOF_ENABLED_FORK : fork
    common = new EOFCommon({
      chain: Chain.Mainnet,
      hardfork: forkName || CURRENT_FORK,
      eips: forkName === EOF_ENABLED_FORK ? EOF_EIPS : [],
    })

    vm = await EOFVM.create({ common })

    const evm = await createEVM({
      common,
    })

    currentOpcodes = evm.getActiveOpcodes()

    if (forks.length === 0) {
      _loadChainAndForks(common)
    }

    _loadOpcodes()
    _loadPrecompiled()
    _setupStateManager()
    _setupAccount()

    vm.evm.events?.on(
      'step',
      (e: InterpreterStep, contFunc: ((result?: any) => void) | undefined) => {
        _stepInto(e, contFunc)
      },
    )
  }

  /**
   * Callback on changing the EVM chain.
   * @param chainId The chain ID.
   */
  const onChainChange = (chainId: number) => {
    const chain = chains.find((chain) => chain.id === chainId)
    if (chain) {
      void (async () => {
        // NOTE: we first setup the vm to make sure it has the correct version before refreshing the fork details
        await initVmInstance(selectedFork?.name)
        setSelectedChain(chain)
        resetExecution()
      })()
    }
  }

  /**
   * Callback on changing the EVM hard fork.
   * @param forkName The hard fork name.
   */
  const onForkChange = (forkName: string) => {
    const fork = forks.find((f) => f.name === forkName)
    if (fork) {
      ;(async () => {
        // NOTE: we first setup the vm to make sure it has the correct version before refreshing the fork details
        await initVmInstance(forkName)
        setSelectedFork(fork)
        resetExecution()
      })()
    }
  }

  /*
   * Deploys the contract code to the EVM.
   * @param byteCode The contract bytecode.
   * @returns The deployed contract transaction data.
   */
  const transactionData = async (data: string, value: bigint, to?: Address) => {
    const account = await vm.stateManager.getAccount(accountAddress)

    const txData = {
      to,
      value: value,
      gasLimit,
      gasPrice: 10,
      data: '0x' + data,
      nonce: account?.nonce,
    }

    if (vm.evm instanceof EOFEVM) {
      return createTxFromTxDataEOF(txData).sign(privateKey)
    } else {
      return TransactionFactory.fromTxData(txData).sign(privateKey)
    }
  }

  /**
   * Loads contract instructions to the context state.
   * @param byteCode The contract bytecode.
   */
  const loadInstructions = (byteCode: string) => {
    const opcodes = currentOpcodes
    const instructions: IInstruction[] = []

    if (!opcodes) {
      return
    }

    for (let i = 0; i < byteCode.length; i += 2) {
      const instruction = parseInt(byteCode.slice(i, i + 2), 16)
      // The id to reference back with breakpoints
      const id = i / 2
      const opcode = opcodes.get(instruction)

      if (!opcode) {
        instructions.push({
          id,
          name: 'INVALID',
        })
      } else if (opcode.name === 'PUSH') {
        const count = parseInt(opcode.fullName.slice(4), 10) * 2
        instructions.push({
          id,
          name: opcode.fullName,
          value: byteCode.slice(i + 2, i + 2 + count),
        })
        i += count
      } else {
        instructions.push({
          id,
          name: opcode.fullName,
        })
      }
    }

    setInstructions(instructions)
  }

  /**
   * Starts EVM execution of the instructions.
   * @param byteCode The contract bytecode.
   * @param value The callvalue.
   * @param data The calldata.
   */
  const startExecution = async (
    byteCode: string,
    value: bigint,
    data: string,
  ) => {
    vm.stateManager.putContractCode(
      contractAddress,
      Buffer.from(byteCode, 'hex'),
    )
    transientStorageMemory.clear()
    startTransaction(await transactionData(data, value, contractAddress))
  }

  /**
   * Starts EVM execution of the instructions.
   * @param tx The transaction data to run from.
   */
  const startTransaction = (tx: TypedTransaction | TxData | undefined) => {
    // always start paused
    isExecutionPaused.current = true
    setIsExecuting(true)
    setVmError(undefined)

    // starting execution via deployed contract's transaction
    return vm
      .runTx({ tx: tx as TypedTransaction, block: _getBlock() })
      .then(({ execResult, totalGasSpent, createdAddress }) => {
        _loadRunState({
          totalGasSpent,
          runState: execResult.runState,
          newContractAddress: createdAddress,
          returnValue: execResult.returnValue,
          exceptionError: execResult.exceptionError,
        })
        return {
          error: execResult.exceptionError,
          returnValue: execResult.returnValue,
          createdAddress: createdAddress,
        }
      })
      .finally(() => setIsExecuting(false))
  }

  /**
   * Resets EVM execution state to the initial state.
   */
  const resetExecution = () => {
    setInstructions([])
    setExecutionState(initialExecutionState)
    setDeployedContractAddress(undefined)
    setVmError(undefined)

    isExecutionPaused.current = true
    breakpointIds.current = []
    nextStepFunction.current = undefined

    setIsExecuting(false)
  }

  /**
   * Adds a breakpoint to pause the EVM execution at a given instruction.
   * @param instructionId The instruction id provided by in the `instructions[]`.
   */
  const addBreakpoint = (instructionId: number) => {
    breakpointIds.current.push(instructionId)

    setInstructions(
      instructions.map((el) => {
        if (el.id === instructionId) {
          return {
            ...el,
            hasBreakpoint: true,
          }
        }
        return el
      }),
    )
  }

  /**
   * Removes previously added breakpoint.
   * @param instructionId The instruction id provided by in the `instructions[]`.
   * @see `addBreakpoint`
   */
  const removeBreakpoint = (instructionId: number) => {
    breakpointIds.current = breakpointIds.current.filter(
      (id) => id !== instructionId,
    )

    setInstructions(
      instructions.map((el) => {
        if (el.id === instructionId) {
          return {
            ...el,
            hasBreakpoint: false,
          }
        }
        return el
      }),
    )
  }

  /**
   * Resumes the EVM execution.
   */
  const continueExecution = () => {
    isExecutionPaused.current = false
    nextExecution()
  }

  /**
   * Runs the next EVM execution.
   */
  const nextExecution = () => {
    // FIXME: Instead of allowing to get into exception,
    // prevent from executing when all instructions have been completed.
    try {
      if (nextStepFunction.current) {
        nextStepFunction.current()
      }
    } catch (_e) {
      const error = _e as Error

      if (error.message.match(/Callback was already called/i)) {
        return
      }

      throw error
    }
  }

  const _loadChainAndForks = (common: Common | EOFCommon) => {
    const chainIds: number[] = []
    const chainNames: string[] = []
    const forks: HardforkTransitionConfig[] = []

    // iterate over TS enum to pick key,val
    for (const chain in Chain) {
      if (isNaN(Number(chain))) {
        chainNames.push(chain)
      } else {
        chainIds.push(parseInt(chain))
      }
    }

    setChains(
      chainIds.map((chainId, index) => {
        return { id: chainId, name: chainNames[index] }
      }),
    )
    setSelectedChain({ id: chainIds[0], name: chainNames[0] })

    let currentForkFound = false
    common.hardforks().forEach((rawFork) => {
      // FIXME: After shanghai, timestamps are used, so support them in addition
      // to blocks, and in the meantime use timestamp as the block num.
      const block = rawFork.block
        ? rawFork.block
        : FORKS_WITH_TIMESTAMPS[rawFork.name]
      const fork = {
        ...rawFork,
        block,
      }

      if (typeof fork.block === 'number') {
        forks.push(fork)

        // set initially selected fork
        if (!currentForkFound && fork.name === CURRENT_FORK) {
          setSelectedFork(fork)
          currentForkFound = true
        }
      }
    })

    forks.push({
      name: EOF_FORK_NAME,
      block: 1710338135,
    })

    setForks(forks)
  }

  const extractDocFromOpcode = (op: Opcode) => {
    const meta = OpcodesMeta as IReferenceItemMetaList
    // TODO: need to implement proper selection of doc according to selected fork (maybe similar to dynamic gas fee)
    // Hack for "difficulty" -> "prevrandao" replacement for "merge" HF
    if (
      CheckIfAfterMergeHardfork(selectedFork?.name) &&
      toHex(op.code) == '44'
    ) {
      return {
        ...meta[prevrandaoDocName],
        ...{
          opcodeOrAddress: toHex(op.code),
          staticFee: op.fee,
          minimumFee: 0,
          name: 'PREVRANDAO',
        },
      }
    }
    return {
      ...meta[toHex(op.code)],
      ...{
        opcodeOrAddress: toHex(op.code),
        staticFee: op.fee,
        minimumFee: 0,
        name: op.fullName,
      },
    }
  }

  const _loadOpcodes = () => {
    const opcodes: IReferenceItem[] = []

    currentOpcodes?.forEach((op: Opcode) => {
      const opcode = extractDocFromOpcode(op)

      opcode.minimumFee = parseInt(
        calculateOpcodeDynamicFee(opcode, common, {}),
      )
      opcodes.push(opcode)
    })

    setOpcodes(opcodes)
  }

  const _loadPrecompiled = () => {
    const precompiled: IReferenceItem[] = []

    const addressIterator = getActivePrecompiles(common).keys()
    console.log(getActivePrecompiles(common))
    let result = addressIterator.next()
    while (!result.done) {
      const meta = PrecompiledMeta as IReferenceItemMetaList
      const addressString = '0x' + result.value.slice(-2)
      const contract = {
        ...meta[addressString],
        ...{
          opcodeOrAddress: addressString,
          minimumFee: 0,
          name: meta[addressString].name,
        },
      }

      contract.minimumFee = parseInt(
        calculatePrecompiledDynamicFee(contract, common, {}),
      )
      precompiled.push(contract)
      result = addressIterator.next()
    }

    // TODO: Remove this conditional logic when upgrading to @ethereumjs/evm@10.0.0
    // The newer version includes these precompiles natively, but upgrading requires
    // a larger refactor due to EOF package compatibility issues. See GitHub issue.
    // Add BLS12-381 precompiles for Prague fork
    if (selectedFork?.name === 'prague') {
      const bls12381Addresses = [
        '0x0b',
        '0x0c',
        '0x0d',
        '0x0e',
        '0x0f',
        '0x10',
        '0x11',
      ]

      bls12381Addresses.forEach((addressString) => {
        const meta = PrecompiledMeta as IReferenceItemMetaList
        if (meta[addressString]) {
          const contract = {
            ...meta[addressString],
            ...{
              opcodeOrAddress: addressString,
              minimumFee: 0,
              name: meta[addressString].name,
            },
          }

          contract.minimumFee = parseInt(
            calculatePrecompiledDynamicFee(contract, common, {}),
          )
          precompiled.push(contract)
        }
      })
    }

    setPrecompiled(precompiled)
  }

  function traceStorageMethodCalls(obj: any) {
    const handler = {
      get(target: any, propKey: any) {
        const origMethod = target[propKey]
        return (...args: any[]) => {
          const result = origMethod.apply(target, args)
          if (propKey == 'clearContractStorage' || propKey == 'clearStorage') {
            _clearContractStorage(args[0])
          }
          if (propKey == 'putContractStorage' || propKey == 'putStorage') {
            _putContractStorage(args[0], args[1], args[2])
          }
          return result
        }
      },
    }
    return new Proxy(obj, handler)
  }

  function traceTransientStorageMethodCalls(obj: any) {
    const handler = {
      get(target: any, propKey: any) {
        const origMethod = target[propKey]
        return (...args: any[]) => {
          const result = origMethod.apply(target, args)
          if (propKey == 'put') {
            const [rawAddress, rawKey, rawValue] = args as [
              Address,
              Uint8Array,
              Uint8Array,
            ]
            const address = rawAddress.toString()
            const key = bytesToHex(rawKey)
            const value = bytesToHex(rawValue)
            let addressTransientStorage = transientStorageMemory.get(address)
            // Add the address to the transient storage
            if (addressTransientStorage === undefined) {
              transientStorageMemory.set(address, new Map<string, string>())
              addressTransientStorage = transientStorageMemory.get(
                address,
              ) as Map<string, string>
            }

            addressTransientStorage.set(key, value)
          }
          return result
        }
      },
    }
    return new Proxy(obj, handler)
  }

  // In this function we create a proxy EEI object that will intercept
  // putContractStorage and clearContractStorage and route them to our
  // implementations at _putContractStorage and _clearContractStorage
  // respectively AFTER applying the original methods.
  // This is necessary in order to handle storage operations easily.
  const _setupStateManager = () => {
    const evm = vm.evm

    // Storage handler
    const proxyStateManager = traceStorageMethodCalls(evm.stateManager)

    if (evm instanceof EVM) {
      evm.stateManager.putContractStorage = proxyStateManager.putContractStorage
      evm.stateManager.clearContractStorage =
        proxyStateManager.clearContractStorage

      // Transient storage handler
      const transientStorageMethodProxy = traceTransientStorageMethodCalls(
        evm.transientStorage,
      )
      evm.transientStorage.put = transientStorageMethodProxy.put
    } else if (evm instanceof EOFEVM) {
      // @ts-ignore confused package
      evm.stateManager.putStorage = proxyStateManager.putStorage
      // @ts-ignore confused package
      evm.stateManager.clearStorage = proxyStateManager.clearStorage

      // Transient storage handler
      const transientStorageMethodProxy = traceTransientStorageMethodCalls(
        evm.transientStorage,
      )
      evm.transientStorage.put = transientStorageMethodProxy.put

      // NOTE: they renamed a few functions with the EOF changes
      // @ts-ignore it's confused because of the pre eof version
      evm.stateManager.putContractCode = evm.stateManager.putCode
      vm.runTx = (opts: RunTxOpts) => runTxEOF(vm, opts)
    }

    storageMemory.clear()
    transientStorageMemory.clear()
  }

  const _setupAccount = () => {
    // Add a fake account
    const accountData = {
      nonce: 2,
      balance: BigInt(10 ** accountBalance),
    }
    const contractData = {
      nonce: 0,
      balance: 0,
    }
    vm.stateManager.putAccount(
      accountAddress,
      Account.fromAccountData(accountData),
    )
    vm.stateManager.putAccount(
      contractAddress,
      Account.fromAccountData(contractData),
    )
  }

  const _loadRunState = ({
    totalGasSpent,
    runState,
    newContractAddress,
    returnValue,
    exceptionError,
  }: {
    totalGasSpent: bigint
    runState: RunState | undefined
    newContractAddress?: Address
    returnValue?: Uint8Array
    exceptionError?: EvmError
  }) => {
    if (runState) {
      const { programCounter: pc, stack, memory, memoryWordCount } = runState
      _setExecutionState({
        pc,
        totalGasSpent,
        stack: stack.getStack(),
        memory: memory._store,
        memoryWordCount,
        returnValue,
      })
    }

    if (exceptionError) {
      setVmError(exceptionError.error)
    } else if (newContractAddress) {
      setDeployedContractAddress(newContractAddress.toString())
    }
  }

  const _getBlock = () => {
    // base fee is only applicable since london hardfork, ie block 12965000
    if (selectedFork && (selectedFork.block || 0) < 12965000) {
      return undefined
    }

    return Block.fromBlockData(
      {
        header: {
          baseFeePerGas: 10,
          gasLimit,
          gasUsed: 60,
        },
      },
      { common },
    )
  }

  const _stepInto = (
    {
      depth,
      pc,
      gasLeft,
      opcode,
      stack,
      memory,
      memoryWordCount,
    }: InterpreterStep,
    continueFunc: ((result?: any) => void) | undefined,
  ) => {
    // We skip over the calls
    if (depth !== 0 && continueFunc) {
      continueFunc()
      return
    }

    const totalGasSpent = gasLimit - gasLeft

    _setExecutionState({
      pc,
      totalGasSpent,
      stack,
      memory,
      memoryWordCount,
      currentGas: opcode.fee,
    })

    nextStepFunction.current = continueFunc

    if (isExecutionPaused.current === false) {
      if (breakpointIds.current.includes(pc)) {
        isExecutionPaused.current = true
      } else {
        nextExecution()
      }
    }
  }

  const _setExecutionState = ({
    pc,
    totalGasSpent,
    stack,
    memory,
    memoryWordCount,
    currentGas,
    returnValue,
  }: {
    pc: number
    totalGasSpent: bigint
    stack: bigint[]
    memory: Uint8Array
    memoryWordCount: bigint
    currentGas?: bigint | number
    returnValue?: Uint8Array
  }) => {
    const storage: IStorage[] = []

    storageMemory.forEach((sm, address) => {
      sm.forEach((value: string, slot: string) => {
        storage.push({ address, slot, value })
      })
    })

    const transientStorage: ITransientStorage[] = []
    for (const [address, entries] of transientStorageMemory.entries()) {
      for (const [key, value] of entries.entries()) {
        transientStorage.push({
          address,
          key,
          value,
        })
      }
    }

    setExecutionState({
      programCounter: pc,
      stack: stack.map((value) => value.toString(16)).reverse(),
      totalGas: totalGasSpent.toString(),
      memory: fromBuffer(Buffer.from(memory)).substring(
        0,
        Number(memoryWordCount) * 64,
      ),
      transientStorage,
      storage,
      currentGas: currentGas ? currentGas.toString() : undefined,
      returnValue: returnValue
        ? Buffer.from(returnValue).toString('hex')
        : undefined,
    })
  }

  // Update storage slot `key` for contract `address`
  // to `value` in our storage memory Map
  const _putContractStorage = (
    address: Address,
    key: Buffer,
    value: Buffer,
  ) => {
    const addressText = address.toString()
    const keyText = fromBuffer(key)
    const valueText = fromBuffer(value)

    if (value.length == 0) {
      if (storageMemory.has(addressText)) {
        const addressStorage = storageMemory.get(addressText)
        addressStorage.delete(keyText)

        if (addressStorage.size == 0) {
          storageMemory.delete(addressText)
        }
      }
    } else {
      if (storageMemory.has(addressText)) {
        storageMemory.get(addressText).set(keyText, valueText)
      } else {
        storageMemory.set(addressText, new Map([[keyText, valueText]]))
      }
    }
  }

  // Clear all storage slots of contract at `address` in our storage memory Map
  const _clearContractStorage = (address: Address) => {
    const addressText = address.toString()
    storageMemory.delete(addressText)
  }

  return (
    <EthereumContext.Provider
      value={{
        common,
        chains,
        forks,
        selectedChain,
        selectedFork,
        opcodes,
        precompiled,
        instructions,
        deployedContractAddress,
        isExecuting,
        executionState,
        vmError,
        areForksLoaded,

        onChainChange,
        onForkChange,
        transactionData,
        loadInstructions,
        startExecution,
        startTransaction,
        continueExecution,
        addBreakpoint,
        removeBreakpoint,
        nextExecution,
        resetExecution,
      }}
    >
      {children}
    </EthereumContext.Provider>
  )
}
