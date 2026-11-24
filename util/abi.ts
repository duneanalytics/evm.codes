import { AbiParameter, encodeAbiParameters } from 'viem'

export function parseArguments(
  parameters: readonly AbiParameter[],
  values: string[],
) {
  if (parameters.length !== values.length) {
    throw new Error('Incorrect number of arguments')
  }
  return parameters.map((parameter, index) => {
    const value = values[index]
    if (parameter.type === 'bool') {
      if (value === 'true' || value === '1') {
        return true
      }
      if (value === 'false' || value === '0') {
        return false
      }
      throw new Error('Invalid boolean argument')
    }
    return value
  })
}

export function encodeArguments(
  parameters: readonly AbiParameter[],
  values: string[],
) {
  return encodeAbiParameters(parameters, parseArguments(parameters, values))
}
