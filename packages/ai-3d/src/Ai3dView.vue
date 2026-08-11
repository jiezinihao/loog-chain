<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';

type ExperimentCategory = 'three' | 'cesium' | 'game';

interface Experiment {
  id: string;
  category: ExperimentCategory;
  index: string;
  title: string;
  summary: string;
  meta: string;
  status: string;
}

const categories: Array<{ id: ExperimentCategory; label: string; code: string }> = [
  { id: 'three', label: 'Three', code: 'WEBGL' },
  { id: 'cesium', label: 'Cesium', code: 'GLOBE' },
  { id: 'game', label: 'Game', code: 'PLAY' },
];

const experiments: Experiment[] = [
  {
    id: 'particle-gravity',
    category: 'three',
    index: '01',
    title: '粒子引力场',
    summary: '用空间噪声和鼠标向量构造持续流动的粒子轨迹，观察交互输入如何改变群体运动。',
    meta: 'THREE.JS / GLSL',
    status: '实验中',
  },
  {
    id: 'glass-refraction',
    category: 'three',
    index: '02',
    title: '折射材质研究',
    summary: '围绕透射、色散与环境光照建立材质练习，记录实时渲染中的视觉取舍。',
    meta: 'THREE.JS / MATERIAL',
    status: '构建中',
  },
  {
    id: 'earth-orbit',
    category: 'cesium',
    index: '03',
    title: '地球昼夜轨迹',
    summary: '把时间、轨道和地表光照组织成可探索的空间叙事，呈现一天中的连续变化。',
    meta: 'CESIUM / TIMELINE',
    status: '实验中',
  },
  {
    id: 'city-stream',
    category: 'cesium',
    index: '04',
    title: '城市数据流',
    summary: '尝试将城市级数据映射到三维地理空间，在信息密度与阅读效率之间寻找平衡。',
    meta: 'CESIUM / 3D TILES',
    status: '构思中',
  },
  {
    id: 'kinetic-room',
    category: 'game',
    index: '05',
    title: '动量房间',
    summary: '以短循环关卡验证碰撞、惯性与反馈节奏，让物理规则成为游戏本身。',
    meta: 'PHASER / RAPIER',
    status: '原型中',
  },
  {
    id: 'signal-hunter',
    category: 'game',
    index: '06',
    title: '信号猎手',
    summary: '通过声音提示和有限视野建立探索压力，测试极简规则能否形成清晰的决策空间。',
    meta: 'CANVAS / AUDIO',
    status: '构思中',
  },
];

const activeCategory = ref<ExperimentCategory>('three');
const canvasElement = ref<HTMLCanvasElement>();
const mainElement = ref<HTMLElement>();
const reducedMotion = ref(false);
let animationFrame = 0;
let resizeObserver: ResizeObserver | undefined;
let themeObserver: MutationObserver | undefined;
let pointerX = 0;
let pointerY = 0;
let canvasColors = {
  background: '#090b11',
  primary: '#8f7cff',
  secondary: '#5ce4ce',
  line: 'rgba(255, 255, 255, .18)',
};

const activeCategoryInfo = computed(() =>
  categories.find((category) => category.id === activeCategory.value) ?? categories[0],
);
const filteredExperiments = computed(() =>
  experiments.filter((experiment) => experiment.category === activeCategory.value),
);

function selectCategory(category: ExperimentCategory) {
  activeCategory.value = category;
}

function getCanvasColors() {
  const styles = getComputedStyle(mainElement.value ?? document.documentElement);
  return {
    background: styles.getPropertyValue('--ai-canvas-background').trim() || '#090b11',
    primary: styles.getPropertyValue('--ai-canvas-primary').trim() || '#8f7cff',
    secondary: styles.getPropertyValue('--ai-canvas-secondary').trim() || '#5ce4ce',
    line: styles.getPropertyValue('--ai-canvas-line').trim() || 'rgba(255, 255, 255, .18)',
  };
}

