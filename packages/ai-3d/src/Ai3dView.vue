<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import * as THREE from 'three';

import AsyncGameLoading from './components/AsyncGameLoading.vue';

type ProjectId = 'three' | 'cesium' | 'game';
type GameId = 'rubiks-cube' | 'snake' | 'platform-jump' | 'top-down-racing';

interface ProjectExample {
  id: string;
  name: string;
  stack: string;
}

interface ProjectDefinition {
  id: ProjectId;
  index: string;
  name: string;
  code: string;
  examples: ProjectExample[];
}

const projects: ProjectDefinition[] = [
  {
    id: 'three',
    index: '01',
    name: 'Three',
    code: 'REALTIME 3D',
    examples: [
      { id: 'particle-field', name: '粒子引力场', stack: 'THREE.JS / GLSL' },
      { id: 'glass-refraction', name: '折射材质', stack: 'THREE.JS / MATERIAL' },
      { id: 'model-deconstruction', name: '模型拆解动画', stack: 'THREE.JS / GSAP' },
    ],
  },
  {
    id: 'cesium',
    index: '02',
    name: 'Cesium',
    code: 'DIGITAL GLOBE',
    examples: [
      { id: 'earth-day-night', name: '地球昼夜轨迹', stack: 'CESIUM / TIMELINE' },
      { id: 'city-data-stream', name: '城市数据流', stack: 'CESIUM / 3D TILES' },
      { id: 'global-flight-path', name: '全球航线追踪', stack: 'CESIUM / ENTITY' },
    ],
  },
  {
    id: 'game',
    index: '03',
    name: 'Game',
    code: 'PLAYABLE IDEAS',
    examples: [
      { id: 'rubiks-cube', name: '还原魔方', stack: 'THREE.JS / PUZZLE' },
      { id: 'snake', name: '贪吃蛇', stack: 'CANVAS 2D' },
      { id: 'platform-jump', name: '像素平台跳跃', stack: 'CANVAS 2D / PHYSICS' },
      { id: 'top-down-racing', name: '高空俯视赛车', stack: 'THREE.JS / TIME TRIAL' },
    ],
  },
];

// 每个游戏建立独立分包，只有用户进入对应工作台时才请求和初始化。
const gameComponents = {
  'rubiks-cube': defineAsyncComponent({
    loader: () => import('./games/RubiksCubeGame.vue'),
    loadingComponent: AsyncGameLoading,
    delay: 120,
  }),
  snake: defineAsyncComponent({
    loader: () => import('./games/SnakeGame.vue'),
    loadingComponent: AsyncGameLoading,
    delay: 120,
  }),
  'platform-jump': defineAsyncComponent({
    loader: () => import('./games/PlatformJumpGame.vue'),
    loadingComponent: AsyncGameLoading,
    delay: 120,
  }),
  'top-down-racing': defineAsyncComponent({
    loader: () => import('./games/TopDownRacingGame.vue'),
    loadingComponent: AsyncGameLoading,
    delay: 120,
  }),
} satisfies Record<GameId, ReturnType<typeof defineAsyncComponent>>;

const activeProjectId = ref<ProjectId>('three');
const activeGameId = ref<GameId>();
const pageElement = ref<HTMLElement>();
const canvasElement = ref<HTMLCanvasElement>();
const gameCloseButton = ref<HTMLButtonElement>();
const activeProject = computed(
  () => projects.find((project) => project.id === activeProjectId.value) ?? projects[0],
);
const gameProject = projects.find((project) => project.id === 'game');
const activeGame = computed(() => gameProject?.examples.find((example) => example.id === activeGameId.value));
const activeGameComponent = computed(() => activeGameId.value ? gameComponents[activeGameId.value] : undefined);

let renderer: THREE.WebGLRenderer | undefined;
let camera: THREE.PerspectiveCamera | undefined;
let scene: THREE.Scene | undefined;
let sceneGroup: THREE.Group | undefined;
let wireMaterial: THREE.MeshBasicMaterial | undefined;
let ringMaterial: THREE.MeshBasicMaterial | undefined;
let pointMaterial: THREE.PointsMaterial | undefined;
let resizeObserver: ResizeObserver | undefined;
let themeObserver: MutationObserver | undefined;
let animationFrame = 0;
let lastFrameTime = 0;
let elapsedTime = 0;
let motionDeadline = 0;
let pointerX = 0;
let pointerY = 0;
let reducedMotion = false;
let previousBodyOverflow = '';
let gameTriggerElement: HTMLElement | undefined;
const geometries: THREE.BufferGeometry[] = [];
const materials: THREE.Material[] = [];

