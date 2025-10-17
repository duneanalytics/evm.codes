export const GITHUB_REPO_URL = 'https://github.com/duneanalytics/evm.codes'

// Currently active hardfork from the ones available:
// See: https://github.com/ethereumjs/ethereumjs-monorepo/blob/master/packages/common/src/hardforks.ts
export const CURRENT_FORK = 'prague'
export const EOF_ENABLED_FORK = 'prague'
export const EOF_FORK_NAME = 'EOF'

export const FORKS_WITH_TIMESTAMPS: { [name: string]: number | null } = {
  shanghai: 1681338455,
  cancun: 1710338135,
  prague: 1746612311,
}