// Canvas 仅负责首屏氛围，不承载信息，缩放时限制 DPR 以控制每帧绘制成本。
function resizeCanvas() {
  const canvas = canvasElement.value;
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  drawCanvas(performance.now());
}

function refreshCanvasColors() {
  canvasColors = getCanvasColors();
  resizeCanvas();
}

function drawCanvas(time: number) {
  const canvas = canvasElement.value;
  const context = canvas?.getContext('2d');
  if (!canvas || !context) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = canvas.width / dpr;
  const height = canvas.height / dpr;
  const colors = canvasColors;
  const elapsed = reducedMotion.value ? 0 : time * 0.00028;
  const centerX = width * (0.63 + pointerX * 0.035);
  const centerY = height * (0.48 + pointerY * 0.035);
  const radius = Math.min(width, height) * 0.3;

  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = colors.background;
  context.fillRect(0, 0, width, height);

  const glow = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius * 1.8);
  glow.addColorStop(0, `${colors.primary}52`);
  glow.addColorStop(0.46, `${colors.secondary}1f`);
  glow.addColorStop(1, 'transparent');
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);

  // 多层椭圆轨道用二维绘制模拟三维景深，保持实现轻量且不提前引入 WebGL。
  for (let ring = 0; ring < 5; ring += 1) {
    context.save();
    context.translate(centerX, centerY);
    context.rotate(elapsed * (ring % 2 === 0 ? 1 : -0.72) + ring * 0.58);
    context.scale(1, 0.34 + ring * 0.025);
    context.beginPath();
    context.arc(0, 0, radius * (0.48 + ring * 0.14), 0, Math.PI * 2);
    context.strokeStyle = colors.line;
    context.lineWidth = 1;
    context.stroke();
    context.restore();
  }

  for (let index = 0; index < 72; index += 1) {
    const phase = (index / 72) * Math.PI * 2;
    const orbit = radius * (0.34 + (index % 9) * 0.07);
    const depth = Math.sin(phase * 2.4 + elapsed * 5);
    const x = centerX + Math.cos(phase + elapsed * (1 + (index % 4) * 0.08)) * orbit;
    const y = centerY + Math.sin(phase + elapsed * 1.4) * orbit * 0.38 + depth * radius * 0.13;
    const size = 0.8 + ((depth + 1) / 2) * 2.2;

    context.beginPath();
    context.arc(x, y, size, 0, Math.PI * 2);
    context.fillStyle = index % 3 === 0 ? colors.secondary : colors.primary;
    context.globalAlpha = 0.28 + ((depth + 1) / 2) * 0.65;
    context.fill();
  }

  context.globalAlpha = 1;
}

function animate(time: number) {
  drawCanvas(time);
  if (!reducedMotion.value) {
    animationFrame = window.requestAnimationFrame(animate);
  }
}

function updatePointer(event: PointerEvent) {
  const canvas = canvasElement.value;
  if (!canvas || reducedMotion.value) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  pointerX = event.offsetX / (canvas.width / dpr) - 0.5;
  pointerY = event.offsetY / (canvas.height / dpr) - 0.5;
}

// 页面进入后台时暂停帧循环，恢复后再继续，避免不可见状态占用渲染资源。
function handleVisibilityChange() {
  window.cancelAnimationFrame(animationFrame);
  if (!document.hidden && !reducedMotion.value) {
    animationFrame = window.requestAnimationFrame(animate);
  }
}

onMounted(async () => {
  await nextTick();
  mainElement.value?.focus();
  reducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const canvas = canvasElement.value;
  if (!canvas) return;

  resizeObserver = new ResizeObserver(resizeCanvas);
  resizeObserver.observe(canvas);
  themeObserver = new MutationObserver(refreshCanvasColors);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  canvas.addEventListener('pointermove', updatePointer);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  refreshCanvasColors();
  animate(performance.now());
});

