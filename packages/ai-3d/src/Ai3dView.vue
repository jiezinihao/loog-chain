<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import * as THREE from 'three';

type ProjectId = 'three' | 'cesium' | 'game';

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
      { id: 'rubiks-cube', name: '还原魔方', stack: 'THREE.JS / PHASER' },
      { id: 'snake', name: '贪吃蛇', stack: 'PHASER' },
      { id: 'platform-jump', name: '像素平台跳跃', stack: 'PHASER / RAPIER' },
      { id: 'space-shooter', name: '太空射击', stack: 'THREE.JS / PHASER' },
    ],
  },
];

const activeProjectId = ref<ProjectId>('three');
const pageElement = ref<HTMLElement>();
const canvasElement = ref<HTMLCanvasElement>();
const activeProject = computed(
  () => projects.find((project) => project.id === activeProjectId.value) ?? projects[0],
);

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
const geometries: THREE.BufferGeometry[] = [];
const materials: THREE.Material[] = [];

function selectProject(projectId: ProjectId) {
  activeProjectId.value = projectId;
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

onMounted(async () => {
  await nextTick();
  pageElement.value?.focus();
  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  try {
    initializeScene();
  } catch (error) {
    // WebGL 不可用时保留完整项目列表，Three.js 仅作为渐进增强。
    console.warn('Three.js 背景初始化失败，页面将使用静态背景。', error);
    disposeScene();
  }
});

onBeforeUnmount(disposeScene);
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
              <span class="example-index">{{ String(index + 1).padStart(2, '0') }}</span>
              <h3>{{ example.name }}</h3>
              <p>{{ example.stack }}</p>
              <span class="display-mark">仅展示</span>
            </li>
          </ol>
        </section>
      </div>
    </section>
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
  display: grid;
  min-height: 88px;
  grid-template-columns: 3rem minmax(12rem, 1fr) minmax(10rem, .65fr) auto;
  align-items: center;
  border-bottom: 1px solid var(--page-border);
}

.example-index,
.example-item > p,
.display-mark {
  color: var(--page-subtle);
  font-size: .63rem;
  font-weight: 700;
  letter-spacing: .12em;
}

.example-index {
  font-variant-numeric: tabular-nums;
}

.example-item h3,
.example-item > p {
  margin: 0;
}

.example-item h3 {
  font-size: clamp(1.15rem, 2vw, 1.7rem);
  font-weight: 590;
  letter-spacing: -.035em;
}

.example-item > p {
  color: var(--page-muted);
}

.display-mark {
  padding: .4rem .55rem;
  border: 1px solid var(--page-border);
  color: var(--page-subtle);
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

  .example-item {
    min-height: 96px;
    grid-template-columns: 2.25rem minmax(0, 1fr) auto;
  }

  .example-item h3 {
    font-size: 1.2rem;
  }

  .example-item > p {
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
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    transition-duration: .01ms !important;
  }
}
</style>
