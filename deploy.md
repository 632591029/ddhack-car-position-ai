# 🚀 Cloudflare Pages 部署指南

## 快速部署

### 方法1: Cloudflare Dashboard（推荐）

1. **访问 Cloudflare Pages**
   - 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
   - 进入 "Pages" 页面
   - 点击 "Create a project"

2. **连接 Git 仓库**
   - 选择 "Connect to Git"
   - 连接你的 GitHub/GitLab 账户
   - 选择此项目的仓库

3. **配置构建设置**
   ```
   Framework preset: Vue
   Build command: npm run build
   Build output directory: dist
   Root directory: (留空)
   ```

4. **环境变量（可选）**
   ```
   NODE_ENV = production
   ```

5. **点击 "Save and Deploy"**

### 方法2: Wrangler CLI

1. **安装 Wrangler**
   ```bash
   npm install -g wrangler
   ```

2. **登录 Cloudflare**
   ```bash
   wrangler login
   ```

3. **部署项目**
   ```bash
   wrangler pages publish dist --project-name car-ultra-vue
   ```

## 📁 部署文件结构

```
├── dist/                    # 构建输出目录
├── _functions/             # Cloudflare Functions (API代理)
│   └── api/
│       └── [[path]].js     # 动态路由处理百度API
├── _headers                # HTTP头配置
├── _redirects             # 重定向规则
├── wrangler.toml          # Cloudflare配置
└── deploy.md              # 部署文档
```

## 🔧 关键配置说明

### API 代理
- 百度API调用通过 `_functions/api/[[path]].js` 代理
- 解决CORS跨域问题
- 支持路径：
  - `/api/oauth/2.0/token` → 百度OAuth
  - `/api/baidu/rest/2.0/image-classify/v1/vehicle_detect` → 车辆检测

### 安全配置
- `_headers`: 设置安全头和CORS
- PWA支持: 摄像头权限、全屏模式
- HTTPS强制: Cloudflare自动提供

### 功能特性
- ✅ 摄像头访问
- ✅ 语音合成
- ✅ 百度AI车辆检测
- ✅ 自动拍照
- ✅ 移动端优化

## 🌐 访问地址

部署完成后，你的应用将在：
- `https://car-ultra-vue.pages.dev`
- 或你的自定义域名

## 🔄 自动部署

每次推送到主分支时，Cloudflare Pages会自动：
1. 拉取最新代码
2. 运行 `npm run build`
3. 部署到全球CDN

## 📱 移动端测试

部署后请在移动端测试：
- 摄像头权限
- 语音提示
- 车辆检测精度
- 自动拍照功能

---

🎉 **部署完成！享受你的AI车辆检测系统吧！**