/** @type {import('next').NextConfig} */

const { withPlausibleProxy } = require('next-plausible')

const nodeModuleReplacement = require('./webpack/nodeModuleReplacement')

module.exports = withPlausibleProxy()({
  reactStrictMode: true,
  webpack: (config, options) => {
    const { dir, defaultLoaders } = options

    config.resolve.extensions.push('.ts', '.tsx')
    config.module.rules.push({
      test: /\.+(ts|tsx)$/,
      include: [dir],
      use: [
        defaultLoaders.babel,
        {
          loader: 'ts-loader',
          options: {
            transpileOnly: true,
            // Next forces "jsx": "react-jsx" in tsconfig; leave JSX to babel so
            // styled-jsx still sees <style jsx>.
            compilerOptions: { jsx: 'preserve' },
          },
        },
      ],
    })

    // NOTE: Needed to clear the import assert from rustbn used by ethereumjs
    config.module.rules.push({
      test: /\.js$/,
      include: [dir],
      use: [
        {
          loader: './webpack/importAssertTransformer.js',
        },
      ],
    })
    // NOTE: Needed to transform various node imports from ethereumjs
    config.plugins.push(nodeModuleReplacement.default)

    config.resolve.fallback = {
      fs: false,
      stream: false,
      crypto: false,
      path: false,
      process: require.resolve('process/browser'),
      assert: require.resolve('assert/'),
      events: require.resolve('events/'),
      buffer: require.resolve('buffer/'),
    }
    // NOTE: Needed because rustbn used by ethereumjs is having a top level await
    config.experiments.topLevelAwait = true

    return config
  },
})
