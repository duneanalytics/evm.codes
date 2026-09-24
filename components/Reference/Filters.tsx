import { useState, useMemo, useEffect, useRef } from 'react'

import debounce from 'lodash.debounce'
import { useRouter } from 'next/router'
import Select, { OnChangeValue } from 'react-select'

import { Input } from 'components/ui'

const debounceTimeout = 100 // ms

type Props = {
  onSetFilter: (columnId: string, value: string) => void
  isPrecompiled?: boolean
}

const Filters = ({ onSetFilter, isPrecompiled = false }: Props) => {
  const router = useRouter()
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchFilter, setSearchFilter] = useState({
    value: 'name',
    label: 'Name',
  })

  const filterByOptions = useMemo(
    () => [
      {
        label: !isPrecompiled ? 'Opcode' : 'Address',
        value: 'opcodeOrAddress',
      },
      { label: 'Name', value: 'name' },
      { label: 'Description', value: 'description' },
    ],
    [isPrecompiled],
  )

  const inputRef = useRef<HTMLInputElement>(null)

  const handleKeywordChange = debounce(
    (value: string) => onSetFilter(searchFilter.value, value),
    debounceTimeout,
  )

  const handleSearchFilterChange = (option: OnChangeValue<any, any>) => {
    // clear previous filter first
    onSetFilter(searchFilter.value, '')
    setSearchKeyword('')
    setSearchFilter(option)
  }

  const handleAltK = (event: KeyboardEvent) => {
    if (event.altKey && event.key.toLowerCase() === 'k') {
      inputRef.current?.focus()
      inputRef.current?.value && inputRef.current.select()
    }
  }

  // Change filter and search opcode according to query param
  useEffect(() => {
    const query = router.query

    if ('name' in query) {
      // Change the filter type to Name
      handleSearchFilterChange({ label: 'Name', value: 'name' })
      setSearchKeyword(query.name as string)
      handleKeywordChange(query.name as string)
      router.push(router)
    }

    // Register and clean up Alt+K event listener
    window.addEventListener('keydown', handleAltK)
    return () => window.removeEventListener('keydown', handleAltK)

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady])

  return (
    <div className="flex items-center md:justify-end">
      <span className="hidden md:inline-block text-sm text-gray-400 mr-3">
        Search by
      </span>

      <div className="bg-gray-100 dark:bg-black-500 rounded mr-3 pl-2 pr-1">
        <Select
          instanceId="filter-by"
          onChange={handleSearchFilterChange}
          options={filterByOptions}
          defaultValue={{ label: 'Name', value: 'name' }}
          value={searchFilter}
          isSearchable={false}
          classNamePrefix="select"
          menuPlacement="auto"
        />
      </div>

      <Input
        ref={inputRef}
        searchable
        value={searchKeyword}
        onChange={(e) => {
          setSearchKeyword(e.target.value)
          handleKeywordChange(e.target.value)
        }}
        placeholder={`Enter keyword...`}
        className="bg-gray-100 dark:bg-black-500"
      />
    </div>
  )
}

export default Filters
