#!/usr/bin/env node
/*
 * 使用百度车辆识别API进行一次真实检测，并可选校验与引导框的匹配情况。
 * 调用前请设置环境变量：
 *   export BAIDU_API_KEY=xxxx
 *   export BAIDU_SECRET_KEY=yyyy
 *
 * 运行示例：
 *   node scripts/baidu-detect.cjs --image samples/car.jpg --expected 0.08,0.24,0.84,0.54
 */

const fs = require('fs');
const path = require('path');
const { analyzeAlignment } = require('../src/utils/alignment');

const API_KEY = process.env.BAIDU_API_KEY;
const SECRET_KEY = process.env.BAIDU_SECRET_KEY;

function parseArgs(argv) {
  const options = { expected: [0.08, 0.24, 0.84, 0.54], align: true };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--image' && i + 1 < argv.length) {
      options.image = argv[++i];
    } else if (arg.startsWith('--image=')) {
      options.image = arg.split('=')[1];
    } else if (arg === '--expected' && i + 1 < argv.length) {
      options.expected = argv[++i].split(',').map(Number);
    } else if (arg.startsWith('--expected=')) {
      options.expected = arg.split('=')[1].split(',').map(Number);
    } else if (arg === '--no-align') {
      options.align = false;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }

  return options;
}

function printHelp() {
  console.log(`用法：node scripts/baidu-detect.cjs --image /path/to/photo.jpg [--expected x,y,width,height] [--no-align]`);
  console.log('\n环境变量：BAIDU_API_KEY / BAIDU_SECRET_KEY');
}

function loadImageBase64(imagePath) {
  const absolute = path.resolve(process.cwd(), imagePath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`图片文件不存在: ${absolute}`);
  }
  const buffer = fs.readFileSync(absolute);
  return buffer.toString('base64');
}

async function fetchAccessToken() {
  if (!API_KEY || !SECRET_KEY) {
    throw new Error('请先配置 BAIDU_API_KEY 和 BAIDU_SECRET_KEY 环境变量');
  }

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: API_KEY,
    client_secret: SECRET_KEY
  });

  const response = await fetch('https://aip.baidubce.com/oauth/2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`获取token失败：${response.status} ${text}`);
  }

  const data = await response.json();
  if (!data.access_token) {
    throw new Error(`返回token异常：${JSON.stringify(data)}`);
  }

  return data.access_token;
}

async function detectVehicle(accessToken, imageBase64) {
  const params = new URLSearchParams({
    image: imageBase64,
    top_num: '1',
    baike_num: '0'
  });

  const response = await fetch(`https://aip.baidubce.com/rest/2.0/image-classify/v1/vehicle_detect?access_token=${accessToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`车辆检测失败：${response.status} ${text}`);
  }

  return response.json();
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help || !options.image) {
    printHelp();
    process.exit(options.help ? 0 : 1);
  }

  const expectedBox = options.expected && options.expected.length === 4
    ? { x: options.expected[0], y: options.expected[1], width: options.expected[2], height: options.expected[3] }
    : null;

  try {
    console.log('读取图片并编码...');
    const imageBase64 = loadImageBase64(options.image);

    console.log('获取百度Access Token...');
    const token = await fetchAccessToken();
    console.log('调用车辆识别API...');
    const result = await detectVehicle(token, imageBase64);

    if (!result.vehicle_info || !result.vehicle_info.length) {
      console.log('未检测到车辆。原始响应：', JSON.stringify(result));
      return;
    }

    // 选择面积最大的车辆
    const vehicles = result.vehicle_info.filter(v => v.type === 'car');
    if (!vehicles.length) {
      console.log('未检测到car类型车辆');
      return;
    }

    const vehicle = vehicles.reduce((maxVehicle, current) => {
      const maxArea = maxVehicle.location.width * maxVehicle.location.height;
      const currentArea = current.location.width * current.location.height;
      return currentArea > maxArea ? current : maxVehicle;
    });

    console.log('选择的车辆（面积最大）：', JSON.stringify(vehicle, null, 2));

    if (options.align && expectedBox) {
      const analysis = analyzeAlignment(
        {
          hasVehicle: true,
          bbox: vehicle.location,
          score: vehicle.score
        },
        expectedBox
      );

      console.log('\n对齐校验：');
      console.log(`状态=${analysis.frameStatus} 置信度=${analysis.confidence.toFixed(3)} IoU=${analysis.metrics.iou.toFixed(3)}`);
      console.log('提示：', analysis.message);
    }
  } catch (error) {
    console.error('调用失败：', error.message || error);
    process.exit(1);
  }
}

main();
