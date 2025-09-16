<template>
  <div class="app-container">
    <!-- 加载界面 -->
    <div v-if="isLoading" class="loading-overlay">
      <div class="spinner"></div>
      <div>正在初始化摄像头...</div>
    </div>

    <!-- 简洁头部：进度条 + 大字提示 -->
    <div class="header-simple" v-show="!isLoading">
      <!-- 四步骤进度条 -->
      <div class="progress-steps">
        <div
          v-for="(step, index) in steps"
          :key="index"
          class="step-item"
          :class="{
            active: index === currentStepIndex,
            completed: capturedPhotos[index]
          }"
        >
          <div class="step-dot"></div>
          <div class="step-label">{{ step.title }}</div>
        </div>
      </div>

      <!-- 大字提示 -->
      <div class="main-instruction">
        {{ currentStep.desc }}
      </div>
    </div>

    <!-- 摄像头 -->
    <div class="camera-container" v-show="!isLoading">
      <video ref="videoRef" id="videoElement" autoplay playsinline muted></video>

      <!-- 车辆指导框 - 能容纳真实车辆的大框 -->
      <div class="overlay">
        <div class="vehicle-guide-frame">
          <!-- 大尺寸车辆轮廓指导框 - 固定使用第一步图片 -->
          <div class="car-frame-large"></div>
        </div>
      </div>
    </div>

    <!-- 控制按钮 -->


    <!-- 语音提示 -->
    <div class="voice-hint" :class="{ show: showVoiceHint }">
      {{ voiceHintText }}
    </div>

    <!-- 结果界面 -->
    <div class="results-modal" :class="{ show: showResultsModal }">
      <div class="results-header">
        <h2>拍摄结果</h2>
        <p>已完成 {{ Object.keys(capturedPhotos).length }} / 4 张</p>
      </div>

      <div class="results-content">
        <div class="photo-grid">
          <div v-for="(step, index) in steps" :key="index" class="photo-item">
            <img
              v-if="capturedPhotos[index]"
              :src="capturedPhotos[index]"
              class="photo-preview"
            >
            <div v-else class="photo-preview">
              未拍摄
            </div>
            <div class="photo-label">{{ step.title }}</div>
          </div>
        </div>
      </div>

      <div class="results-actions">
        <button class="btn btn-secondary" @click="closeResults">
          继续拍摄
        </button>
        <button
          class="btn btn-primary"
          @click="submitPhotos"
          :disabled="Object.keys(capturedPhotos).length < 4"
        >
          提交照片
        </button>
      </div>
    </div>
  </div>
</template>

<script>
// 百度AI配置 - 使用真实API
// eslint-disable-next-line no-unused-vars
const CAR_API_KEY = "iq9EVHlacJwRarx9cmy7VzXl";
// eslint-disable-next-line no-unused-vars
const CAR_SECRET_KEY = "ZqTw4y1denK2RS3SsD9VACpvIDNua0OF";