onBeforeUnmount(() => {
  window.cancelAnimationFrame(animationFrame);
  resizeObserver?.disconnect();
  themeObserver?.disconnect();
  canvasElement.value?.removeEventListener('pointermove', updatePointer);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
});
</script>

<template>
  <main ref="mainElement" class="ai-page" tabindex="-1">
    <a class="skip-link" href="#experiment-list">跳至实验列表</a>

    <header class="ai-header">
      <RouterLink class="brand-link" to="/" aria-label="返回 Think Chain 首页">
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="m15 18-6-6 6-6" />
        </svg>
        <span>THINK CHAIN</span>
      </RouterLink>
      <span class="header-mark" aria-hidden="true">AI / 3D</span>
    </header>

    <section class="hero" aria-labelledby="ai-3d-title">
      <canvas ref="canvasElement" class="hero-canvas" aria-hidden="true"></canvas>
      <div class="hero-grid" aria-hidden="true"></div>
      <div class="hero-copy">
        <p class="eyebrow">CREATIVE COMPUTING / 2026</p>
        <h1 id="ai-3d-title">构造数字<br /><em>空间实验</em></h1>
        <p class="hero-description">收集关于实时渲染、地理空间与互动游戏的练习。先从一个想法出发，再让它变得可以被看见、触碰和体验。</p>
      </div>
      <div class="hero-aside" aria-hidden="true">
        <span>CANVAS STUDY</span>
        <strong>2D → 3D</strong>
      </div>
      <p class="scroll-cue" aria-hidden="true"><span></span>SCROLL TO EXPLORE</p>
    </section>

    <section id="experiment-list" class="catalogue" aria-labelledby="catalogue-title">
      <aside class="category-panel">
        <p class="section-label">FILTER / 分类</p>
        <h2 id="catalogue-title">实验索引</h2>
        <nav class="category-nav" aria-label="实验分类">
          <button
            v-for="category in categories"
            :key="category.id"
            class="category-button"
            :class="{ 'category-button--active': category.id === activeCategory }"
            type="button"
            :aria-pressed="category.id === activeCategory"
            @click="selectCategory(category.id)"
          >
            <span>{{ category.label }}</span>
            <small>{{ category.code }}</small>
          </button>
        </nav>
        <p class="category-note">当前收录 {{ filteredExperiments.length }} 个 {{ activeCategoryInfo.label }} 实验</p>
      </aside>

      <div class="experiment-list" aria-live="polite">
        <article v-for="experiment in filteredExperiments" :key="experiment.id" class="experiment-card">
          <span class="experiment-index">{{ experiment.index }}</span>
          <div class="experiment-content">
            <p>{{ experiment.meta }}</p>
            <h3>{{ experiment.title }}</h3>
            <p class="experiment-summary">{{ experiment.summary }}</p>
          </div>
          <span class="experiment-status"><i aria-hidden="true"></i>{{ experiment.status }}</span>
        </article>
      </div>
    </section>

    <footer class="ai-footer">
      <p>AI · 3D LAB</p>
      <p>BUILDING VISUAL IDEAS INTO REAL-TIME EXPERIENCES.</p>
      <RouterLink to="/">返回入口</RouterLink>
    </footer>
  </main>
</template>

<style scoped>
:global(*) {
  box-sizing: border-box;
}

