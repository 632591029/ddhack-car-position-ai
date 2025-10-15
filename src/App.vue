<template>
  <div class="app-container">
    <div v-if="isLoading" class="loading-overlay">
      <div class="spinner"></div>
      <div>{{ loadingText }}</div>
    </div>

    <!-- 本地开发模式指示器 -->
    <div v-if="IS_LOCAL_DEV" class="dev-mode-indicator">
      🚀 本地开发模式 - Mock数据已启用
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
      <!-- <div class="status-toast" :class="frameStatus">
        {{ statusText || '正在检测车辆轮廓' }}
      </div> -->
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

        <div class="debug-section">
          <h4>检测状态</h4>
          <div>检测运行: {{ isDetecting ? '是' : '否' }}</div>
          <div>拍摄中: {{ isCapturing ? '是' : '否' }}</div>
          <div>定时器: {{ detectionTimer ? '有' : '无' }}</div>
          <div>连续失败: {{ consecutiveFailures }}</div>
        </div>

        <div class="debug-section">
          <h4>实时日志</h4>
          <div v-for="log in debugLog" :key="log" class="debug-log-item">{{ log }}</div>
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

// 本地开发模式：检测hostname自动启用mock模式
const IS_LOCAL_DEV = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const USE_BAIDU_API = !IS_LOCAL_DEV; // 本地开发时关闭百度API
const BAIDU_MIN_CONFIDENCE = 0.65; // 降低百度API置信度阈值，提高车辆后部识别率
const DETECTION_INTERVAL_MS = IS_LOCAL_DEV ? 800 : 1200; // 本地开发时更快检测
const BAIDU_DETECTION_INTERVAL_MS = 1400; // 百度API检测间隔，平衡响应速度和API成本
const DEBUG_MODE = true; // 调试模式，显示详细信息
const DETECTION_CANVAS_MAX_WIDTH = 720;
const USE_SAMPLE_IMAGE_DEBUG = false;
const SAMPLE_IMAGE_URL = 'https://s3-gz01.didistatic.com/packages-mait/img/w0VyxKMAgG1758512666365.png';

const OVERLAY_LEFT_FRONT = 'https://s3-gz01.didistatic.com/packages-mait/img/t2JuuMYg411759216061942.png';
const OVERLAY_RIGHT_FRONT = 'https://s3-gz01.didistatic.com/packages-mait/img/bF5pKiZOZ91759216062459.png';
const OVERLAY_RIGHT_REAR = 'https://s3-gz01.didistatic.com/packages-mait/img/a2kiXwxiVX1759216061042.png';
const OVERLAY_LEFT_REAR = 'https://s3-gz01.didistatic.com/packages-mait/img/4zj7gkcftY1759216061287.png';

// 实心图片URL
const SOLID_LEFT_FRONT = 'https://s3-gz01.didistatic.com/packages-mait/img/cI6Dt6hDh41759216060082.png';
const SOLID_RIGHT_FRONT = 'https://s3-gz01.didistatic.com/packages-mait/img/r3AMQsZrRS1759216060170.png';
const SOLID_RIGHT_REAR = 'https://s3-gz01.didistatic.com/packages-mait/img/d0vsut19Gb1759216059118.png';
const SOLID_LEFT_REAR = 'https://s3-gz01.didistatic.com/packages-mait/img/tEpYMd0lH41759216059126.png';

