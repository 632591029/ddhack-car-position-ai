# 车辆照片采集系统 🚗📸

一个基于Vue.js的AI车辆照片采集系统，支持四角度智能拍摄、实时检测和语音指导。

## ✨ 功能特性

- 🎯 **四角度拍摄**：左前、右前、右后、左后四个关键角度一键采集
- 🧭 **虚线车身轮廓**：使用出题方提供的四套参考轮廓 PNG，保证司机看到的引导与验车要求一致
- 🤖 **本地智能检测**：基于边缘分析的轻量级检测逻辑，调试阶段无需消耗云端配额
- ☁️ **可选百度识别**：支持切换到百度车辆识别API，生产环境下可获得更稳健的识别结果
- 🔊 **语音指导**：每一步均有语音提示，减少司机记忆负担
- 📷 **照片质量自检**：模糊度、亮度实时评估，确保上传照片可用
- 📱 **移动端优化**：全屏沉浸式界面，支持安全区内边距

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

## 🧪 调试与验证

- `npm run test:alignment`：使用与前端完全一致的对齐打分逻辑，批量校验 `tests/alignment-cases.json` 中的示例检测框是否能得到正确状态。
- `npm run detect:baidu`：在设置好 `BAIDU_API_KEY` 与 `BAIDU_SECRET_KEY` 后，调用真实的百度车辆识别API，并输出原始检测框及与虚线引导框的匹配结果。（需要手动准备图片路径）
- 在 `src/App.vue` 将 `USE_SAMPLE_IMAGE_DEBUG` 设为 `true` 可直接加载提供的样例车辆图片（无需相机），观察完整的检测与提示流程，避免频繁消耗 API 调用额度。

> 提示：`scripts/baidu-detect.cjs` 会自动读取图片、申请 access token、调用车辆检测接口，并使用 `src/utils/alignment.js` 中的同一套算法给出匹配提示，可直接用于线下真机测试。

## 🖼️ 示例素材

- **车辆引导轮廓**：
  - 左前侧：`https://s3-gz01.didistatic.com/packages-mait/img/RC5OtnR65N1758512045195.png`
  - 右前侧：`https://s3-gz01.didistatic.com/packages-mait/img/vPFvw45BoX1758512045345.png`
  - 右后侧：`https://s3-gz01.didistatic.com/packages-mait/img/2OquYrEZxI1758512044128.png`
  - 左后侧：`https://s3-gz01.didistatic.com/packages-mait/img/Kd0C5rriZv1758512044096.png`
- **样例车辆图片**：`https://s3-gz01.didistatic.com/packages-mait/img/w0VyxKMAgG1758512666365.png`
  - 直接开启 `USE_SAMPLE_IMAGE_DEBUG` 时会自动加载，用于在桌面环境复现完整流程。
  - 若希望离线保存，可下载至 `tests/fixtures/` 目录配合脚本或自定义实验使用。

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
- **实时检测**：Canvas 边缘检测（默认） / 百度车辆识别API（可切换）
- **语音合成**：Web Speech API
- **摄像头**：MediaDevices API
- **样式**：原生 CSS + 自适应布局

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

### 检测模式配置

项目默认使用**本地边缘检测**，调试阶段不会消耗任何云端配额。如需启用百度车辆识别API，在 `src/App.vue` 顶部调整开关：

```javascript
const USE_BAIDU_API = true; // 默认为 false
```

同时将 `CAR_API_KEY` 和 `CAR_SECRET_KEY` 修改为你的百度智能云密钥。生产环境推荐通过后端代理隐藏密钥，详细方案见 `API部署说明.md`。

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