:global(body) {
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.ai-page {
  --ai-background: #090b11;
  --ai-surface: #0e1119;
  --ai-surface-raised: #141824;
  --ai-foreground: #f3f5f7;
  --ai-muted: #9ca3b2;
  --ai-subtle: #707887;
  --ai-border: rgb(255 255 255 / 14%);
  --ai-border-strong: rgb(255 255 255 / 28%);
  --ai-accent: #a897ff;
  --ai-accent-secondary: #68e4d2;
  --ai-focus: #68e4d2;
  --ai-canvas-background: #090b11;
  --ai-canvas-primary: #9f8cff;
  --ai-canvas-secondary: #5ce4ce;
  --ai-canvas-line: rgb(255 255 255 / 18%);
  min-width: 320px;
  min-height: 100dvh;
  overflow: hidden;
  background: var(--ai-background);
  color: var(--ai-foreground);
  outline: none;
  transition: background-color 220ms ease, color 220ms ease;
}

:global(html[data-theme='light']) .ai-page {
  --ai-background: #f3f1ed;
  --ai-surface: #faf9f6;
  --ai-surface-raised: #fff;
  --ai-foreground: #1d2027;
  --ai-muted: #565d69;
  --ai-subtle: #6f7580;
  --ai-border: rgb(29 32 39 / 17%);
  --ai-border-strong: rgb(29 32 39 / 31%);
  --ai-accent: #6550c9;
  --ai-accent-secondary: #087c70;
  --ai-focus: #5540b3;
  --ai-canvas-background: #e9e6f0;
  --ai-canvas-primary: #755ed2;
  --ai-canvas-secondary: #168f82;
  --ai-canvas-line: rgb(38 34 58 / 22%);
}

.skip-link {
  position: fixed;
  z-index: 1100;
  top: 1rem;
  left: 1rem;
  padding: .75rem 1rem;
  background: var(--ai-foreground);
  color: var(--ai-background);
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
  position: absolute;
  z-index: 10;
  top: 0;
  right: 0;
  left: 0;
  display: flex;
  min-height: 72px;
  align-items: center;
  justify-content: space-between;
  padding: max(1rem, env(safe-area-inset-top)) max(10.5rem, calc(env(safe-area-inset-right) + 10.5rem)) 1rem max(1.5rem, env(safe-area-inset-left));
  border-bottom: 1px solid var(--ai-border);
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
  color: var(--ai-accent-secondary);
}

.brand-link:focus-visible,
.category-button:focus-visible,
.ai-footer a:focus-visible {
  outline: 2px solid var(--ai-focus);
  outline-offset: 4px;
}

.header-mark {
  color: var(--ai-muted);
  font-size: .68rem;
  font-weight: 700;
  letter-spacing: .17em;
}

.hero {
  position: relative;
  min-height: min(900px, 100dvh);
  overflow: hidden;
  border-bottom: 1px solid var(--ai-border);
  isolation: isolate;
}

.hero-canvas,
.hero-grid {
  position: absolute;
  z-index: -2;
  width: 100%;
  height: 100%;
  inset: 0;
}

.hero-canvas {
  display: block;
}

.hero-grid {
  z-index: -1;
  opacity: .35;
  background-image:
    linear-gradient(var(--ai-border) 1px, transparent 1px),
    linear-gradient(90deg, var(--ai-border) 1px, transparent 1px);
  background-size: 72px 72px;
  mask-image: linear-gradient(to right, #000, transparent 72%);
}

.hero-copy {
  position: absolute;
  top: 50%;
  left: max(clamp(1.5rem, 7vw, 7rem), env(safe-area-inset-left));
  width: min(48rem, calc(100% - 3rem));
  transform: translateY(-43%);
}

.eyebrow,
.section-label {
  margin: 0;
  color: var(--ai-accent-secondary);
  font-size: .68rem;
  font-weight: 750;
  letter-spacing: .2em;
}

.hero h1 {
  margin: 1.2rem 0 1.75rem;
  font-size: clamp(4rem, 9.2vw, 9rem);
  font-weight: 580;
  letter-spacing: -.085em;
  line-height: .82;
}

.hero h1 em {
  color: var(--ai-accent);
  font-family: Georgia, "Times New Roman", serif;
  font-weight: 400;
}

.hero-description {
  max-width: 34rem;
  margin: 0;
  color: var(--ai-muted);
  font-size: clamp(.95rem, 1.3vw, 1.08rem);
  line-height: 1.8;
}

.hero-aside {
  position: absolute;
  right: max(clamp(2rem, 5vw, 5rem), env(safe-area-inset-right));
  bottom: 4.5rem;
  display: flex;
  align-items: flex-end;
  flex-direction: column;
}

.hero-aside span,
.scroll-cue {
  color: var(--ai-muted);
  font-size: .63rem;
  font-weight: 700;
  letter-spacing: .18em;
}

.hero-aside strong {
  margin-top: .45rem;
  color: var(--ai-foreground);
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1.8rem;
  font-weight: 400;
  letter-spacing: -.04em;
}

.scroll-cue {
  position: absolute;
  bottom: 4.5rem;
  left: max(clamp(1.5rem, 7vw, 7rem), env(safe-area-inset-left));
  display: flex;
  align-items: center;
  margin: 0;
}

.scroll-cue span {
  display: block;
  width: 3rem;
  height: 1px;
  margin-right: 1rem;
  overflow: hidden;
  background: var(--ai-border-strong);
}

.scroll-cue span::after {
  display: block;
  width: 48%;
  height: 1px;
  background: var(--ai-accent-secondary);
  content: '';
}

.catalogue {
  display: grid;
  grid-template-columns: minmax(17rem, 30%) 1fr;
  max-width: 1440px;
  min-height: 650px;
  margin: 0 auto;
  padding: clamp(5rem, 9vw, 9rem) clamp(1.5rem, 5vw, 5rem);
}

.category-panel {
  padding-right: clamp(2rem, 5vw, 5rem);
}

.category-panel h2 {
  margin: .9rem 0 2.75rem;
  font-size: clamp(2.7rem, 5vw, 4.5rem);
  font-weight: 590;
  letter-spacing: -.07em;
}

.category-nav {
  border-top: 1px solid var(--ai-border);
}

.category-button {
  position: relative;
  display: flex;
  width: 100%;
  min-height: 64px;
  align-items: center;
  justify-content: space-between;
  padding: 0;
  border: 0;
  border-bottom: 1px solid var(--ai-border);
  background: transparent;
  color: var(--ai-muted);
  cursor: pointer;
  font: inherit;
  text-align: left;
  touch-action: manipulation;
  transition: background-color 180ms ease, color 180ms ease;
}

.category-button span {
  font-size: 1rem;
  font-weight: 650;
  transition: transform 180ms ease;
}

.category-button small {
  color: var(--ai-subtle);
  font-size: .62rem;
  letter-spacing: .15em;
}

.category-button:hover,
.category-button--active {
  background: var(--ai-surface);
  color: var(--ai-foreground);
}

.category-button--active::before {
  position: absolute;
  left: .1rem;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--ai-accent-secondary);
  content: '';
}

.category-button--active span {
  transform: translateX(.9rem);
}

.category-note {
  margin: 1.5rem 0 0;
  color: var(--ai-subtle);
  font-size: .73rem;
  letter-spacing: .06em;
}

.experiment-list {
  border-top: 1px solid var(--ai-border);
}

.experiment-card {
  position: relative;
  display: grid;
  grid-template-columns: 4rem minmax(0, 1fr) auto;
  min-height: 245px;
  padding: 2rem 0;
  border-bottom: 1px solid var(--ai-border);
  transition: background-color 220ms ease, box-shadow 220ms ease;
}

.experiment-card:hover {
  background: var(--ai-surface);
  box-shadow: inset 3px 0 var(--ai-accent);
}

.experiment-index,
.experiment-content > p:first-child,
.experiment-status {
  color: var(--ai-subtle);
  font-size: .65rem;
  font-weight: 700;
  letter-spacing: .13em;
}

.experiment-content {
  max-width: 39rem;
}

.experiment-content > p:first-child {
  margin: 0 0 1.1rem;
  color: var(--ai-accent-secondary);
}

.experiment-content h3 {
  margin: 0;
  font-size: clamp(2rem, 4.3vw, 4rem);
  font-weight: 540;
  letter-spacing: -.065em;
  line-height: 1;
}

.experiment-summary {
  max-width: 34rem;
  margin: 1.3rem 0 0;
  color: var(--ai-muted);
  font-size: .92rem;
  line-height: 1.8;
}

.experiment-status {
  display: flex;
  align-items: flex-start;
  white-space: nowrap;
}

.experiment-status i {
  width: 6px;
  height: 6px;
  margin: .2rem .55rem 0 0;
  border-radius: 50%;
  background: var(--ai-accent);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--ai-accent) 15%, transparent);
}

