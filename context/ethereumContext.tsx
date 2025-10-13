import { Buffer } from 'buffer'

import React, { createContext, useEffect, useState, useRef } from 'react'

import { createBlock } from '@ethereumjs/block'
import {
  Common,
  HardforkTransitionConfig,
  Mainnet,
} from '@ethereumjs/common'
import {
  EVM,
  EVMError,
  getActivePrecompiles,
  InterpreterStep,
} from '@ethereumjs/evm'
import { TypedTransaction, TxData, createTx } from '@ethereumjs/tx'
import {
  Address,
  hexToBytes,
  createAddressFromString,
  createAccount,
} from '@ethereumjs/util'
import { VM, createVM, runTx } from '@ethereumjs/vm'
import { Common as EOFCommon } from '@ethjs-eof/common'
// @ts-ignore it confused with pre-EOF version
import { createEVM, EVM as EOFEVM } from '@ethjs-eof/evm'
// @ts-ignore it confused with pre-EOF version
import { createTxFromTxData as createTxFromTxDataEOF } from '@ethjs-eof/tx'
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

let vm: VM
let common: Common
let currentOpcodes: any | undefined

const storageMemory = new Map()
const transientStorageMemory = new Map<string, Map<string, string>>()
const privateKey = Buffer.from(
  'e331b6d69882b4cb4ea581d88e0b604039a3de5967688d3dcffdd2270c0fd109',
  'hex',
)
const accountBalance = 18 // 1eth
const accountAddress = createAddressFromString(
  '0xE36Ea790bc9d7AB70C55260C66D52b1eca985f84',
)
const contractAddress = createAddressFromString(
  '0x0000000000000000000000000000000000000000',
)
const gasLimit = 0xffffffffffffn
const postMergeHardforkNames: Array<string> = ['merge', 'shanghai', 'cancun']
export const prevrandaoDocName = '44_merge'
const EOF_EIPS = [
  663, 3540, 3670, 4200, 4750, 5450, 6206, 7069, 7480, 7620, 7692, 7698,
]

type ContextProps = {
  common: Common | undefined
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
    error?: EVMError
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
      chain: Mainnet,
      hardfork: forkName || CURRENT_FORK,
      eips: forkName === EOF_ENABLED_FORK ? EOF_EIPS : [],
    })

    vm = (await createVM({ common })) as any

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
      data: hexToBytes(('0x' + data) as `0x${string}`),
      nonce: account?.nonce,
    }

    if (vm.evm instanceof EOFEVM) {
      return createTxFromTxDataEOF(txData).sign(privateKey)
    } else {
      return createTx(txData).sign(privateKey)
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
    vm.stateManager.putCode(contractAddress, Buffer.from(byteCode, 'hex'))
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
    return runTx(vm, { tx: tx as TypedTransaction, block: _getBlock() })
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

  const _loadChainAndForks = (common: Common) => {
    const forks: HardforkTransitionConfig[] = []

    const availableChains = [
      { id: 1, name: 'Mainnet' },
      { id: 11155111, name: 'Sepolia' },
      { id: 17000, name: 'Holesky' },
    ]
    const chains = availableChains.map((chainConfig) => ({
      id: chainConfig.id,
      name: chainConfig.name,
    }))

    setChains(chains)
    setSelectedChain(chains[0])

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

  const extractDocFromOpcode = (op: any) => {
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

    currentOpcodes?.forEach((op: any) => {
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
    let result = addressIterator.next()
    while (!result.done) {
      const meta = PrecompiledMeta as IReferenceItemMetaList
      const addressString = '0x' + result.value.slice(-2)

      if (!meta[addressString]) {
        result = addressIterator.next()
        continue
      }

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

    setPrecompiled(precompiled)
  }

  function traceStorageMethodCalls(obj: any) {
    const handler = {
      get(target: any, propKey: any) {
        const origMethod = target[propKey]
        return (...args: any[]) => {
          const result = origMethod.apply(target, args)
          if (propKey == 'clearStorage') {
            _clearContractStorage(args[0])
          }
          if (propKey == 'putStorage') {
            _putContractStorage(args[0], args[1], args[2])
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
      // In v10, StateManagerInterface uses putStorage/clearStorage instead of putContractStorage/clearContractStorage
      // @ts-ignore - attaching our proxy methods
      evm.stateManager.putStorage = proxyStateManager.putStorage
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
    vm.stateManager.putAccount(accountAddress, createAccount(accountData))
    vm.stateManager.putAccount(contractAddress, createAccount(contractData))
  }

  const _loadRunState = ({
    totalGasSpent,
    runState,
    newContractAddress,
    returnValue,
    exceptionError,
  }: {
    totalGasSpent: bigint
    runState: any
    newContractAddress?: Address
    returnValue?: Uint8Array
    exceptionError?: EVMError
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

    return createBlock(
      {
        header: {
          baseFeePerGas: 10,
          gasLimit,
          gasUsed: 60,
        } as any,
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
