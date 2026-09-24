import React, {
  useState,
  useRef,
  useEffect,
  useContext,
  useMemo,
  useCallback,
  MutableRefObject,
  RefObject,
  Fragment,
} from 'react'

import { encode, decode } from '@kunigi/string-compression'
import cn from 'classnames'
import copy from 'copy-to-clipboard'
import { bufferToHex } from 'ethereumjs-util'
import { useRouter } from 'next/router'
import Select, { OnChangeValue } from 'react-select'
import SCEditor from 'react-simple-code-editor'

import { EthereumContext } from 'context/ethereumContext'
import { SettingsContext, Setting } from 'context/settingsContext'

import { getAbsoluteURL } from 'util/browser'
import {
  getTargetEvmVersion,
  compilerVersion,
  getBytecodeFromMnemonic,
  getMnemonicFromBytecode,
  getBytecodeLinesFromInstructions,
} from 'util/compiler'
import {
  codeHighlight,
  isEmpty,
  isFullHex,
  isHex,
  objToQueryString,
} from 'util/string'

import examples from 'components/Editor/examples'
import InstructionList from 'components/Editor/Instructions'
import { Button, Input, Icon } from 'components/ui'

import Console from './Console'
import ExecutionState from './ExecutionState'
import ExecutionStatus from './ExecutionStatus'
import Header from './Header'
import SolidityAdvanceModeTab from './SolidityAdvanceModeTab'
import { IConsoleOutput, CodeType, ValueUnit, Contract } from './types'

type Props = {
  readOnly?: boolean
}

type SCEditorRef = {
  _input: HTMLTextAreaElement
} & RefObject<React.FC>

const editorHeight = 350
const consoleHeight = 350
const instructionsListHeight = editorHeight + 52 // RunBar
const instructionsListWithExpandHeight = editorHeight + 156 // Advance Mode bar

const unitOptions = Object.keys(ValueUnit).map((value) => ({
  value,
  label: value,
}))

