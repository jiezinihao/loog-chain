import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';

import App from './App.vue';
import { portalModules } from './portal-modules';
import HomeView from './views/HomeView.vue';
import PlaceholderView from './views/PlaceholderView.vue';

const placeholderModules = portalModules.filter(
  (module) => module.id !== 'thinking' && module.id !== 'ai-3d',
);

// 各业务模块按路由异步加载，避免入口首屏提前打包实验内容与页面动效。
const loadAi3dView = () => import('@think-chain/ai-3d').then((module) => module.Ai3dView);
// 思想切面按路由异步加载，避免入口首屏提前打包笔记正文和页面动效。
const loadThinkingView = () => import('@think-chain/thinking').then((module) => module.ThinkingView);
const loadThinkingDetailView = () =>
  import('@think-chain/thinking').then((module) => module.ThinkingDetailView);

// 三个模块共享唯一入口；已具备真实页面的模块单独接入，其余继续使用统一占位页。
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: HomeView },
    { path: '/ai-3d', name: 'ai-3d', component: loadAi3dView },
    { path: '/thinking', name: 'thinking', component: loadThinkingView },
    { path: '/thinking/:id', name: 'thinking-detail', component: loadThinkingDetailView },
    ...placeholderModules.map((module) => ({
      path: module.path,
      component: PlaceholderView,
      props: { module },
    })),
  ],
});

createApp(App).use(router).mount('#app');
