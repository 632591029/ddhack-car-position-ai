const DEFAULT_THRESHOLDS = {
  matchedConfidence: 0.70, // 降低阈值，以完整车辆为主
  goodConfidence: 0.60,
  adjustConfidence: 0.45,
  matchedIoU: 0.50  // 降低IoU要求，注重车辆完整性而非精确对准
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeBox(box) {
  if (!box) {
    return null;
  }

  const x = clamp(typeof box.x === 'number' ? box.x : 0, 0, 1);
  const y = clamp(typeof box.y === 'number' ? box.y : 0, 0, 1);
  const width = clamp(typeof box.width === 'number' ? box.width : 0.02, 0.02, 1 - x);
  const height = clamp(typeof box.height === 'number' ? box.height : 0.02, 0.02, 1 - y);

  return { x, y, width, height };
}

function computeIoU(boxA, boxB) {
  if (!boxA || !boxB) {
    return 0;
  }

  const left = Math.max(boxA.x, boxB.x);
  const top = Math.max(boxA.y, boxB.y);
  const right = Math.min(boxA.x + boxA.width, boxB.x + boxB.width);
  const bottom = Math.min(boxA.y + boxA.height, boxB.y + boxB.height);

  if (right <= left || bottom <= top) {
    return 0;
  }

  const intersection = (right - left) * (bottom - top);
  const areaA = boxA.width * boxA.height;
  const areaB = boxB.width * boxB.height;
  const union = areaA + areaB - intersection;

  if (union <= 0) {
    return 0;
  }

  return intersection / union;
}

function getAdjustmentHint(offsetX, offsetY, areaRatio) {
  const hints = [];

  // 注意：offsetX = 实际中心 - 期望中心
  // 若 offsetX>0 表示车辆偏右，应提示“向右调整一点”（与用户直觉一致）
  if (offsetX > 0.02) {
    hints.push('向右调整一点');
  } else if (offsetX < -0.02) {
    hints.push('向左调整一点');
  }

  if (offsetY > 0.02) {
    hints.push('稍微降低镜头');
  } else if (offsetY < -0.02) {
    hints.push('稍微抬高镜头');
  }

  if (areaRatio < 0.85) {
    hints.push('靠近车辆一些');
  } else if (areaRatio > 1.2) {
    hints.push('后退一步');
  }

  return hints.length ? hints.join('，') : '保持稳定，微调即可';
}


function analyzeAlignment(detection, expectedRegion, options = {}) {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...options.thresholds };

  if (!detection || !detection.hasVehicle || !detection.bbox) {
    return {
      hasVehicle: false,
      confidence: 0,
      frameStatus: 'detecting',
      message: '未检测到车辆，请移动手机对准车身',
      detectionBox: null,
      metrics: null
    };
  }

  const expected = normalizeBox(expectedRegion);
  const actual = normalizeBox(detection.bbox);

  if (!expected || !actual) {
    return {
      hasVehicle: false,
      confidence: 0,
      frameStatus: 'detecting',
      message: '未检测到车辆，请移动手机对准车身',
      detectionBox: null,
      metrics: null
    };
  }

  const expectedCenterX = expected.x + expected.width / 2;
  const expectedCenterY = expected.y + expected.height / 2;
  const actualCenterX = actual.x + actual.width / 2;
  const actualCenterY = actual.y + actual.height / 2;

  const offsetX = actualCenterX - expectedCenterX;
  const offsetY = actualCenterY - expectedCenterY;
  const areaRatio = (actual.width * actual.height) / (expected.width * expected.height);
  // 尺寸惩罚适度收敛，避免“稍小/稍大”时被过度惩罚
  const sizePenalty = Math.min(Math.abs(Math.log(areaRatio)), 0.6);
  const centerPenalty = Math.sqrt(offsetX * offsetX + offsetY * offsetY);
  const iou = computeIoU(actual, expected);
  const baseScore = typeof detection.score === 'number' ? detection.score : 0.65;

  const alignmentScore = Math.max(0, 1 - centerPenalty * 2.8 - sizePenalty * 0.8); // 提高惩罚强度，更严格

  // 改进置信度计算：更重视车辆完整性，适当放松对齐要求
  const areaBonus = areaRatio >= 0.8 && areaRatio <= 1.3 ? 0.15 : 0; // 完整车辆奖励
  const iouBonus = iou > 0.5 ? Math.min(0.10, (iou - 0.5) * 0.3) : 0; // 降低IoU奖励门槛
  const confidence = Math.max(0, Math.min(1,
    baseScore * 0.40 +          // 提高基础检测分数权重
    alignmentScore * 0.25 +     // 降低对齐分数权重，不要太严格
    iou * 0.25 +               // 降低IoU权重
    areaBonus +                // 完整车辆奖励
    iouBonus                   // IoU奖励
  ));

  let frameStatus = 'detecting';
  let message = '请继续调整位置';

  if (confidence >= thresholds.matchedConfidence && iou > thresholds.matchedIoU) {
    frameStatus = 'matched';
    message = '位置优秀，可以拍照';
  } else if (confidence >= thresholds.goodConfidence) {
    frameStatus = 'good';
    message = '位置良好，保持稳定';
  } else if (confidence >= thresholds.adjustConfidence) {
    frameStatus = 'adjust';
    message = getAdjustmentHint(offsetX, offsetY, areaRatio);
  } else {
    frameStatus = 'detecting';
    message = getAdjustmentHint(offsetX, offsetY, areaRatio);
  }

  return {
    hasVehicle: true,
    confidence,
    frameStatus,
    message,
    detectionBox: actual,
    metrics: {
      offsetX,
      offsetY,
      areaRatio,
      iou,
      baseScore,
      alignmentScore
    }
  };
}

module.exports = {
  analyzeAlignment,
  computeIoU,
  getAdjustmentHint,
  normalizeBox,
  DEFAULT_THRESHOLDS
};
