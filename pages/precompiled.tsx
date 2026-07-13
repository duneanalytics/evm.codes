import fs from 'fs'
import path from 'path'

import React, { useContext, useEffect } from 'react'

import matter from 'gray-matter'
import type { NextPage } from 'next'
import getConfig from 'next/config'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { serialize } from 'next-mdx-remote/serialize'
import { IItemDocs, IGasDocs, IDocMeta } from 'types'

import { EthereumContext } from 'context/ethereumContext'

import ContributeBox from 'components/ContributeBox'
import HomeLayout from 'components/layouts/Home'
import ReferenceTable from 'components/Reference'
import { H1, H2, Container, RelativeLink as Link } from 'components/ui'

const { serverRuntimeConfig } = getConfig()

// It seems the memory expansion computation and constants did not change since frontier, but we have to keep an eye on new fork to keep this up to date
const PrecompiledPage = ({
  precompiledDocs,
  gasDocs,
}: {
  precompiledDocs: IItemDocs
  gasDocs: IGasDocs
}) => {
  const { precompiled, onForkChange, areForksLoaded } =
    useContext(EthereumContext)

  // Change selectedFork according to query param
  const router = useRouter()

  useEffect(() => {
    const query = router.query

    if ('fork' in query) {
      onForkChange(query.fork as string)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, areForksLoaded])

  return (
    <>
      <React.Fragment>
        <Head>
          <title> EVM Codes - Precompiled Contracts </title>
          <meta
            name="description"
            content="EVM Codes offers a reference of precompiled contracts - complex
          client-side functions bundled with the Ethereum Virtual Machine for
          efficiency."
          />
        </Head>
      </React.Fragment>
      <Container className="text-sm leading-6">
        <H1>Precompiled Contracts</H1>

        <H2 className="mb-4">Introduction</H2>
        <p className="pb-6">
          On top of having a set of opcodes to choose from, the EVM also offers
          a set of more advanced functionalities through precompiled contracts.
          These are a special kind of contracts that are bundled with the EVM at
          fixed addresses, and can be called with a determined gas cost. Early
          precompiled contracts use sequential addresses starting from 1, while
          new hardforks may introduce precompiled contracts at non-contiguous
          addresses. They are called from the opcodes like regular contracts,
          with instructions like <Link to="#F1" title="CALL" />. The gas cost
          mentioned here is purely the cost of the contract, and does not
          consider the cost of the call itself nor the instructions to put the
          parameters in memory. The precompiled contracts are also available in
          the <Link to="playground" title="playground" />.
        </p>
        <p className="pb-6">
          For all precompiled contracts, if the input is shorter than expected,
          it is assumed to be virtually padded with zeros at the end. If the
          input is longer than expected, surplus bytes at the end are ignored.
        </p>
        <p className="pb-6">
          After the hardfork <b>Berlin</b>, all the precompiled contracts
          addresses are always considered warm. See section{' '}
          <Link to="about" title="access sets" />.
        </p>
      </Container>

      <section className="py-10 md:py-20 bg-gray-50 dark:bg-black-700">
        <Container>
          <ReferenceTable
            isPrecompiled
            reference={precompiled}
            itemDocs={precompiledDocs}
            gasDocs={gasDocs}
          />
        </Container>
      </section>

      <section className="pt-20 pb-10 text-center">
        <ContributeBox />
      </section>
    </>
  )
}

PrecompiledPage.getLayout = function getLayout(page: NextPage) {
  return <HomeLayout>{page}</HomeLayout>
}

export const getStaticProps = async () => {
  const docsPath = path.join(serverRuntimeConfig.APP_ROOT, 'docs/precompiled')
  const docs = fs.readdirSync(docsPath)

  const precompiledDocs: IItemDocs = {}
  const gasDocs: IGasDocs = {}

  await Promise.all(
    docs.map(async (doc) => {
      const stat = fs.statSync(path.join(docsPath, doc))
      const address = path.parse(doc).name.toLowerCase()

      try {
        if (stat?.isDirectory()) {
          fs.readdirSync(path.join(docsPath, doc)).map((fileName) => {
            const markdown = fs.readFileSync(
              path.join(docsPath, doc, fileName),
              'utf-8',
            )
            const forkName = path.parse(fileName).name
            if (!(address in gasDocs)) {
              gasDocs[address] = {}
            }
            gasDocs[address][forkName] = markdown
          })
        } else {
          const markdownWithMeta = fs.readFileSync(
            path.join(docsPath, doc),
            'utf-8',
          )
          const { data, content } = matter(markdownWithMeta)
          const meta = data as IDocMeta
          const mdxSource = await serialize(content)

          precompiledDocs[address] = {
            meta,
            mdxSource,
          }
        }
      } catch (error) {
        console.debug("Couldn't read the Markdown doc for the opcode", error)
      }
    }),
  )
  return {
    props: {
      precompiledDocs,
      gasDocs,
    },
  }
}

export default PrecompiledPage
