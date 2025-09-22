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
        {{ currentStep.title }} · {{ currentStep.desc }}
      </div>
      <div class="sub-instruction">
        {{ statusText || '请保持手机稳定，缓慢移动以对准车辆轮廓' }}
      </div>
    </div>

    <div class="camera-container" v-show="!isLoading">
      <video ref="videoRef" id="videoElement" autoplay playsinline muted></video>
      <div class="overlay">
        <div class="car-frame-large" :style="carFrameStyle"></div>
        <!-- <div class="expected-box" :style="expectedRegionStyle"></div> -->
      </div>
      <div class="status-toast" :class="frameStatus">
        {{ statusText || '正在检测车辆轮廓' }}
      </div>
    </div>


    <div class="voice-hint" :class="{ show: showVoiceHint }">
      {{ voiceHintText }}
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

const USE_BAIDU_API = false;
const DETECTION_INTERVAL_MS = 1200;
const BAIDU_DETECTION_INTERVAL_MS = 2000; // 百度API检测间隔更长
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
          expectedRegion: { x: 0.05, y: 0.20, width: 0.90, height: 0.60 },
          voice: '请对准车辆左前侧'
        },
        {
          title: '右前侧',
          desc: '请转到车辆右前侧，让车头贴合虚线轮廓',
          overlayImage: OVERLAY_RIGHT_FRONT,
          expectedRegion: { x: 0.05, y: 0.20, width: 0.90, height: 0.60 },
          voice: '请对准车辆右前侧'
        },
        {
          title: '右后侧',
          desc: '请移动到车辆右后侧，对齐虚线框位置',
          overlayImage: OVERLAY_RIGHT_REAR,
          expectedRegion: { x: 0.08, y: 0.25, width: 0.84, height: 0.55 },
          voice: '请对准车辆右后侧'
        },
        {
          title: '左后侧',
          desc: '请移动到车辆左后侧，保持车辆充满虚线轮廓',
          overlayImage: OVERLAY_LEFT_REAR,
          expectedRegion: { x: 0.08, y: 0.25, width: 0.84, height: 0.55 },
          voice: '请对准车辆左后侧'
        }
      ]
    };
  },

  computed: {
    currentStep() {
      return this.steps[this.currentStepIndex];
    },


    expectedRegionStyle() {
      const region = this.currentStep.expectedRegion;
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

      if (this.currentStep.overlayTransform) {
        style.transform = this.currentStep.overlayTransform;
      } else {
        style.transform = 'none';
      }

      return style;
    }
  },

  async mounted() {
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
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
          detection = this.detectWithEdgeDetection();
        }

        // 只有检测到车辆时才进行对齐分析
        if (detection && detection.hasVehicle) {
          this.consecutiveFailures = 0; // 重置失败计数
          this.lastErrorVoiceTime = null; // 清空错误语音时间戳
          const analysis = analyzeAlignment(detection, this.currentStep.expectedRegion);
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

      const detection = detectVehicleEdges(frame.imageData, this.currentStep.expectedRegion);

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

      // 选择面积最大的car类型车辆
      const vehicles = response.vehicle_info.filter(v => v.type === 'car');
      if (!vehicles.length) {
        return { hasVehicle: false };
      }

      const vehicle = vehicles.reduce((maxVehicle, current) => {
        const maxArea = maxVehicle.location.width * maxVehicle.location.height;
        const currentArea = current.location.width * current.location.height;
        return currentArea > maxArea ? current : maxVehicle;
      });
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

      this.logDetectionMetrics(result);

      // 自动拍照：检测到对准状态且置信度够高
      if (this.frameStatus === 'matched' && this.confidence > 0.85 && !this.isCapturing) {
        const now = Date.now();
        if (!this.lastGoodDetectionTime || now - this.lastGoodDetectionTime > 3000) {
          this.playVoice('对准成功，正在拍照', true); // 强制播放成功语音
          this.lastGoodDetectionTime = now;
          this.showSuccessEffect(); // 显示成功效果
          setTimeout(() => this.autoCapture(), 1000); // 延迟1秒自动拍照，给用户看到效果
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
      const expected = this.currentStep.expectedRegion;
      const jitterX = (Math.random() - 0.5) * 0.06;
      const jitterY = (Math.random() - 0.5) * 0.05;
      const scale = 1 + (Math.random() - 0.5) * 0.15;

      const width = Math.min(0.9, Math.max(0.3, expected.width * scale));
      const height = Math.min(0.9, Math.max(0.3, expected.height * (scale * 0.92)));
      const x = Math.min(Math.max(expected.x + jitterX, 0.02), 1 - width - 0.02);
      const y = Math.min(Math.max(expected.y + jitterY, 0.02), 1 - height - 0.02);

      const detection = {
        hasVehicle: true,
        bbox: { x, y, width, height },
        score: 0.6 + Math.random() * 0.3
      };

      const analysis = analyzeAlignment(detection, this.currentStep.expectedRegion);
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
      if (this.confidence < 0.75) {
        return {
          passed: false,
          reason: '车辆未完全进入虚线框，请重新对准'
        };
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

        this.capturedPhotos = {
          ...this.capturedPhotos,
          [this.currentStepIndex]: imageDataUrl
        };

        this.playVoice('照片已保存');
        await this.delay(700);
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
        this.currentStepIndex += 1;
        this.frameStatus = 'detecting';
        this.confidence = 0;
        this.statusText = '';
        this.consecutiveFailures = 0; // 重置失败计数
        this.lastErrorVoiceTime = null; // 清空错误语音时间戳
          this.playVoice(this.currentStep.voice, true); // 强制播放下一步骤语音
        this.startDetection();
      } else {
        this.showResults();
      }
    },

    playVoice(text, forcePlay = false) {
      const now = Date.now();

      // 频率控制：普通语音提示间隔至少3秒
      if (!forcePlay && this.lastVoiceTime && now - this.lastVoiceTime < 3000) {
        return;
      }

      this.voiceHintText = text;
      this.showVoiceHint = true;
      this.lastVoiceTime = now;

      if ('speechSynthesis' in window) {
        speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'zh-CN';
        utterance.rate = 0.9;
        speechSynthesis.speak(utterance);
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
  inset: 0;
  background-position: center;
  background-repeat: no-repeat;
  background-size: contain;
  opacity: 0.9;
  filter: drop-shadow(0 0 18px rgba(255, 222, 102, 0.75));
  transition: transform 0.3s ease;
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
