<p align="center">
  <h1 align="center">EVM.Codes</h1>
</p>
<p align="center">
  <strong><i>An interactive reference to Ethereum Virtual Machine Opcodes</i></strong>
  <img width="1408" alt="screenshot" src="https://user-images.githubusercontent.com/5113/142245431-08ad9922-9115-43fd-9572-8b33cde75bb0.png">
</p>

This is the source code that runs [evm.codes](https://evm.codes) web application. Below you will find the docs on how to contribute to the project and get it up and running locally for further development.

evm.codes is brought to you by [Dune](https://dune.com/home), powered by open-source projects such as [EthereumJS](https://github.com/ethereumjs/ethereumjs-monorepo), [SolcJS](https://github.com/ethereum/solc-js) and [many others](package.json).

## ⚙️ Installation

The app requires the following dependencies:

- [NodeJS](https://nodejs.org/) >= 24
- [pnpm](https://pnpm.io/)

## 👩‍💻 Local Development

For contributing to the project, you can quickly get the application running by following these steps:

Clone this repository:

    git clone git@github.com:duneanalytics/evm.codes.git

Install the dependencies:

    pnpm install

Specify the environment variables if you want to run the contract viewer in `.env.local`

    APIKEY_ETHERSCAN=

Start up the app and see it running at <http://localhost:3000>

    pnpm dev

## 🚀 Deploying

Deployments are handled automatically by [Vercel](https://vercel.com/), as soon as your PR is merged to `main`.

## 🤗 Contributing

evm.codes is built and maintained by a small team, so we would definitely love your help to fix bugs, add new features and improvements, or update EVM [reference docs](docs/opcodes).

Before you submit a pull request, please make sure there isn't an existing [GitHub issue](https://github.com/duneanalytics/evm.codes/issues). If there isn't, create one first to discuss the best way to approach it and also get some feedback from the team.

Once you are about to submit a pull request, prefix the name with either `chore:` (small improvements and regular maintenance), `fix:` (bugs and hot fixes), or `feat:` (new features) to help us quickly look up the type of the issue from the Git history.

### Coding conventions

The project is already pre-configured with [Eslint](.eslintrc.js), [TypeScript](tsconfig.json), and [Prettier](.prettierrc). Here are some useful commands you can run to ensure your changes follow the project's coding conventions:

Check for any linting issues and fix:

    pnpm lint --fix

Check for any TypeScript issues:

    pnpm typecheck

Sort the `package.json`:

    pnpm lint:package

## Architecture

If you would like to contribute, make sure to check the [architecture document](docs/ARCHITECTURE.md) to learn about the code structure, and how the app is built.

## License

[MIT](LICENSE)
