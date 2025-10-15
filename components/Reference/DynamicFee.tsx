import { useEffect, useState, useContext } from 'react'

import { Common } from '@ethereumjs/common'
import debounce from 'lodash.debounce'
import { IReferenceItem } from 'types'

import { EthereumContext } from 'context/ethereumContext'

import { calculateDynamicFee, calculateDynamicRefund } from 'util/gas'

import { Input, Radio, Icon } from 'components/ui'
import { H2 } from 'components/ui/Doc'

const debounceTimeout = 100 // ms

type Props = {
  referenceItem: IReferenceItem
  fork: string
}

type InputValue = {
  [name: string]: string | undefined
}

const DynamicFee = ({ referenceItem, fork }: Props) => {
  const { dynamicFee } = referenceItem
  const forkInputs = dynamicFee ? dynamicFee[fork].inputs : null

  const { common } = useContext(EthereumContext)
  const [inputs, setInputs] = useState<InputValue | undefined>()
  const [disabled, setDisabled] = useState<Set<string>>(new Set())
  const [gasCost, setGasCost] = useState('0')
  const [gasRefund, setGasRefund] = useState('0')
  const [canRefund, setCanRefund] = useState(false)

  const handleCompute = debounce((inputs) => {
    if (common) {
      try {
        setDisabled(calculateDisabledInputs(referenceItem, common, inputs))
        const updatedInputs = { ...inputs }
        for (const key in disabled.values()) {
          updatedInputs[key] = '0'
        }

        setGasCost(calculateDynamicFee(referenceItem, common, updatedInputs))

        const refund = calculateDynamicRefund(
          referenceItem,
          common,
          updatedInputs,
        )
        if (refund != null) {
          setCanRefund(true)
          setGasRefund(refund)
        } else {
          setCanRefund(false)
        }
      } catch (error) {
        console.error(error)
      }
    }
  }, debounceTimeout)

  const calculateDisabledInputs = (
    opcode: IReferenceItem,
    common: Common,
    inputs: InputValue,
  ) => {
    if (opcode.opcodeOrAddress === '55' && common.gteHardfork('berlin')) {
      if (inputs.currentValue !== inputs.originalValue) {
        inputs.cold = '0'
        return new Set(['cold'])
      }
    }

    return new Set([])
  }

  // Initialize inputs with default keys & values
  useEffect(() => {
    const inputValues: InputValue = {}
    Object.keys(forkInputs || []).map((key: string) => {
      inputValues[key] = '0' // false for boolean, zero for numbers
    })
    setInputs(inputValues)
    handleCompute(inputValues)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dynamicFee])

  const handleChange = (key: string, value: string) => {
    const newInputs = {
      ...inputs,
      [key]: value,
    }
    setInputs(newInputs)
    handleCompute(newInputs)
  }

  if (!forkInputs || !inputs) {
    return null
  }

  return (
    <div className="md:w-96">
      <div className="flex justify-between items-center">
        <H2>Estimate your gas cost</H2>
      </div>

      <div className="bg-indigo-100 dark:bg-black-500 p-4 rounded shadow">
        {Object.keys(forkInputs).map((key: string) => {
          const input = forkInputs[key]

          return (
            <div key={key}>
              <label className="block text-sm text-gray-500 mb-1" htmlFor={key}>
                {input.label}
              </label>

              {input.type === 'number' && (
                <Input
                  type="number"
                  min={0}
                  max={1000000000000}
                  name={key}
                  value={inputs[key]}
                  onChange={(e) => handleChange(key, e.target.value)}
                  className="bg-white/75 dark:bg-black-400/75 mb-4 text-sm font-mono"
                />
              )}

              {input.type === 'boolean' && (
                <div className="mb-4">
                  <Radio
                    text="Yes"
                    value={'1'}
                    isChecked={inputs[key] === '1' && !disabled.has(key)}
                    isDisabled={disabled.has(key)}
                    onChange={() => handleChange(key, '1')}
                  />
                  <Radio
                    text="No"
                    value={'0'}
                    isChecked={inputs[key] === '0' || disabled.has(key)}
                    isDisabled={disabled.has(key)}
                    onChange={() => handleChange(key, '0')}
                  />
                </div>
              )}
            </div>
          )
        })}

        <div className="flex items-center pt-2">
          <Icon name="gas-station-fill" className="text-indigo-500 mr-2" />
          Static gas + dynamic gas = {gasCost}
        </div>

        {canRefund && (
          <div className="flex items-center pt-2">
            <Icon name="reply-fill" className="text-indigo-500 mr-2" />
            Gas refund = {gasRefund}
          </div>
        )}
      </div>
    </div>
  )
}

export default DynamicFee
