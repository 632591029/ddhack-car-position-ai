<template>
  <div class="app-container">
    <div v-if="isLoading" class="loading-overlay">
      <div class="spinner"></div>
      <div>正在初始化摄像头...</div>
    </div>

    <div class="header-simple" v-show="!isLoading">
      <div class="progress-steps">
        <div
          v-for="(step, index) in steps"
          :key="step.title"
          class="step-item"
          :class="{
            active: index === currentStepIndex,
            completed: Boolean(capturedPhotos[index])
          }"
        >
          <div class="step-dot"></div>
          <div class="step-label">{{ step.title }}</div>
      </div>
      </div>
      <div class="main-instruction">
        {{ currentStepText }}
      </div>
      <div class="sub-instruction">
        {{ statusText || '请保持手机稳定，缓慢移动以对准车辆轮廓' }}
      </div>
    </div>

    <div class="camera-container" v-show="!isLoading">
      <video ref="videoRef" id="videoElement" autoplay playsinline muted></video>
      <div class="overlay">
        <div class="car-frame-large" :class="{ rear: isRearAngle }" :style="carFrameStyle"></div>
        <!-- <div class="expected-box" :style="expectedRegionStyle"></div> -->
        </div>
      <div class="status-toast" :class="frameStatus">
        {{ statusText || '正在检测车辆轮廓' }}
      </div>
    </div>


    <div class="voice-hint" :class="{ show: showVoiceHint }">
      {{ voiceHintText }}
      </div>

    <!-- 语音激活提示 -->
    <div class="speech-enable-hint" :class="{ show: !userInteracted && speechReady }" @click="enableSpeechManually">
      <div class="speech-hint-content">
        <div class="speech-icon">🔊</div>
        <div class="speech-text">点击启用语音提示</div>
      </div>
      </div>


    <!-- 调试信息面板 -->
    <div v-if="DEBUG_MODE && debugInfo" class="debug-panel">
      <div class="debug-header" @click="toggleDebugPanel">
        🐛 调试信息 <span class="debug-toggle">{{ showDebugPanel ? '▼' : '▶' }}</span>
      </div>
      <div v-show="showDebugPanel" class="debug-content">
        <div class="debug-section">
          <h4>检测结果</h4>
          <div>检测到车辆: {{ debugInfo.hasVehicle ? '是' : '否' }}</div>
          <div>置信度: {{ (debugInfo.confidence * 100).toFixed(1) }}%</div>
          <div>状态: {{ debugInfo.frameStatus }}</div>
      </div>

        <div v-if="debugInfo.detection" class="debug-section">
          <h4>车辆位置</h4>
          <div>X: {{ (debugInfo.detection.x * 100).toFixed(1) }}%</div>
          <div>Y: {{ (debugInfo.detection.y * 100).toFixed(1) }}%</div>
          <div>宽: {{ (debugInfo.detection.width * 100).toFixed(1) }}%</div>
          <div>高: {{ (debugInfo.detection.height * 100).toFixed(1) }}%</div>
      </div>

        <div class="debug-section">
          <h4>预期位置</h4>
          <div>X: {{ (debugInfo.expected.x * 100).toFixed(1) }}%</div>
          <div>Y: {{ (debugInfo.expected.y * 100).toFixed(1) }}%</div>
          <div>宽: {{ (debugInfo.expected.width * 100).toFixed(1) }}%</div>
          <div>高: {{ (debugInfo.expected.height * 100).toFixed(1) }}%</div>
    </div>

        <div v-if="debugInfo.metrics" class="debug-section">
          <h4>对齐指标</h4>
          <div>IoU: {{ debugInfo.metrics.iou.toFixed(3) }}</div>
          <div>X偏移: {{ debugInfo.metrics.offsetX.toFixed(3) }}</div>
          <div>Y偏移: {{ debugInfo.metrics.offsetY.toFixed(3) }}</div>
          <div>面积比: {{ debugInfo.metrics.areaRatio.toFixed(3) }}</div>
    </div>

        <div class="debug-section">
          <h4>建议</h4>
          <div>{{ debugInfo.message }}</div>
        </div>
      </div>
    </div>

    <div class="results-modal" :class="{ show: showResultsModal }">
      <div class="results-header">
        <h2>拍摄结果</h2>
        <p>已完成 {{ Object.keys(capturedPhotos).length }} / {{ steps.length }} 张</p>
      </div>
      <div class="results-content">
        <div class="photo-grid">
          <div v-for="(step, index) in steps" :key="step.title" class="photo-item">
            <img
              v-if="capturedPhotos[index]"
              :src="capturedPhotos[index]"
              class="photo-preview"
              :alt="step.title"
            >
            <div v-else class="photo-preview placeholder">
              未拍摄
            </div>
            <div class="photo-label">{{ step.title }}</div>
          </div>
        </div>
      </div>
      <div class="results-actions">
        <button class="btn btn-secondary" @click="closeResults">
          返回继续拍摄
        </button>
        <button
          class="btn btn-primary"
          @click="submitPhotos"
          :disabled="Object.keys(capturedPhotos).length < steps.length || isUploading"
        >
          {{ isUploading ? '上传中...' : '提交照片' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script>
const { analyzeAlignment } = require('./utils/alignment');
const { detectVehicleEdges } = require('./utils/detection');

const CAR_API_KEY = "iq9EVHlacJwRarx9cmy7VzXl";
const CAR_SECRET_KEY = "ZqTw4y1denK2RS3SsD9VACpvIDNua0OF";

const USE_BAIDU_API = true; // 开启百度API检测
const BAIDU_MIN_CONFIDENCE = 0.6; // 百度API最低置信度阈值
const DETECTION_INTERVAL_MS = 1200;
const BAIDU_DETECTION_INTERVAL_MS = 2000; // 百度API检测间隔更长
const DEBUG_MODE = true; // 调试模式，显示详细信息
const DETECTION_CANVAS_MAX_WIDTH = 720;
const USE_SAMPLE_IMAGE_DEBUG = false;
const SAMPLE_IMAGE_URL = 'https://s3-gz01.didistatic.com/packages-mait/img/w0VyxKMAgG1758512666365.png';

const OVERLAY_LEFT_FRONT = 'https://s3-gz01.didistatic.com/packages-mait/img/RC5OtnR65N1758512045195.png';
const OVERLAY_RIGHT_FRONT = 'https://s3-gz01.didistatic.com/packages-mait/img/vPFvw45BoX1758512045345.png';
const OVERLAY_RIGHT_REAR = 'https://s3-gz01.didistatic.com/packages-mait/img/2OquYrEZxI1758512044128.png';
const OVERLAY_LEFT_REAR = 'https://s3-gz01.didistatic.com/packages-mait/img/Kd0C5rriZv1758512044096.png';

export default {
  name: 'App',
  data() {
    return {
      isLoading: true,
      isUploading: false,
      isCapturing: false,
      useSampleDebug: USE_SAMPLE_IMAGE_DEBUG,
      sampleImage: null,
      currentStepIndex: 0,
      capturedPhotos: {},
      frameStatus: 'detecting',
      confidence: 0,
      statusText: '',
      isDetecting: false,
      showVoiceHint: false,
      voiceHintText: '',
      showResultsModal: false,
      speechReady: false, // 语音是否已就绪
      userInteracted: false, // 用户是否已交互
      debugInfo: null, // 调试信息
      showDebugPanel: true, // 是否显示调试面板内容
      DEBUG_MODE, // 调试模式常量
      accessToken: null,
      detectionTimer: null,
      stream: null,
      lastGoodDetectionTime: null,
      consecutiveFailures: 0, // 连续检测失败次数
      lastVoiceTime: null, // 上次语音提示时间
      lastErrorVoiceTime: null, // 上次错误语音提示时间
      detectionCanvas: null,
      detectionContext: null,
      lastDetectionMetrics: null,
      videoSize: {
        width: 0,
        height: 0
      },
      steps: [
        {
          title: '左前侧',
          desc: '请将车辆左前侧对齐虚线轮廓，让车头露出完整',
          overlayImage: OVERLAY_LEFT_FRONT,
          expectedRegion: { x: 0.075, y: 0.22, width: 0.85, height: 0.56 },
          voice: '请对准车辆左前侧'
        },
        {
          title: '右前侧',
          desc: '请转到车辆右前侧，让车头贴合虚线轮廓',
          overlayImage: OVERLAY_RIGHT_FRONT,
          expectedRegion: { x: 0.075, y: 0.22, width: 0.85, height: 0.56 },
          voice: '请对准车辆右前侧'
        },
        {
          title: '右后侧',
          desc: '请移动到车辆右后侧，对齐虚线框位置',
          overlayImage: OVERLAY_RIGHT_REAR,
          expectedRegion: { x: 0.075, y: 0.27, width: 0.85, height: 0.46 },
          voice: '请对准车辆右后侧'
        },
        {
          title: '左后侧',
          desc: '请移动到车辆左后侧，保持车辆充满虚线轮廓',
          overlayImage: OVERLAY_LEFT_REAR,
          expectedRegion: { x: 0.075, y: 0.27, width: 0.85, height: 0.46 },
          voice: '请对准车辆左后侧'
        }
      ]
    };
  },

  computed: {
    currentStep() {
      return this.steps[this.currentStepIndex];
    },

    isRearAngle() {
      return this.currentStep.title.includes('后');
    },

    currentExpectedRegion() {
      // 根据视频画面纵横比选择不同的期望区域预设
      const ar = this.videoSize && this.videoSize.height
        ? this.videoSize.width / this.videoSize.height
        : 16 / 9;

      const preset = ar > 1.7 ? 'wide' : 'normal';
      const isRear = this.isRearAngle;

      const regions = {
        normal: {
          front: { x: 0.08, y: 0.28, width: 0.78, height: 0.38 },
          rear:  { x: 0.10, y: 0.32, width: 0.76, height: 0.36 },
        },
        wide: {
          front: { x: 0.08, y: 0.26, width: 0.80, height: 0.34 },
          rear:  { x: 0.10, y: 0.30, width: 0.78, height: 0.33 },
        }
      };

      return isRear ? regions[preset].rear : regions[preset].front;
    },

    expectedRegionStyle() {
      const region = this.currentExpectedRegion;
      return {
        left: `${region.x * 100}%`,
        top: `${region.y * 100}%`,
        width: `${region.width * 100}%`,
        height: `${region.height * 100}%`
      };
    },

    carFrameStyle() {
      const style = {
        backgroundImage: `url(${this.currentStep.overlayImage})`
      };

      return style;
    },

    currentStepText() {
      if (this.capturedPhotos[this.currentStepIndex]) {
        return '已截取';
      }
      return `请对准车辆${this.currentStep.title}`;
    }
  },

  async mounted() {
    document.addEventListener('visibilitychange', this.handleVisibilityChange);

    // 添加用户交互监听器，以启用语音功能
    this.addUserInteractionListeners();

    // 初始化语音合成器
    this.initSpeechSynthesis();

    await this.initApp();
  },

  beforeUnmount() {
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.cleanup();
  },

  methods: {
    async initApp() {
      try {
        if (this.useSampleDebug) {
          await this.loadSampleImage();
        } else {
          if (USE_BAIDU_API) {
        await this.getBaiduAccessToken();
          }
        await this.initCamera();
        }
        this.isLoading = false;
        this.playVoice(this.currentStep.voice, true); // 强制播放初始步骤语音
        this.startDetection();
      } catch (error) {
        console.error('初始化失败:', error);
        alert('初始化失败: ' + error.message);
        this.isLoading = false;
      }
    },

    async getBaiduAccessToken() {
      try {
        const response = await fetch('/api/oauth/2.0/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: `grant_type=client_credentials&client_id=${CAR_API_KEY}&client_secret=${CAR_SECRET_KEY}`
        });

        const result = await response.json();

        if (result.access_token) {
          this.accessToken = result.access_token;
        } else {
          throw new Error('获取访问令牌失败: ' + JSON.stringify(result));
        }
      } catch (error) {
        console.error('获取访问令牌失败:', error);
        alert('获取百度API访问令牌失败，请检查网络连接和API密钥');
        throw error;
      }
    },

    async initCamera() {
        const constraints = {
          video: {
            facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
          }
        };

      try {
        this.stream = await navigator.mediaDevices.getUserMedia(constraints);
        this.$refs.videoRef.srcObject = this.stream;

        await new Promise((resolve) => {
          this.$refs.videoRef.onloadedmetadata = () => {
            this.videoSize.width = this.$refs.videoRef.videoWidth;
            this.videoSize.height = this.$refs.videoRef.videoHeight;
            this.setupDetectionCanvas();
            resolve();
          };
        });
      } catch (error) {
        throw new Error('无法访问摄像头: ' + error.message);
      }
    },

    loadSampleImage() {
      if (this.sampleImage) {
        this.setupDetectionCanvas();
        return Promise.resolve();
      }

      return new Promise((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => {
          this.sampleImage = image;
          const width = image.naturalWidth || image.width;
          const height = image.naturalHeight || image.height;
          this.videoSize.width = width;
          this.videoSize.height = height;

          if (this.$refs.videoRef) {
            this.$refs.videoRef.poster = SAMPLE_IMAGE_URL;
          }

          this.setupDetectionCanvas();
          resolve();
        };
        image.onerror = () => {
          reject(new Error('样例车辆图片加载失败，请检查图片地址是否可访问'));
        };
        image.src = SAMPLE_IMAGE_URL;
      });
    },

    setupDetectionCanvas() {
      if (!this.detectionCanvas) {
        this.detectionCanvas = document.createElement('canvas');
        this.detectionContext = this.detectionCanvas.getContext('2d');
      }

      if (this.useSampleDebug && this.sampleImage) {
        const imageWidth = this.sampleImage.naturalWidth || this.sampleImage.width;
        const imageHeight = this.sampleImage.naturalHeight || this.sampleImage.height;
        const targetWidth = Math.min(DETECTION_CANVAS_MAX_WIDTH, imageWidth);
        const scale = targetWidth / imageWidth;
        const targetHeight = Math.round(imageHeight * scale);

        this.detectionCanvas.width = targetWidth;
        this.detectionCanvas.height = targetHeight;
        return;
      }

      const video = this.$refs.videoRef;
      if (!video || !video.videoWidth) {
        return;
      }

      const targetWidth = Math.min(DETECTION_CANVAS_MAX_WIDTH, video.videoWidth);
      const scale = targetWidth / video.videoWidth;
      const targetHeight = Math.round(video.videoHeight * scale);

      this.detectionCanvas.width = targetWidth;
      this.detectionCanvas.height = targetHeight;
    },

    startDetection() {
      if (this.isDetecting) {
        return;
      }

      this.isDetecting = true;

      const runDetection = async () => {
        if (!this.isDetecting) {
          return;
        }

        await this.detectVehicleAlignment();

        if (this.isDetecting) {
          // 动态调整检测间隔：失败次数越多，间隔越长
          let interval = USE_BAIDU_API ? BAIDU_DETECTION_INTERVAL_MS : DETECTION_INTERVAL_MS;
          if (this.consecutiveFailures > 3) {
            interval = interval * 2; // 连续失败后降低频率
          }
          this.detectionTimer = setTimeout(runDetection, interval);
        }
      };

      runDetection();
    },

    stopDetection() {
      if (this.detectionTimer) {
        clearTimeout(this.detectionTimer);
        this.detectionTimer = null;
      }
      this.isDetecting = false;
    },

    async detectVehicleAlignment() {
      if (!this.$refs.videoRef || document.hidden) {
        return;
      }

      try {
        let detection;

        if (USE_BAIDU_API && this.accessToken) {
          detection = await this.detectWithBaidu();
        } else {
          // 直接使用mock数据，跳过边缘检测
          this.useMockDetection();
          return;
        }

        // 只有检测到车辆时才进行对齐分析
        if (detection && detection.hasVehicle) {
          this.consecutiveFailures = 0; // 重置失败计数
          this.lastErrorVoiceTime = null; // 清空错误语音时间戳
          const analysis = analyzeAlignment(detection, this.currentExpectedRegion);
          this.updateDetectionStatus(analysis);
        } else {
          this.consecutiveFailures++; // 增加失败计数
          this.updateDetectionStatus({
            hasVehicle: false,
            confidence: 0,
            frameStatus: 'detecting',
            message: '未检测到车辆，请移动手机对准车身'
          });

          // 连续错误语音提示
          this.handleConsecutiveErrorVoice();
        }
      } catch (error) {
        console.error('车辆检测失败:', error);
        this.useMockDetection();
      }
    },

    detectWithEdgeDetection() {
      const frame = this.getDetectionFrame();
      if (!frame) {
        return { hasVehicle: false };
      }

      const detection = detectVehicleEdges(frame.imageData, this.currentExpectedRegion);

      if (!detection || !detection.hasVehicle) {
        return { hasVehicle: false };
      }

      return detection;
    },

    getDetectionFrame() {
      if (!this.detectionCanvas || !this.detectionContext) {
        this.setupDetectionCanvas();
      }

      if (!this.detectionCanvas || !this.detectionContext) {
        return null;
      }

      if (this.useSampleDebug && this.sampleImage) {
        this.detectionContext.drawImage(
          this.sampleImage,
          0,
          0,
          this.detectionCanvas.width,
          this.detectionCanvas.height
        );
      } else {
        const video = this.$refs.videoRef;
        if (!video || !video.videoWidth) {
          return null;
        }

        this.detectionContext.drawImage(
          video,
          0,
          0,
          this.detectionCanvas.width,
          this.detectionCanvas.height
        );
      }

      const imageData = this.detectionContext.getImageData(
        0,
        0,
        this.detectionCanvas.width,
        this.detectionCanvas.height
      );

      return {
        imageData,
        width: this.detectionCanvas.width,
        height: this.detectionCanvas.height
      };
    },

    async detectWithBaidu() {
      const frame = this.captureFrame();
      if (!frame) {
        return { hasVehicle: false };
      }

      const base64Image = frame.split(',')[1];
      const response = await this.callBaiduVehicleAPI(base64Image);

      if (!response || !response.vehicle_info || !response.vehicle_info.length) {
        return { hasVehicle: false };
      }

      // 选择面积最大的car类型车辆，并过滤低置信度结果
      const MIN_CONFIDENCE = BAIDU_MIN_CONFIDENCE;
      const vehicles = response.vehicle_info.filter(v =>
        v.type === 'car' && v.probability >= MIN_CONFIDENCE
      );

      if (!vehicles.length) {
        console.log('未检测到高置信度车辆，最高置信度:',
          Math.max(...response.vehicle_info.map(v => v.probability)).toFixed(3));
        return { hasVehicle: false };
      }

      const vehicle = vehicles.reduce((maxVehicle, current) => {
        const maxArea = maxVehicle.location.width * maxVehicle.location.height;
        const currentArea = current.location.width * current.location.height;
        return currentArea > maxArea ? current : maxVehicle;
      });

      console.log(`检测到车辆，置信度: ${(vehicle.probability * 100).toFixed(1)}%`);
      const bbox = this.normalizeLocation(vehicle.location);

        return {
        hasVehicle: true,
        bbox,
        score: vehicle.score || 0.8,
        raw: vehicle
      };
    },

    normalizeLocation(location) {
      if (!location) {
        return null;
      }

      const video = this.$refs.videoRef;
      const width = video && video.videoWidth ? video.videoWidth : location.width || 1;
      const height = video && video.videoHeight ? video.videoHeight : location.height || 1;

      if (location.left > 1 || location.top > 1) {
        return {
          x: location.left / width,
          y: location.top / height,
          width: location.width / width,
          height: location.height / height
        };
      }

      return {
        x: location.left,
        y: location.top,
        width: location.width,
        height: location.height
      };
    },


    updateDetectionStatus(result) {
      if (!result) {
        return;
      }

      this.confidence = result.confidence || 0;
      this.statusText = result.message;
      this.frameStatus = result.frameStatus || 'detecting';
      this.lastDetectionMetrics = result.metrics || null;

      // 更新调试信息
      if (DEBUG_MODE) {
        this.debugInfo = {
          hasVehicle: result.hasVehicle,
          confidence: result.confidence || 0,
          frameStatus: result.frameStatus || 'detecting',
          message: result.message,
          detection: result.detectionBox,
          expected: this.currentExpectedRegion,
          metrics: result.metrics
        };
      }

      this.logDetectionMetrics(result);

      // 自动拍照：matched 或（good 且 IoU、面积比充足）时均可触发
      const autoThreshold = DEBUG_MODE ? 0.62 : 0.77; // 适中的自动拍照阈值
      const metrics = result.metrics || {};
      const goodEnoughOverlap = (metrics.iou || 0) >= 0.58 && (metrics.areaRatio || 0) >= 0.72; // 适中的重叠要求
      const canAuto = (
        (this.frameStatus === 'matched' && this.confidence >= autoThreshold) ||
        (this.frameStatus === 'good' && this.confidence >= (autoThreshold - 0.05) && goodEnoughOverlap)
      );
      // 如果当前步骤已拍摄完成，直接进入下一步
      if (this.capturedPhotos[this.currentStepIndex] && !this.isCapturing) {
        const now = Date.now();
        if (!this.lastGoodDetectionTime || now - this.lastGoodDetectionTime > 1000) {
          this.lastGoodDetectionTime = now;
          this.stopDetection(); // 停止检测
          setTimeout(() => this.nextStep(), 500); // 直接进入下一步
        }
        return;
      }

      if (canAuto && !this.isCapturing) {
        const now = Date.now();
        if (!this.lastGoodDetectionTime || now - this.lastGoodDetectionTime > 2500) { // 减少等待时间到2.5秒
          this.playVoice('对准成功，正在拍照', true); // 强制播放成功语音
          this.lastGoodDetectionTime = now;
          this.showSuccessEffect(); // 显示成功效果
          setTimeout(() => this.autoCapture(), 800); // 减少延迟到0.8秒，更快响应
        }
      }

    },

    logDetectionMetrics(result) {
      if (
        typeof process === 'undefined' ||
        !result ||
        !result.metrics ||
        process.env.NODE_ENV === 'production'
      ) {
        return;
      }

      const metrics = result.metrics;
      const format = value => (typeof value === 'number' ? value.toFixed(3) : 'N/A');

      console.debug('[alignment]', {
        step: this.currentStep ? this.currentStep.title : '未知步骤',
        status: result.frameStatus,
        confidence: format(result.confidence),
        offsetX: format(metrics.offsetX),
        offsetY: format(metrics.offsetY),
        areaRatio: format(metrics.areaRatio),
        iou: format(metrics.iou)
      });
    },

    useMockDetection() {
      const expected = this.currentExpectedRegion;
      // 减少随机抖动，让mock数据更精确对齐
      const jitterX = (Math.random() - 0.5) * 0.02;
      const jitterY = (Math.random() - 0.5) * 0.02;
      const scale = 1 + (Math.random() - 0.5) * 0.05;

      const width = Math.min(0.9, Math.max(0.3, expected.width * scale));
      const height = Math.min(0.9, Math.max(0.3, expected.height * scale));
      const x = Math.min(Math.max(expected.x + jitterX, 0.02), 1 - width - 0.02);
      const y = Math.min(Math.max(expected.y + jitterY, 0.02), 1 - height - 0.02);

      const detection = {
        hasVehicle: true,
        bbox: { x, y, width, height },
        score: 0.85 + Math.random() * 0.1 // 提高基础分数到0.85-0.95
      };

      const analysis = analyzeAlignment(detection, this.currentExpectedRegion);
      this.updateDetectionStatus(analysis);
    },

    captureFrame(options = {}) {
      const { fullResolution = false } = options;
      const video = this.$refs.videoRef;

      if (this.useSampleDebug && this.sampleImage) {
        const canvas = document.createElement('canvas');
        const sourceWidth = this.sampleImage.naturalWidth || this.sampleImage.width;
        const sourceHeight = this.sampleImage.naturalHeight || this.sampleImage.height;

        if (fullResolution) {
          canvas.width = sourceWidth;
          canvas.height = sourceHeight;
        } else {
          const targetWidth = Math.min(1280, sourceWidth);
          const scale = targetWidth / sourceWidth;
          canvas.width = targetWidth;
          canvas.height = Math.round(sourceHeight * scale);
        }

        const ctx = canvas.getContext('2d');
        ctx.drawImage(this.sampleImage, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.92);
      }

      // Mock模式：生成模拟图片
      if (!USE_BAIDU_API) {
        const canvas = document.createElement('canvas');
        canvas.width = fullResolution ? 1920 : 1280;
        canvas.height = fullResolution ? 1080 : 720;

        const ctx = canvas.getContext('2d');
        // 生成简单的模拟图片（灰色背景 + 当前步骤文字）
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#333';
        ctx.font = '48px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`Mock ${this.currentStep.title}`, canvas.width/2, canvas.height/2);

        return canvas.toDataURL('image/jpeg', 0.92);
      }

      if (!video || !video.videoWidth) {
        return null;
      }

      const canvas = document.createElement('canvas');

      if (fullResolution) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      } else {
        const targetWidth = Math.min(1280, video.videoWidth);
        const scale = targetWidth / video.videoWidth;
        canvas.width = targetWidth;
        canvas.height = Math.round(video.videoHeight * scale);
      }

      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.92);
    },

    checkPhotoQuality() {
      // Mock模式直接通过质量检查
      if (!USE_BAIDU_API) {
        return { passed: true, score: 0.9 };
      }

      // 放宽通过条件：matched 直接通过；
      // 或 good 且 置信度>=0.60 且 IoU/面积比达到阈值
      const metrics = this.lastDetectionMetrics || {};
      const overlapOK = (metrics.iou || 0) >= 0.58 && (metrics.areaRatio || 0) >= 0.70;
      const canPass = this.frameStatus === 'matched' ||
        (this.frameStatus === 'good' && this.confidence >= 0.60 && overlapOK);

      if (!canPass) {
        return { passed: false, reason: '车辆未完全进入虚线框，请重新对准' };
      }

      const frame = this.getDetectionFrame();
      if (!frame) {
        return {
          passed: true,
          score: 0.8
        };
      }

      const clarity = this.calculateLaplacianVariance(frame.imageData);
      const brightness = this.calculateAverageLuminance(frame.imageData);

      if (clarity < 1100) {
        return {
          passed: false,
          reason: '画面可能模糊，请保持手部稳定'
        };
      }

      if (brightness < 40) {
        return {
          passed: false,
          reason: '环境较暗，请到光线更好的地方拍摄'
        };
      }

      if (brightness > 220) {
        return {
          passed: false,
          reason: '画面过亮，请避开强烈反光'
        };
      }

      return {
        passed: true,
        score: Math.min(1, clarity / 4500),
        brightness
      };
    },

    calculateAverageLuminance(imageData) {
      const { data, width, height } = imageData;
      let sum = 0;
      let count = 0;
      const step = 12;

      for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
          const index = (y * width + x) * 4;
          const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
          sum += gray;
          count++;
        }
      }

      return count ? sum / count : 0;
    },

    calculateLaplacianVariance(imageData) {
      const { data, width, height } = imageData;
      let sum = 0;
      let sumSq = 0;
      let count = 0;

      for (let y = 1; y < height - 1; y += 2) {
        for (let x = 1; x < width - 1; x += 2) {
          const index = (y * width + x) * 4;
          const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
          const leftGray = data[index - 4] * 0.299 + data[index - 3] * 0.587 + data[index - 2] * 0.114;
          const rightGray = data[index + 4] * 0.299 + data[index + 5] * 0.587 + data[index + 6] * 0.114;
          const upGray = data[index - width * 4] * 0.299 + data[index - width * 4 + 1] * 0.587 + data[index - width * 4 + 2] * 0.114;
          const downGray = data[index + width * 4] * 0.299 + data[index + width * 4 + 1] * 0.587 + data[index + width * 4 + 2] * 0.114;

          const laplacian = -4 * gray + leftGray + rightGray + upGray + downGray;
          sum += laplacian;
          sumSq += laplacian * laplacian;
          count++;
        }
      }

      if (!count) {
        return 0;
      }

      const mean = sum / count;
      return sumSq / count - mean * mean;
    },

    async autoCapture() {
      if (this.isCapturing) {
        return; // 如果正在拍照，直接返回
      }

      // 如果当前步骤已拍摄，直接进入下一步
      if (this.capturedPhotos[this.currentStepIndex]) {
        this.nextStep();
        return;
      }

      this.isCapturing = true;
      this.stopDetection();

      try {
        const imageDataUrl = this.captureFrame({ fullResolution: true });
        if (!imageDataUrl) {
          throw new Error('无法捕获画面');
        }

        const qualityResult = this.checkPhotoQuality();

        if (!qualityResult.passed) {
          this.playVoice(qualityResult.reason || '照片质量不佳，请重新拍摄');
          await this.delay(1200);
          this.startDetection();
          return;
        }

        // 保存照片
        this.capturedPhotos = {
          ...this.capturedPhotos,
          [this.currentStepIndex]: imageDataUrl
        };

        this.playVoice('照片已保存');
        await this.delay(800);

        // 立即进入下一步，并确保UI更新
        this.nextStep();
      } catch (error) {
        console.error('拍照失败:', error);
        this.playVoice('拍照失败，请重试');
        this.startDetection();
      } finally {
        this.isCapturing = false;
      }
    },


    nextStep() {
      if (this.currentStepIndex < this.steps.length - 1) {
        // 立即停止当前检测
        this.stopDetection();
        this.isCapturing = false;

        // 更新步骤索引和状态
        this.currentStepIndex += 1;
        this.frameStatus = 'detecting';
        this.confidence = 0;
        this.statusText = '';
        this.consecutiveFailures = 0; // 重置失败计数
        this.lastErrorVoiceTime = null; // 清空错误语音时间戳
        this.lastGoodDetectionTime = null; // 重置拍照时间戳

        // 强制触发Vue响应式更新
        this.$nextTick(() => {
          // 确保UI完全更新
          this.$forceUpdate();

          setTimeout(() => {
            this.playVoice(this.currentStep.voice, true); // 强制播放下一步骤语音
            // 再延迟开始检测，确保所有状态都已更新
            setTimeout(() => {
              this.startDetection();
            }, 300);
          }, 200);
        });
      } else {
        this.showResults();
      }
    },

    addUserInteractionListeners() {
      // 监听用户交互事件
      const events = ['touchstart', 'touchend', 'mousedown', 'click'];
      const enableSpeech = () => {
        this.userInteracted = true;
        // 移除事件监听器
        events.forEach(event => {
          document.removeEventListener(event, enableSpeech);
        });
        // 测试语音功能
        this.testSpeech();
      };

      events.forEach(event => {
        document.addEventListener(event, enableSpeech, { once: true });
      });
    },

    initSpeechSynthesis() {
      if ('speechSynthesis' in window) {
        // 等待语音合成器就绪
        const checkVoices = () => {
          const voices = speechSynthesis.getVoices();
          if (voices.length > 0) {
            this.speechReady = true;
            console.log('语音合成器已就绪，可用语音:', voices.filter(v => v.lang.includes('zh')).length);
          } else {
            setTimeout(checkVoices, 100);
          }
        };

        if (speechSynthesis.getVoices().length > 0) {
          this.speechReady = true;
        } else {
          speechSynthesis.addEventListener('voiceschanged', checkVoices);
        }
      } else {
        console.warn('此浏览器不支持语音合成功能');
      }
    },

    testSpeech() {
      if (this.speechReady && this.userInteracted) {
        // 播放一个很短的测试音频以激活语音功能
        const testUtterance = new SpeechSynthesisUtterance('');
        testUtterance.volume = 0;
        speechSynthesis.speak(testUtterance);
        console.log('语音功能已激活');
      }
    },

    enableSpeechManually() {
      this.userInteracted = true;
      this.testSpeech();
      // 播放欢迎语音
      setTimeout(() => {
        this.playVoice('语音提示已启用，开始车辆检测', true);
      }, 500);
    },

    toggleDebugPanel() {
      this.showDebugPanel = !this.showDebugPanel;
    },


    playVoice(text, forcePlay = false) {
      const now = Date.now();

      // 频率控制：普通语音提示间隔至少3秒
      if (!forcePlay && this.lastVoiceTime && now - this.lastVoiceTime < 3000) {
        return;
      }

      // 显示文字提示（无论语音是否工作都显示）
      this.voiceHintText = text;
      this.showVoiceHint = true;
      this.lastVoiceTime = now;

      // 语音播放
      if ('speechSynthesis' in window && this.speechReady) {
        try {
          speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'zh-CN';
        utterance.rate = 0.9;
          utterance.volume = 1;
          utterance.pitch = 1;

          // 选择中文语音（如果可用）
          const voices = speechSynthesis.getVoices();
          const chineseVoice = voices.find(voice =>
            voice.lang.includes('zh') || voice.lang.includes('cmn')
          );
          if (chineseVoice) {
            utterance.voice = chineseVoice;
          }

          // 错误处理
          utterance.onerror = (event) => {
            console.error('语音播放失败:', event.error);
          };

          utterance.onstart = () => {
            console.log('开始播放语音:', text);
          };

        speechSynthesis.speak(utterance);

        } catch (error) {
          console.error('语音播放异常:', error);
        }
      } else if (!this.speechReady) {
        console.log('语音合成器未就绪，仅显示文字提示');
      } else if (!this.userInteracted) {
        console.log('需要用户交互后才能播放语音');
      }

      setTimeout(() => {
        this.showVoiceHint = false;
      }, 2500);
    },

    handleConsecutiveErrorVoice() {
      const now = Date.now();

      // 错误语音提示间隔至少8秒
      if (this.lastErrorVoiceTime && now - this.lastErrorVoiceTime < 8000) {
        return;
      }

      let message = '';
      if (this.consecutiveFailures >= 5 && this.consecutiveFailures < 10) {
        message = '请确保车辆完全进入画面，光线充足';
      } else if (this.consecutiveFailures >= 10 && this.consecutiveFailures < 15) {
        message = '建议移动到更好的拍摄位置，确保车辆清晰可见';
      } else if (this.consecutiveFailures >= 15) {
        message = '检测困难，请检查车辆是否在画面中央，背景是否简洁';
      }

      if (message) {
        this.playVoice(message, true); // 强制播放
        this.lastErrorVoiceTime = now;
      }
    },

    showSuccessEffect() {
      // 添加成功闪烁效果
      const overlay = document.querySelector('.overlay');
      if (overlay) {
        overlay.style.animation = 'successFlash 0.6s ease-in-out';
        setTimeout(() => {
          overlay.style.animation = '';
        }, 600);
      }
    },


    showResults() {
      this.stopDetection();
      this.showResultsModal = true;
      this.playVoice('所有角度拍摄完成');
    },

    closeResults() {
      this.showResultsModal = false;
      this.playVoice(this.currentStep.voice, true); // 强制播放返回步骤语音
      this.startDetection();
    },

    async submitPhotos() {
      if (Object.keys(this.capturedPhotos).length < this.steps.length) {
        alert('请完成所有角度的拍摄');
        return;
      }

      try {
        this.isUploading = true;
        this.playVoice('正在上传照片，请稍候');

        const uploadData = {
          photos: this.capturedPhotos,
          steps: this.steps.map(step => step.title),
          timestamp: Date.now(),
          device: navigator.userAgent
        };

        const result = await this.uploadToServer(uploadData);

        if (result.success) {
          alert('照片上传成功！');
          this.playVoice('上传成功，验车完成');
          this.resetApp();
        } else {
          alert('上传失败：' + result.message);
        }
      } catch (error) {
        console.error('上传失败:', error);
        alert('网络错误，请重试');
      } finally {
        this.isUploading = false;
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
        }, 1500);
      });
    },

    resetApp() {
      this.currentStepIndex = 0;
      this.capturedPhotos = {};
      this.frameStatus = 'detecting';
      this.confidence = 0;
      this.statusText = '';
      this.showResultsModal = false;

      this.playVoice(this.currentStep.voice, true); // 强制播放重置步骤语音
        this.startDetection();
    },

    cleanup() {
      this.stopDetection();

      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
        this.stream = null;
      }

      if ('speechSynthesis' in window) {
        speechSynthesis.cancel();
      }
    },

    handleVisibilityChange() {
      if (document.hidden) {
        this.stopDetection();
      } else if (!this.showResultsModal) {
        this.startDetection();
      }
    },

    async callBaiduVehicleAPI(base64Image) {
      const response = await fetch(`/api/baidu/rest/2.0/image-classify/v1/vehicle_detect?access_token=${this.accessToken}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `image=${encodeURIComponent(base64Image)}&top_num=1&baike_num=0`
      });

      return response.json();
    },

    delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
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
  color: white;
}

.header-simple {
  position: fixed;
  top: 16px;
  left: 0;
  right: 0;
  z-index: 30;
  background: linear-gradient(180deg, rgba(0,0,0,0.85) 0%, transparent 100%);
  padding: env(safe-area-inset-top, 32px) 20px 32px;
  text-align: center;
}

.progress-steps {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 0 auto 28px auto;
  padding: 0 20px;
  max-width: 640px;
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
  background: rgba(255,255,255,0.2);
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
  background: #0abaff;
  box-shadow: 0 0 0 4px rgba(10, 186, 255, 0.25);
}

.step-item.active .step-label {
  color: #0abaff;
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
  font-size: 30px;
  font-weight: 700;
  color: white;
  text-shadow: 0 2px 8px rgba(0,0,0,0.8);
  letter-spacing: 2px;
  margin-bottom: 12px;
}

.sub-instruction {
  font-size: 16px;
  color: rgba(255,255,255,0.75);
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


.car-frame-large {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 85.3vw; /* 640/750 = 85.3% */
  height: 55.7vw; /* 418/750 = 55.7% for front */
  background-position: center;
  background-repeat: no-repeat;
  background-size: contain;
  opacity: 0.9;
  filter: drop-shadow(0 0 18px rgba(255, 222, 102, 0.75));
  transition: all 0.3s ease;
}

/* 后侧角度使用不同高度 */
.car-frame-large.rear {
  height: 46.4vw; /* 348/750 = 46.4% for rear */
}

.expected-box {
  position: absolute;
  border: 2px dashed rgba(255,255,255,0.25);
  border-radius: 20px;
  box-shadow: inset 0 0 18px rgba(0,0,0,0.25);
}


.status-toast {
  position: absolute;
  bottom: 140px;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 24px;
  border-radius: 999px;
  background: rgba(0,0,0,0.65);
  border: 1px solid rgba(255,255,255,0.2);
  color: white;
  font-size: 15px;
  letter-spacing: 0.6px;
  backdrop-filter: blur(6px);
  transition: all 0.3s ease;
}

.status-toast.matched {
  background: rgba(0, 255, 106, 0.12);
  border-color: rgba(0, 255, 106, 0.55);
  color: #0cff7a;
}

.status-toast.good {
  background: rgba(0, 196, 255, 0.12);
  border-color: rgba(0, 196, 255, 0.55);
  color: #67e1ff;
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
  width: 42px;
  height: 42px;
  border: 3px solid rgba(255,255,255,0.3);
  border-top: 3px solid white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 20px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes successFlash {
  0% { background: rgba(0, 255, 0, 0); }
  50% { background: rgba(0, 255, 0, 0.3); }
  100% { background: rgba(0, 255, 0, 0); }
}

.voice-hint {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.88);
  color: white;
  padding: 24px 32px;
  border-radius: 16px;
  text-align: center;
  z-index: 60;
  max-width: 80vw;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.voice-hint.show {
  opacity: 1;
}

.speech-enable-hint {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 70;
  opacity: 0;
  transition: opacity 0.3s ease;
  cursor: pointer;
}

.speech-enable-hint.show {
  opacity: 1;
}

.speech-hint-content {
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 12px 16px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  backdrop-filter: blur(8px);
}

.speech-icon {
  font-size: 18px;
  animation: pulse 2s infinite;
}

.speech-text {
  font-size: 14px;
  font-weight: 500;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}


.debug-panel {
  position: fixed;
  top: 100px;
  left: 10px;
  width: 280px;
  background: rgba(0, 0, 0, 0.9);
  color: white;
  border-radius: 8px;
  font-size: 12px;
  z-index: 80;
  max-height: 60vh;
  overflow-y: auto;
}

.debug-header {
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.1);
  cursor: pointer;
  font-weight: bold;
  border-radius: 8px 8px 0 0;
  user-select: none;
}

.debug-toggle {
  float: right;
}

.debug-content {
  padding: 0;
}

.debug-section {
  padding: 8px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.debug-section:last-child {
  border-bottom: none;
}

.debug-section h4 {
  margin: 0 0 4px 0;
  color: #0abaff;
  font-size: 11px;
  font-weight: bold;
}

.debug-section div {
  margin: 2px 0;
  font-family: monospace;
}

@media (max-width: 640px) {
  .debug-panel {
    width: 260px;
    left: 5px;
    top: 80px;
    font-size: 11px;
  }
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
  color: #111;
}

.results-modal.show {
  transform: translateY(0);
}

.results-header {
  padding: 24px 20px 12px 20px;
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
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 18px;
  margin-bottom: 30px;
}

.photo-item {
  text-align: center;
}

.photo-preview {
  width: 100%;
  height: 140px;
  border-radius: 12px;
  border: 2px solid #e0e0e0;
  object-fit: cover;
  background: #f5f5f5;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
  font-size: 12px;
}

.photo-preview.placeholder {
  font-weight: 500;
}

.photo-label {
  margin-top: 10px;
  font-size: 15px;
  font-weight: 500;
}

.results-actions {
  padding: 20px;
  display: flex;
  gap: 12px;
}

.btn {
  flex: 1;
  padding: 15px;
  border: none;
  border-radius: 10px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  touch-action: manipulation;
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

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (max-width: 520px) {
  .main-instruction {
    font-size: 24px;
  }

  .sub-instruction {
    font-size: 14px;
  }


  .status-toast {
    bottom: 130px;
    font-size: 13px;
  }
}
</style>
