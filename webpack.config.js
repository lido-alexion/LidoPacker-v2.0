const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = (env, argv) => {
  const isDev = argv.mode === 'development';
  const publicPath = '/packer/';

  return {
    entry: './src/main.ts',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].[contenthash].js',
      publicPath,
      clean: true,
    },
    resolve: {
      extensions: ['.ts', '.js'],
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
        {
          test: /\.scss$/,
          use: [
            isDev ? 'style-loader' : MiniCssExtractPlugin.loader,
            'css-loader',
            'sass-loader',
          ],
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: './src/index.html',
        filename: 'index.html',
      }),
      new MiniCssExtractPlugin({
        filename: '[name].[contenthash].css',
      }),
      new CopyWebpackPlugin({
        patterns: [
          { from: 'public', to: '.', noErrorOnMissing: true },
        ],
      }),
    ],
    devServer: {
      port: 3005,
      hot: true,
      open: [publicPath],
      static: {
        directory: path.join(__dirname, 'public'),
        publicPath,
        serveIndex: false,
      },
      historyApiFallback: {
        index: '/packer/index.html',
        disableDotRule: true,
        htmlAcceptHeaders: ['text/html', 'application/xhtml+xml', '*/*'],
      },
      setupMiddlewares: (middlewares) => {
        middlewares.unshift({
          name: 'packer-spa',
          middleware: (req, res, next) => {
            if (req.method !== 'GET' && req.method !== 'HEAD') return next();
            const pathname = (req.url || '').split('?')[0];
            if (pathname === '/packer' || pathname === '/packer/' || pathname === '/packer/index.html') {
              return next();
            }
            if (!pathname.startsWith('/packer/')) {
              if (pathname === '/' || pathname === '/index.html') {
                req.url = '/packer/index.html';
              }
              return next();
            }
            if (/\.(js|css|map|png|json|ico|svg|woff2?)$/i.test(pathname)) return next();
            if (pathname.startsWith('/packer/main.')) return next();
            req.url = '/packer/index.html';
            return next();
          },
        });
        return middlewares;
      },
      devMiddleware: {
        publicPath,
      },
    },
    devtool: isDev ? 'inline-source-map' : 'source-map',
  };
};
