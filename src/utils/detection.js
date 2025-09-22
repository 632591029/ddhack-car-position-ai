/**
 * 基于边缘像素的车辆区域粗检测算法，供前端实时检测和离线校验复用。
 *
 * @param {ImageData | { data: Uint8ClampedArray | Buffer, width: number, height: number }} imageData
 * @param {{ x: number, y: number, width: number, height: number }} expectedRegion
 * @param {{ margin?: number, threshold?: number, sampleStep?: number }} [options]
 * @returns {{ hasVehicle: boolean, bbox?: { x: number, y: number, width: number, height: number }, score?: number, meta?: Record<string, number> }}
 */
function detectVehicleEdges(imageData, expectedRegion, options = {}) {
  if (!imageData || !imageData.data || !expectedRegion) {
    return { hasVehicle: false };
  }

  const { data, width, height } = imageData;

  if (!width || !height) {
    return { hasVehicle: false };
  }

  const margin = options.margin != null ? options.margin : 0.03;
  const threshold = options.threshold != null ? options.threshold : 36;
  const step = options.sampleStep != null ? options.sampleStep : 2;

  const startX = Math.max(1, Math.floor((expectedRegion.x - margin) * width));
  const endX = Math.min(width - 2, Math.floor((expectedRegion.x + expectedRegion.width + margin) * width));
  const startY = Math.max(1, Math.floor((expectedRegion.y - margin) * height));
  const endY = Math.min(height - 2, Math.floor((expectedRegion.y + expectedRegion.height + margin) * height));

  if (startX >= endX || startY >= endY) {
    return { hasVehicle: false };
  }

  let minX = endX;
  let maxX = startX;
  let minY = endY;
  let maxY = startY;
  let edgePixels = 0;

  for (let y = startY; y < endY; y += step) {
    const rowOffset = y * width * 4;
    for (let x = startX; x < endX; x += step) {
      const index = rowOffset + x * 4;
      const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
      const rightGray = data[index + 4] * 0.299 + data[index + 5] * 0.587 + data[index + 6] * 0.114;
      const downGray = data[index + width * 4] * 0.299 + data[index + width * 4 + 1] * 0.587 + data[index + width * 4 + 2] * 0.114;

      const diff = Math.max(Math.abs(gray - rightGray), Math.abs(gray - downGray));

      if (diff > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        edgePixels++;
      }
    }
  }

  const regionArea = Math.max(1, (endX - startX) * (endY - startY));
  const minimumEdgePixels = Math.max(120, regionArea * 0.003);

  if (edgePixels < minimumEdgePixels || minX >= maxX || minY >= maxY) {
    return {
      hasVehicle: false,
      meta: {
        edgePixels,
        regionArea
      }
    };
  }

  const widthPixels = Math.max(12, maxX - minX);
  const heightPixels = Math.max(12, maxY - minY);

  const bbox = {
    x: minX / width,
    y: minY / height,
    width: widthPixels / width,
    height: heightPixels / height
  };

  const density = edgePixels / regionArea;
  const score = Math.max(0.45, Math.min(0.95, density * 3.6));

  return {
    hasVehicle: true,
    bbox,
    score,
    meta: {
      edgePixels,
      density,
      threshold,
      sampleStep: step
    }
  };
}

module.exports = {
  detectVehicleEdges
};
