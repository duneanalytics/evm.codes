import {
  useContext,
  useMemo,
  useRef,
  Fragment,
  useEffect,
  useState,
  useCallback,
} from 'react'

import cn from 'classnames'
import useWindowSize from 'lib/useWindowResize'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useTable, useExpanded, useFilters, HeaderGroup } from 'react-table'
import { Tooltip } from 'react-tooltip'
import { IReferenceItem, IItemDocs, IGasDocs } from 'types'

import {
  EthereumContext,
  CheckIfAfterMergeHardfork,
  prevrandaoDocName,
} from 'context/ethereumContext'

import { findMatchingForkName } from 'util/gas'

import { Button, Icon } from 'components/ui'

import tableColumns from './columns'
import DocRow from './DocRow'
import Filters from './Filters'
import Header from './Header'

type CustomHeaderGroup = {
  className?: string
} & HeaderGroup<IReferenceItem>

const ReferenceTable = ({
  itemDocs,
  gasDocs,
  reference,
  isPrecompiled = false,
}: {
  itemDocs: IItemDocs
  gasDocs: IGasDocs
  reference: IReferenceItem[]
  isPrecompiled?: boolean
}) => {
  const router = useRouter()
  const { forks, selectedFork, onForkChange, areForksLoaded } =
    useContext(EthereumContext)
  const data = useMemo(() => reference, [reference])
  const columns = useMemo(() => tableColumns(isPrecompiled), [isPrecompiled])
  const rowRefs = useRef<HTMLTableRowElement[]>([])
  const [focusedOpcode, setFocusedOpcode] = useState<number | null>()
  const { width: screenWidth } = useWindowSize()

  // FIXME: See: https://github.com/tannerlinsley/react-table/issues/3064
  // @ts-ignore: Waiting for 8.x of react-table to have better types
  const table = useTable({ columns, data }, useExpanded, useFilters)

  const {
    getTableProps,
    getTableBodyProps,
    headerGroups,
    rows,
    prepareRow,
    visibleColumns,
    // @ts-ignore: Waiting for 8.x of react-table to have better types
    toggleAllRowsExpanded,
    // @ts-ignore: Waiting for 8.x of react-table to have better types
    isAllRowsExpanded,
    // @ts-ignore: Waiting for 8.x of react-table to have better types
    setFilter,
  } = table

  const colSpan = useMemo(
    () => (screenWidth && screenWidth >= 768 ? visibleColumns.length : 3),
    [screenWidth, visibleColumns],
  )

  const itemDoc = useCallback(
    (opcodeOrAddress: string) => {
      // @ts-ignore: TODO: need to implement proper selection of doc according to selected fork (maybe similar to dynamic gas fee)
      // @ts-ignore: Hack for "difficulty" -> "prevrandao" replacement for "merge" HF
      return opcodeOrAddress == '44' &&
        CheckIfAfterMergeHardfork(selectedFork?.name)
        ? itemDocs[prevrandaoDocName]
        : itemDocs[opcodeOrAddress]
    },
    [itemDocs, selectedFork?.name],
  )

  // Focus and expand anchored reference
  useEffect(() => {
    if (reference && rowRefs?.current) {
      const idx = reference.findIndex((referenceItem) => {
        const re = new RegExp(`#${referenceItem.opcodeOrAddress}`, 'gi')
        return router.asPath.match(re)
      })

      if (idx !== -1) {
        setFocusedOpcode(idx)
        setTimeout(() => {
          if (rowRefs.current[idx]) {
            rowRefs.current[idx].scrollIntoView({ behavior: 'smooth' })
          }
        }, 300)
      }
    }
  }, [reference, router.asPath])

  // Change selectedFork according to query param
  useEffect(() => {
    const query = router.query
    if ('fork' in query) {
      onForkChange(query.fork as string)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, areForksLoaded])

  const renderExpandButton = () => {
    return (
      <div className="hidden md:block">
        <Button
          onClick={() => toggleAllRowsExpanded(!isAllRowsExpanded)}
          padded={false}
          transparent
          className="text-gray-800 dark:text-gray-200"
        >
          <span className="text-sm font-normal">
            {isAllRowsExpanded ? 'Collapse' : 'Expand'}
          </span>
          <Icon
            className="text-indigo-500"
            name={isAllRowsExpanded ? 'arrow-up-s-line' : 'arrow-down-s-line'}
          />
        </Button>
      </div>
    )
  }

  if (reference.length === 0 || !areForksLoaded) {
    return null
  }

  return (
    <>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 md:mb-10">
        <Header isPrecompiled={isPrecompiled} />
        <Filters onSetFilter={setFilter} isPrecompiled={isPrecompiled} />
      </div>

      <table {...getTableProps()} className="w-full table-fixed">
        <thead>
          {headerGroups.map((headerGroup) => (
            <tr
              key={headerGroup.getHeaderGroupProps().key}
              className="sticky bg-gray-50 dark:bg-black-700 border-b border-gray-200 dark:border-black-500 uppercase text-xs tracking-wide text-left text-gray-500 dark:text-gray-400"
              style={{
                top: 54,
              }}
            >
              {headerGroup.headers.map(
                (column: CustomHeaderGroup, index: number) => {
                  const isLastColumn = index + 1 === headerGroup.headers.length

                  return (
                    <th
                      key={column.getHeaderProps().key}
                      className={cn('py-3 font-medium', column.className, {
                        'pr-6': !isLastColumn,
                      })}
                      style={{
                        width: column.width || 'auto',
                      }}
                    >
                      <div className="flex items-center justify-between">
                        {column.render('Header')}
                        {isLastColumn && renderExpandButton()}
                      </div>
                    </th>
                  )
                },
              )}
            </tr>
          ))}
        </thead>

        <tbody {...getTableBodyProps()} className="text-sm">
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={colSpan}
                className="text-center pt-20 pb-4 text-lg text-gray-400 dark:text-gray-600"
              >
                {!isPrecompiled
                  ? 'No opcodes found'
                  : 'No precompiled contracts found'}
              </td>
            </tr>
          )}

          {rows.map((row) => {
            prepareRow(row)

            const { opcodeOrAddress } = row.values
            const rowId = parseInt(row.id)
            // @ts-ignore: Waiting for 8.x of react-table to have better types
            const isExpanded = row.isExpanded || focusedOpcode === rowId
            const dynamicFeeForkName = findMatchingForkName(
              forks,
              Object.keys(reference[rowId]?.dynamicFee || {}),
              selectedFork,
            )

            return (
              <Fragment key={row.getRowProps().key}>
                <tr
                  className={cn('border-t cursor-pointer', {
                    'border-gray-200 dark:border-black-500 hover:bg-gray-100 dark:hover:bg-black-600':
                      !isExpanded,
                    'border-b border-indigo-100 dark:border-black-500':
                      isExpanded,
                  })}
                  ref={(el) => {
                    if (el) {
                      rowRefs.current[row.index] = el
                    }
                  }}
                  // @ts-ignore: Waiting for 8.x of react-table to have better types
                  onClick={() => row.toggleRowExpanded()}
                  style={{ scrollMarginTop: '96px' }}
                >
                  {row.cells.map((cell) => (
                    <td
                      key={cell.getCellProps().key}
                      // FIXME: See: https://github.com/tannerlinsley/react-table/issues/3064
                      // @ts-ignore: Waiting for 8.x of react-table to have better types
                      className={cn('py-2 pr-6', cell.column.className)}
                      style={{
                        width: cell.column.width || 'auto',
                      }}
                    >
                      <div className="flex items-center flex-wrap">
                        {cell.column.id === 'opcodeOrAddress' && (
                          <Link
                            href={
                              isPrecompiled
                                ? `/precompiled?fork=${selectedFork?.name}#${opcodeOrAddress}`
                                : `/?fork=${selectedFork?.name}#${opcodeOrAddress}`
                            }
                            className="underline font-mono"
                          >
                            <Icon
                              name="links-line"
                              className="text-indigo-500 mr-2"
                            />
                          </Link>
                        )}
                        {cell.render('Cell')}
                        {cell.column.id === 'minimumFee' &&
                          !!dynamicFeeForkName && (
                            <span
                              className="inline-block pl-2 text-gray-400 dark:text-black-400"
                              data-tooltip-content="Has additional dynamic gas cost, expand to estimate it"
                              data-tooltip-id={`tip-${cell.row.id}`}
                            >
                              <Icon name="question-line" />
                              <Tooltip
                                className="tooltip"
                                id={`tip-${cell.row.id}`}
                              />
                            </span>
                          )}
                      </div>
                    </td>
                  ))}
                </tr>

                {isExpanded ? (
                  <tr className="bg-indigo-50 dark:bg-black-600">
                    <td colSpan={colSpan}>
                      <DocRow
                        itemDoc={itemDoc(opcodeOrAddress)}
                        referenceItem={reference[rowId]}
                        gasDocs={gasDocs[opcodeOrAddress]}
                        dynamicFeeForkName={dynamicFeeForkName}
                      />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </>
  )
}

export default ReferenceTable
