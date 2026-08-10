<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { portalModules, type PortalModule, type PortalModuleId } from '../portal-modules';

const router = useRouter();
const isLoaded = ref(false);
const isEntering = ref(false);
const selectedId = ref<PortalModuleId | null>(null);
let revealTimer: number | undefined;
let enterTimer: number | undefined;

const isFocused = computed(() => selectedId.value !== null);

function selectModule(moduleId: PortalModuleId) {
  if (!isEntering.value) {
    selectedId.value = moduleId;
  }
}

function clearSelection() {
  if (!isEntering.value) {
    selectedId.value = null;
  }
}

function enterModule(event: MouseEvent, module: PortalModule) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) {
    return;
  }

  event.preventDefault();
  if (isEntering.value) {
    return;
  }

  // 点击后保留短暂的选中态，使转场与用户操作形成明确因果关系。
  selectModule(module.id);
  isEntering.value = true;
  enterTimer = window.setTimeout(() => {
    void router.push(module.path);
  }, 420);
}

onMounted(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  revealTimer = window.setTimeout(() => {
    isLoaded.value = true;
  }, reducedMotion ? 0 : 1850);
});

onBeforeUnmount(() => {
  window.clearTimeout(revealTimer);
  window.clearTimeout(enterTimer);
});
</script>

<template>
  <main class="entry-shell" :class="{ 'entry-shell--loaded': isLoaded, 'entry-shell--entering': isEntering }">
    <a class="skip-link" href="#module-portal">跳至模块入口</a>
    <section id="module-portal" class="portal" :class="{ 'portal--focused': isFocused }" aria-label="Think Chain 模块入口">
      <h1 class="screen-reader-title">Think Chain 模块入口</h1>
      <RouterLink
        v-for="module in portalModules"
        :key="module.id"
        class="portal-card"
        :class="[
          `portal-card--${module.id}`,
          { 'portal-card--selected': selectedId === module.id },
        ]"
        :to="module.path"
        :aria-label="`${module.action}：${module.title}`"
        @pointerenter="selectModule(module.id)"
        @pointerleave="clearSelection"
        @focus="selectModule(module.id)"
        @blur="clearSelection"
        @click="enterModule($event, module)"
      >
        <span class="portal-card__noise" aria-hidden="true"></span>
        <span class="portal-card__index" aria-hidden="true">{{ module.index }}</span>
        <span class="portal-card__content">
          <span class="portal-card__eyebrow">{{ module.eyebrow }}</span>
          <span class="portal-card__title">{{ module.title }}</span>
          <span class="portal-card__description">{{ module.description }}</span>
          <span class="portal-card__action">{{ module.action }} <span aria-hidden="true">↗</span></span>
        </span>
      </RouterLink>
    </section>

    <section class="loader" :class="{ 'loader--hidden': isLoaded }" aria-live="polite" aria-label="正在加载入口">
      <div class="loader__aura" aria-hidden="true"></div>
      <div class="gear gear--outer" aria-hidden="true"><span></span></div>
      <div class="gear gear--inner" aria-hidden="true"><span></span></div>
      <p class="loader__label">THINK CHAIN <span>LOADING…</span></p>
    </section>
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

