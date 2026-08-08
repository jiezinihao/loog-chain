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
.placeholder {
  display: grid;
  min-height: 100dvh;
  padding: clamp(2rem, 5vw, 5rem);
  place-items: center;
  background: radial-gradient(circle at 50% 42%, var(--glow), transparent 30%), #08090d;
  color: #f8fafc;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
}

.placeholder--hand-coded-blog { --glow: rgb(255 160 84 / 30%); }
.placeholder--ai-3d { --glow: rgb(103 101 255 / 34%); }
.placeholder--thinking { --glow: rgb(244 83 151 / 28%); }

.placeholder__back {
  position: absolute;
  top: clamp(2rem, 5vw, 5rem);
  left: clamp(2rem, 5vw, 5rem);
  color: rgb(255 255 255 / 72%);
  font-size: .8rem;
  letter-spacing: .08em;
  text-decoration: none;
}

.placeholder__back:hover,
.placeholder__back:focus-visible {
  color: #fff;
}

.placeholder__content {
  text-align: center;
}

.placeholder__content p,
.placeholder__content span {
  color: rgb(255 255 255 / 58%);
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
  color: rgb(255 255 255 / 76%);
}
</style>