function selectProject(projectId: ProjectId) {
  activeProjectId.value = projectId;
}

async function openGame(gameId: string, event: MouseEvent) {
  if (!(gameId in gameComponents)) return;
  gameTriggerElement = event.currentTarget as HTMLElement;
  activeGameId.value = gameId as GameId;
  previousBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  await nextTick();
  gameCloseButton.value?.focus();
}

async function closeGame() {
  activeGameId.value = undefined;
  document.body.style.overflow = previousBodyOverflow;
  await nextTick();
  gameTriggerElement?.focus();
}

function handlePageKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && activeGameId.value) void closeGame();
}

function createParticleGeometry() {
  const count = 160;
  const positions = new Float32Array(count * 3);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  // 使用确定性的球面分布生成点云，刷新页面时保持视觉构图稳定。
  for (let index = 0; index < count; index += 1) {
    const y = 1 - (index / (count - 1)) * 2;
    const radius = Math.sqrt(1 - y * y);
    const angle = goldenAngle * index;
    const distance = 1.75 + (index % 7) * 0.085;
    positions[index * 3] = Math.cos(angle) * radius * distance;
    positions[index * 3 + 1] = y * distance;
    positions[index * 3 + 2] = Math.sin(angle) * radius * distance;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geometry;
}

function updateSceneTheme() {
  const page = pageElement.value;
  if (!page) return;

  const styles = getComputedStyle(page);
  wireMaterial?.color.set(styles.getPropertyValue('--three-wire').trim() || '#8f82ff');
  ringMaterial?.color.set(styles.getPropertyValue('--three-ring').trim() || '#5ce4cf');
  pointMaterial?.color.set(styles.getPropertyValue('--three-point').trim() || '#d3ccff');
  renderScene();
}

function resizeScene() {
  const canvas = canvasElement.value;
  if (!canvas || !renderer || !camera) return;

  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width === 0 || height === 0) return;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderScene();
}

