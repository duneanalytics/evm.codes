import React from 'react'

import cn from 'classnames'
import Link from 'next/link'

type Props = {
  href: string
  external?: boolean
  children: string
  className?: string
}

const NavLink: React.FC<Props> = ({
  href,
  children,
  className,
  external = false,
}) => {
  return (
    <li
      className={cn(
        'inline-block mx-4 text-sm my-2 md:my-0 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white',
        className,
      )}
    >
      <Link href={href} target={external ? '_blank' : '_self'}>
        {children}
      </Link>
    </li>
  )
}

export default NavLink
