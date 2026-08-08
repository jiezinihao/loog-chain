<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import { thinkingNotes, type ThinkingNote } from './notes';

interface FlowNote extends ThinkingNote {
  instanceId: string;
  cycle: number;
  originalIndex: number;
}

const FLOW_REPEAT_COUNT = 3;
// CSS 坐标系的 Y 轴向下：纵向流旋转 +30° 后，主轴才会由右上延伸到左下。
const FLOW_ANGLE = 0;
const FLOW_COLUMNS = 4;

// 内容较少时循环铺设，但保留原始索引，避免视觉副本改变笔记的真实顺序。
const flowNotes: FlowNote[] = Array.from({ length: FLOW_REPEAT_COUNT }, (_, cycle) =>
  thinkingNotes.map((note, originalIndex) => ({
    ...note,
    instanceId: `${note.id}-${cycle}`,
    cycle,
    originalIndex,
  })),
).flat();

const mainElement = ref<HTMLElement>();
const pageElement = ref<HTMLElement>();
const isReady = ref(false);
const activeIndex = ref<number | null>(null);
const scrollProgress = ref(0);
let animationFrame = 0;
let revealTimer = 0;

const flowDistance = Math.max(1500, Math.ceil(flowNotes.length / FLOW_COLUMNS) * 280);
const pageLength = flowDistance + 720;

const pageStyle = {
  '--page-length': `${pageLength}px`,
};

const visibleIndex = computed(() => {
  if (activeIndex.value !== null) {
    return activeIndex.value;
  }

  return Math.min(
    flowNotes.length - 1,
    Math.max(0, Math.round(scrollProgress.value * (flowNotes.length - 1))),
  );
});

const visibleItem = computed(() => flowNotes[visibleIndex.value]);
const visibleNote = computed(() => visibleItem.value ?? flowNotes[0]);

const sceneStyle = computed(() => {
  const radians = FLOW_ANGLE * (Math.PI / 180);
  const travelledDistance = scrollProgress.value * flowDistance;

  // 滚动方向与瀑布流的局部纵轴相反，使视口沿着斜向内容自然向前浏览。
  return {
    '--flow-angle': `${FLOW_ANGLE}deg`,
    '--flow-x': `${Math.sin(radians) * travelledDistance}px`,
    '--flow-y': `${-Math.cos(radians) * travelledDistance}px`,
    '--progress': scrollProgress.value.toFixed(4),
    '--active-accent': visibleNote.value?.accent ?? '244 118 152',
  };
});

function getTileStyle(note: FlowNote) {
  return {
    '--accent': note.accent,
  };
}

function resetTileOffsets(flowElement = pageElement.value?.querySelector<HTMLElement>('.note-flow')) {
  flowElement?.querySelectorAll<HTMLElement>('.flow-tile-wrap').forEach((tile) => {
    tile.style.removeProperty('--push-x');
    tile.style.removeProperty('--push-y');
  });
}

function setActiveNote(index: number, event?: Event) {
  activeIndex.value = index;

  if (!(event?.currentTarget instanceof HTMLElement)) {
    return;
  }

  const activeTile = event.currentTarget.closest<HTMLElement>('.flow-tile-wrap');
  const flowElement = event.currentTarget.closest<HTMLElement>('.note-flow');
  if (!activeTile || !flowElement) {
    return;
  }

  const activeRect = activeTile.getBoundingClientRect();
  const activeCenterX = activeRect.left + activeRect.width / 2;
  const activeCenterY = activeRect.top + activeRect.height / 2;
  const influenceRadius = Math.max(activeRect.width, activeRect.height) * 1.8;

  // 使用屏幕中的真实位置计算排斥方向，使上下左右的相邻卡片分别向外平移。
  flowElement.querySelectorAll<HTMLElement>('.flow-tile-wrap').forEach((tile) => {
    tile.style.removeProperty('--push-x');
    tile.style.removeProperty('--push-y');

    if (tile === activeTile) {
      return;
    }

    const tileRect = tile.getBoundingClientRect();
    const offsetX = tileRect.left + tileRect.width / 2 - activeCenterX;
    const offsetY = tileRect.top + tileRect.height / 2 - activeCenterY;
    const distance = Math.hypot(offsetX, offsetY);
    if (distance === 0 || distance > influenceRadius) {
      return;
    }

    const pushDistance = (18 + (1 - distance / influenceRadius) * 38) / 3;
    tile.style.setProperty('--push-x', `${(offsetX / distance) * pushDistance}px`);
    tile.style.setProperty('--push-y', `${(offsetY / distance) * pushDistance}px`);
  });
}

