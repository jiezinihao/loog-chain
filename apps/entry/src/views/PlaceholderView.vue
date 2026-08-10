<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import type { PortalModule } from '../portal-modules';

const props = defineProps<{ module: PortalModule }>();
const moduleClass = computed(() => `placeholder--${props.module.id}`);
const mainElement = ref<HTMLElement>();

// 路由切换后把阅读焦点交给新页面主体，避免读屏器停留在已离开的入口卡片。
onMounted(() => {
  mainElement.value?.focus();
});
</script>

<template>
  <main ref="mainElement" class="placeholder" :class="moduleClass" tabindex="-1">
    <RouterLink class="placeholder__back" to="/">← 返回入口</RouterLink>
    <section class="placeholder__content">
      <p>{{ module.eyebrow }}</p>
      <h1>{{ module.title }}</h1>
      <span>页面建设中</span>
    </section>
  </main>
</template>

<style scoped>
/* 占位页通过语义变量分别适配 Light / Dark，保持两种模式的层级与对比度。 */
.placeholder {
  --placeholder-background: #08090d;
  --placeholder-foreground: #f8fafc;
  --placeholder-muted: #b5bbc5;
  --placeholder-link: #d5d9df;
  --placeholder-focus: #fff;
  display: grid;
  min-height: 100dvh;
  padding: clamp(2rem, 5vw, 5rem);
  place-items: center;
  background: radial-gradient(circle at 50% 42%, var(--glow), transparent 30%), var(--placeholder-background);
  color: var(--placeholder-foreground);
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  transition: background-color 220ms ease, color 220ms ease;
}

.placeholder--hand-coded-blog { --glow: rgb(255 160 84 / 30%); }
.placeholder--ai-3d { --glow: rgb(103 101 255 / 34%); }
.placeholder--thinking { --glow: rgb(244 83 151 / 28%); }

:global(html[data-theme='light']) .placeholder {
  --placeholder-background: #f5f2ed;
  --placeholder-foreground: #202126;
  --placeholder-muted: #565a63;
  --placeholder-link: #3f434b;
  --placeholder-focus: #5940a5;
}

:global(html[data-theme='light']) .placeholder--hand-coded-blog { --glow: rgb(207 102 37 / 20%); }
:global(html[data-theme='light']) .placeholder--ai-3d { --glow: rgb(91 75 190 / 20%); }
:global(html[data-theme='light']) .placeholder--thinking { --glow: rgb(190 54 112 / 18%); }

.placeholder__back {
  position: absolute;
  top: max(clamp(2rem, 5vw, 5rem), env(safe-area-inset-top));
  left: max(clamp(2rem, 5vw, 5rem), env(safe-area-inset-left));
  min-height: 44px;
  color: var(--placeholder-link);
  font-size: .8rem;
  letter-spacing: .08em;
  line-height: 44px;
  text-decoration: none;
  transition: color 180ms ease;
}

.placeholder__back:hover,
.placeholder__back:focus-visible {
  color: var(--placeholder-foreground);
}

.placeholder__back:focus-visible {
  outline: 2px solid var(--placeholder-focus);
  outline-offset: 4px;
}

.placeholder__content {
  text-align: center;
}

.placeholder__content p,
.placeholder__content span {
  color: var(--placeholder-muted);
  font-size: .7rem;
  letter-spacing: .2em;
}

.placeholder__content h1 {
  margin: 1rem 0 1.25rem;
  font-size: clamp(3rem, 10vw, 8rem);
  font-weight: 620;
  letter-spacing: -.08em;
}

.placeholder__content span {
  color: var(--placeholder-link);
}

@media (prefers-reduced-motion: reduce) {
  .placeholder,
  .placeholder__back {
    transition: none;
  }
}
</style>
