import React, {
  FC,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { EVMError } from '@ethereumjs/evm'
import { Address, createAddressFromString } from '@ethereumjs/util'
import abi from 'ethereumjs-abi'
import { BN, bufferToHex } from 'ethereumjs-util'
import Select, { OnChangeValue } from 'react-select'

import { isEmpty } from 'util/string'

import { EthereumContext } from '../../context/ethereumContext'
import { Button, Icon, Input } from '../ui'

import { Contract, MethodAbi, ValueUnit } from './types'

interface Props {
  show: boolean
  log: (line: string, type?: string) => void
  setShowSimpleMode: () => void
  handleCompile: () => void
  deployByteCode: (
    byteCode: string,
    args: string,
    callValue: BN | undefined,
  ) => Promise<
    | {
        error?: EVMError | undefined
        returnValue: Uint8Array
        createdAddress: Address | undefined
      }
    | undefined
  >
  selectedContract: Contract | undefined
  callValue: string | undefined
  setCallValue: (v: string) => void
  unitValue: string | undefined
  setUnit: (v: string) => void
  getCallValue: () => bigint
  methodByteCode: string | undefined
  handleCopyPermalink: () => void
}

interface MethodAbiOption extends MethodAbi {
  label: string
  value: string
  isDisabled?: boolean
}

const FIXED_ABIS: Array<MethodAbiOption> = [
  {
    inputs: [],
    inputTypes: '',
    name: 'Compile',
    label: 'compile',
    value: 'compile',
    type: 'compiler',
    outputs: [],
    stateMutability: 'payable',
  },
]

const DEFAULT_CONSTRUCTOR: MethodAbiOption = {
  inputs: [],
  inputTypes: '',
  name: 'Constructor',
  label: 'constructor',
  value: 'constructor',
  type: 'constructor',
  outputs: [],
  stateMutability: 'nonpayable',
}

const METHOD_SELECT_STYLES = {
  singleValue: (provider: any) => {
    return { ...provider, textTransform: 'none' }
  },
  option: (provider: any) => {
    return { ...provider, textTransform: 'none' }
  },
}

const unitOptions = Object.keys(ValueUnit).map((value) => ({
  value,
  label: value,
}))

const SolidityAdvanceModeTab: FC<Props> = ({
  log,
  setShowSimpleMode,
  show,
  deployByteCode,
  selectedContract,
  callValue,
  unitValue,
  setCallValue,
  setUnit,
  getCallValue,
  handleCompile,
  methodByteCode,
  handleCopyPermalink,
}) => {
  const {
    transactionData,
    loadInstructions,
    startTransaction,
    deployedContractAddress,
  } = useContext(EthereumContext)
  const container = useRef<any>()

  const [selectedMethod, setSelectedMethod] = useState<
    MethodAbiOption | undefined
  >()

  const [methodArgs, setMethodArgs] = useState<string>('')

  const methodArgsArray = useMemo(() => {
    if (!methodArgs) {
      return []
    }
    return methodArgs.split(',').filter((s) => s.length > 0)
  }, [methodArgs])

  const abiArray = useMemo(() => {
    return (selectedContract?.abi || []).map((method) => ({
      ...method,
      inputTypes: method.inputs?.map((i) => i.type).join(',') || '',
    }))
  }, [selectedContract])

  const getMethodData = useCallback(() => {
    if (!selectedMethod) {
      return ''
    }

    const methodRawSignature =
      selectedMethod.name + '(' + selectedMethod.inputTypes + ')'

    try {
      const byteCodeBuffer =
        methodArgsArray.length > 0 && selectedMethod.inputs?.length > 0
          ? abi.simpleEncode(methodRawSignature, ...methodArgsArray)
          : abi.simpleEncode(methodRawSignature)

      if (methodArgs.length > 0 && selectedMethod.inputs?.length > 0) {
        log(`run method ${methodRawSignature} with ${methodArgsArray}.`)
      } else if (methodArgs.length > 0) {
        log(
          `run method ${methodRawSignature}. Arguments will be ignored.`,
          'warn',
        )
      } else {
        log(`run method ${methodRawSignature}.`)
      }

      return bufferToHex(byteCodeBuffer).substring(2)
    } catch (error) {
      log("Can't encode method, please check your arguments.", 'error')
      return ''
    }
  }, [log, methodArgs.length, methodArgsArray, selectedMethod])

  const handleDeployApi = useCallback(() => {
    if (!selectedContract || !selectedMethod) {
      return
    }
    let args = ''
    if (selectedMethod.inputs && selectedMethod.inputs.length > 0) {
      if (methodArgsArray.length <= 0) {
        log('Please input args', 'error')
        return
      }
      const abiBuffer = abi.rawEncode(
        selectedMethod.inputs.map((mi) => mi.type),
        methodArgsArray,
      )
      args = bufferToHex(abiBuffer).substring(2)
    }
    deployByteCode(selectedContract.code, args, undefined)
  }, [selectedContract, selectedMethod, deployByteCode, methodArgsArray, log])

  const handleRunAbi = useCallback(async () => {
    if (!deployedContractAddress || !methodByteCode) {
      log('Please deploy first', 'error')
      return
    }
    if (!selectedMethod) {
      log('Please select a method', 'error')
      return
    }
    loadInstructions((methodByteCode as string).substring(2))

    const data = getMethodData()
    if (isEmpty(data)) {
      return
    }

    try {
      const transaction = await transactionData(
        data,
        getCallValue(),
        createAddressFromString(deployedContractAddress),
      )
      if (!transaction) {
        return
      }

      const result = await startTransaction(transaction)
      if (
        !result.error &&
        selectedMethod.outputs &&
        selectedMethod.outputs.length > 0
      ) {
        log(
          `run method complete, the response is ${abi.rawDecode(
            selectedMethod.outputs.map((mi) => mi.type),
            Buffer.from(result.returnValue),
          )}`,
        )
      } else if (!result.error) {
        log(`run method complete.`)
      } else {
        log(`run method failed, ${result.error.error}`)
      }
    } catch (error) {
      log(`run method failed, ${error}`)
    }
  }, [
    deployedContractAddress,
    methodByteCode,
    selectedMethod,
    loadInstructions,
    getMethodData,
    transactionData,
    getCallValue,
    log,
    startTransaction,
  ])

  const clickButtonText = useMemo(() => {
    if (selectedMethod?.type === 'compiler') {
      return `Compile`
    }
    if (selectedMethod?.type === 'constructor') {
      return `Deploy`
    } else {
      return `Run Method`
    }
  }, [selectedMethod])

  const handleRunClick = useCallback(() => {
    if (selectedMethod?.type === 'compiler') {
      handleCompile()
    } else if (selectedMethod?.type === 'constructor') {
      handleDeployApi()
    } else {
      handleRunAbi()
    }
  }, [selectedMethod, handleDeployApi, handleRunAbi, handleCompile])

  const methodOptions = useMemo(() => {
    const result = [...FIXED_ABIS]
    if (!abiArray) {
      return result
    }

    const methodAbis = abiArray.map((am) => ({
      ...am,
      label: am.name + '(' + am.inputTypes + ')',
      value: am.name,
    }))
    let constructor = methodAbis.find((abi) => abi.type === 'constructor')
    const isDisabled =
      isEmpty(deployedContractAddress as string) ||
      isEmpty(methodByteCode as string)

    const functionAbis = methodAbis
      .filter((abi) => abi.type !== 'constructor')
      .map((am) => {
        return { ...am, isDisabled: isDisabled }
      })

    if (selectedContract && !constructor) {
      constructor = { ...DEFAULT_CONSTRUCTOR }
    }

    if (constructor) {
      result.push(constructor)
    }

    return [...result, ...functionAbis]
  }, [abiArray, selectedContract, deployedContractAddress, methodByteCode])

  // select constructor when contract had been changed.
  useEffect(() => {
    const constructor = methodOptions.find(
      (abiMethod) => abiMethod.type === 'constructor',
    )
    const compiler = methodOptions.find(
      (abiMethod) => abiMethod.type === 'compiler',
    )

    if (constructor) {
      setSelectedMethod(constructor)
    } else {
      setSelectedMethod(compiler)
    }
  }, [methodOptions, setSelectedMethod])

  // clear args and call value when select method had been changed.
  useEffect(() => {
    if (!selectedMethod) {
      return
    }
    if (selectedMethod.stateMutability === 'nonpayable') {
      setMethodArgs('')
    }
    if (!selectedMethod.inputs || selectedMethod.inputs?.length <= 0) {
      setCallValue('')
    }
  }, [selectedMethod, setCallValue])

  return (
    <div
      className={show ? 'overflow-auto' : 'hidden'}
      style={{ height: 156 }}
      ref={container}
    >
      <div className="flex flex-col md:flex-row md:items-center md:justify-between px-4 py-4 md:py-2 md:border-r border-gray-200 dark:border-black-500">
        <div className="flex flex-col md:flex-row md:gap-x-4 gap-y-2 md:gap-y-0 mb-4 md:mb-0">
          <Select
            options={methodOptions}
            onChange={(v: OnChangeValue<any, any>) => {
              setSelectedMethod(v)
            }}
            styles={METHOD_SELECT_STYLES}
            menuPortalTarget={container.current?.parentElement}
            value={selectedMethod}
            isSearchable={false}
            placeholder="Select Method"
            classNamePrefix="select"
            menuPlacement="auto"
          />
          <Button onClick={handleCopyPermalink} transparent padded={false}>
            <span
              className="inline-block mr-4 select-all"
              data-tooltip-content="Share permalink"
            >
              <Icon name="links-line" className="text-indigo-500 mr-1" />
            </span>
          </Button>
        </div>

        <div>
          <Button transparent padded={false} onClick={setShowSimpleMode}>
            <span className="inline-block mr-4 text-indigo-500">
              Simple Mode
            </span>
          </Button>
          <Button
            size="sm"
            contentClassName="justify-center"
            onClick={handleRunClick}
          >
            {clickButtonText}
          </Button>
        </div>
      </div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between px-4 py-4 md:py-2 md:border-r border-gray-200 dark:border-black-500">
        <div className="flex flex-col md:flex-row md:items-center md:gap-x-4 gap-y-2 md:gap-y-0 mb-4 md:mb-0">
          <div className="font-normal text-sm w-16">Value:</div>
          <Input
            type="number"
            value={callValue}
            onChange={(e) => setCallValue(e.target.value)}
            placeholder={'Value To Send'}
            className="bg-white dark:bg-black-500 w-52"
          />
          <Select
            isDisabled={selectedMethod?.stateMutability !== 'payable'}
            onChange={(option: OnChangeValue<any, any>) =>
              setUnit(option.value)
            }
            options={unitOptions}
            value={{ label: unitValue, value: unitValue }}
            isSearchable={false}
            classNamePrefix="select"
            menuPlacement="auto"
            menuPortalTarget={container?.current?.parentElement}
          />
        </div>
      </div>
      <div
        title="Use ',' to separate arguments"
        className="flex flex-col md:flex-row md:items-center md:gap-x-4 gap-y-2 md:gap-y-0 mb-4 md:mb-0 px-4 py-2 min-w-min"
      >
        <div className={'font-normal text-sm w-16'}>Argument: </div>
        <Input
          placeholder="Use ',' to separate arguments"
          className="bg-white dark:bg-black-500 w-52"
          value={methodArgs}
          onChange={(e) => {
            setMethodArgs(e.target.value)
          }}
        />
      </div>
    </div>
  )
}

export default SolidityAdvanceModeTab