function clearActiveNote() {
  activeIndex.value = null;
  resetTileOffsets();
}

function updateScrollProgress() {
  if (!pageElement.value) {
    return;
  }

  const pageTop = pageElement.value.offsetTop;
  const maxScroll = Math.max(1, pageElement.value.offsetHeight - window.innerHeight);
  scrollProgress.value = Math.min(1, Math.max(0, (window.scrollY - pageTop) / maxScroll));
}

function scheduleScrollUpdate() {
  if (animationFrame) {
    return;
  }

  animationFrame = window.requestAnimationFrame(() => {
    updateScrollProgress();
    animationFrame = 0;
  });
}

onMounted(() => {
  updateScrollProgress();
  window.addEventListener('scroll', scheduleScrollUpdate, { passive: true });
  window.addEventListener('resize', scheduleScrollUpdate, { passive: true });

  // 首帧稳定后再移除蒙层，避免路由异步加载造成内容闪现。
  revealTimer = window.setTimeout(() => {
    isReady.value = true;
    mainElement.value?.focus({ preventScroll: true });
  }, 80);
});

onBeforeUnmount(() => {
  window.removeEventListener('scroll', scheduleScrollUpdate);
  window.removeEventListener('resize', scheduleScrollUpdate);
  window.cancelAnimationFrame(animationFrame);
  window.clearTimeout(revealTimer);
});
</script>

<template>
  <main
    ref="mainElement"
    class="thinking-page"
    :class="{ 'thinking-page--ready': isReady }"
    :style="pageStyle"
    tabindex="-1"
  >
    <section ref="pageElement" class="thinking-scroll" :style="sceneStyle" aria-labelledby="thinking-title">
      <div class="thinking-scene">
        <div class="thinking-scene__grain" aria-hidden="true"></div>
        <div class="thinking-scene__ink" aria-hidden="true"></div>
        <div class="thinking-scene__axis" aria-hidden="true"></div>

        <header class="thinking-header">
          <RouterLink class="thinking-header__back" to="/">
            <span aria-hidden="true">←</span>
            <span>返回入口</span>
          </RouterLink>
          <p class="thinking-header__eyebrow">THINKING / NOTE ARCHIVE</p>
          <h1 id="thinking-title">思想切面</h1>
          <p class="thinking-header__intro">让散落的经验成为一条可以反复行走的路。</p>
        </header>

        <aside class="note-inspector" aria-label="当前笔记信息">
          <p class="note-inspector__index">
            {{ String((visibleNote?.originalIndex ?? 0) + 1).padStart(2, '0') }}
            <span>/ {{ String(thinkingNotes.length).padStart(2, '0') }}</span>
          </p>
          <p class="note-inspector__category">{{ visibleNote?.category }}</p>
          <h2>{{ visibleNote?.title }}</h2>
          <p class="note-inspector__excerpt">{{ visibleNote?.excerpt }}</p>
          <p class="note-inspector__meta">
            {{ visibleNote?.fileName }} · 约 {{ visibleNote?.readingMinutes }} 分钟
          </p>
        </aside>

        <div class="scroll-guide" aria-hidden="true">
          <span>斜向浏览</span>
          <i><b></b></i>
        </div>

        <div class="flow-motion">
          <div class="note-flow" aria-label="思想笔记瀑布流">
            <div
              v-for="(note, index) in flowNotes"
              :key="note.instanceId"
              class="flow-tile-wrap"
              :class="[
                `flow-tile-wrap--weight-${note.weight}`,
                { 'flow-tile-wrap--repeat': note.cycle > 0 },
                { 'flow-tile-wrap--active': activeIndex === index },
              ]"
              :style="getTileStyle(note)"
              :aria-hidden="note.cycle > 0 ? 'true' : undefined"
            >
              <button
                class="flow-tile"
                type="button"
                :aria-label="`查看笔记信息：${note.title}`"
                :aria-pressed="visibleIndex === index"
                :tabindex="note.cycle > 0 ? -1 : 0"
                @pointerenter="setActiveNote(index, $event)"
                @pointerleave="clearActiveNote"
                @focus="setActiveNote(index, $event)"
                @blur="clearActiveNote"
                @click="setActiveNote(index, $event)"
              >
                <span class="flow-tile__surface" aria-hidden="true"></span>
                <span class="flow-tile__content">
                  <span class="flow-tile__topline">
                    <span>{{ String(note.originalIndex + 1).padStart(2, '0') }}</span>
                    <span>{{ note.category }}</span>
                  </span>
                  <strong>{{ note.title }}</strong>
                  <span class="flow-tile__weight" :aria-label="`权重 ${note.weight}`">
                    <i v-for="level in 3" :key="level" :class="{ 'is-filled': level <= note.weight }"></i>
                  </span>
                </span>
              </button>
            </div>
          </div>
        </div>

        <p class="thinking-footer">FLAT FLOW · 30° · LOOPED NOTES</p>
      </div>
    </section>

    <div class="reveal-mask" aria-hidden="true"><span></span></div>
  </main>
