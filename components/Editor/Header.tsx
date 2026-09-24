import { useContext, useMemo } from 'react'

import Select, { OnChangeValue } from 'react-select'

import { EthereumContext } from 'context/ethereumContext'

import { Label } from 'components/ui'

import { CodeType } from './types'

type Props = {
  codeType: string | undefined
  onCodeTypeChange: (option: OnChangeValue<any, any>) => void
}

const codeLangOptions = Object.keys(CodeType).map((lang) => ({
  value: lang,
  label: lang,
}))

const EditorHeader = ({ codeType, onCodeTypeChange }: Props) => {
  const { selectedFork } = useContext(EthereumContext)

  const codeTypeValue = useMemo(
    () => ({
      value: codeType,
      label: codeType,
    }),
    [codeType],
  )

  return (
    <div className="flex justify-between items-center w-full">
      <h3 className="font-semibold text-md hidden xl:inline-flex items-center">
        <span>EVM Playground</span>
        <Label>{selectedFork?.name}</Label>
      </h3>

      <div className="flex items-center justify-between w-full xl:w-auto">
        <Select
          instanceId="code-type"
          onChange={onCodeTypeChange}
          options={codeLangOptions}
          value={codeTypeValue}
          isSearchable={false}
          classNamePrefix="select"
          menuPlacement="auto"
        />
      </div>
    </div>
  )
}

export default EditorHeader
