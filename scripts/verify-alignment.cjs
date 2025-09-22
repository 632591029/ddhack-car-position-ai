#!/usr/bin/env node
/*
 * 简单的对齐逻辑校验脚本，使用与前端一致的计算公式。
 * 运行方式：npm run test:alignment
 */

const fs = require('fs');
const path = require('path');
const { analyzeAlignment } = require('../src/utils/alignment');

const casesPath = path.resolve(__dirname, '..', 'tests', 'alignment-cases.json');
const cases = JSON.parse(fs.readFileSync(casesPath, 'utf-8'));

let failed = 0;

cases.forEach(testCase => {
  const { detection, expected, expectedStatus, name } = testCase;
  const result = analyzeAlignment(detection, expected);

  const statusMatched = result.frameStatus === expectedStatus;

  if (!statusMatched) {
    failed++;
    console.error(`❌ ${name} 状态不符，期望 ${expectedStatus}，实际 ${result.frameStatus}`);
    console.error(`   置信度=${result.confidence.toFixed(3)} IoU=${result.metrics ? result.metrics.iou.toFixed(3) : 'N/A'}`);
  } else {
    console.log(`✅ ${name} -> ${result.frameStatus} (置信度=${result.confidence.toFixed(3)})`);
  }
});

if (failed > 0) {
  console.error(`\n共发现 ${failed} 个对齐逻辑异常，请检查检测参数和期望区域设置。`);
  process.exit(1);
}

console.log(`\n全部 ${cases.length} 个样例通过对齐校验。`);