const Editor = ({ readOnly = false }: Props) => {
  const { settingsLoaded, getSetting, setSetting } = useContext(SettingsContext)
  const router = useRouter()

  const {
    transactionData,
    loadInstructions,
    startExecution,
    startTransaction,
    deployedContractAddress,
    vmError,
    selectedFork,
    opcodes,
    instructions,
    resetExecution,
    onForkChange,
    areForksLoaded,
  } = useContext(EthereumContext)

  const [code, setCode] = useState('')
  const [timeOutId, setTimeOutId] = useState<NodeJS.Timeout | undefined>(
    undefined,
  )
  const [compiling, setIsCompiling] = useState(false)
  const [codeType, setCodeType] = useState<string | undefined>()
  const [codeModified, setCodeModified] = useState(false)
  const [output, setOutput] = useState<IConsoleOutput[]>([
    {
      type: 'info',
      message: `Loading Solidity compiler ${compilerVersion}...`,
    },
  ])
  const solcWorkerRef = useRef<null | Worker>(null)
  const instructionsRef = useRef() as MutableRefObject<HTMLDivElement>
  const editorRef = useRef<SCEditorRef>()
  const [callData, setCallData] = useState('')
  const [callValue, setCallValue] = useState('')
  const [unit, setUnit] = useState(ValueUnit.Wei as string)

  const [contract, setContract] = useState<Contract | undefined>(undefined)
  const [isExpanded, setIsExpanded] = useState(false)
  const [methodByteCode, setMethodByteCode] = useState<string | undefined>()

  const log = useCallback(
    (line: string, type: IConsoleOutput['type'] = 'info') => {
      // See https://blog.logrocket.com/a-guide-to-usestate-in-react-ecb9952e406c/
      setOutput((previous) => {
        const cloned = previous.map((x) => ({ ...x }))
        cloned.push({ type, message: line })
        return cloned
      })
    },
    [setOutput],
  )

  const getCallValue = useCallback(() => {
    const _callValue = BigInt(callValue)
    switch (unit) {
      case ValueUnit.Gwei:
        return _callValue * BigInt('1000000000')
      case ValueUnit.Finney:
        return _callValue * BigInt('1000000000000000')
      case ValueUnit.Ether:
        return _callValue * BigInt('1000000000000000000')
      default:
        return _callValue
    }
  }, [callValue, unit])

  const deployByteCode = useCallback(
    async (bc: string, args = '', callValue?: bigint) => {
      try {
        if (!callValue) {
          callValue = getCallValue()
        }
        const transaction = await transactionData(bc + args, callValue)
        loadInstructions(bc)
        setIsCompiling(false)

        if (!transaction) {
          return
        }

        const result = await startTransaction(transaction)
        if (
          codeType === CodeType.Solidity &&
          !result.error &&
          result.returnValue
        ) {
          setMethodByteCode(bufferToHex(Buffer.from(result.returnValue)))
        }
        return result
      } catch (error) {
        log((error as Error).message, 'error')
        setIsCompiling(false)
        return undefined
      }
    },
    [
      transactionData,
      getCallValue,
      loadInstructions,
      startTransaction,
      codeType,
      log,
    ],
  )

  const handleWorkerMessage = useCallback(
    (event: MessageEvent) => {
      const { warning, error, contracts } = event.data
      resetExecution()
      setContract(undefined)

      if (error) {
        log(error, 'error')
        setIsCompiling(false)
        return
      }

      if (warning) {
        log(warning, 'warn')
      }

      log('Compilation successful')

      if (contracts.length > 1) {
        setIsCompiling(false)
        log(
          'The source should contain only one contract, Please select one to deploy.',
          'error',
        )
        return
      }

      if (codeType === CodeType.Solidity) {
        setContract(contracts[0])
      }

      if (!isExpanded) {
        deployByteCode(contracts[0].code, '', undefined)
      } else {
        setIsCompiling(false)
      }
    },
    [resetExecution, log, codeType, isExpanded, deployByteCode],
  )

  useEffect(() => {
    const query = router.query

    if ('callValue' in query && 'unit' in query) {
      setCallValue(query.callValue as string)
      setUnit(query.unit as string)
    }

    if ('callData' in query) {
      setCallData(query.callData as string)
    }

    if ('codeType' in query && 'code' in query) {
      setCodeType(query.codeType as string)
      setCode(JSON.parse('{"a":' + decode(query.code as string) + '}').a)
    } else {
      const initialCodeType: CodeType =
        getSetting(Setting.EditorCodeType) || CodeType.Yul

      setCodeType(initialCodeType)
      setCode(examples[initialCodeType][0])
    }

    if ('fork' in query) {
      onForkChange(query.fork as string)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsLoaded, router.isReady, areForksLoaded])

  useEffect(() => {
    solcWorkerRef.current = new Worker(
      new URL('../../lib/solcWorker.js', import.meta.url),
    )
    solcWorkerRef.current.onmessage = handleWorkerMessage
    log('Solidity compiler loaded')

    return () => {
      if (solcWorkerRef?.current) {
        solcWorkerRef.current.terminate()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (solcWorkerRef?.current) {
      // @ts-ignore change the worker message, when value and args changed.
      solcWorkerRef.current.onmessage = handleWorkerMessage
    }
  }, [solcWorkerRef, handleWorkerMessage])

  useEffect(() => {
    if (deployedContractAddress) {
      log(`Contract deployed at address: ${deployedContractAddress}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deployedContractAddress])

  useEffect(() => {
    if (vmError) {
      log(vmError, 'error')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vmError])

  const validateBytecode = (bytecode: string) => {
    if (bytecode.length % 2 !== 0) {
      log('There should be at least 2 characters per byte', 'error')
      return
    }
    if (!isHex(bytecode)) {
      log('Only hexadecimal characters are allowed', 'error')
      return
    }
  }

  const stripBytecode = (value: string) => {
    const findHexPrefix = /^0x/
    return value
      .replaceAll(/\/\/.*$/gm, '')
      .replaceAll(/;.*$/gm, '')
      .replaceAll(/#.*$/gm, '')
      .replaceAll(/\s/gm, '')
      .replace(findHexPrefix, '')
  }

  const handleCodeChange = (value: string) => {
    setCode(value)
    setCodeModified(true)

    try {
      if (codeType === CodeType.Bytecode) {
        const cleanBytecode = stripBytecode(value)

        if (timeOutId) {
          clearTimeout(timeOutId)
          setTimeOutId(undefined)
        }
        setTimeOutId(setTimeout(() => validateBytecode(cleanBytecode), 1000))

        loadInstructions(cleanBytecode)
        // startExecution(value, _callValue, _callData)
      }
    } catch (error) {
      log((error as Error).message, 'error')
    }
  }

  const highlightCode = (value: string) => {
    if (!codeType) {
      return value
    }

    if (codeType === CodeType.Bytecode) {
      return codeHighlight(value, codeType).value
    }
    return codeHighlight(value, codeType)
      .value.split('\n')
      .map((line, i) => `<span class='line-number'>${i + 1}</span>${line}`)
      .join('\n')
  }

  const handleCodeTypeChange = (option: OnChangeValue<any, any>) => {
    const { value } = option
    setCodeType(value)
    setSetting(Setting.EditorCodeType, value)
    setContract(undefined)
    setMethodByteCode(undefined)
    setIsExpanded(false)

    if (!codeModified && codeType) {
      setCode(examples[value as CodeType][0])
    } else if (
      value &&
      value === CodeType.Mnemonic &&
      instructions?.length > 0
    ) {
      const code = getBytecodeLinesFromInstructions(instructions)
      setCode(code)
    } else if (
      value &&
      value === CodeType.Bytecode &&
      instructions?.length > 0
    ) {
      const code = getMnemonicFromBytecode(instructions, opcodes)
      setCode(code)
    }

    // NOTE: SCEditor does not expose input ref as public /shrug
    if (editorRef?.current?._input) {
      const input = editorRef?.current?._input

      input.focus()
      input.select()
    }
  }

  const handleRun = useCallback(() => {
    if (!isEmpty(callValue) && !/^[0-9]+$/.test(callValue)) {
      log('Callvalue should be a positive integer', 'error')
      return
    }

    if (!isEmpty(callData) && !isFullHex(callData)) {
      log(
        'Calldata should be a hexadecimal string with 2 digits per byte',
        'error',
      )
      return
    }

    try {
      const _callData = callData.substr(2)
      const _callValue = getCallValue()

      if (codeType === CodeType.Mnemonic) {
        const bytecode = getBytecodeFromMnemonic(code, opcodes)
        loadInstructions(bytecode)
        startExecution(bytecode, _callValue, _callData)
      } else if (codeType === CodeType.Bytecode) {
        const cleanBytecode = stripBytecode(code)
        if (cleanBytecode.length % 2 !== 0) {
          log('There should be at least 2 characters per byte', 'error')
          return
        }
        if (!isHex(cleanBytecode)) {
          log('Only hexadecimal characters are allowed', 'error')
          return
        }
        loadInstructions(cleanBytecode)
        startExecution(cleanBytecode, _callValue, _callData)
      } else {
        setIsCompiling(true)
        log('Starting compilation...')
        if (solcWorkerRef?.current) {
          solcWorkerRef.current.postMessage({
            language: codeType,
            evmVersion: getTargetEvmVersion(selectedFork?.name),
            source: code,
          })
        }
      }
    } catch (error) {
      log((error as Error).message, 'error')
    }
  }, [
    code,
    codeType,
    opcodes,
    selectedFork,
    callData,
    callValue,
    loadInstructions,
    log,
    startExecution,
    getCallValue,
  ])

  const handleCopyPermalink = useCallback(() => {
    const fork = selectedFork?.name
    const params = {
      fork,
      callValue,
      unit,
      callData,
      codeType,
      code: encodeURIComponent(encode(JSON.stringify(code))),
    }

    copy(`${getAbsoluteURL('/playground')}?${objToQueryString(params)}`)
    log('Link to current fork, code, calldata and value copied to clipboard')
  }, [selectedFork, callValue, unit, callData, codeType, code, log])

  const isRunDisabled = useMemo(() => {
    return compiling || isEmpty(code)
  }, [compiling, code])

  const isBytecode = useMemo(() => codeType === CodeType.Bytecode, [codeType])
  const isCallDataActive = useMemo(
    () => codeType === CodeType.Mnemonic || codeType === CodeType.Bytecode,
    [codeType],
  )

  const showAdvanceMode = useMemo(() => {
    return codeType === CodeType.Solidity && isExpanded
  }, [codeType, isExpanded])
  const unitValue = useMemo(
    () => ({
      value: unit,
      label: unit,
    }),
    [unit],
  )

  return (
    <div className="bg-gray-100 dark:bg-black-700 rounded-lg">
      <div className="flex flex-col md:flex-row">
        <div className="w-full md:w-1/2">
          <div className="border-b border-gray-200 dark:border-black-500 flex items-center pl-6 pr-2 h-14 md:border-r">
            <Header
              onCodeTypeChange={handleCodeTypeChange}
              codeType={codeType}
            />
          </div>

          <div>
            <div
              className="relative pane pane-light overflow-auto md:border-r bg-gray-50 dark:bg-black-600 border-gray-200 dark:border-black-500"
              style={{ height: editorHeight }}
            >
              <SCEditor
                // @ts-ignore: SCEditor is not TS-friendly
                ref={editorRef}
                value={code}
                readOnly={readOnly}
                onValueChange={handleCodeChange}
                highlight={highlightCode}
                tabSize={4}
                className={cn('code-editor', {
                  'with-numbers': !isBytecode,
                })}
              />
            </div>

            <Fragment>
              {!showAdvanceMode && (
                <div className="flex flex-col md:flex-row md:items-center md:justify-between px-4 py-4 md:py-2 md:border-r border-gray-200 dark:border-black-500">
                  <div className="flex flex-col md:flex-row md:gap-x-4 gap-y-2 md:gap-y-0 mb-4 md:mb-0">
                    {isCallDataActive && (
                      <Input
                        placeholder="Calldata in HEX"
                        className="bg-white dark:bg-black-500"
                        value={callData}
                        onChange={(e) => setCallData(e.target.value)}
                      />
                    )}

                    <Input
                      type="number"
                      step="1"
                      placeholder="Value to send"
                      className="bg-white dark:bg-black-500"
                      value={callValue}
                      onChange={(e) => setCallValue(e.target.value)}
                    />

                    <Select
                      instanceId="call-value-unit"
                      onChange={(option: OnChangeValue<any, any>) =>
                        setUnit(option.value)
                      }
                      options={unitOptions}
                      value={unitValue}
                      isSearchable={false}
                      classNamePrefix="select"
                      menuPlacement="auto"
                    />

                    <Button
                      onClick={handleCopyPermalink}
                      transparent
                      padded={false}
                    >
                      <span
                        className="inline-block mr-4 select-all"
                        data-tooltip-content="Share permalink"
                      >
                        <Icon
                          name="links-line"
                          className="text-indigo-500 mr-1"
                        />
                      </span>
                    </Button>
                  </div>

                  <div>
                    <Fragment>
                      {codeType === CodeType.Solidity && (
                        <Button
                          onClick={() => setIsExpanded(!isExpanded)}
                          tooltip={'Please run your contract first.'}
                          transparent
                          padded={false}
                        >
                          <span className="inline-block mr-4 text-indigo-500">
                            Advance Mode
                          </span>
                        </Button>
                      )}
                    </Fragment>

                    <Button
                      onClick={handleRun}
                      disabled={isRunDisabled}
                      size="sm"
                      contentClassName="justify-center"
                    >
                      Run
                    </Button>
                  </div>
                </div>
              )}
            </Fragment>

            <SolidityAdvanceModeTab
              log={log}
              selectedContract={contract}
              handleCompile={handleRun}
              setShowSimpleMode={() => setIsExpanded(false)}
              show={showAdvanceMode}
              deployByteCode={deployByteCode}
              callValue={callValue}
              setCallValue={setCallValue}
              setUnit={setUnit}
              unitValue={unit}
              getCallValue={getCallValue}
              methodByteCode={methodByteCode}
              handleCopyPermalink={handleCopyPermalink}
            />
          </div>
        </div>

        <div className="w-full md:w-1/2">
          <div className="border-t md:border-t-0 border-b border-gray-200 dark:border-black-500 flex items-center pl-4 pr-6 h-14">
            <ExecutionStatus />
          </div>

          <div
            className="pane pane-light overflow-auto bg-gray-50 dark:bg-black-600 h-full"
            ref={instructionsRef}
            style={{
              height: isExpanded
                ? instructionsListWithExpandHeight
                : instructionsListHeight,
            }}
          >
            <InstructionList containerRef={instructionsRef} />
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row-reverse">
        <div className="w-full md:w-1/2">
          <div
            className="pane pane-dark overflow-auto border-t border-black-900/25 bg-gray-800 dark:bg-black-700 text-white px-4 py-3"
            style={{ height: consoleHeight }}
          >
            <ExecutionState />
          </div>
        </div>
        <div className="w-full md:w-1/2">
          <div
            className="pane pane-dark overflow-auto bg-gray-800 dark:bg-black-700 text-white border-t border-black-900/25 md:border-r"
            style={{ height: consoleHeight }}
          >
            <Console output={output} />
          </div>
        </div>
      </div>

      <div className="rounded-b-lg py-2 px-4 border-t bg-gray-800 dark:bg-black-700 border-black-900/25 text-gray-400 dark:text-gray-600 text-xs">
        Solidity Compiler {compilerVersion}
      </div>
    </div>
  )
}

export default Editor