.ai-footer {
  display: grid;
  grid-template-columns: 1fr 2fr auto;
  align-items: center;
  padding: 2rem max(1.5rem, env(safe-area-inset-right)) max(2rem, env(safe-area-inset-bottom)) max(1.5rem, env(safe-area-inset-left));
  border-top: 1px solid var(--ai-border);
  background: var(--ai-surface);
  color: var(--ai-subtle);
  font-size: .63rem;
  letter-spacing: .12em;
}

.ai-footer p {
  margin: 0;
}

.ai-footer p:nth-child(2) {
  text-align: center;
}

.ai-footer a {
  min-height: 44px;
  color: var(--ai-foreground);
  font-weight: 700;
  line-height: 44px;
  text-decoration: none;
}

@media (max-width: 900px) {
  .hero {
    min-height: 760px;
  }

  .hero-copy {
    top: 46%;
  }

  .hero-aside {
    display: none;
  }

  .catalogue {
    grid-template-columns: 1fr;
  }

  .category-panel {
    padding-right: 0;
  }

  .category-nav {
    display: flex;
    margin: 0 -.4rem 3rem;
    border-top: 0;
  }

  .category-button {
    min-height: 48px;
    justify-content: center;
    margin: 0 .4rem;
    padding: 0 .9rem;
    border: 1px solid var(--ai-border);
  }

  .category-button small {
    display: none;
  }

  .category-button:hover,
  .category-button--active {
    border-color: var(--ai-border-strong);
    background: var(--ai-surface-raised);
  }

  .category-button--active::before {
    left: .55rem;
  }

  .category-button--active span {
    transform: none;
  }

  .category-note {
    display: none;
  }
}

