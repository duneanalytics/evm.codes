import { Row } from 'react-table'

import { StackBox } from 'components/ui'

// Possible fields are defined in `Opcodes.json`
type OpcodeRow = Row<Record<string, string | undefined>>

const filter = (rows: OpcodeRow[], id: string, filterValue: string) => {
  return rows.filter((row) =>
    row.original[id]
      ?.toLocaleLowerCase()
      .includes(filterValue.toLocaleLowerCase()),
  )
}

const columns = (isPrecompiled: boolean) => [
  {
    Header: !isPrecompiled ? 'Opcode' : 'Address',
    accessor: 'opcodeOrAddress',
    className: !isPrecompiled ? 'uppercase' : undefined,
    filter,
    width: 48,
  },
  {
    Header: 'Name',
    accessor: 'name',
    filter,
    width: 80,
  },
  {
    Header: 'Minimum Gas',
    accessor: 'minimumFee',
    width: 50,
  },
  {
    Header: !isPrecompiled ? 'Stack Input' : 'Input',
    accessor: 'input',
    Cell: ({ value }: { value: string }) => (
      <StackBox
        value={value}
        className="text-xs border-indigo-300 dark:border-indigo-900 text-gray-800 dark:text-gray-200"
      />
    ),
    width: 200,
    className: 'hidden md:table-cell',
  },
  {
    Header: !isPrecompiled ? 'Stack Output' : 'Output',
    accessor: 'output',
    Cell: ({ value }: { value: string }) => (
      <StackBox
        value={value}
        className="text-xs border-indigo-300 dark:border-indigo-900 text-gray-800 dark:text-gray-200"
      />
    ),
    width: 100,
    className: 'hidden md:table-cell',
  },
  {
    Header: 'Description',
    accessor: 'description',
    className: 'hidden md:table-cell',
  },
]

export default columns
