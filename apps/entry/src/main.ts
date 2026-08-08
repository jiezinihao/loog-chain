import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';

import App from './App.vue';
import { portalModules } from './portal-modules';
import HomeView from './views/HomeView.vue';
import PlaceholderView from './views/PlaceholderView.vue';

// 三个模块共享唯一入口；实际业务页确定前先统一落到占位路由。
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: HomeView },
    ...portalModules.map((module) => ({
      path: module.path,
      component: PlaceholderView,
      props: { module },
    })),
  ],
});

createApp(App).use(router).mount('#app');
