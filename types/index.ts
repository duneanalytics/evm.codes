declare global {
  interface Window {
    EvmCodes: any
  }
}

export interface IReferenceItem {
  opcodeOrAddress: string
  name: string | undefined
  input: string
  output: string
  description: string
  staticFee?: number
  minimumFee: number
  dynamicFee?: {
    [fork: string]: {
      inputs: {
        [name: string]: {
          type: 'number' | 'boolean'
          label: string
        }
      }
    }
  }
}

export interface IReferenceItemMeta {
  name?: string
  input: string
  output: string
  description: string
}

export interface IReferenceItemMetaList {
  [opcodeOrAddress: string]: IReferenceItemMeta
}

export interface IInstruction {
  id: number
  name: string
  value?: string | undefined
  hasBreakpoint?: boolean
}

export interface IStorage {
  address: string
  slot: string
  value: string
}

export interface ITransientStorage {
  address: string
  key: string
  value: string
}

export interface IMemoryWord {
  offset: string
  data: string
}

export interface IExecutionState {
  programCounter: number | undefined
  stack: string[]
  storage: IStorage[]
  transientStorage: ITransientStorage[]
  memory: IMemoryWord[] | undefined
  totalGas: string | undefined
  currentGas: string | undefined
  returnValue: string | undefined
}

export interface IChain {
  id: number
  name: string
}

export interface IDocMeta {
  fork: string
  group: string
}

export interface IItemDoc {
  meta: IDocMeta
  mdxSource: any
}

export interface IItemDocs {
  [opcodeOrAddress: string]: IItemDoc
}

export interface IGasDoc {
  [fork: string]: string
}

export interface IGasDocs {
  [opcodeOrAddress: string]: IGasDoc
}