</template>

<style scoped>
:global(*) {
  box-sizing: border-box;
}

:global(html),
:global(body),
:global(#app) {
  min-width: 320px;
  min-height: 100%;
  margin: 0;
}

:global(html) {
  color-scheme: dark;
  background: #08090c;
}

:global(body) {
  overflow-x: hidden;
  background: #08090c;
  color: #f6f1eb;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.thinking-page {
  --color-background: #08090c;
  --color-surface: #19191c;
  --color-foreground: #f6f1eb;
  --color-muted: rgb(246 241 235 / 62%);
  --color-border: rgb(255 255 255 / 14%);
  position: relative;
  height: calc(100dvh + var(--page-length));
  background: var(--color-background);
  outline: none;
}

.thinking-scroll {
  position: absolute;
  width: 100%;
  height: 100%;
  inset: 0;
}

.thinking-scene {
  position: sticky;
  top: 0;
  height: 100dvh;
  overflow: hidden;
  background:
    linear-gradient(180deg, rgb(17 15 20 / 42%), transparent 28%),
    radial-gradient(circle at 48% 54%, rgb(87 54 67 / 18%), transparent 52%),
    var(--color-background);
  isolation: isolate;
}

.thinking-scene__grain,
.thinking-scene__ink,
.thinking-scene__axis {
  position: absolute;
  pointer-events: none;
}

.thinking-scene__grain {
  z-index: 30;
  opacity: .065;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.82' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.9'/%3E%3C/svg%3E");
  mix-blend-mode: soft-light;
}

.thinking-scene__ink {
  z-index: 1;
  width: min(70vw, 54rem);
  aspect-ratio: 1;
  top: 50%;
  left: 52%;
  border-radius: 50%;
  background: radial-gradient(circle, rgb(var(--active-accent) / 23%), rgb(var(--active-accent) / 7%) 36%, transparent 70%);
  filter: blur(46px);
  opacity: .78;
  transform: translate(-50%, -50%) scale(calc(.9 + var(--progress) * .18));
  transition: background 240ms ease-out;
}

.thinking-scene__axis {
  z-index: 2;
  width: 140vw;
  height: 1px;
  top: 52%;
  left: -20vw;
  background: linear-gradient(90deg, transparent, rgb(255 255 255 / 12%), transparent);
  transform: rotate(var(--flow-angle));
}

.thinking-header {
  position: absolute;
  z-index: 20;
  top: max(2rem, env(safe-area-inset-top));
  left: max(clamp(1.5rem, 4vw, 4.5rem), env(safe-area-inset-left));
  max-width: min(34rem, 52vw);
}

.thinking-header__back {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  color: var(--color-muted);
  font-size: .76rem;
  letter-spacing: .08em;
  text-decoration: none;
  transition: color 180ms ease-out, transform 180ms ease-out;
}

.thinking-header__back span:first-child {
  margin-right: .65rem;
  font-size: 1rem;
}

.thinking-header__back:hover,
.thinking-header__back:focus-visible {
  color: var(--color-foreground);
  transform: translateX(-3px);
}

.thinking-header__back:focus-visible,
.flow-tile:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 5px;
}

.thinking-header__eyebrow {
  margin: clamp(1.25rem, 3vh, 2.5rem) 0 0;
  color: rgb(244 118 152 / 88%);
  font-size: .66rem;
  font-weight: 700;
  letter-spacing: .22em;
}

