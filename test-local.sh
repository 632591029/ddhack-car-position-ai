#!/bin/bash

# 设置百度API密钥（从代码中读取）
export BAIDU_API_KEY="iq9EVHlacJwRarx9cmy7VzXl"
export BAIDU_SECRET_KEY="ZqTw4y1denK2RS3SsD9VACpvIDNua0OF"

echo "🚗 车辆检测本地测试"
echo "========================"

# 检查图片参数
if [ "$1" == "" ]; then
    echo "用法: ./test-local.sh 图片路径 [预期区域]"
    echo "示例: ./test-local.sh car.jpg"
    echo "示例: ./test-local.sh car.jpg 0.05,0.20,0.90,0.60"
    exit 1
fi

IMAGE_PATH="$1"
EXPECTED_REGION="${2:-0.05,0.20,0.90,0.60}"

echo "📸 测试图片: $IMAGE_PATH"
echo "📍 预期区域: $EXPECTED_REGION"
echo "🔍 调用百度API检测..."
echo ""

# 调用百度检测脚本
node scripts/baidu-detect.cjs --image "$IMAGE_PATH" --expected "$EXPECTED_REGION"

echo ""
echo "✅ 测试完成!"
echo "💡 如果要调整预期区域，修改上面的坐标参数"