import React from 'react'

import cn from 'classnames'
import { IMemoryWord } from 'types'

type Props = {
  words: IMemoryWord[] | undefined
}

const toPrefixedHex = (hex: string) => (hex ? `0x${hex}` : '')

export const MemoryPane: React.FC<Props> = ({ words }) => {
  const rows =
    !words || words.length === 0 ? [{ offset: '00', data: '' }] : words
  const offsetWidth = Math.max(...rows.map((row) => row.offset.length))

  return (
    <div
      className="inline-block border border-gray-600 dark:border-gray-700 rounded-sm w-full overflow-hidden font-mono text-tiny"
      style={{ minHeight: 26 }}
    >
      {rows.map((row, index) => (
        <div
          key={`${row.offset}-${index}`}
          className={cn('flex items-start px-2 py-1', {
            'border-t border-gray-600/40 dark:border-gray-700/60': index > 0,
          })}
        >
          <span
            className="shrink-0 pr-3 text-gray-500 dark:text-gray-400 tabular-nums select-none"
            style={{ width: `${offsetWidth + 1}ch` }}
          >
            {row.offset}
          </span>
          <span className="min-w-0 flex-1 break-all text-gray-300 tracking-tight">
            {row.data ? toPrefixedHex(row.data) : '\u00a0'}
          </span>
        </div>
      ))}
    </div>
  )
}
