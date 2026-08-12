<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  errorMessage?: string;
  eyebrow?: string;
  message?: string;
  progress?: number;
  retryLabel?: string;
}>(), {
  errorMessage: '',
  eyebrow: 'LOADING PLAYGROUND',
  message: '正在装载游戏模块…',
  progress: undefined,
  retryLabel: '重新加载',
});

const emit = defineEmits<{
  retry: [];
}>();

const normalizedProgress = computed(() => (
  Number.isFinite(props.progress)
    ? Math.min(100, Math.max(0, Math.round(props.progress ?? 0)))
    : undefined
));
</script>

<template>
  <!-- 统一承接异步游戏分包的等待状态，避免切换时出现空白工作台。 -->
  <section
    class="game-loading"
    :class="{ 'game-loading--error': errorMessage }"
    :role="errorMessage ? 'alert' : 'status'"
    aria-live="polite"
  >
    <div class="game-loading__mark" aria-hidden="true">
      <span></span>
      <span></span>
      <span></span>
    </div>
    <div class="game-loading__content">
      <p>{{ eyebrow }}</p>
      <strong>{{ errorMessage || message }}</strong>
      <div
        v-if="normalizedProgress !== undefined && !errorMessage"
        class="game-loading__progress"
        role="progressbar"
        aria-label="游戏资源加载进度"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="normalizedProgress"
      >
        <span :style="{ width: `${normalizedProgress}%` }"></span>
        <output>{{ normalizedProgress }}%</output>
      </div>
      <button v-if="errorMessage" type="button" @click="emit('retry')">{{ retryLabel }}</button>
    </div>
  </section>
</template>

<style scoped>
.game-loading {
  display: flex;
  min-height: min(70dvh, 760px);
  align-items: center;
  justify-content: center;
  padding: 2rem;
  color: var(--game-foreground, #f4f5f8);
  text-align: left;
}

.game-loading__mark {
  position: relative;
  width: 64px;
  height: 64px;
  margin-right: 1.5rem;
  animation: loading-turn 1.8s linear infinite;
}

.game-loading__mark span {
  position: absolute;
  width: 28px;
  height: 28px;
  border: 1px solid var(--game-accent, #9f91ff);
  background: var(--game-loading-cell, rgb(159 145 255 / 18%));
}

.game-loading__mark span:nth-child(1) {
  top: 0;
  left: 18px;
}

.game-loading__mark span:nth-child(2) {
  bottom: 0;
  left: 0;
}

.game-loading__mark span:nth-child(3) {
  right: 0;
  bottom: 0;
}

.game-loading--error .game-loading__mark {
  animation: none;
}

.game-loading--error .game-loading__mark span {
  border-color: var(--game-danger, #ef6b6b);
  background: var(--game-danger-soft, rgb(239 107 107 / 14%));
}

.game-loading p,
.game-loading strong {
  margin: 0;
}

.game-loading p {
  margin-bottom: .5rem;
  color: var(--game-accent-secondary, #68e5d1);
  font-size: .62rem;
  font-weight: 750;
  letter-spacing: .2em;
}

.game-loading strong {
  font-size: clamp(1rem, 2vw, 1.35rem);
  font-weight: 580;
  letter-spacing: -.02em;
}

.game-loading__content {
  width: min(100%, 28rem);
}

.game-loading__progress {
  position: relative;
  height: 4px;
  margin-top: 1rem;
  overflow: visible;
  background: var(--game-border, rgb(255 255 255 / 14%));
}

.game-loading__progress > span {
  display: block;
  height: 100%;
  background: var(--game-accent-secondary, #68e5d1);
  transition: width 180ms ease;
}

.game-loading__progress output {
  position: absolute;
  top: .65rem;
  right: 0;
  color: var(--game-muted, #a5abb7);
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: .68rem;
  font-variant-numeric: tabular-nums;
}

.game-loading button {
  min-height: 44px;
  margin-top: 1.25rem;
  padding: 0 1rem;
  border: 1px solid var(--game-border-strong, rgb(255 255 255 / 28%));
  background: var(--game-control, #111620);
  color: var(--game-foreground, #f4f5f8);
  cursor: pointer;
  font: inherit;
  font-size: .78rem;
  font-weight: 720;
  transition: border-color 180ms ease, background-color 180ms ease;
}

.game-loading button:hover {
  border-color: var(--game-accent-secondary, #68e5d1);
  background: var(--game-control-hover, #20263a);
}

.game-loading button:focus-visible {
  outline: 2px solid var(--game-focus, #68e5d1);
  outline-offset: 2px;
}

@keyframes loading-turn {
  to { transform: rotate(360deg); }
}

@media (max-width: 540px) {
  .game-loading {
    flex-direction: column;
    text-align: center;
  }

  .game-loading__mark {
    margin: 0 0 1.5rem;
  }

  .game-loading__content {
    width: min(100%, 22rem);
  }
}

@media (prefers-reduced-motion: reduce) {
  .game-loading__mark {
    animation: none;
  }

  .game-loading__progress > span {
    transition: none;
  }
}
</style>
