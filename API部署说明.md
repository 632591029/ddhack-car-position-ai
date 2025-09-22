# 🚀 API部署和CORS解决方案

## 🔧 当前开发状态

### 开发模式 (推荐)
```javascript
const USE_MOCK_API = true; // 使用Mock数据，不调用真实API
```
- ✅ 完全本地运行，无CORS问题
- ✅ 不消耗API配额
- ✅ 可以模拟各种检测状态
- ✅ 适合UI/UX调试

### 生产模式的CORS问题

前端直接调用百度API会遇到：
1. **CORS跨域限制** - 浏览器安全策略阻止
2. **密钥暴露** - API密钥会暴露在前端代码中
3. **配额管理困难** - 无法控制调用频率

## 🛠️ 解决方案

### 方案1: 后端代理 (推荐)

创建后端API服务：

**Node.js Express示例:**
```javascript
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// 获取百度访问令牌
app.post('/api/baidu/token', async (req, res) => {
  try {
    const response = await axios.post('https://aip.baidubce.com/oauth/2.0/token',
      `grant_type=client_credentials&client_id=${process.env.BAIDU_API_KEY}&client_secret=${process.env.BAIDU_SECRET_KEY}`,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 车辆检测代理
app.post('/api/baidu/vehicle-detect', async (req, res) => {
  try {
    const { image, access_token } = req.body;
    const response = await axios.post(
      `https://aip.baidubce.com/rest/2.0/image-classify/v1/vehicle_detect?access_token=${access_token}`,
      `image=${encodeURIComponent(image)}&top_num=1&baike_num=0`,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3001);
```

**前端调用:**
```javascript
// 获取token
const tokenResponse = await fetch('/api/baidu/token', { method: 'POST' });
const { access_token } = await tokenResponse.json();

// 车辆检测
const detectResponse = await fetch('/api/baidu/vehicle-detect', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ image: base64Image, access_token })
});
```

### 方案2: Serverless函数

**Vercel/Netlify函数:**
```javascript
// api/baidu-proxy.js
export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const response = await fetch('https://aip.baidubce.com/oauth/2.0/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=client_credentials&client_id=${process.env.BAIDU_API_KEY}&client_secret=${process.env.BAIDU_SECRET_KEY}`
      });

      const data = await response.json();
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}
```

### 方案3: 浏览器扩展 (仅开发测试)

**Chrome扩展禁用CORS:**
```bash
# MacOS
open -n -a /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --args --user-data-dir="/tmp/chrome_dev_sess" --disable-web-security

# Windows
chrome.exe --user-data-dir="c:/chrome-dev-session" --disable-web-security
```

## 🎯 当前最佳实践

### 开发阶段
1. 使用 `USE_MOCK_API = true`
2. 专注UI/UX开发
3. 模拟各种检测场景

### 部署阶段
1. 搭建后端API代理服务
2. 环境变量管理密钥
3. 设置 `USE_MOCK_API = false`
4. 更新API调用地址

### 命令行联调工具

仓库提供 `scripts/baidu-detect.cjs`，可直接在本地命令行读取图片、获取 access token 并完成车辆识别，示例：

```bash
export BAIDU_API_KEY=xxx
export BAIDU_SECRET_KEY=yyy
npm run detect:baidu -- --image ~/Pictures/right-front.jpg --expected 0.08,0.24,0.84,0.54
```

脚本会输出百度返回的原始 `location` 坐标，并调用与前端一致的 `analyzeAlignment` 逻辑给出对齐评分和提示，便于快速验证完整流程。

## 🔐 安全建议

- ✅ API密钥存储在后端环境变量
- ✅ 实施API调用频率限制
- ✅ 添加用户认证机制
- ✅ 监控API使用量和成本
- ❌ 避免在前端暴露敏感信息

## 📊 Mock vs Real对比

| 特性 | Mock模式 | Real模式 |
|------|----------|----------|
| 开发速度 | ✅ 快速 | ⚠️ 需要配置 |
| API消耗 | ✅ 无消耗 | ❌ 消耗配额 |
| 真实性 | ⚠️ 模拟数据 | ✅ 真实检测 |
| 调试便利 | ✅ 可控状态 | ⚠️ 不可控 |
| CORS问题 | ✅ 无问题 | ❌ 需要代理 |

目前建议继续使用Mock模式完成功能开发，后续再配置生产环境的API代理服务。