function renderScene() {
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

function renderFrame(time: number) {
  if (!sceneGroup) return;

  if (lastFrameTime > 0) {
    elapsedTime += Math.min((time - lastFrameTime) / 1000, 0.05);
  }
  lastFrameTime = time;

  sceneGroup.rotation.x += (-0.22 + pointerY * 0.28 - sceneGroup.rotation.x) * 0.035;
  sceneGroup.rotation.y += (elapsedTime * 0.14 + pointerX * 0.42 - sceneGroup.rotation.y) * 0.035;
  sceneGroup.rotation.z = Math.sin(elapsedTime * 0.24) * 0.08;
  renderScene();

  if (!reducedMotion && !document.hidden && time < motionDeadline) {
    animationFrame = window.requestAnimationFrame(renderFrame);
  } else {
    animationFrame = 0;
    lastFrameTime = 0;
  }
}

function scheduleMotion(duration = 1800) {
  if (reducedMotion || document.hidden) return;
  motionDeadline = performance.now() + duration;
  if (animationFrame === 0) {
    animationFrame = window.requestAnimationFrame(renderFrame);
  }
}

function updatePointer(event: PointerEvent) {
  if (reducedMotion) return;
  pointerX = event.clientX / window.innerWidth - 0.5;
  pointerY = event.clientY / window.innerHeight - 0.5;
  scheduleMotion();
}

// 页面进入后台时暂停 WebGL 帧循环，返回后从当前姿态继续渲染。
function handleVisibilityChange() {
  window.cancelAnimationFrame(animationFrame);
  animationFrame = 0;
  lastFrameTime = 0;
  if (!document.hidden && !reducedMotion) {
    scheduleMotion(4000);
  }
}

function initializeScene() {
  const canvas = canvasElement.value;
  if (!canvas) return;

  renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0, 7);
  sceneGroup = new THREE.Group();
  sceneGroup.position.set(1.35, -0.1, 0);
  scene.add(sceneGroup);

  const coreGeometry = new THREE.IcosahedronGeometry(1.5, 2);
  wireMaterial = new THREE.MeshBasicMaterial({
    color: 0x8f82ff,
    transparent: true,
    opacity: 0.32,
    wireframe: true,
  });
  const core = new THREE.Mesh(coreGeometry, wireMaterial);

  ringMaterial = new THREE.MeshBasicMaterial({
    color: 0x5ce4cf,
    transparent: true,
    opacity: 0.52,
    wireframe: true,
  });
  const outerRingGeometry = new THREE.TorusGeometry(2.12, 0.014, 5, 64);
  const innerRingGeometry = new THREE.TorusGeometry(1.83, 0.01, 5, 64);
  const outerRing = new THREE.Mesh(outerRingGeometry, ringMaterial);
  const innerRing = new THREE.Mesh(innerRingGeometry, ringMaterial);
  outerRing.rotation.set(Math.PI * 0.66, Math.PI * 0.18, 0);
  innerRing.rotation.set(Math.PI * 0.2, Math.PI * 0.58, 0);

  const particleGeometry = createParticleGeometry();
  pointMaterial = new THREE.PointsMaterial({
    color: 0xd3ccff,
    size: 0.035,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
  });
  const particles = new THREE.Points(particleGeometry, pointMaterial);

  geometries.push(coreGeometry, outerRingGeometry, innerRingGeometry, particleGeometry);
  materials.push(wireMaterial, ringMaterial, pointMaterial);
  sceneGroup.add(core, outerRing, innerRing, particles);

  resizeObserver = new ResizeObserver(resizeScene);
  resizeObserver.observe(canvas);
  themeObserver = new MutationObserver(updateSceneTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  pageElement.value?.addEventListener('pointermove', updatePointer);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  updateSceneTheme();
  resizeScene();
  motionDeadline = performance.now() + 12000;
  renderFrame(performance.now());
}

function disposeScene() {
  window.cancelAnimationFrame(animationFrame);
  animationFrame = 0;
  resizeObserver?.disconnect();
  themeObserver?.disconnect();
  pageElement.value?.removeEventListener('pointermove', updatePointer);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  renderer?.dispose();
  renderer?.forceContextLoss();
  geometries.length = 0;
  materials.length = 0;
  renderer = undefined;
  camera = undefined;
  scene = undefined;
  sceneGroup = undefined;
  wireMaterial = undefined;
  ringMaterial = undefined;
  pointMaterial = undefined;
}

function disposePage() {
  disposeScene();
  document.body.style.overflow = previousBodyOverflow;
  window.removeEventListener('keydown', handlePageKeydown);
}

onMounted(async () => {
  await nextTick();
  pageElement.value?.focus();
  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.addEventListener('keydown', handlePageKeydown);

  try {
    initializeScene();
  } catch (error) {
    // WebGL 不可用时保留完整项目列表，Three.js 仅作为渐进增强。
    console.warn('Three.js 背景初始化失败，页面将使用静态背景。', error);
    disposeScene();
  }
});

onBeforeUnmount(disposePage);
</script>

<template>
  <main ref="pageElement" class="ai-page" data-ai-3d-theme-root tabindex="-1">
    <a class="skip-link" href="#project-browser">跳至项目与例子列表</a>
    <canvas ref="canvasElement" class="three-stage" aria-hidden="true"></canvas>
    <div class="background-grid" aria-hidden="true"></div>

    <header class="ai-header">
      <RouterLink class="brand-link" to="/" aria-label="返回 Think Chain 首页">
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="m15 18-6-6 6-6" />
        </svg>
        <span>THINK CHAIN</span>
      </RouterLink>
      <span class="header-mark">AI / 3D</span>
    </header>

    <section id="project-browser" class="workspace" aria-labelledby="page-title">
      <header class="workspace-heading">
        <div>
          <p>AI EXPLORATION / CODE LIMITS</p>
          <h1 id="page-title"><span>AI</span> 探索编程极限</h1>
        </div>
        <p class="project-total" aria-label="共 3 个项目"><strong>03</strong><span>PROJECTS</span></p>
      </header>

      <div class="browser-layout">
        <aside class="project-panel">
          <p class="section-label">PROJECTS / 项目</p>
          <nav class="project-nav" aria-label="项目分类">
            <button
              v-for="project in projects"
              :key="project.id"
              class="project-button"
              :class="{ 'project-button--active': project.id === activeProjectId }"
              type="button"
              :aria-pressed="project.id === activeProjectId"
              @click="selectProject(project.id)"
            >
              <span class="project-index">{{ project.index }}</span>
              <span class="project-name">{{ project.name }}</span>
              <span class="project-count">{{ String(project.examples.length).padStart(2, '0') }}</span>
            </button>
          </nav>
        </aside>

        <section class="example-panel" aria-labelledby="example-title">
          <header class="example-heading">
            <div>
              <p class="section-label">EXAMPLES / 例子</p>
              <h2 id="example-title">{{ activeProject.name }}</h2>
            </div>
            <p><span>{{ activeProject.code }}</span>{{ activeProject.examples.length }} 个例子</p>
          </header>

          <ol class="example-list" aria-live="polite">
            <li v-for="(example, index) in activeProject.examples" :key="example.id" class="example-item">
              <button
                v-if="activeProject.id === 'game'"
                class="example-entry example-entry--playable"
                type="button"
                :aria-label="`进入${example.name}游戏`"
                @click="openGame(example.id, $event)"
              >
                <span class="example-index">{{ String(index + 1).padStart(2, '0') }}</span>
                <span class="example-name">{{ example.name }}</span>
                <span class="example-stack">{{ example.stack }}</span>
                <span class="display-mark">
                  进入
                  <svg aria-hidden="true" viewBox="0 0 24 24">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </span>
              </button>
              <div v-else class="example-entry">
                <span class="example-index">{{ String(index + 1).padStart(2, '0') }}</span>
                <span class="example-name">{{ example.name }}</span>
                <span class="example-stack">{{ example.stack }}</span>
                <span class="display-mark">仅展示</span>
              </div>
            </li>
          </ol>
        </section>
      </div>
    </section>

    <Transition name="game-workspace">
      <section
        v-if="activeGameId && activeGameComponent"
        class="game-workspace"
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-workspace-title"
      >
        <header class="game-workspace__bar">
          <div>
            <span>PLAYABLE EXAMPLE</span>
            <strong id="game-workspace-title">{{ activeGame?.name }}</strong>
          </div>
          <button ref="gameCloseButton" type="button" aria-label="关闭游戏并返回例子列表" @click="closeGame">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
            <span>返回列表</span>
          </button>
        </header>
        <div class="game-workspace__content">
          <component :is="activeGameComponent" />
        </div>
      </section>
    </Transition>
  </main>
</template>

<style>
/* 跨越异步路由包的 scoped 边界，确保根主题变化能覆盖 AI-3D 页语义色。 */
html[data-theme='light'] [data-ai-3d-theme-root] {
  --page-background: #f1f0ec;
  --page-surface: rgb(250 249 246 / 30%);
  --page-surface-active: rgb(255 255 255 / 96%);
  --page-foreground: #20232a;
  --page-muted: #565d69;
  --page-subtle: #707681;
  --page-border: rgb(32 35 42 / 18%);
  --page-border-strong: rgb(32 35 42 / 32%);
  --page-accent: #6450c4;
  --page-accent-secondary: #087c70;
  --page-focus: #533eae;
  --three-wire: #6652c7;
  --three-ring: #0e8a7c;
  --three-point: #765fd1;
  --game-background: #f1f0ec;
  --game-surface: rgb(255 255 255 / 72%);
  --game-foreground: #20232a;
  --game-muted: #565d69;
  --game-border: rgb(32 35 42 / 18%);
  --game-border-strong: rgb(32 35 42 / 34%);
  --game-accent: #6450c4;
  --game-on-accent: #fff;
  --game-accent-secondary: #087c70;
  --game-focus: #533eae;
  --game-control: #f8f7f3;
  --game-control-hover: #e8e3f6;
  --game-canvas: #e8e6e1;
  --game-canvas-grid: rgb(32 35 42 / 9%);
  --game-grid: rgb(32 35 42 / 8%);
  --game-stage-glow: rgb(100 80 196 / 15%);
  --game-shadow: rgb(45 39 63 / 15%);
  --game-loading-cell: rgb(100 80 196 / 14%);
  --game-danger: #b42318;
  --game-danger-soft: rgb(180 35 24 / 12%);
  --racing-sky: #dbe8ed;
  --racing-fog: #dbe8ed;
  --racing-ambient: #f8fbfc;
  --racing-key-light: #fff4dc;
  --racing-hud: rgb(250 249 246 / 92%);
  --racing-hud-strong: rgb(255 255 255 / 98%);
  --racing-scrim: rgb(20 24 30 / 48%);
  --cube-edge: #272a31;
  background:
    radial-gradient(circle at 76% 36%, rgb(101 79 193 / 13%), transparent 31rem),
    var(--page-background);
}
</style>

<style scoped>
:global(*) {
  box-sizing: border-box;
}

:global(body) {
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.ai-page {
  --page-background: #080a0f;
  --page-surface: rgb(13 16 24 / 30%);
  --page-surface-active: rgb(24 28 40 / 92%);
  --page-foreground: #f4f5f8;
  --page-muted: #a5abb7;
  --page-subtle: #747c8b;
  --page-border: rgb(255 255 255 / 14%);
  --page-border-strong: rgb(255 255 255 / 28%);
  --page-accent: #9f91ff;
  --page-accent-secondary: #68e5d1;
  --page-focus: #68e5d1;
  --three-wire: #9485ff;
  --three-ring: #62e5d1;
  --three-point: #d4ceff;
  --game-background: #080a0f;
  --game-surface: rgb(19 23 34 / 82%);
  --game-foreground: #f4f5f8;
  --game-muted: #a5abb7;
  --game-border: rgb(255 255 255 / 14%);
  --game-border-strong: rgb(255 255 255 / 28%);
  --game-accent: #9f91ff;
  --game-on-accent: #090b10;
  --game-accent-secondary: #68e5d1;
  --game-focus: #68e5d1;
  --game-control: #111620;
  --game-control-hover: #20263a;
  --game-canvas: #0c1018;
  --game-canvas-grid: rgb(255 255 255 / 7%);
  --game-grid: rgb(255 255 255 / 6%);
  --game-stage-glow: rgb(104 81 228 / 18%);
  --game-shadow: rgb(0 0 0 / 42%);
  --game-loading-cell: rgb(159 145 255 / 18%);
  --game-danger: #ff8686;
  --game-danger-soft: rgb(255 104 104 / 15%);
  --racing-sky: #101923;
  --racing-fog: #101923;
  --racing-ambient: #9fb3c7;
  --racing-key-light: #ffe2b2;
  --racing-hud: rgb(10 15 22 / 88%);
  --racing-hud-strong: rgb(14 20 29 / 96%);
  --racing-scrim: rgb(3 6 10 / 58%);
  --cube-edge: #080a0f;
  position: relative;
  min-width: 320px;
  min-height: 100dvh;
  overflow: hidden;
  background:
    radial-gradient(circle at 76% 36%, rgb(96 80 207 / 16%), transparent 31rem),
    var(--page-background);
  color: var(--page-foreground);
  outline: none;
  isolation: isolate;
  transition: background-color 220ms ease, color 220ms ease;
}

.three-stage,
.background-grid {
  position: absolute;
  z-index: -2;
  width: 100%;
  height: 100%;
  inset: 0;
  pointer-events: none;
}

.three-stage {
  display: block;
  opacity: .9;
  mask-image: linear-gradient(90deg, transparent 22%, #000 58%, #000 100%);
}

.background-grid {
  z-index: -1;
  opacity: .22;
  background-image:
    linear-gradient(var(--page-border) 1px, transparent 1px),
    linear-gradient(90deg, var(--page-border) 1px, transparent 1px);
  background-size: 64px 64px;
  mask-image: linear-gradient(90deg, #000, transparent 72%);
}

.skip-link {
  position: fixed;
  z-index: 1100;
  top: 1rem;
  left: 1rem;
  padding: .75rem 1rem;
  background: var(--page-foreground);
  color: var(--page-background);
  font-size: .78rem;
  font-weight: 700;
  text-decoration: none;
  transform: translateY(-160%);
  transition: transform 180ms ease-out;
}

.skip-link:focus-visible {
  transform: translateY(0);
}

.ai-header {
  position: relative;
  z-index: 10;
  display: flex;
  min-height: 72px;
  align-items: center;
  justify-content: space-between;
  padding: max(1rem, env(safe-area-inset-top)) max(10.5rem, calc(env(safe-area-inset-right) + 10.5rem)) 1rem max(1.5rem, env(safe-area-inset-left));
  border-bottom: 1px solid var(--page-border);
}

.brand-link {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  color: inherit;
  font-size: .72rem;
  font-weight: 750;
  letter-spacing: .16em;
  text-decoration: none;
  transition: color 180ms ease;
}

.brand-link svg {
  width: 18px;
  margin-right: .7rem;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.brand-link:hover {
  color: var(--page-accent-secondary);
}

.brand-link:focus-visible,
.project-button:focus-visible {
  outline: 2px solid var(--page-focus);
  outline-offset: 3px;
}

.header-mark {
  color: var(--page-muted);
  font-size: .68rem;
  font-weight: 700;
  letter-spacing: .17em;
}

.workspace {
  position: relative;
  z-index: 1;
  width: min(100%, 1520px);
  min-height: calc(100dvh - 72px);
  margin: 0 auto;
  padding: clamp(2.75rem, 5vw, 5rem) clamp(1.5rem, 5vw, 5rem) clamp(4rem, 7vw, 7rem);
}

.workspace-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: clamp(2.5rem, 5vw, 4.5rem);
}

.workspace-heading > div > p,
.section-label {
  margin: 0;
  color: var(--page-accent-secondary);
  font-size: .65rem;
  font-weight: 750;
  letter-spacing: .2em;
}

.workspace-heading h1 {
  margin: .75rem 0 0;
  font-size: clamp(3rem, 6.3vw, 6.4rem);
  font-weight: 570;
  letter-spacing: -.075em;
  line-height: .95;
}

.workspace-heading h1 span {
  color: var(--page-accent);
  font-family: Georgia, "Times New Roman", serif;
  font-weight: 400;
}

.project-total {
  display: flex;
  align-items: flex-end;
  margin: 0;
  color: var(--page-muted);
}

.project-total strong {
  margin-right: .8rem;
  color: var(--page-foreground);
  font-family: Georgia, "Times New Roman", serif;
  font-size: 2.8rem;
  font-weight: 400;
  line-height: .8;
}

.project-total span {
  font-size: .62rem;
  font-weight: 750;
  letter-spacing: .17em;
}

.browser-layout {
  display: grid;
  grid-template-columns: minmax(15rem, 22%) minmax(0, 1fr);
  border-top: 1px solid var(--page-border-strong);
  border-bottom: 1px solid var(--page-border-strong);
  background: var(--page-surface);
  backdrop-filter: blur(4px);
}

.project-panel {
  padding: 2rem clamp(1.5rem, 3vw, 2.75rem) 2.75rem;
  border-right: 1px solid var(--page-border-strong);
}

.project-nav {
  margin-top: 1.5rem;
  border-top: 1px solid var(--page-border);
}

.project-button {
  position: relative;
  display: grid;
  width: 100%;
  min-height: 72px;
  grid-template-columns: 2.5rem 1fr auto;
  align-items: center;
  padding: 0 .75rem 0 0;
  border: 0;
  border-bottom: 1px solid var(--page-border);
  background: transparent;
  color: var(--page-muted);
  cursor: pointer;
  font: inherit;
  text-align: left;
  touch-action: manipulation;
  transition: background-color 180ms ease, color 180ms ease;
}

.project-button::before {
  position: absolute;
  left: 0;
  width: 3px;
  height: 0;
  background: var(--page-accent-secondary);
  content: '';
  transition: height 220ms cubic-bezier(.16, 1, .3, 1);
}

.project-button:hover,
.project-button--active {
  background: var(--page-surface-active);
  color: var(--page-foreground);
}

.project-button--active::before {
  height: 28px;
}

.project-index,
.project-count {
  color: var(--page-subtle);
  font-size: .63rem;
  font-variant-numeric: tabular-nums;
  letter-spacing: .12em;
}

.project-index {
  padding-left: .75rem;
}

.project-name {
  font-size: 1rem;
  font-weight: 680;
}

.example-panel {
  min-width: 0;
  padding: 2rem clamp(1.5rem, 4vw, 4rem) 2.75rem;
}

.example-heading {
  display: flex;
  min-height: 76px;
  align-items: flex-start;
  justify-content: space-between;
}

.example-heading h2 {
  margin: .55rem 0 0;
  font-size: clamp(2rem, 4vw, 3.8rem);
  font-weight: 580;
  letter-spacing: -.065em;
  line-height: 1;
}

.example-heading > p {
  margin: .1rem 0 0;
  color: var(--page-muted);
  font-size: .68rem;
  letter-spacing: .08em;
  text-align: right;
}

.example-heading > p span {
  display: block;
  margin-bottom: .5rem;
  color: var(--page-accent-secondary);
  font-size: .62rem;
  font-weight: 750;
  letter-spacing: .14em;
}

.example-list {
  margin: 1.75rem 0 0;
  padding: 0;
  border-top: 1px solid var(--page-border);
  list-style: none;
}

.example-item {
  border-bottom: 1px solid var(--page-border);
}

.example-entry {
  display: grid;
  width: 100%;
  min-height: 88px;
  grid-template-columns: 3rem minmax(12rem, 1fr) minmax(10rem, .65fr) auto;
  align-items: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
}

.example-entry--playable {
  cursor: pointer;
  touch-action: manipulation;
  transition: background-color 180ms ease, padding 220ms cubic-bezier(.16, 1, .3, 1);
}

.example-entry--playable:hover {
  padding-right: .75rem;
  padding-left: .75rem;
  background: var(--page-surface-active);
}

.example-entry--playable:focus-visible {
  outline: 2px solid var(--page-focus);
  outline-offset: -2px;
}

.example-index,
.example-stack,
.display-mark {
  color: var(--page-subtle);
  font-size: .63rem;
  font-weight: 700;
  letter-spacing: .12em;
}

.example-index {
  font-variant-numeric: tabular-nums;
}

.example-name {
  font-size: clamp(1.15rem, 2vw, 1.7rem);
  font-weight: 590;
  letter-spacing: -.035em;
}

.example-stack {
  color: var(--page-muted);
}

.display-mark {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  padding: .4rem .55rem;
  border: 1px solid var(--page-border);
  color: var(--page-subtle);
}

.display-mark svg {
  width: 14px;
  margin-left: .35rem;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.example-entry--playable:hover .display-mark {
  border-color: var(--page-accent-secondary);
  color: var(--page-accent-secondary);
}

.game-workspace {
  position: fixed;
  z-index: 100;
  display: flex;
  min-width: 320px;
  flex-direction: column;
  overflow: auto;
  background:
    radial-gradient(circle at 72% 20%, var(--game-stage-glow), transparent 34rem),
    var(--game-background);
  color: var(--game-foreground);
  inset: 0;
}

.game-workspace__bar {
  position: sticky;
  z-index: 2;
  top: 0;
  display: flex;
  min-height: 72px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  padding: max(1rem, env(safe-area-inset-top)) max(10.5rem, calc(env(safe-area-inset-right) + 10.5rem)) 1rem max(1.25rem, env(safe-area-inset-left));
  border-bottom: 1px solid var(--game-border);
  background: var(--game-background);
}

.game-workspace__bar > div {
  display: flex;
  align-items: baseline;
}

.game-workspace__bar > div span {
  margin-right: .8rem;
  color: var(--game-accent-secondary);
  font-size: .6rem;
  font-weight: 750;
  letter-spacing: .18em;
}

.game-workspace__bar strong {
  font-size: .86rem;
  font-weight: 650;
}

.game-workspace__bar button {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  padding: 0 .8rem;
  border: 1px solid var(--game-border-strong);
  background: var(--game-control);
  color: var(--game-foreground);
  cursor: pointer;
  font: inherit;
  font-size: .72rem;
  font-weight: 700;
  touch-action: manipulation;
  transition: border-color 180ms ease, background-color 180ms ease;
}

.game-workspace__bar button:hover {
  border-color: var(--game-accent-secondary);
  background: var(--game-control-hover);
}

.game-workspace__bar button:focus-visible {
  outline: 2px solid var(--game-focus);
  outline-offset: 2px;
}

.game-workspace__bar button svg {
  width: 16px;
  margin-right: .55rem;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-width: 1.8;
}

.game-workspace__content {
  width: min(100%, 1600px);
  flex: 1;
  align-self: center;
}

.game-workspace-enter-active,
.game-workspace-leave-active {
  transition: opacity 240ms ease, transform 320ms cubic-bezier(.16, 1, .3, 1);
}

.game-workspace-enter-from,
.game-workspace-leave-to {
  opacity: 0;
  transform: translateY(1.5rem);
}

@media (max-width: 900px) {
  .three-stage {
    opacity: .62;
    mask-image: linear-gradient(to bottom, #000, transparent 78%);
  }

  .workspace-heading {
    align-items: flex-start;
  }

  .project-total {
    margin-top: 1.5rem;
  }

  .browser-layout {
    grid-template-columns: 1fr;
  }

  .project-panel {
    padding-bottom: 2rem;
    border-right: 0;
    border-bottom: 1px solid var(--page-border-strong);
  }

  .project-nav {
    display: flex;
    margin: 1.5rem -.35rem 0;
    border-top: 0;
  }

  .project-button {
    min-height: 56px;
    grid-template-columns: 1fr auto;
    margin: 0 .35rem;
    padding: 0 .8rem;
    border: 1px solid var(--page-border);
  }

  .project-button::before,
  .project-index {
    display: none;
  }

  .example-panel {
    padding-top: 2.5rem;
  }
}

@media (max-width: 620px) {
  .ai-header {
    min-height: 68px;
    padding-right: max(9.5rem, calc(env(safe-area-inset-right) + 9.5rem));
  }

  .header-mark,
  .project-total {
    display: none;
  }

  .workspace {
    min-height: calc(100dvh - 68px);
    padding-top: 2.75rem;
    padding-right: 1.25rem;
    padding-left: 1.25rem;
  }

  .workspace-heading {
    margin-bottom: 2.5rem;
  }

  .workspace-heading h1 {
    font-size: clamp(3rem, 14vw, 4.2rem);
  }

  .project-panel,
  .example-panel {
    padding-right: 1rem;
    padding-left: 1rem;
  }

  .project-button {
    grid-template-columns: 1fr;
    justify-items: center;
    margin: 0 .2rem;
    padding: 0 .35rem;
  }

  .project-count {
    display: none;
  }

  .example-heading {
    min-height: 68px;
  }

  .example-heading > p {
    display: none;
  }

  .example-list {
    margin-top: 1.25rem;
  }

  .example-entry {
    min-height: 96px;
    grid-template-columns: 2.25rem minmax(0, 1fr) auto;
  }

  .example-name {
    font-size: 1.2rem;
  }

  .example-stack {
    grid-column: 2;
    margin-top: -1.6rem;
    padding-right: .75rem;
    font-size: .58rem;
  }

  .display-mark {
    grid-row: 1 / span 2;
    grid-column: 3;
    padding: .35rem .4rem;
    font-size: .55rem;
  }

  .example-entry--playable:hover {
    padding-right: .35rem;
    padding-left: .35rem;
  }

  .game-workspace__bar {
    min-height: 68px;
    padding-right: max(9.5rem, calc(env(safe-area-inset-right) + 9.5rem));
  }

  .game-workspace__bar > div span,
  .game-workspace__bar button span {
    display: none;
  }

  .game-workspace__bar button {
    width: 44px;
    justify-content: center;
    padding: 0;
  }

  .game-workspace__bar button svg {
    margin-right: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    transition-duration: .01ms !important;
  }

  .game-workspace-enter-active,
  .game-workspace-leave-active {
    transition: none;
  }
}
</style>
