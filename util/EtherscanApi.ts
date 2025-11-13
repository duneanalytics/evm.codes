const ETHERSCAN_URL = 'https://api.etherscan.io/v2/api?'

export async function etherscanRequest(
  module: string,
  action: string,
  params: object,
) {
  const query: any = {
    chainid: 1,
    apikey: process.env.APIKEY_ETHERSCAN,
    module: module,
    action: action,
    ...params,
  }

  const url = ETHERSCAN_URL + new URLSearchParams(query)
  return fetch(url)
}

export async function etherscanGetSource(address: string) {
  return etherscanRequest('contract', 'getsourcecode', { address })
}
