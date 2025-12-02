const path = require('path');

module.exports = {
  entry: './lib/ic-password-auth.ts',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.wasm$/,
        type: 'asset/inline',
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.wasm'],
    fallback: {
      fs: false,
      path: false,
      crypto: false,
    },
  },
  output: {
    filename: 'ic-password-auth.js',
    path: path.resolve(__dirname, 'dist'),
    globalObject: 'this',
  },
  optimization: {
    minimize: true,
  },
  experiments: {
    asyncWebAssembly: true,
  },
};
