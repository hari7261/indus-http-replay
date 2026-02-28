/* eslint-disable @typescript-eslint/no-var-requires */
'use strict';

const path = require('path');

/** @type {import('webpack').Configuration[]} */
const configs = [
  // Extension host bundle
  {
    target: 'node',
    mode: 'none',
    entry: './src/extension.ts',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'extension.js',
      libraryTarget: 'commonjs2',
    },
    externals: {
      vscode: 'commonjs vscode',
    },
    resolve: {
      extensions: ['.ts', '.js'],
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          exclude: /node_modules/,
          use: [
            {
              loader: 'ts-loader',
            },
          ],
        },
      ],
    },
    devtool: 'nosources-source-map',
    infrastructureLogging: {
      level: 'log',
    },
  },
  // Worker process bundle
  {
    target: 'node',
    mode: 'none',
    entry: './src/worker/replayWorker.ts',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'replayWorker.js',
      libraryTarget: 'commonjs2',
    },
    resolve: {
      extensions: ['.ts', '.js'],
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          exclude: /node_modules/,
          use: [
            {
              loader: 'ts-loader',
            },
          ],
        },
      ],
    },
    devtool: 'nosources-source-map',
  },
];

module.exports = configs;