@media (max-width: 600px) {
  .ai-header {
    min-height: 68px;
    padding-right: max(9.5rem, calc(env(safe-area-inset-right) + 9.5rem));
  }

  .header-mark {
    display: none;
  }

  .hero {
    min-height: 700px;
  }

  .hero-grid {
    background-size: 48px 48px;
    mask-image: linear-gradient(to bottom, #000, transparent 80%);
  }

  .hero-copy {
    top: 44%;
    transform: translateY(-38%);
  }

  .hero h1 {
    font-size: clamp(3.6rem, 20vw, 5.4rem);
  }

  .scroll-cue {
    bottom: 2.5rem;
  }

  .catalogue {
    padding-top: 4.5rem;
    padding-bottom: 5rem;
  }

  .category-panel h2 {
    margin-bottom: 2rem;
  }

  .category-nav {
    margin-bottom: 2.5rem;
  }

  .category-button {
    margin: 0 .25rem;
    padding-right: .55rem;
    padding-left: .55rem;
    font-size: .88rem;
  }

  .category-button:hover,
  .category-button--active {
    background: var(--ai-surface-raised);
  }

  .experiment-card {
    grid-template-columns: 2.25rem minmax(0, 1fr);
    min-height: 0;
    padding: 2rem 0 2.5rem;
  }

  .experiment-card:hover {
    background: transparent;
    box-shadow: none;
  }

  .experiment-content h3 {
    font-size: 2.35rem;
  }

  .experiment-status {
    grid-column: 2;
    margin-top: 1.5rem;
  }

  .ai-footer {
    grid-template-columns: 1fr auto;
  }

  .ai-footer p:nth-child(2) {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
  }
}
</style>
