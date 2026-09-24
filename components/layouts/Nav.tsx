import { useState } from 'react'

import cn from 'classnames'
import Link from 'next/link'

import { GITHUB_REPO_URL } from 'util/constants'

import KBarButton from 'components/KBar/Button'
import NavLink from 'components/NavLink'
import ThemeSelector from 'components/ThemeSelector'
import { Container, Logo, Hamburger } from 'components/ui'

import ChainSelector from '../ChainSelector'

const Nav = () => {
  const [isMenuVisible, setIsMenuVisible] = useState(false)

  return (
    <nav className="fixed z-40 top-0 inset-x-0 py-2 bg-white dark:bg-black-800">
      <Container>
        <div className="h-10 flex items-center justify-between">
          <Link href="/">
            <Logo />
          </Link>

          <ul
            className={cn(
              'py-2 md:py-0 px-2 flex justify-between items-start md:items-center flex-col md:flex-row w-full md:w-auto fixed md:static shadow-md md:shadow-none transition-all',
              {
                'left-0 bg-white dark:bg-black-800 md:bg-transparent dark:md:bg-transparent':
                  isMenuVisible,
                '-left-full': !isMenuVisible,
              },
            )}
            style={{ top: 56 }}
          >
            <NavLink href="/">Opcodes</NavLink>
            <NavLink href="/precompiled">Precompiled Contracts</NavLink>
            <NavLink href="/contract">Contract Viewer</NavLink>
            <NavLink href="/playground">Playground</NavLink>
            <NavLink href="/about">About the EVM</NavLink>
            <NavLink href={GITHUB_REPO_URL} external>
              GitHub
            </NavLink>

            <li className="hidden lg:inline-block">
              <KBarButton />
            </li>
          </ul>

          <div className="items-center ml-auto flex">
            <ChainSelector />
            <ThemeSelector />
          </div>

          <Hamburger
            isActive={isMenuVisible}
            onClick={() => setIsMenuVisible(!isMenuVisible)}
          />
        </div>
      </Container>
    </nav>
  )
}

export default Nav