export default {
  name: 'App',
  data() {
    return {
      isLoading: true,
      currentStepIndex: 0,
      capturedPhotos: {},
      frameStatus: 'detecting',
      confidence: 0,
      statusText: '',
      showVoiceHint: false,
      voiceHintText: '',
      showResultsModal: false,
      isDetecting: false,
      accessToken: null,
      detectionTimer: null,
      stream: null,
      lastGoodDetectionTime: null,

      steps: [
        {
          title: '左前侧',
          desc: '已成功识别',
          rotation: '0deg',
          expectedAngle: 'front_left',
          voice: '请对准车辆左前侧'
        },
        {
          title: '右前侧',
          desc: '已成功识别',
          rotation: '45deg',
          expectedAngle: 'front_right',
          voice: '请对准车辆右前侧'
        },
        {
          title: '右后侧',
          desc: '已成功识别',
          rotation: '135deg',
          expectedAngle: 'rear_right',
          voice: '请对准车辆右后侧'
        },
        {
          title: '左后侧',
          desc: '已成功识别',
          rotation: '180deg',
          expectedAngle: 'rear_left',
          voice: '请对准车辆左后侧'
        }
      ]
    };
  },

  computed: {
    currentStep() {
      return this.steps[this.currentStepIndex];
    },

    isReadyToCapture() {
      return this.frameStatus === 'matched' && this.confidence > 0.8;
    }
  },

  async mounted() {
    await this.initApp();
  },

  beforeUnmount() {
    this.cleanup();
  },

  methods: {
    async initApp() {
      try {
        await this.getBaiduAccessToken();
        await this.initCamera();
        // this.startDetection();

        this.isLoading = false;
        this.playVoice(this.currentStep.voice);

      } catch (error) {
        console.error('初始化失败:', error);
        alert('初始化失败: ' + error.message);
        this.isLoading = false;
      }
    },

    async getBaiduAccessToken() {
      try {
        console.log('🔑 正在获取百度API访问令牌...');
        
        // 获取访问令牌的API调用 - 通过代理避免CORS
        const response = await fetch('/api/oauth/2.0/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `grant_type=client_credentials&client_id=${CAR_API_KEY}&client_secret=${CAR_SECRET_KEY}`
        });

        const result = await response.json();
        
        if (result.access_token) {
          this.accessToken = result.access_token;
          console.log('✅ 成功获取访问令牌');
          console.log(`令牌有效期: ${result.expires_in} 秒`);
        } else {
          throw new Error('获取访问令牌失败: ' + JSON.stringify(result));
        }

      } catch (error) {
        console.error('❌ 获取访问令牌失败:', error);
        alert('获取百度API访问令牌失败，请检查网络连接和API密钥');
        throw error;
      }
    },

    async initCamera() {
      try {
        const constraints = {
          video: {
            facingMode: 'environment',
            width: { ideal: 1920, max: 1920 },
            height: { ideal: 1080, max: 1080 }
          }
        };

        this.stream = await navigator.mediaDevices.getUserMedia(constraints);
        this.$refs.videoRef.srcObject = this.stream;

        await new Promise((resolve) => {
          this.$refs.videoRef.onloadedmetadata = resolve;
        });

      } catch (error) {
        throw new Error('无法访问摄像头: ' + error.message);
      }
    },

    startDetection() {
      this.isDetecting = true;
      this.frameStatus = 'detecting';
      this.statusText = '正在检测车辆...';

      this.detectionTimer = setTimeout(() => {
        this.detectVehicleAlignment();
      }, 500);
    },

    stopDetection() {
      if (this.detectionTimer) {
        clearInterval(this.detectionTimer);
        this.detectionTimer = null;
      }
      this.isDetecting = false;
    },

    async detectVehicleAlignment() {
      if (!this.isDetecting || !this.$refs.videoRef) return;

      try {
        console.log('🚀 调用百度车辆检测API...');
        const imageData = this.captureFrame();
        const detectionResult = await this.callBaiduVehicleAPI(imageData);
        const alignmentResult = this.analyzeAlignment(detectionResult);
        this.updateDetectionStatus(alignmentResult);

      } catch (error) {
        console.error('❌ 车辆检测失败:', error);
        // 如果API调用失败，使用备用检测逻辑
        this.useMockDetection();
      }
    },

    captureFrame() {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const video = this.$refs.videoRef;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);

      return canvas.toDataURL('image/jpeg', 0.8);
    },

    async callBaiduVehicleAPI(imageData) {
      const base64Image = imageData.split(',')[1];

      // 使用代理路径避免CORS问题
      const response = await fetch(`/api/baidu/rest/2.0/image-classify/v1/vehicle_detect?access_token=${this.accessToken}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `image=${encodeURIComponent(base64Image)}&top_num=1&baike_num=0`
      });

      const result = await response.json();
      console.log('🤖 百度API检测结果:', result);
      return result;
    },


    analyzeAlignment(detectionResult) {
      if (!detectionResult.result || !detectionResult.result.length) {
        return {
          hasVehicle: false,
          confidence: 0,
          alignment: 'none',
          message: '未检测到车辆'
        };
      }

      const vehicle = detectionResult.result[0];
      const vehicleScore = vehicle.score || 0;

      const location = vehicle.location;
      if (!location) {
        return {
          hasVehicle: true,
          confidence: vehicleScore,
          alignment: 'poor',
          message: '无法确定车辆位置'
        };
      }

      const centerX = location.left + location.width / 2;
      const centerY = location.top + location.height / 2;
      const vehicleWidth = location.width;
      const vehicleHeight = location.height;

      const idealCenterX = 0.5;
      const idealCenterY = 0.5;
      const tolerance = 0.15;

      const offsetX = Math.abs(centerX - idealCenterX);
      const offsetY = Math.abs(centerY - idealCenterY);

      let alignmentScore = 1.0;

      if (offsetX > tolerance) alignmentScore -= (offsetX - tolerance) * 2;
      if (offsetY > tolerance) alignmentScore -= (offsetY - tolerance) * 2;

      const vehicleArea = vehicleWidth * vehicleHeight;
      const idealArea = 0.4;
      const areaDiff = Math.abs(vehicleArea - idealArea);
      if (areaDiff > 0.2) alignmentScore -= areaDiff;

      const angleScore = this.evaluateVehicleAngle(vehicle, this.currentStep.expectedAngle);
      alignmentScore *= angleScore;

      const finalConfidence = Math.max(0, Math.min(1, alignmentScore * vehicleScore));

      let alignment, message;
      if (finalConfidence > 0.8) {
        alignment = 'perfect';
        message = '车辆位置完美！';
      } else if (finalConfidence > 0.6) {
        alignment = 'good';
        message = '位置良好，可以拍照';
      } else if (finalConfidence > 0.3) {
        alignment = 'adjusting';
        message = this.getAdjustmentHint(offsetX, offsetY, vehicleArea);
      } else {
        alignment = 'poor';
        message = '请重新调整车辆位置';
      }

      return {
        hasVehicle: true,
        confidence: finalConfidence,
        alignment,
        message
      };
    },

    evaluateVehicleAngle(vehicle, expectedAngle) {
      const attributes = vehicle.attributes || {};
      let angleScore = 0.7;

      switch (expectedAngle) {
        case 'front':
          if (attributes.front_view_score) {
            angleScore = attributes.front_view_score;
          }
          break;
        case 'front_right':
          if (attributes.angle_score) {
            angleScore = attributes.angle_score * 0.9;
          }
          break;
        case 'rear_right':
          angleScore = Math.random() * 0.3 + 0.6;
          break;
        case 'left_side':
          angleScore = Math.random() * 0.4 + 0.5;
          break;
        default:
          angleScore = 0.7;
      }

      return Math.max(0.3, Math.min(1.0, angleScore));
    },

    getAdjustmentHint(offsetX, offsetY, vehicleArea) {
      const hints = [];

      if (offsetX > 0.1) {
        hints.push(offsetX > 0.5 ? '请向左移动' : '请稍微向左调整');
      } else if (offsetX < -0.1) {
        hints.push(offsetX < -0.5 ? '请向右移动' : '请稍微向右调整');
      }

      if (offsetY > 0.1) {
        hints.push('请降低镜头高度');
      } else if (offsetY < -0.1) {
        hints.push('请抬高镜头高度');
      }

      if (vehicleArea < 0.2) {
        hints.push('请靠近一些');
      } else if (vehicleArea > 0.6) {
        hints.push('请距离远一些');
      }

      return hints.length > 0 ? hints.join('，') : '请调整车辆位置';
    },

    updateDetectionStatus(result) {
      this.confidence = result.confidence;
      this.statusText = result.message;

      console.log('🎯 检测状态更新:', {
        confidence: result.confidence,
        alignment: result.alignment,
        message: result.message
      });

      if (!result.hasVehicle) {
        this.frameStatus = 'detecting';
      } else if (result.alignment === 'perfect' || result.alignment === 'good') {
        this.frameStatus = 'matched';
      } else if (result.alignment === 'adjusting') {
        this.frameStatus = 'detecting';
      } else {
        this.frameStatus = 'misaligned';
      }

      // 暂时关闭自动拍摄，等待后续图片
      if (result.confidence > 0.8 && this.frameStatus === 'matched') {
        if (!this.lastGoodDetectionTime || Date.now() - this.lastGoodDetectionTime > 3000) {
          this.playVoice('位置很好，识别成功');
          this.lastGoodDetectionTime = Date.now();
          // 暂时不自动拍照，等待手动控制
          console.log('✅ 检测成功，等待手动控制下一步');
        }
      }
    },

    useMockDetection() {
      const mockStates = [
        { confidence: 0.3, alignment: 'adjusting', message: '请调整车辆位置' },
        { confidence: 0.6, alignment: 'good', message: '位置不错，继续调整' },
        { confidence: 0.85, alignment: 'perfect', message: '位置完美，可以拍照！' }
      ];

      const randomState = mockStates[Math.floor(Math.random() * mockStates.length)];
      this.updateDetectionStatus({
        hasVehicle: true,
        ...randomState
      });
    },


    async handleCapture() {
      if (!this.isReadyToCapture) {
        console.log('⚠️ 车辆位置未就绪，等待对准边框');
        return;
      }

      try {
        console.log('📸 开始自动拍摄流程');
        this.stopDetection();

        const imageData = this.captureFrame();
        const qualityResult = await this.checkPhotoQuality();

        console.log('🔍 照片质量检测结果:', qualityResult);

        if (qualityResult.passed) {
          this.capturedPhotos[this.currentStepIndex] = imageData;
          this.playVoice('照片已保存');
          console.log(`✅ 照片${this.currentStepIndex + 1}已保存`, this.currentStep.title);

          setTimeout(() => {
            this.nextStep();
          }, 1000);
        } else {
          this.playVoice(`照片质量不合格：${qualityResult.reason}`);
          console.log('❌ 照片质量不合格:', qualityResult.reason);
          setTimeout(() => {
            this.startDetection();
          }, 2000);
        }

      } catch (error) {
        console.error('❌ 拍照失败:', error);
        this.playVoice('拍照失败，请重试');
        this.startDetection();
      }
    },

    async checkPhotoQuality() {
      try {
        return this.mockQualityCheck();
      } catch (error) {
        console.error('质量检测失败:', error);
        return this.mockQualityCheck();
      }
    },

    mockQualityCheck() {
      const mockResults = [
        { passed: true, score: 0.9, reason: '质量良好' },
        { passed: false, score: 0.4, reason: '图像模糊，请重新拍摄' },
        { passed: false, score: 0.5, reason: '光线不足，请在明亮处拍摄' },
        { passed: true, score: 0.85, reason: '质量良好' }
      ];

      return mockResults[Math.floor(Math.random() * mockResults.length)];
    },

    nextStep() {
      if (this.currentStepIndex < this.steps.length - 1) {
        this.currentStepIndex++;
        this.frameStatus = 'detecting';
        this.confidence = 0;
        this.statusText = '';

        setTimeout(() => {
          this.startDetection();
          this.playVoice(this.currentStep.voice);
        }, 500);
      } else {
        this.playVoice('所有照片拍摄完成！');
        this.showResultsModal = true;
      }
    },

    playVoice(text) {
      this.voiceHintText = text;
      this.showVoiceHint = true;

      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'zh-CN';
        utterance.rate = 0.9;
        speechSynthesis.speak(utterance);
      }

      setTimeout(() => {
        this.showVoiceHint = false;
      }, 2500);
    },

    async switchCamera() {
      this.playVoice('正在切换摄像头');
    },

    showResults() {
      this.showResultsModal = true;
    },

    closeResults() {
      this.showResultsModal = false;
    },

    async submitPhotos() {
      if (Object.keys(this.capturedPhotos).length < 4) {
        alert('请完成所有角度的拍摄');
        return;
      }

      try {
        this.playVoice('正在上传照片，请稍候');

        const uploadData = {
          photos: this.capturedPhotos,
          timestamp: Date.now(),
          device: navigator.userAgent
        };

        const result = await this.uploadToServer(uploadData);

        if (result.success) {
          alert('照片上传成功！');
          this.resetApp();
        } else {
          alert('上传失败：' + result.message);
        }

      } catch (error) {
        console.error('上传失败:', error);
        alert('网络错误，请重试');
      }
    },

    async uploadToServer(data) {
      return new Promise((resolve) => {
        setTimeout(() => {
          console.log('上传数据:', data);
          resolve({
            success: true,
            message: '上传成功',
            uploadId: 'MOCK_' + Date.now()
          });
        }, 2000);
      });
    },

    resetApp() {
      this.currentStepIndex = 0;
      this.capturedPhotos = {};
      this.frameStatus = 'detecting';
      this.confidence = 0;
      this.statusText = '';
      this.showResultsModal = false;

      setTimeout(() => {
        this.startDetection();
        this.playVoice(this.currentStep.voice);
      }, 500);
    },

    cleanup() {
      this.stopDetection();

      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
      }

      if ('speechSynthesis' in window) {
        speechSynthesis.cancel();
      }
    },

  }
};
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #000;
  overflow: hidden;
  position: fixed;
  width: 100vw;
  height: 100vh;
}

.app-container {
  position: relative;
  width: 100vw;
  height: 100vh;
  background: #000;
}

/* 简洁头部 - 参考设计稿 */
.header-simple {
  position: fixed;
  top: 20px;
  left: 0;
  right: 0;
  z-index: 20;
  background: linear-gradient(180deg, rgba(0,0,0,0.8) 0%, transparent 100%);
  padding: env(safe-area-inset-top, 40px) 20px 40px;
  color: white;
  text-align: center;
}

.progress-steps {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 40px;
  padding: 0 20px;
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
}

.step-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  position: relative;
}

.step-item:not(:last-child)::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 6px;
  width: calc(100% - 12px);
  height: 2px;
  background: rgba(255,255,255,0.3);
  transform: translateX(6px);
  z-index: 0;
}

.step-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: rgba(255,255,255,0.4);
  transition: all 0.3s ease;
  margin-bottom: 8px;
  position: relative;
  z-index: 1;
}

.step-label {
  font-size: 12px;
  color: rgba(255,255,255,0.7);
  text-align: center;
  transition: all 0.3s ease;
  white-space: nowrap;
}

.step-item.active .step-dot {
  background: #007AFF;
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.3);
}

.step-item.active .step-label {
  color: #007AFF;
  font-weight: 600;
}

.step-item.completed .step-dot {
  background: #34C759;
}

.step-item.completed .step-label {
  color: #34C759;
  font-weight: 500;
}

.step-item.completed:not(:last-child)::after {
  background: #34C759;
}

.main-instruction {
  font-size: 36px;
  font-weight: 700;
  color: white;
  text-shadow: 0 2px 8px rgba(0,0,0,0.8);
  letter-spacing: 2px;
  margin-top: 10px;
}

.camera-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

#videoElement {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
}

/* 大尺寸车辆指导框 - 能容纳真实车辆 */
.vehicle-guide-frame {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
  height: 100%;
  /* 移除最大宽高限制，让它能够全屏显示 */
  display: flex;
  align-items: center;
  justify-content: center;
}

.car-frame-large {
  width: 100%;
  height: 100%;
  background: url('https://s3-gz01.didistatic.com/packages-mait/img/ZE1bZuAsjJ1758023563529.png') center/contain no-repeat;
  /* 不自动旋转，固定使用第一步的图片 */
  transform: rotate(0deg);
  transition: none;
  opacity: 0.6;
  filter: brightness(0) invert(1);
  /* 移除外围边框 */
}

/* 删除老土的动效和复杂的边框样式 */

.controls {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 20;
  background: linear-gradient(0deg, rgba(0,0,0,0.8) 0%, transparent 100%);
  padding: 20px 20px calc(env(safe-area-inset-bottom, 20px) + 20px);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.control-btn {
  width: 50px;
  height: 50px;
  border: 2px solid rgba(255,255,255,0.6);
  border-radius: 50%;
  background: rgba(255,255,255,0.1);
  color: white;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  touch-action: manipulation;
}

.auto-capture-indicator {
  background: rgba(0,0,0,0.7);
  color: white;
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
  border: 2px solid rgba(255,255,255,0.3);
  transition: all 0.3s ease;
}

.auto-capture-indicator.ready {
  background: rgba(0,255,0,0.8);
  color: black;
  border-color: #00ff00;
  animation: ready-pulse 2s infinite;
}

@keyframes ready-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(0, 255, 0, 0.7); }
  50% { box-shadow: 0 0 0 10px rgba(0, 255, 0, 0); }
}

.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: white;
  z-index: 100;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(255,255,255,0.3);
  border-top: 3px solid white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 20px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.voice-hint {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.9);
  color: white;
  padding: 20px;
  border-radius: 12px;
  text-align: center;
  z-index: 50;
  max-width: 80vw;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.voice-hint.show {
  opacity: 1;
}

.results-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: white;
  z-index: 200;
  display: flex;
  flex-direction: column;
  transform: translateY(100%);
  transition: transform 0.3s ease;
}

.results-modal.show {
  transform: translateY(0);
}

.results-header {
  padding: 20px;
  text-align: center;
  border-bottom: 1px solid #e0e0e0;
}

.results-content {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}

.photo-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
  margin-bottom: 30px;
}

.photo-item {
  text-align: center;
}

.photo-preview {
  width: 100%;
  height: 120px;
  border-radius: 8px;
  border: 2px solid #e0e0e0;
  object-fit: cover;
  background: #f5f5f5;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
  font-size: 12px;
}

.photo-label {
  margin-top: 8px;
  font-size: 14px;
  font-weight: 500;
}

.results-actions {
  padding: 20px;
  display: flex;
  gap: 10px;
}

.btn {
  flex: 1;
  padding: 15px;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-user-select: none;
  user-select: none;
}

.btn-primary {
  background: #007AFF;
  color: white;
}

.btn-secondary {
  background: #f0f0f0;
  color: #333;
}

.btn:active {
  opacity: 0.8;
}

/* 删除置信度条 - 过于复杂 */
</style>
