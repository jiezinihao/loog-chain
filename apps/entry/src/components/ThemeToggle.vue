<script setup lang="ts">
import type { Theme } from '../composables/useTheme';

defineProps<{
  theme: Theme;
}>();

const emit = defineEmits<{
  change: [theme: Theme];
}>();

// 使用明确的主题名称，避免把 Light / Dark 误解为页面亮度调节。
const themeOptions: Array<{ label: string; value: Theme }> = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
];
</script>

<template>
  <div
    class="theme-toggle"
    role="group"
    aria-label="主题模式"
  >
    <button
      v-for="option in themeOptions"
      :key="option.value"
      class="theme-toggle__option"
      :class="{ 'theme-toggle__option--active': theme === option.value }"
      type="button"
      :aria-pressed="theme === option.value"
      @click="emit('change', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<style scoped>
.theme-toggle {
  position: fixed;
  z-index: 1000;
  display: flex;
  box-sizing: border-box;
  height: 44px;
  top: calc(max(1rem, env(safe-area-inset-top)) + .25rem);
  right: calc(max(1rem, env(safe-area-inset-right)) + .25rem);
  padding: 4px;
  border: 1px solid var(--theme-control-border);
  border-radius: 999px;
  background: var(--theme-control-background);
  box-shadow: var(--theme-control-shadow);
  backdrop-filter: blur(14px);
  transition: background-color 220ms ease, border-color 220ms ease, box-shadow 220ms ease;
  -webkit-tap-highlight-color: transparent;
}

.theme-toggle__option {
  box-sizing: border-box;
  min-width: 64px;
  min-height: 36px;
  padding: 0 .85rem;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--theme-control-foreground);
  cursor: pointer;
  font: inherit;
  font-size: .72rem;
  font-weight: 700;
  letter-spacing: .04em;
  touch-action: manipulation;
  transition: background-color 180ms ease, color 180ms ease;
}

.theme-toggle:hover {
  box-shadow: var(--theme-control-shadow-hover);
}

.theme-toggle__option:hover:not(.theme-toggle__option--active) {
  background: var(--theme-control-hover);
}

.theme-toggle__option--active {
  background: var(--theme-control-active-background);
  color: var(--theme-control-active-foreground);
}

.theme-toggle__option:focus-visible {
  outline: 2px solid var(--theme-control-focus);
  outline-offset: 1px;
}

@media (prefers-reduced-motion: reduce) {
  .theme-toggle,
  .theme-toggle__option {
    transition: none;
  }
}
</style>