.thinking-header h1 {
  margin: .55rem 0 0;
  font-family: "Songti SC", "STSong", "Noto Serif SC", Georgia, serif;
  font-size: clamp(3rem, 6vw, 6.5rem);
  font-weight: 600;
  letter-spacing: -.08em;
  line-height: .96;
  white-space: nowrap;
}

.thinking-header__intro {
  max-width: 18rem;
  margin: 1rem 0 0;
  color: var(--color-muted);
  font-family: "Songti SC", "STSong", serif;
  font-size: .92rem;
  line-height: 1.75;
}

.note-inspector {
  position: absolute;
  z-index: 20;
  right: max(clamp(1.5rem, 4vw, 4.5rem), env(safe-area-inset-right));
  bottom: max(clamp(2rem, 6vh, 4.5rem), env(safe-area-inset-bottom));
  width: min(24rem, 30vw);
  padding-left: 1.25rem;
  border-left: 1px solid rgb(var(--active-accent) / 68%);
  background: linear-gradient(90deg, rgb(8 9 12 / 48%), transparent);
}

.note-inspector__index,
.note-inspector__category,
.note-inspector__meta,
.note-inspector__excerpt,
.note-inspector h2 {
  margin: 0;
}

.note-inspector__index {
  color: var(--color-foreground);
  font-size: 1.5rem;
  font-variant-numeric: tabular-nums;
  font-weight: 650;
  letter-spacing: -.04em;
}

.note-inspector__index span,
.note-inspector__category,
.note-inspector__meta {
  color: var(--color-muted);
  font-size: .62rem;
  font-weight: 650;
  letter-spacing: .14em;
}

.note-inspector__category {
  margin-top: .55rem;
  color: rgb(var(--active-accent) / 94%);
}

.note-inspector h2 {
  margin-top: .7rem;
  font-family: "Songti SC", "STSong", serif;
  font-size: clamp(1.25rem, 2vw, 2rem);
  line-height: 1.25;
}

