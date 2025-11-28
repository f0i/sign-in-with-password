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
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  output: {
    filename: 'ic-password-auth.js',
    path: path.resolve(__dirname, 'dist'),
    library: {
      name: 'ICPasswordAuth',
      type: 'umd',
      export: 'default',
    },
    globalObject: 'this',
  },
  optimization: {
    minimize: true,
  },
};
