import { EtherscanContractResponse } from 'types/contract'

type EtherscanResponse = {
  status: string
  message: string
  result: EtherscanContractResponse[] | string
}

/// parse response from etherscan api and return the compiler inputs object
export function etherscanParse(
  response: EtherscanResponse,
): EtherscanContractResponse {
  if (response.message !== 'OK') {
    const reason =
      typeof response.result === 'string' ? response.result : response.message
    throw `etherscan response is not OK: ${reason}`
  }

  if (!response.result || response.result.length == 0) {
    throw 'etherscan returned empty result'
  }

  const data = response.result[0]
  if (typeof data == 'string') {
    throw 'etherscan response malformed'
  }

  // SourceCode is json-escaped, convert for convenience
  const sourceStr = data.SourceCode.toString()
  if (sourceStr.startsWith('{{')) {
    // sometimes it is doubly-wrapped, idk. fuck it
    data.SourceCode = JSON.parse(sourceStr.slice(1, -1))
  } else if (sourceStr.startsWith('{')) {
    data.SourceCode = JSON.parse(sourceStr)
  } else {
    // TODO: need mock settings?
    // https://gydocument.readthedocs.io/en/latest/using-the-compiler.html#input-description
    // the compiler should accept raw string, but the UI expects sources by filenames
    data.SourceCode = {
      language: 'Solidity',
      sources: { [data.ContractName]: { content: sourceStr } },
    } //as SolidityCompilerInput
  }

  return data as EtherscanContractResponse
}
