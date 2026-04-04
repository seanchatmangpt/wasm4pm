/**
 * Webpack Configuration for process_mining_wasm
 *
 * This configuration supports bundling the WASM module for use in browser environments.
 * It handles both the WASM binary and JavaScript bindings.
 *
 * Usage:
 * webpack build --config examples/webpack.config.js
 */

const path = require('path');
const WasmPackPlugin = require('@wasm-tool/wasm-pack-plugin');

module.exports = {
  entry: './examples/app.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
  },
  mode: 'development',
  devtool: 'source-map',
  experiments: {
    asyncWebAssembly: true,
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.wasm$/,
        type: 'webassembly/async',
      },
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.wasm'],
  },
  plugins: [
    new WasmPackPlugin({
      crateDirectory: path.resolve(__dirname, '..'),
      outDir: path.resolve(__dirname, '..', 'pkg'),
      outName: 'process_mining_wasm',
      extraArgs: '--target web',
    }),
  ],
  devServer: {
    static: {
      directory: path.join(__dirname, 'dist'),
    },
    compress: true,
    port: 8080,
    hot: true,
    open: true,
  },
};
