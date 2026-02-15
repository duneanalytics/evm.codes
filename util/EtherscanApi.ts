const ETHERSCAN_URL = 'https://api.etherscan.io/v2/api'
const ETHERSCAN_CHAIN_ID = process.env.ETHERSCAN_CHAIN_ID || '1'

export async function etherscanRequest(
  module: string,
  action: string,
  params: object,
) {
  const query: Record<string, string> = {
    chainid: ETHERSCAN_CHAIN_ID,
    apikey: process.env.APIKEY_ETHERSCAN || '',
    module: module,
    action: action,
  }

  Object.entries(params).forEach(([key, value]) => {
    query[key] = String(value)
  })

  const url = `${ETHERSCAN_URL}?${new URLSearchParams(query)}`
  return fetch(url)
}

export async function etherscanGetSource(address: string) {
  return etherscanRequest('contract', 'getsourcecode', { address })
}
