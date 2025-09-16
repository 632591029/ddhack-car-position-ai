# 车辆照片采集系统 🚗📸

一个基于Vue.js的AI车辆照片采集系统，支持四角度智能拍摄、实时检测和语音指导。

## ✨ 功能特性

- 🎯 **四角度拍摄**：右前45°、右后45°、左侧面、正前方
- 🤖 **AI实时检测**：基于百度AI的车辆识别和位置检测
- 🔊 **语音指导**：全程语音提示，提升用户体验
- 📱 **移动端优化**：专为手机拍摄设计，支持HTTPS和PWA
- ✨ **智能边框**：动态边框指导，实时置信度显示
- 📷 **照片质量检测**：自动检测照片质量，确保合格率

## 🚀 快速开始

### 环境要求

- Node.js 14+
- npm 或 yarn
- 支持摄像头的设备
- HTTPS环境（摄像头访问必需）

### 安装依赖

```bash
cd car-ultra-vue
npm install
```

### 开发模式

```bash
npm run dev
# 或者
npm run serve
```

访问: `https://localhost:8080` （注意必须使用HTTPS）

### 构建生产版本

```bash
npm run build
```

### 预览生产版本

```bash
npm run preview
```

## 📱 使用方法

1. **打开应用**：在支持摄像头的设备上打开应用
2. **授权摄像头**：允许浏览器访问摄像头
3. **开始拍摄**：按照语音提示进行四个角度的拍摄
4. **实时指导**：根据屏幕上的边框和语音提示调整位置
5. **自动保存**：系统自动检测最佳时机保存照片
6. **查看结果**：完成后可查看所有拍摄的照片
7. **提交上传**：确认无误后提交照片

## 🛠️ 技术栈

- **前端框架**：Vue 3
- **构建工具**：Vue CLI
- **AI检测**：百度AI车辆识别API
- **语音合成**：Web Speech API
- **摄像头**：MediaDevices API
- **样式**：原生CSS + CSS变量

## 📁 项目结构

```
car-ultra-vue/
├── public/
│   ├── index.html
│   └── favicon.ico
├── src/
│   ├── App.vue          # 主应用组件
│   ├── main.js          # 应用入口
│   └── assets/          # 静态资源
├── vue.config.js        # Vue CLI配置
├── package.json         # 项目配置
└── README.md           # 项目说明
```

## ⚙️ 配置说明

### HTTPS配置

摄像头访问需要HTTPS环境，开发时自动启用HTTPS：

```javascript
devServer: {
  https: true,
  host: '0.0.0.0',
  port: 8080
}
```

### 百度AI配置

在`src/App.vue`中配置你的百度AI密钥：

```javascript
const CAR_API_KEY = "your_api_key";
const CAR_SECRET_KEY = "your_secret_key";
```

## 📋 浏览器兼容性

- Chrome 56+ ✅
- Safari 11+ ✅
- Firefox 50+ ✅
- Edge 79+ ✅

**注意**：需要支持以下API：
- MediaDevices.getUserMedia()
- Web Speech API
- Canvas API
- Fetch API

## 🔧 常见问题

### Q: 摄像头无法访问？
A: 请确保使用HTTPS访问，并在浏览器中允许摄像头权限。

### Q: 语音播放无效？
A: 检查浏览器是否支持Web Speech API，部分浏览器需要用户交互后才能播放语音。

### Q: 照片上传失败？
A: 目前使用mock上传，实际部署时需要配置真实的上传接口。

### Q: 在移动设备上访问？
A: 可以在同一局域网下通过IP地址访问，如：`https://192.168.1.100:8080`

## 🎯 开发指南

### 添加新的拍摄角度

在`steps`数组中添加新的配置：

```javascript
{
  title: '新角度',
  desc: '请将车辆调整到指定角度',
  rotation: '270deg',
  expectedAngle: 'custom_angle',
  voice: '请拍摄新角度'
}
```

### 自定义检测逻辑

在`analyzeAlignment`方法中修改车辆检测和对齐逻辑。

### 修改UI样式

所有样式都在`App.vue`的`<style>`标签中，使用CSS变量便于主题定制。

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交Issue和Pull Request！

---

**注意**：本项目仅用于演示目的，生产环境使用时请确保API密钥安全，并配置适当的后端服务。