.note-inspector__excerpt {
  display: -webkit-box;
  overflow: hidden;
  margin-top: .7rem;
  color: rgb(246 241 235 / 76%);
  font-size: .78rem;
  line-height: 1.65;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.note-inspector__meta {
  overflow: hidden;
  margin-top: .85rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scroll-guide {
  position: absolute;
  z-index: 20;
  display: flex;
  right: max(clamp(1.5rem, 4vw, 4.5rem), env(safe-area-inset-right));
  top: max(2rem, env(safe-area-inset-top));
  align-items: center;
}

.scroll-guide span {
  color: var(--color-muted);
  font-size: .62rem;
  letter-spacing: .14em;
}

.scroll-guide i {
  position: relative;
  display: block;
  width: 5.5rem;
  height: 1px;
  margin-left: 1rem;
  background: var(--color-border);
}

.scroll-guide b {
  position: absolute;
  width: 2rem;
  height: 1px;
  left: calc(var(--progress) * 3.5rem);
  background: rgb(var(--active-accent));
  box-shadow: 0 0 12px rgb(var(--active-accent) / 70%);
}

.flow-motion {
  position: absolute;
  z-index: 10;
  width: clamp(58rem, 72vw, 74rem);
  top: 40vh;
  left: 52%;
  transform: translate3d(calc(-50% + var(--flow-x)), calc(-10rem + var(--flow-y)), 0);
  will-change: transform;
}

.note-flow {
  display: grid;
  width: 100%;
  grid-auto-flow: dense;
  grid-auto-rows: 4.5rem;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
  transform: rotate(var(--flow-angle));
  transform-origin: 50% 0;
}

.flow-tile-wrap {
  --push-x: 0px;
  --push-y: 0px;
  position: relative;
  min-width: 0;
  grid-row: span 2;
  transform: translate(var(--push-x), var(--push-y));
  transition: filter 220ms ease-out, transform 260ms cubic-bezier(.22, 1, .36, 1);
}

.flow-tile-wrap--weight-2 {
  grid-row: span 3;
}

.flow-tile-wrap--weight-3 {
  grid-column: span 2;
  grid-row: span 3;
}

.flow-tile-wrap--active {
  z-index: 4;
  filter: brightness(1.14);
}

.flow-tile {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-foreground);
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

.flow-tile::before {
  position: absolute;
  z-index: -1;
  background: radial-gradient(circle, rgb(var(--accent) / 50%), rgb(var(--accent) / 16%) 40%, transparent 72%);
  content: '';
  filter: blur(30px);
  opacity: 0;
  pointer-events: none;
  transform: scale(.9);
  inset: -4rem;
  transition: opacity 240ms ease-out, transform 280ms cubic-bezier(.22, 1, .36, 1);
}

.flow-tile__surface {
  position: absolute;
  overflow: hidden;
  border: 1px solid rgb(255 255 255 / 16%);
  background:
    radial-gradient(circle at 18% 22%, rgb(var(--accent) / 16%), transparent 34%),
    linear-gradient(135deg, rgb(48 46 50 / 98%), rgb(26 26 29 / 99%) 55%, rgb(16 16 18 / 100%));
  box-shadow: inset 0 1px rgb(255 255 255 / 10%), 0 12px 28px rgb(0 0 0 / 28%);
  inset: 0;
  transition: border-color 220ms ease-out, background 240ms ease-out;
}

.flow-tile__surface::after {
  position: absolute;
  background:
    linear-gradient(104deg, transparent 0 43%, rgb(255 255 255 / 6%) 44%, transparent 45%),
    radial-gradient(circle at 75% 36%, transparent 0 12%, rgb(255 255 255 / 5%) 12.5%, transparent 13%);
  content: '';
  inset: 0;
}

.flow-tile__content {
  position: absolute;
  z-index: 2;
  display: flex;
  width: 72%;
  min-height: 70%;
  top: 50%;
  left: 50%;
  flex-direction: column;
  justify-content: center;
  text-align: left;
  transform: translate(-50%, -50%) scale(.88);
}

.flow-tile__topline {
  display: flex;
  justify-content: space-between;
  color: rgb(246 241 235 / 58%);
  font-size: .56rem;
  font-variant-numeric: tabular-nums;
  font-weight: 650;
  letter-spacing: .13em;
}

.flow-tile__content strong {
  display: -webkit-box;
  overflow: hidden;
  margin-top: .7rem;
  font-family: "Songti SC", "STSong", serif;
  font-size: clamp(1rem, 1.65vw, 1.6rem);
  font-weight: 600;
  letter-spacing: -.035em;
  line-height: 1.25;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.flow-tile-wrap--weight-3 .flow-tile__content strong {
  font-size: clamp(1.3rem, 2vw, 2rem);
}

.flow-tile__weight {
  display: flex;
  margin-top: .8rem;
}

.flow-tile__weight i {
  display: block;
  width: 1.1rem;
  height: 2px;
  margin-right: .25rem;
  background: rgb(255 255 255 / 14%);
}

.flow-tile__weight i.is-filled {
  background: rgb(var(--accent));
  box-shadow: 0 0 8px rgb(var(--accent) / 52%);
}

.flow-tile-wrap--active .flow-tile::before,
.flow-tile:hover::before,
.flow-tile:focus-visible::before {
  opacity: .9;
  transform: scale(1.3);
}

.flow-tile-wrap--active .flow-tile__surface,
.flow-tile:hover .flow-tile__surface,
.flow-tile:focus-visible .flow-tile__surface {
  border-color: rgb(var(--accent) / 76%);
  background:
    radial-gradient(circle at 22% 26%, rgb(var(--accent) / 32%), transparent 42%),
    linear-gradient(135deg, rgb(57 53 58 / 99%), rgb(29 28 32 / 99%) 58%, rgb(16 16 18 / 100%));
}

.flow-tile:active {
  transform: scale(.98);
}

.thinking-footer {
  position: absolute;
  z-index: 20;
  bottom: max(1.25rem, env(safe-area-inset-bottom));
  left: max(clamp(1.5rem, 4vw, 4.5rem), env(safe-area-inset-left));
  margin: 0;
  color: rgb(246 241 235 / 36%);
  font-size: .56rem;
  letter-spacing: .18em;
}

.reveal-mask {
  position: fixed;
  z-index: 100;
  display: grid;
  background: #050609;
  opacity: 1;
  pointer-events: none;
  place-items: center;
  visibility: visible;
  inset: 0;
  transition: opacity 1000ms cubic-bezier(.16, 1, .3, 1), visibility 0s linear 1000ms;
}

.reveal-mask span {
  width: min(34vw, 24rem);
  aspect-ratio: 1;
  border-radius: 50%;
  background: rgb(244 118 152 / 12%);
  filter: blur(64px);
  transform: scale(.5);
  transition: transform 1000ms cubic-bezier(.16, 1, .3, 1);
}

.thinking-page--ready .reveal-mask {
  visibility: hidden;
  opacity: 0;
}

.thinking-page--ready .reveal-mask span {
  transform: scale(2.4);
}

.thinking-header,
.note-inspector,
.scroll-guide,
.flow-motion,
.thinking-footer {
  filter: blur(10px);
  opacity: .3;
  transition: filter 900ms cubic-bezier(.16, 1, .3, 1), opacity 760ms ease-out;
}

.thinking-page--ready .thinking-header,
.thinking-page--ready .note-inspector,
.thinking-page--ready .scroll-guide,
.thinking-page--ready .flow-motion,
.thinking-page--ready .thinking-footer {
  filter: none;
  opacity: 1;
}

@media (max-width: 900px) {
  .note-inspector {
    width: min(19rem, 38vw);
  }

  .note-inspector__excerpt {
    display: none;
  }

  .flow-motion {
    width: 58rem;
    left: 58%;
  }
}

@media (max-width: 680px) {
  .thinking-header {
    top: max(1rem, env(safe-area-inset-top));
    left: max(1.25rem, env(safe-area-inset-left));
    max-width: calc(100vw - 2.5rem);
  }

  .thinking-header__eyebrow {
    margin-top: .8rem;
  }

  .thinking-header h1 {
    font-size: clamp(2.6rem, 13vw, 4.2rem);
  }

  .thinking-header__intro,
  .scroll-guide,
  .thinking-footer {
    display: none;
  }

  .note-inspector {
    right: max(1.25rem, env(safe-area-inset-right));
    bottom: max(1.25rem, env(safe-area-inset-bottom));
    left: max(1.25rem, env(safe-area-inset-left));
    width: auto;
    padding: .85rem 1rem;
    border: 1px solid var(--color-border);
    background: rgb(8 9 12 / 88%);
    backdrop-filter: blur(12px);
  }

  .note-inspector h2 {
    overflow: hidden;
    max-width: 72vw;
    font-size: 1rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .note-inspector__category,
  .note-inspector__meta {
    display: none;
  }

  .note-inspector__index {
    font-size: .72rem;
    letter-spacing: .08em;
  }

  .flow-motion {
    width: 46rem;
    top: 42vh;
    left: 72%;
  }

  .note-flow {
    grid-auto-rows: 4rem;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: .8rem;
  }

  .flow-tile__content {
    width: 78%;
    transform: translate(-50%, -50%) scale(.82);
  }

  .flow-tile__content strong,
  .flow-tile-wrap--weight-3 .flow-tile__content strong {
    font-size: 1rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .thinking-page {
    height: auto;
    min-height: 100dvh;
  }

  .thinking-scroll {
    position: relative;
    height: auto;
  }

  .thinking-scene {
    position: relative;
    height: auto;
    min-height: 100dvh;
    overflow: visible;
    padding: 17rem 1.25rem 8rem;
  }

  .thinking-scene__ink,
  .thinking-scene__axis,
  .scroll-guide {
    display: none;
  }

  .flow-motion {
    position: relative;
    width: min(48rem, 100%);
    top: auto;
    left: auto;
    margin: 0 auto;
    filter: none;
    opacity: 1;
    transform: none;
  }

  .note-flow {
    grid-auto-rows: 5rem;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    transform: none;
  }

  .flow-tile-wrap--repeat {
    display: none;
  }

  .flow-tile-wrap {
    transform: none;
  }

  .flow-tile__content {
    transform: translate(-50%, -50%);
  }

  .flow-tile-wrap,
  .flow-tile,
  .flow-tile::before,
  .flow-tile__surface,
  .thinking-header,
  .note-inspector,
  .thinking-footer,
  .reveal-mask,
  .reveal-mask span {
    animation: none;
    transition: none;
  }

  .thinking-header,
  .note-inspector,
  .thinking-footer {
    filter: none;
    opacity: 1;
  }

  .reveal-mask {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) and (max-width: 560px) {
  .thinking-scene {
    padding-top: 14rem;
  }

  .note-flow {
    grid-template-columns: 1fr;
  }

  .flow-tile-wrap--weight-3 {
    grid-column: span 1;
  }
}
</style>