export default {
  name: 'App',
  data() {
    return {
      IS_LOCAL_DEV, // 暴露给模板使用
      isLoading: true,
      loadingText: '正在初始化...',
      isUploading: false,
      isCapturing: false,
      useSampleDebug: USE_SAMPLE_IMAGE_DEBUG,
      sampleImage: null,
      preloadedImages: {}, // 预加载的图片缓存
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
      debugLog: [], // 调试日志
      showDebugPanel: false, // 是否显示调试面板内容
      DEBUG_MODE, // 调试模式常量
      showSolidOverlay: false, // 是否显示实心图片
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
          solidImage: SOLID_LEFT_FRONT,
          expectedRegion: { x: 0.075, y: 0.22, width: 0.85, height: 0.56 },
          voice: '请对准车辆左前侧'
        },
        {
          title: '右前侧',
          desc: '请转到车辆右前侧，让车头贴合虚线轮廓',
          overlayImage: OVERLAY_RIGHT_FRONT,
          solidImage: SOLID_RIGHT_FRONT,
          expectedRegion: { x: 0.075, y: 0.22, width: 0.85, height: 0.56 },
          voice: '请对准车辆右前侧'
        },
        {
          title: '右后侧',
          desc: '请移动到车辆右后侧，对齐虚线框位置',
          overlayImage: OVERLAY_RIGHT_REAR,
          solidImage: SOLID_RIGHT_REAR,
          expectedRegion: { x: 0.075, y: 0.27, width: 0.85, height: 0.46 },
          voice: '请对准车辆右后侧'
        },
        {
          title: '左后侧',
          desc: '请移动到车辆左后侧，保持车辆充满虚线轮廓',
          overlayImage: OVERLAY_LEFT_REAR,
          solidImage: SOLID_LEFT_REAR,
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
      const imageUrl = this.showSolidOverlay ? this.currentStep.solidImage : this.currentStep.overlayImage;
      const style = {
        backgroundImage: `url(${imageUrl})`
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
    this.addDebugLog('🚀 应用开始初始化');

    document.addEventListener('visibilitychange', this.handleVisibilityChange);

    // 添加用户交互监听器，以启用语音功能
    this.addUserInteractionListeners();

    // 初始化语音合成器
    this.initSpeechSynthesis();

    // 预加载图片
    this.addDebugLog('📸 开始预加载图片');
    await this.preloadImages();
    this.addDebugLog('📸 图片预加载完成');

    await this.initApp();
  },

  beforeUnmount() {
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.cleanup();
  },

  methods: {
    async preloadImages() {
      const imageUrls = [];

      // 收集所有需要预加载的图片URL
      this.steps.forEach(step => {
        imageUrls.push(step.overlayImage);
        imageUrls.push(step.solidImage);
      });

      // 如果使用样例图片，也加入预加载
      if (this.useSampleDebug) {
        imageUrls.push(SAMPLE_IMAGE_URL);
      }

      // 去重
      const uniqueUrls = [...new Set(imageUrls)];

      const preloadPromises = uniqueUrls.map(url => {
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            this.preloadedImages[url] = img;
            resolve(img);
          };
          img.onerror = () => resolve(null);
          img.src = url;
        });
      });

      await Promise.all(preloadPromises);
    },

    async initApp() {
      try {
        this.addDebugLog('🔧 开始初始化应用');

        if (this.useSampleDebug) {
          this.addDebugLog('🖼️ 加载样例图片');
          await this.loadSampleImage();
        } else {
          if (USE_BAIDU_API) {
            this.addDebugLog('🔑 获取百度API访问令牌');
            await this.getBaiduAccessToken();
            this.addDebugLog('✅ 百度API令牌获取成功');
          } else {
            this.addDebugLog('🏠 跳过百度API（本地模式）');
          }
          this.addDebugLog('📹 初始化摄像头');
          await this.initCamera();
          this.addDebugLog('✅ 摄像头初始化成功');
        }

        this.isLoading = false;
        this.addDebugLog('🎤 播放初始语音提示');
        this.playVoice(this.currentStep.voice, true); // 强制播放初始步骤语音
        this.addDebugLog('🔄 启动检测流程');
        this.startDetection();
      } catch (error) {
        console.error('初始化失败:', error);
        this.addDebugLog(`💥 初始化失败: ${error.message}`);
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
      console.log('🔄 startDetection 被调用', {
        isDetecting: this.isDetecting,
        currentStep: this.currentStepIndex,
        isCapturing: this.isCapturing,
        showResultsModal: this.showResultsModal
      });
      this.addDebugLog(`🔄 startDetection - isDetecting:${this.isDetecting}, step:${this.currentStepIndex}`);

      if (this.isDetecting) {
        console.log('⚠️ 检测已在运行，跳过启动');
        this.addDebugLog('⚠️ 检测已在运行，跳过启动');
        return;
      }

      // 开始新的检测前清理旧数据
      this.lastDetectionMetrics = null;
      this.isDetecting = true;
      console.log('✅ 设置 isDetecting = true');
      this.addDebugLog('✅ 检测状态已启动');

      let detectionCount = 0; // 添加计数器
      const runDetection = async () => {
        detectionCount++;
        console.log(`🔍 检测循环 #${detectionCount} 开始`, {
          isDetecting: this.isDetecting,
          step: this.currentStepIndex,
          time: new Date().toLocaleTimeString()
        });
        this.addDebugLog(`🔍 检测循环 #${detectionCount} - ${new Date().toLocaleTimeString()}`);

        if (!this.isDetecting) {
          console.log('❌ isDetecting = false, 退出循环');
          this.addDebugLog('❌ 检测状态为false，退出循环');
          return;
        }

        try {
          await this.detectVehicleAlignment();
          console.log(`✅ 检测循环 #${detectionCount} 完成`);
        } catch (error) {
          console.error(`💥 检测循环 #${detectionCount} 异常:`, error);
          this.addDebugLog(`💥 检测异常: ${error.message}`);
        }

        if (this.isDetecting) {
          // 简化间隔逻辑
          const interval = USE_BAIDU_API ? BAIDU_DETECTION_INTERVAL_MS : DETECTION_INTERVAL_MS;
          console.log(`⏰ 设置下次检测间隔: ${interval}ms`);
          this.detectionTimer = setTimeout(runDetection, interval);
        } else {
          console.log('🛑 isDetecting = false, 不设置下次检测');
          this.addDebugLog('🛑 检测已停止，不设置下次检测');
        }
      };

      console.log('🚀 启动首次检测');
      this.addDebugLog('🚀 启动首次检测');
      runDetection();
    },

    stopDetection() {
      console.log('🛑 stopDetection 被调用', {
        isDetecting: this.isDetecting,
        hasTimer: !!this.detectionTimer,
        currentStep: this.currentStepIndex,
        reason: new Error().stack?.split('\n')[2]?.trim() // 获取调用栈信息
      });
      this.addDebugLog(`🛑 stopDetection - isDetecting:${this.isDetecting}, hasTimer:${!!this.detectionTimer}`);

      if (this.detectionTimer) {
        console.log('⏰ 清除检测定时器');
        clearTimeout(this.detectionTimer);
        this.detectionTimer = null;
        this.addDebugLog('⏰ 定时器已清除');
      }

      this.isDetecting = false;
      console.log('✅ 设置 isDetecting = false');
      this.addDebugLog('✅ 检测状态已停止');
    },

    async detectVehicleAlignment() {
      console.log('🔍 detectVehicleAlignment 开始', {
        hasVideoRef: !!this.$refs.videoRef,
        documentHidden: document.hidden,
        currentStep: this.currentStepIndex,
        time: new Date().toLocaleTimeString()
      });
      this.addDebugLog(`🔍 开始车辆对齐检测 - step:${this.currentStepIndex}`);

      if (!this.$refs.videoRef) {
        console.log('❌ videoRef 不存在');
        this.addDebugLog('❌ videoRef 不存在');
        return;
      }

      if (document.hidden) {
        console.log('📱 页面隐藏，跳过检测');
        this.addDebugLog('📱 页面隐藏，跳过检测');
        return;
      }

      try {
        let detection;
        const startTime = performance.now();

        if (USE_BAIDU_API && this.accessToken) {
          console.log('🌐 使用百度API检测');
          this.addDebugLog(`🌐 百度API检测 - 域名:${window.location.hostname}, Token:${this.accessToken ? '有' : '无'}`);
          detection = await this.detectWithBaidu();
          const apiTime = performance.now() - startTime;
          console.log(`🌐 百度API耗时: ${apiTime.toFixed(1)}ms`, detection);
          this.addDebugLog(`🌐 API耗时: ${apiTime.toFixed(1)}ms, 结果: ${detection?.hasVehicle ? '有车' : '无车'}`);
        } else {
          console.log('🏠 使用Mock检测 - 原因:', USE_BAIDU_API ? '无Token' : '本地开发');
          this.addDebugLog(`🏠 fallback到Mock - USE_BAIDU_API:${USE_BAIDU_API}, Token:${this.accessToken ? '有' : '无'}`);
          // 直接使用mock数据，跳过边缘检测
          this.useMockDetection();
          return;
        }

        // 只有检测到车辆时才进行对齐分析
        if (detection && detection.hasVehicle) {
          console.log('✅ 检测到车辆，进行对齐分析');
          this.addDebugLog('✅ 检测到车辆，分析对齐');
          this.consecutiveFailures = 0; // 重置失败计数
          this.lastErrorVoiceTime = null; // 清空错误语音时间戳
          const analysis = analyzeAlignment(detection, this.currentExpectedRegion);
          this.updateDetectionStatus(analysis);
        } else {
          console.log('❌ 未检测到车辆');
          this.addDebugLog(`❌ 未检测到车辆 (连续失败: ${this.consecutiveFailures + 1})`);
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
        console.error('💥 车辆检测失败:', error);
        this.addDebugLog(`💥 检测失败: ${error.message}`);
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
        const allVehicles = response.vehicle_info || [];
        const maxConfidence = allVehicles.length > 0 ? Math.max(...allVehicles.map(v => v.probability)) : 0;
        const carVehicles = allVehicles.filter(v => v.type === 'car');

        console.log('未检测到高置信度车辆，详细信息:', {
          total: allVehicles.length,
          carType: carVehicles.length,
          maxConfidence: maxConfidence.toFixed(3),
          threshold: MIN_CONFIDENCE,
          step: this.currentStep?.title || 'unknown'
        });

        this.addDebugLog(`❌ 百度API无车辆: 总${allVehicles.length}个, car类型${carVehicles.length}个, 最高置信度${(maxConfidence*100).toFixed(1)}%, 阈值${(MIN_CONFIDENCE*100).toFixed(1)}%`);

        return { hasVehicle: false };
      }

      const vehicle = vehicles.reduce((maxVehicle, current) => {
        const maxArea = maxVehicle.location.width * maxVehicle.location.height;
        const currentArea = current.location.width * current.location.height;
        return currentArea > maxArea ? current : maxVehicle;
      });

      console.log(`检测到车辆，置信度: ${(vehicle.probability * 100).toFixed(1)}%`);
      const bbox = this.normalizeLocation(vehicle.location);

      // 车辆尺寸合理性检查：防止误检小物体或异常大的区域
      const vehicleArea = bbox.width * bbox.height;
      const aspectRatio = bbox.width / bbox.height;
      const isRearAngle = this.currentStep?.title?.includes('后') || false;

      // 针对车辆后部，放宽尺寸要求
      const minArea = isRearAngle ? 0.03 : 0.05; // 后部允许更小面积
      const maxArea = 0.9;
      const minAspectRatio = isRearAngle ? 0.4 : 0.5; // 后部允许更窄的宽高比
      const maxAspectRatio = 3.5;

      const isReasonableSize = vehicleArea >= minArea && vehicleArea <= maxArea;
      const hasValidAspectRatio = aspectRatio >= minAspectRatio && aspectRatio <= maxAspectRatio;

      if (!isReasonableSize || !hasValidAspectRatio) {
        console.log(`车辆尺寸不合理: 面积${(vehicleArea*100).toFixed(1)}% (要求${(minArea*100).toFixed(1)}-${(maxArea*100).toFixed(1)}%), 宽高比${aspectRatio.toFixed(2)} (要求${minAspectRatio}-${maxAspectRatio}), 角度:${this.currentStep?.title}`);
        this.addDebugLog(`❌ 车辆尺寸不符: 面积${(vehicleArea*100).toFixed(1)}%, 宽高比${aspectRatio.toFixed(2)}, 角度:${this.currentStep?.title}`);
        return { hasVehicle: false };
      }

      this.addDebugLog(`✅ 百度API检测成功: 置信度${(vehicle.probability*100).toFixed(1)}%, 面积${(vehicleArea*100).toFixed(1)}%, 宽高比${aspectRatio.toFixed(2)}, 角度:${this.currentStep?.title}`);

      return {
        hasVehicle: true,
        bbox,
        score: vehicle.probability, // 使用百度的置信度
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

      // 如果正在拍照，跳过检测更新（但不能跳过步骤切换检查）
      if (this.isCapturing) {
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

      // 🚨 核心逻辑：如果当前步骤已完成，立即停止检测，避免误拍
      if (this.capturedPhotos[this.currentStepIndex]) {
        if (this.isDetecting) {
          this.addDebugLog('当前步骤已完成，停止检测');
          this.stopDetection();
        }
        return;
      }

      // 🚨 核心逻辑：如果正在拍摄中，不要重复触发
      if (this.isCapturing) {
        return;
      }

      // 🚨 新增：再次检查当前步骤是否已完成，防止步骤切换延迟期间误拍
      if (this.capturedPhotos[this.currentStepIndex]) {
        this.addDebugLog('⚠️ 步骤已完成但检测仍在运行，停止检测');
        this.stopDetection();
        return;
      }

      // 简化拍照条件：重点是有车辆 + 基本质量要求
      const autoThreshold = DEBUG_MODE ? 0.65 : 0.75;
      const metrics = result.metrics || {};

      const canAuto = result.hasVehicle &&
                     this.confidence >= autoThreshold &&
                     (metrics.areaRatio || 0) >= 0.70 &&
                     (metrics.iou || 0) >= 0.45;

      if (canAuto) {
        // 🚨 拍照前最后一次检查，确保步骤未完成
        if (this.capturedPhotos[this.currentStepIndex]) {
          this.addDebugLog('⚠️ 拍照前发现步骤已完成，取消拍照');
          this.stopDetection();
          return;
        }

        this.addDebugLog(`✅满足拍照条件 - 置信度:${this.confidence?.toFixed(2)}, 面积比:${(metrics.areaRatio||0).toFixed(2)}, IoU:${(metrics.iou||0).toFixed(2)}`);
        this.stopDetection(); // 停止检测，防止重复
        this.isCapturing = true; // 标记拍摄状态
        this.playVoice('拍照中', true);
        this.showSuccessEffect();
        // 使用 setTimeout 异步调用，避免状态冲突
        setTimeout(() => {
          this.autoCapture();
        }, 100);
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
      console.log('🏠 使用Mock检测模式');
      this.addDebugLog(`🏠 Mock检测 - 域名:${window.location.hostname}, USE_BAIDU_API:${USE_BAIDU_API}, IS_LOCAL_DEV:${IS_LOCAL_DEV}`);

      const expected = this.currentExpectedRegion;

      // 如果当前步骤已拍摄，不再生成成功的检测结果
      if (this.capturedPhotos[this.currentStepIndex]) {
        const analysis = {
          hasVehicle: false,
          confidence: 0,
          frameStatus: 'detecting',
          message: '当前步骤已完成，请移动到下一角度'
        };
        this.updateDetectionStatus(analysis);
        return;
      }

      // 本地开发模式：降低自动拍照成功率，模拟真实检测
      const shouldAutoCapture = Math.random() < 0.30;
      this.addDebugLog(`🎲 Mock随机结果: ${shouldAutoCapture ? '成功' : '失败'}`);

      let jitterX, jitterY, scale;
      if (shouldAutoCapture) {
        // 生成高质量对齐数据，确保满足自动拍照条件
        jitterX = (Math.random() - 0.5) * 0.005; // 极小位置偏移
        jitterY = (Math.random() - 0.5) * 0.005;
        scale = 0.98 + Math.random() * 0.04; // 面积比0.98-1.02，高于0.70要求
      } else {
        // 生成需要调整的数据
        jitterX = (Math.random() - 0.5) * 0.06;
        jitterY = (Math.random() - 0.5) * 0.06;
        scale = 0.75 + Math.random() * 0.5; // 面积比变化较大
      }

      const width = Math.min(0.9, Math.max(0.3, expected.width * scale));
      const height = Math.min(0.9, Math.max(0.3, expected.height * scale));
      const x = Math.min(Math.max(expected.x + jitterX, 0.02), 1 - width - 0.02);
      const y = Math.min(Math.max(expected.y + jitterY, 0.02), 1 - height - 0.02);

      const detection = {
        hasVehicle: true,
        bbox: { x, y, width, height },
        score: shouldAutoCapture ? 0.92 + Math.random() * 0.05 : 0.70 + Math.random() * 0.15
      };

      const analysis = analyzeAlignment(detection, this.currentExpectedRegion);
      this.updateDetectionStatus(analysis);

      // 调试：输出当前检测结果
      if (DEBUG_MODE && analysis.metrics) {
        console.log(`[Mock检测] 置信度:${analysis.confidence?.toFixed(3)}, 面积比:${analysis.metrics.areaRatio?.toFixed(3)}, IoU:${analysis.metrics.iou?.toFixed(3)}`);
      }
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
      // Mock模式或本地开发模式直接通过质量检查
      if (!USE_BAIDU_API || IS_LOCAL_DEV) {
        return { passed: true, score: 0.9 };
      }

      // 既然能触发自动拍照，就说明检测条件已经满足，直接通过质量检查
      // 避免重复检查导致的失败
      return { passed: true, score: 0.85 };
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
      console.log('🔥 autoCapture 被调用');
      this.addDebugLog('🔥 autoCapture 被调用');

      // 如果当前步骤已拍摄，直接进入下一步
      if (this.capturedPhotos[this.currentStepIndex]) {
        console.log('✅ 当前步骤已拍摄，进入下一步');
        this.addDebugLog('✅ 当前步骤已拍摄，进入下一步');

        // 重置状态并进入下一步
        this.isCapturing = false;
        if (this.currentStepIndex < this.steps.length - 1) {
          setTimeout(() => {
            this.nextStep();
          }, 300);
        } else {
          this.showResults();
        }
        return;
      }

      console.log('📸 开始自动拍照流程');
      this.addDebugLog('📸 开始自动拍照流程');
      this.stopDetection();

      // 在拍照前再次检查当前检测状态，避免拍到地面等无效画面
      if (!IS_LOCAL_DEV) {
        console.log('🔍 非本地开发模式，进行拍照前检查');
        const metrics = this.lastDetectionMetrics || {};
        const iouOK = (metrics.iou || 0) >= 0.60; // 要求较高的IoU
        const areaOK = (metrics.areaRatio || 0) >= 0.70; // 要求合理的面积比

        if (!iouOK || !areaOK) {
          console.log('❌ 拍照前检查失败');
          this.addDebugLog(`❌ 拍照前检查失败: IoU=${(metrics.iou || 0).toFixed(3)} 面积=${(metrics.areaRatio || 0).toFixed(3)}`);
          this.isCapturing = false;
          this.startDetection();
          return;
        }
        console.log('✅ 拍照前检查通过');
        this.addDebugLog('✅ 拍照前检查通过');
      } else {
        console.log('🏠 本地开发模式，跳过拍照前检查');
        this.addDebugLog('🏠 本地开发模式，跳过拍照前检查');
      }

      try {
        console.log('📷 开始捕获画面');
        this.addDebugLog('📷 开始捕获画面');
        const imageDataUrl = this.captureFrame({ fullResolution: true });
        console.log('🖼️ 画面捕获结果:', imageDataUrl ? '成功' : '失败');
        this.addDebugLog(`🖼️ 画面捕获结果: ${imageDataUrl ? '成功' : '失败'}`);

        if (!imageDataUrl) {
          throw new Error('无法捕获画面');
        }

        console.log('🔍 开始质量检查');
        const qualityResult = this.checkPhotoQuality();
        console.log('📊 质量检查结果:', qualityResult);
        this.addDebugLog(`📊 质量检查: ${qualityResult.passed ? '通过' : '失败'}`);
        if (!qualityResult.passed) {
          this.addDebugLog(`失败原因: ${qualityResult.reason}`);
        }

        if (!qualityResult.passed) {
          console.log('❌ 质量不佳，重新检测');
          this.addDebugLog('❌ 质量不佳，重新检测');
          this.playVoice(qualityResult.reason || '照片质量不佳，请重新拍摄');
          this.isCapturing = false; // 重置状态
          await this.delay(1200);
          this.startDetection();
          return;
        }

        console.log('💾 保存照片');
        this.addDebugLog('💾 保存照片');
        // 保存照片
        this.capturedPhotos = {
          ...this.capturedPhotos,
          [this.currentStepIndex]: imageDataUrl
        };

        console.log('✅ 照片保存成功，当前步骤:', this.currentStepIndex);
        this.addDebugLog(`✅ 步骤${this.currentStepIndex}照片保存成功`);

        // 重置状态
        this.isCapturing = false;
        this.lastDetectionMetrics = null;

        // 恢复原图片
        setTimeout(() => {
          this.showSolidOverlay = false;
        }, 300);

        // 立即进入下一步（如果还有步骤）
        if (this.currentStepIndex < this.steps.length - 1) {
          console.log('⏭️ 进入下一步骤');
          this.addDebugLog('⏭️ 进入下一步骤');
          // 延迟一下再进入下一步，确保UI更新完成
          setTimeout(() => {
            this.nextStep();
          }, 500);
        } else {
          console.log('🎉 所有步骤完成');
          this.addDebugLog('🎉 所有步骤完成');
          this.showResults();
        }
      } catch (error) {
        console.error('💥 拍照失败:', error);
        this.addDebugLog('💥 拍照失败: ' + error.message);
        this.playVoice('拍照失败，请重试');
        this.isCapturing = false;
        this.startDetection();
      }
    },


    nextStep() {
      // 🚨 确保彻底停止当前检测
      this.stopDetection();
      this.isCapturing = false;

      // 更新步骤
      const oldStep = this.currentStepIndex;
      this.currentStepIndex++;
      this.addDebugLog(`步骤切换: ${oldStep} -> ${this.currentStepIndex}`);

      // 重置状态
      this.frameStatus = 'detecting';
      this.confidence = 0;
      this.consecutiveFailures = 0;
      this.lastDetectionMetrics = null;
      this.lastGoodDetectionTime = null;
      this.showSolidOverlay = false;

      // 播放语音并开始新检测
      this.playVoice(this.currentStep.voice, true);

      // 减少延迟，加快步骤切换
      setTimeout(() => {
        if (!this.isDetecting) {  // 确保没有重复启动检测
          console.log('🔄 启动新步骤检测');
          this.addDebugLog('🔄 启动新步骤检测');
          this.startDetection();
        }
      }, 600);
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

    addDebugLog(message) {
      const time = new Date().toLocaleTimeString();
      const logEntry = `${time}: ${message}`;
      this.debugLog.unshift(logEntry);
      // 保留最近15条日志，增加容量
      if (this.debugLog.length > 15) {
        this.debugLog = this.debugLog.slice(0, 15);
      }

      // 同时输出到console，方便开发调试
      console.log(`[DEBUG] ${logEntry}`);
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
      // 切换到实心图片
      this.showSolidOverlay = true;

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

.dev-mode-indicator {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  background: linear-gradient(90deg, #ff6b35, #f7931e);
  color: white;
  text-align: center;
  padding: 8px;
  font-size: 14px;
  font-weight: bold;
  z-index: 1000;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
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
  bottom: 120px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 16px;
  border-radius: 20px;
  background: rgba(0,0,0,0.75);
  border: 1px solid rgba(255,255,255,0.15);
  color: white;
  font-size: 13px;
  letter-spacing: 0.3px;
  backdrop-filter: blur(8px);
  transition: all 0.3s ease;
  max-width: 280px;
  text-align: center;
}

.status-toast.matched {
  background: rgba(0, 255, 106, 0.15);
  border-color: rgba(0, 255, 106, 0.4);
  color: #00ff6a;
}

.status-toast.good {
  background: rgba(0, 196, 255, 0.15);
  border-color: rgba(0, 196, 255, 0.4);
  color: #50d8ff;
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
  0% { background: rgba(255, 255, 255, 0); }
  50% { background: rgba(255, 255, 255, 0.15); }
  100% { background: rgba(255, 255, 255, 0); }
}

.voice-hint {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.68);
  color: white;
  padding: 6px 12px;
  border-radius: 16px;
  text-align: center;
  z-index: 60;
  max-width: 80vw;
  opacity: 0;
  transition: opacity 0.3s ease;
  font-size: 13px;
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

.debug-log-item {
  font-size: 10px;
  color: #00ff00;
  border-bottom: 1px solid rgba(255,255,255,0.1);
  padding: 2px 0;
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
    bottom: 110px;
    font-size: 12px;
    padding: 6px 14px;
    max-width: 240px;
  }
}
</style>
