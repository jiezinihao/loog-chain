<script setup lang="ts">
import ThemeToggle from './components/ThemeToggle.vue';
import { useTheme } from './composables/useTheme';

const { theme, setTheme } = useTheme();
</script>

<template>
  <RouterView />
  <ThemeToggle :theme="theme" @change="setTheme" />
</template>

<style>
/* Light / Dark 分别声明语义色，避免用整体明暗滤镜模拟主题。 */
:root,
:root[data-theme='dark'] {
  --app-background: #07080b;
  --app-foreground: #f8fafc;
  --theme-control-background: rgb(19 21 27 / 88%);
  --theme-control-hover: #252934;
  --theme-control-foreground: #bfc5cf;
  --theme-control-active-background: #f8fafc;
  --theme-control-active-foreground: #17181c;
  --theme-control-border: rgb(255 255 255 / 28%);
  --theme-control-focus: #79f8df;
  --theme-control-shadow: 0 8px 24px rgb(0 0 0 / 26%);
  --theme-control-shadow-hover: 0 10px 30px rgb(0 0 0 / 36%);
  --theme-control-clearance: 10.5rem;
  background: var(--app-background);
  color-scheme: dark;
}

:root[data-theme='light'] {
  --app-background: #f5f2ed;
  --app-foreground: #17181c;
  --theme-control-background: rgb(255 255 255 / 90%);
  --theme-control-hover: #ece8e2;
  --theme-control-foreground: #5d6068;
  --theme-control-active-background: #202126;
  --theme-control-active-foreground: #fff;
  --theme-control-border: rgb(23 24 28 / 22%);
  --theme-control-focus: #7657d8;
  --theme-control-shadow: 0 8px 24px rgb(55 46 36 / 14%);
  --theme-control-shadow-hover: 0 10px 30px rgb(55 46 36 / 20%);
  background: var(--app-background);
  color-scheme: light;
}

html,
body,
#app {
  min-width: 320px;
  min-height: 100%;
  margin: 0;
}

body {
  overflow-x: hidden;
  background: var(--app-background);
  color: var(--app-foreground);
  transition: background-color 220ms ease, color 220ms ease;
}

@media (prefers-reduced-motion: reduce) {
  body {
    transition: none;
  }
}
</style>
