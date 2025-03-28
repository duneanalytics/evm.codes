# Architecture

evm.codes is a [NextJS](https://nextjs.org/) and [TailwindCSS](https://tailwindcss.com/) backed React application. Currently, it does not have any backend, so everything runs in the browser. It's written in TypeScript and uses the latest ES6 language features.

Below is the structure of the app:

```
app
├── components  - React components used throughout the application
|───── layouts  - Layout components
|───── ui       - Reusable UI components
├── context     - Shared React Contexts for the application-wide state
├── docs        - Documentation and MDX files used in the reference table
├── lib         - Common libraries and reusable React hooks
├── pages       - NextJS pages and server-side API routes
├── public      - Public static assets
├── styles      - Global CSS styles
├── types       - TypeScript type definitions
└── utils       - Utility methods
```

## Ethereum Context

The core of the application is a [context/ethereumContext.tsx](../context/ethereumContext.tsx) powered by [EthereumJS](https://github.com/ethereumjs/ethereumjs-monorepo), which provides an application-wide state to the Ethereum Virtual Machine and its operating mechanics. Additionally, smart contracts compilation is handled by [SolcJS](https://github.com/ethereum/solc-js) through [lib/solcWorker.js](../lib/solcWorker.js).

## MDX docs

The Opcodes reference table relies on the [MDX](https://mdxjs.com/) powered [docs/opcodes](../docs/opcodes), in order to build dynamic documentation for each opcode. It follows a standard [markdown syntax](https://daringfireball.net/projects/markdown/syntax) with a few customizations, implemented by the [components/Reference/DocRow.tsx](../components/Reference/DocRow.tsx) and [components/ui/Doc.tsx](../components/ui/Doc.tsx) components:

- Supported page metadata (labels shown in the beginning of the doc) are: `fork`, `group`.
- Adding `*` in the markdown table header or column, leaves a borderless gap between the columns.

The dynamic gas fee calculation is handled by the following pieces of code:

1. [opcodes.json](../opcodes.json) defines the user input metadata in `dynamicFee` section of the opcodes, where each field is represented by a `number` or `boolean` with their corresponding labels. The app then builds the gas calculation UI form dynamically. The same happens for the precompiled contracts with [precompiled.json](../precompiled.json).

1. The actual gas calculation is performed by the [util/gas.ts#calculateDynamicFee](../util/gas.ts) based on the selected [EthereumJS Common](https://github.com/ethereumjs/ethereumjs-monorepo/tree/master/packages/common) object, via the get `param` method.

1.An Opcode with dynamic gas fee portion in [docs/opcodes](../docs/opcodes) can then have fork specific documentation (for example, `0A/london.mdx`), which are picked by the [components/Reference/DocRow.tsx](../components/Reference/DocRow.tsx) depending on the selected hardfork. In case of multiple hardfork docs, the latest to the selected one is picked. Additionally, these Markdown documents may have dynamic variables that are processed client-side and converted to MDX server-side by the [api/getDynamicDoc.ts](../pages/api/getDynamicDoc.ts) (due to node module dependencies of the `next-mdx-remote` package).

### Supported dynamic variables

- `{gasPrices|param}` - Renders a valid [EthereumJS Common](https://github.com/duneanalytics/evm.codes/blob/43d14aed225e04b47656f44de4492f3b8d1abdbc/util/gas.ts#L861) `gasPrices` parameter.
