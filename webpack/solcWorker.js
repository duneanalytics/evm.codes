const path = require('node:path')
const webpack = require('webpack')

webpack(
  {
    mode: 'production',
    target: 'webworker',
    entry: './babel/solcWorker2.js',
    output: {
      path: path.resolve(__dirname, '../public'),
      filename: 'solcWorker.js',
    },
    resolve: {
      // The worker loads compilers with importScripts, never solc's Node HTTP loader.
      alias: { 'follow-redirects': false, memorystream: false },
      fallback: { assert: require.resolve('assert/') },
    },
    plugins: [
      new webpack.ProvidePlugin({
        process: 'process/browser',
        Buffer: ['buffer', 'Buffer'],
      }),
    ],
  },
  (error, stats) => {
    if (error || stats.hasErrors()) {
      console.error(error || stats.toString({ all: false, errors: true }))
      process.exitCode = 1
    }
  },
)
