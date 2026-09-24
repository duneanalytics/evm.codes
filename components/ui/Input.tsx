import React, { useState, ForwardedRef, forwardRef } from 'react'

import cn from 'classnames'

import { Icon } from './Icon'

type Props = {
  searchable?: boolean
  ref?: ForwardedRef<HTMLInputElement>
  className?: string
} & React.ComponentPropsWithoutRef<'input'>

export const Input = forwardRef<HTMLInputElement, Props>(
  (
    { searchable = false, onFocus, onBlur, className, ...rest },
    ref: ForwardedRef<HTMLInputElement>,
  ) => {
    const [isFocused, setIsFocused] = useState(false)
    const [isInputEmpty, setIsInputEmpty] = useState(true)

    const handleFocus = (e: any) => {
      setIsFocused(true)
      if (onFocus) {
        onFocus(e)
      }
    }

    const handleBlur = (e: any) => {
      setIsFocused(false)
      if (onBlur && e) {
        onBlur(e)
      }
    }

    const handleInput = (e: any) => {
      if (e.target.value === '') {
        setIsInputEmpty(true)
      } else {
        setIsInputEmpty(false)
      }
    }

    return (
      <div
        className={cn(
          'flex items-center rounded px-3 py-2 text-sm relative',
          {
            shadow: isFocused,
          },
          className,
        )}
      >
        <input
          ref={ref}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onInput={handleInput}
          className="w-full outline-none bg-transparent dark:placeholder-black-400"
          {...rest}
        />
        {searchable && (
          <>
            {isInputEmpty && (
              <span className="text-black-400 absolute right-8">Alt+K</span>
            )}
            <Icon
              name="search-line"
              className={cn(
                'ml-2',
                isFocused
                  ? 'text-gray-400 dark:text-gray-300'
                  : 'text-gray-300 dark:text-gray-400',
              )}
            />
          </>
        )}
      </div>
    )
  },
)
