const { defineConfig } = require('@vue/cli-service')

module.exports = defineConfig({
  transpileDependencies: true,

  // 开发服务器配置
  devServer: {
    host: '0.0.0.0',
    port: 8080,
    server: {
      type: 'https',
      options: {
        // 忽略证书错误，用于开发环境
        requestCert: false,
        rejectUnauthorized: false
      }
    },
    client: {
      webSocketURL: 'wss://0.0.0.0:8080/ws',
    },
    // 允许从任何主机访问
    allowedHosts: 'all',
    // 代理配置解决CORS问题
    proxy: {
      '/api/baidu': {
        target: 'https://aip.baidubce.com',
        changeOrigin: true,
        secure: true,
        pathRewrite: {
          '^/api/baidu': ''
        },
        headers: {
          'Origin': 'https://aip.baidubce.com'
        }
      },
      '/api/oauth': {
        target: 'https://aip.baidubce.com',
        changeOrigin: true,
        secure: true,
        pathRewrite: {
          '^/api/oauth': '/oauth'
        },
        headers: {
          'Origin': 'https://aip.baidubce.com'
        }
      }
    }
  },

  // PWA配置（用于移动端体验）
  pwa: {
    name: '车辆照片采集系统',
    themeColor: '#000000',
    msTileColor: '#000000',
    appleMobileWebAppCapable: 'yes',
    appleMobileWebAppStatusBarStyle: 'black-translucent',
    manifestOptions: {
      background_color: '#000000',
      display: 'fullscreen',
      orientation: 'portrait',
      start_url: '/',
      icons: [
        {
          src: './img/icons/android-chrome-192x192.png',
          sizes: '192x192',
          type: 'image/png',
        },
        {
          src: './img/icons/android-chrome-512x512.png',
          sizes: '512x512',
          type: 'image/png',
        }
      ]
    },
    workboxOptions: {
      skipWaiting: true,
      clientsClaim: true
    }
  },

  // 生产构建优化
  configureWebpack: {
    optimization: {
      splitChunks: {
        chunks: 'all',
      }
    }
  },

  // 链式操作webpack配置
  chainWebpack: config => {
    // 优化图片加载
    config.module
      .rule('images')
      .use('url-loader')
      .loader('url-loader')
      .tap(options => Object.assign(options || {}, { limit: 10240 }))

    // 生产环境移除console
    if (process.env.NODE_ENV === 'production') {
      config.optimization.minimizer('terser').tap(args => {
        if (args[0] && args[0].terserOptions && args[0].terserOptions.compress) {
          args[0].terserOptions.compress.drop_console = true
        }
        return args
      })
    }
  }
})
