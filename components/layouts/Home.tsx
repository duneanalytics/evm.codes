import { ReactNode } from 'react'

import Head from 'next/head'

import { getAbsoluteURL } from 'util/browser'

import Footer from './Footer'
import Nav from './Nav'

const HomeLayout = ({ children }: { children: ReactNode }) => {
  return (
    <>
      <Head>
        <title>
          EVM Codes - An Ethereum Virtual Machine Opcodes Interactive Reference
        </title>
        <meta property="og:type" content="website" />
        <meta property="og:title" content="EVM Codes" />
        <meta
          property="og:description"
          content="An Ethereum Virtual Machine Opcodes Interactive Reference"
        />
        <meta property="og:image" content={`${getAbsoluteURL('/og.png')}`} />
        <meta property="og:url" content={getAbsoluteURL()} />

        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="flex flex-col h-screen justify-between">
        <Nav />

        <main className="mb-auto mt-20 md:mt-28 pb-10">{children}</main>

        <Footer />
      </div>
    </>
  )
}

export default HomeLayout
