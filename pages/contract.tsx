import { ReactElement } from 'react'

import Head from 'next/head'

import ContractViewer from 'components/ContractViewer'
import HomeLayout from 'components/layouts/Home'
import { Container } from 'components/ui'

const ContractPage = () => {
  return (
    <>
      <Head>
        <meta property="og:type" content="website" />
        <title>EVM Codes - Contract Viewer</title>
        <meta name="description" content="EVM Codes - Contract Viewer" />
      </Head>

      <Container>
        <ContractViewer />
      </Container>
    </>
  )
}

ContractPage.getLayout = function getLayout(page: ReactElement) {
  return <HomeLayout>{page}</HomeLayout>
}

export default ContractPage