:global(body) {
  background: var(--app-background);
  color: var(--app-foreground);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

/* 入口页在组件级维护两套色板，主题切换不改变内容层整体亮度。 */
.entry-shell {
  --entry-background: #07080b;
  --entry-foreground: #f8fafc;
  --entry-muted: #b9bec8;
  --entry-subtle: #a8adb7;
  --entry-border: rgb(255 255 255 / 16%);
  --entry-focus: #fff;
  --entry-card-scrim: linear-gradient(180deg, rgb(3 4 9 / 8%) 12%, rgb(3 4 9 / 8%) 42%, rgb(3 4 9 / 82%) 100%);
  --entry-loader-label: #e4e7ec;
  --entry-loader-accent: #69f9dc;
  --entry-gear-border: rgb(255 255 255 / 52%);
  --entry-gear-inner-border: rgb(255 255 255 / 42%);
  min-height: 100dvh;
  overflow: hidden;
  background: var(--entry-background);
  color: var(--entry-foreground);
  transition: background-color 220ms ease, color 220ms ease;
}

:global(html[data-theme='light']) .entry-shell {
  --entry-background: #f5f2ed;
  --entry-foreground: #202126;
  --entry-muted: #4f535c;
  --entry-subtle: #62666f;
  --entry-border: rgb(32 33 38 / 20%);
  --entry-focus: #382469;
  --entry-card-scrim: linear-gradient(180deg, rgb(255 255 255 / 8%) 12%, rgb(255 255 255 / 18%) 42%, rgb(255 255 255 / 88%) 100%);
  --entry-loader-label: #363941;
  --entry-loader-accent: #087d69;
  --entry-gear-border: rgb(32 33 38 / 34%);
  --entry-gear-inner-border: rgb(32 33 38 / 28%);
}

.skip-link {
  position: fixed;
  z-index: 10;
  top: 1rem;
  left: 1rem;
  padding: .7rem .85rem;
  background: var(--entry-foreground);
  color: var(--entry-background);
  font-size: .78rem;
  font-weight: 700;
  text-decoration: none;
  transform: translateY(-150%);
  transition: transform 180ms ease-out;
}

.skip-link:focus-visible {
  transform: translateY(0);
}

.portal {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  min-height: 100dvh;
  transform: scale(.86);
  opacity: 0;
  transition: transform 950ms cubic-bezier(.16, 1, .3, 1), opacity 600ms ease-out;
}

.entry-shell--loaded .portal {
  transform: scale(1);
  opacity: 1;
}

.portal-card {
  position: relative;
  display: flex;
  min-height: 100dvh;
  overflow: hidden;
  padding: max(clamp(2rem, 4vw, 4.75rem), env(safe-area-inset-top)) max(clamp(2rem, 4vw, 4.75rem), env(safe-area-inset-right)) max(clamp(2rem, 4vw, 4.75rem), env(safe-area-inset-bottom)) max(clamp(2rem, 4vw, 4.75rem), env(safe-area-inset-left));
  border: 0;
  border-right: 1px solid var(--entry-border);
  color: inherit;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  isolation: isolate;
  text-align: left;
  text-decoration: none;
  transition: background-color 220ms ease, flex-basis 520ms cubic-bezier(.16, 1, .3, 1), transform 520ms cubic-bezier(.16, 1, .3, 1);
}

.portal-card:last-child {
  border-right: 0;
}

.portal-card::before,
.portal-card::after {
  position: absolute;
  z-index: -2;
  content: '';
  inset: 0;
  transition: transform 800ms cubic-bezier(.16, 1, .3, 1), opacity 500ms ease;
}

.portal-card::after {
  z-index: -1;
  background: var(--entry-card-scrim);
}

.portal-card--hand-coded-blog {
  background: #17120f;
}

.portal-card--hand-coded-blog::before {
  background:
    linear-gradient(128deg, transparent 45%, rgb(255 166 88 / 24%) 46%, transparent 47%) 0 0 / 28px 28px,
    radial-gradient(circle at 18% 21%, #ffb265 0 1px, transparent 2px) 0 0 / 31px 31px,
    radial-gradient(circle at 70% 31%, rgb(255 198 123 / 54%), transparent 31%),
    linear-gradient(145deg, #311e14 0%, #18110f 58%, #07080b 100%);
}

.portal-card--ai-3d {
  background: #0b1127;
}

.portal-card--ai-3d::before {
  background:
    radial-gradient(ellipse at 50% 42%, rgb(218 106 255 / 88%) 0 3%, rgb(67 224 255 / 58%) 22%, transparent 45%),
    conic-gradient(from 210deg at 52% 43%, transparent 0 14%, rgb(58 217 255 / 40%) 18%, transparent 24% 38%, rgb(161 77 255 / 46%) 46%, transparent 53% 72%, rgb(59 243 197 / 34%) 80%, transparent 88%),
    linear-gradient(165deg, #151344 0%, #0a1025 55%, #05060d 100%);
  transform: scale(1.25) rotate(-12deg);
}

.portal-card--thinking {
  background: #1d101b;
}

.portal-card--thinking::before {
  background:
    radial-gradient(ellipse at 84% 16%, rgb(255 154 202 / 30%), transparent 36%),
    radial-gradient(ellipse at 35% 65%, rgb(246 67 116 / 41%), transparent 42%),
    repeating-radial-gradient(ellipse at 58% 56%, transparent 0 24px, rgb(255 186 215 / 12%) 25px 26px, transparent 27px 45px),
    linear-gradient(150deg, #381526 0%, #1c0e1c 58%, #08080c 100%);
}

:global(html[data-theme='light']) .portal-card--hand-coded-blog {
  background: #f1dfcf;
}

:global(html[data-theme='light']) .portal-card--hand-coded-blog::before {
  background:
    linear-gradient(128deg, transparent 45%, rgb(161 85 34 / 18%) 46%, transparent 47%) 0 0 / 28px 28px,
    radial-gradient(circle at 18% 21%, #9d5327 0 1px, transparent 2px) 0 0 / 31px 31px,
    radial-gradient(circle at 70% 31%, rgb(220 128 59 / 35%), transparent 31%),
    linear-gradient(145deg, #f8eadf 0%, #ead6c5 58%, #d8c2b2 100%);
}

:global(html[data-theme='light']) .portal-card--ai-3d {
  background: #e5e8f7;
}

:global(html[data-theme='light']) .portal-card--ai-3d::before {
  background:
    radial-gradient(ellipse at 50% 42%, rgb(139 73 189 / 55%) 0 3%, rgb(48 145 165 / 34%) 22%, transparent 45%),
    conic-gradient(from 210deg at 52% 43%, transparent 0 14%, rgb(38 142 166 / 24%) 18%, transparent 24% 38%, rgb(127 73 184 / 28%) 46%, transparent 53% 72%, rgb(38 153 128 / 22%) 80%, transparent 88%),
    linear-gradient(165deg, #f0ebfb 0%, #dce7f2 55%, #eef1f7 100%);
}

:global(html[data-theme='light']) .portal-card--thinking {
  background: #f0dce7;
}

:global(html[data-theme='light']) .portal-card--thinking::before {
  background:
    radial-gradient(ellipse at 84% 16%, rgb(197 72 132 / 24%), transparent 36%),
    radial-gradient(ellipse at 35% 65%, rgb(197 55 105 / 25%), transparent 42%),
    repeating-radial-gradient(ellipse at 58% 56%, transparent 0 24px, rgb(151 52 99 / 12%) 25px 26px, transparent 27px 45px),
    linear-gradient(150deg, #f8eaf1 0%, #ead3df 58%, #dcc6d2 100%);
}

.portal-card__noise {
  position: absolute;
  z-index: -1;
  opacity: .11;
  pointer-events: none;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 160 160' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.75'/%3E%3C/svg%3E");
}

.portal-card__index {
  position: absolute;
  top: clamp(1.6rem, 3vw, 3rem);
  right: clamp(1.6rem, 3vw, 3rem);
  color: var(--entry-muted);
  font-size: .75rem;
  font-variant-numeric: tabular-nums;
  letter-spacing: .16em;
}

.portal-card__content {
  display: block;
  align-self: flex-end;
  max-width: 25rem;
  transform: translateY(1.1rem);
  transition: transform 420ms cubic-bezier(.16, 1, .3, 1);
}

.portal-card__eyebrow,
.portal-card__title,
.portal-card__description,
.portal-card__action {
  display: block;
}

.portal-card__eyebrow {
  color: var(--entry-subtle);
  font-size: .67rem;
  font-weight: 650;
  letter-spacing: .18em;
}

.portal-card__title {
  margin-top: .8rem;
  font-size: clamp(2.25rem, 4.2vw, 5rem);
  font-weight: 640;
  letter-spacing: -.07em;
  line-height: .94;
  text-wrap: balance;
}

.portal-card__description {
  max-width: 19rem;
  margin-top: 1.15rem;
  color: var(--entry-muted);
  font-size: .92rem;
  letter-spacing: .02em;
  line-height: 1.7;
  opacity: 0;
  transform: translateY(.65rem);
  transition: opacity 260ms ease, transform 420ms cubic-bezier(.16, 1, .3, 1);
}

.portal-card__action {
  margin-top: 1.5rem;
  color: var(--entry-foreground);
  font-size: .72rem;
  font-weight: 700;
  letter-spacing: .14em;
  opacity: 0;
  transform: translateY(.65rem);
  transition: opacity 260ms ease 60ms, transform 420ms cubic-bezier(.16, 1, .3, 1) 60ms;
}

.portal-card:hover::before,
.portal-card:focus-visible::before,
.portal-card--selected::before {
  transform: scale(1.08);
}

.portal-card:focus-visible {
  outline: 2px solid var(--entry-focus);
  outline-offset: -6px;
}

.screen-reader-title {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.portal-card--ai-3d:hover::before,
.portal-card--ai-3d:focus-visible::before,
.portal-card--ai-3d.portal-card--selected::before {
  transform: scale(1.42) rotate(8deg);
}

.portal-card:hover::after,
.portal-card:focus-visible::after,
.portal-card--selected::after {
  opacity: .45;
}

.portal-card:hover .portal-card__content,
.portal-card:focus-visible .portal-card__content,
.portal-card--selected .portal-card__content {
  transform: translateY(0);
}

.portal-card:hover .portal-card__description,
.portal-card:hover .portal-card__action,
.portal-card:focus-visible .portal-card__description,
.portal-card:focus-visible .portal-card__action,
.portal-card--selected .portal-card__description,
.portal-card--selected .portal-card__action {
  opacity: 1;
  transform: translateY(0);
}

.portal--focused .portal-card:not(.portal-card--selected) {
  transform: scale(.985);
}

.entry-shell--entering .portal-card:not(.portal-card--selected) {
  opacity: 0;
  transform: scale(.92);
  transition-duration: 390ms;
}

.entry-shell--entering .portal-card--selected {
  z-index: 2;
  transform: scale(1.055);
}

.loader {
  position: fixed;
  z-index: 5;
  display: grid;
  width: 100%;
  min-height: 100dvh;
  place-items: center;
  overflow: hidden;
  background: var(--entry-background);
  opacity: 1;
  transition: opacity 560ms ease, visibility 0s linear 560ms;
}

.loader--hidden {
  visibility: hidden;
  opacity: 0;
  pointer-events: none;
}

.loader__aura {
  position: absolute;
  width: min(62vw, 46rem);
  aspect-ratio: 1;
  border-radius: 50%;
  background: conic-gradient(from 0deg, #ff8b55, #805cff, #48e9ca, #ff88bf, #ff8b55);
  filter: blur(54px);
  opacity: .33;
  animation: aura-shift 2.8s ease-in-out infinite alternate;
}

.gear {
  position: absolute;
  display: grid;
  border: 1px solid var(--entry-gear-border);
  border-radius: 50%;
  place-items: center;
  background: conic-gradient(from 90deg, #ff8d5c, #6a8dff, #5cffe1, #ff94c3, #ff8d5c);
  box-shadow: 0 0 42px rgb(133 133 255 / 28%);
  transform-origin: center;
}

.gear::before,
.gear::after {
  position: absolute;
  content: '';
  background: inherit;
}

.gear::before {
  width: 18%;
  height: 116%;
}

.gear::after {
  width: 116%;
  height: 18%;
}

.gear span {
  position: relative;
  z-index: 1;
  display: block;
  width: 60%;
  aspect-ratio: 1;
  border: 1px solid var(--entry-gear-inner-border);
  border-radius: 50%;
  background: var(--entry-background);
  box-shadow: inset 0 0 20px rgb(0 0 0 / 60%);
}

.gear--outer {
  width: clamp(10rem, 20vw, 17rem);
  animation: gear-turn 1.8s linear infinite;
}

.gear--inner {
  width: clamp(5.1rem, 10vw, 8.5rem);
  animation: gear-turn 1.3s linear infinite reverse;
}

.loader__label {
  position: absolute;
  bottom: clamp(2rem, 5vw, 4rem);
  margin: 0;
  color: var(--entry-loader-label);
  font-size: .67rem;
  font-weight: 700;
  letter-spacing: .3em;
}

.loader__label span {
  display: inline-block;
  margin-left: .8em;
  color: var(--entry-loader-accent);
  animation: pulse 1s ease-in-out infinite alternate;
}

@keyframes gear-turn {
  to { transform: rotate(360deg); }
}

@keyframes aura-shift {
  from { transform: scale(.9) rotate(-15deg); }
  to { transform: scale(1.14) rotate(18deg); }
}

@keyframes pulse {
  to { opacity: .32; }
}

@media (max-width: 760px) {
  .entry-shell {
    overflow: auto;
  }

  .portal {
    grid-template-columns: 1fr;
    grid-template-rows: repeat(3, minmax(33.33dvh, 1fr));
    min-height: 100dvh;
  }

  .portal-card {
    min-height: 33.33dvh;
    padding: 2rem;
    border-right: 0;
    border-bottom: 1px solid var(--entry-border);
  }

  .portal-card:last-child {
    border-bottom: 0;
  }

  .portal-card__content {
    transform: none;
  }

  .portal-card__description,
  .portal-card__action {
    display: none;
  }

  .portal-card:first-child .portal-card__index {
    right: var(--theme-control-clearance);
  }
}

@media (min-width: 761px) {
  .portal-card:last-child .portal-card__index {
    right: max(var(--theme-control-clearance), calc(env(safe-area-inset-right) + var(--theme-control-clearance)));
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

  .portal {
    transform: none;
  }

  .entry-shell {
    transition: none;
  }
}
</style>
