import { createApp, h } from 'vue';

// 当前版本只建立唯一挂载入口，不提前绘制任何业务页面。
createApp({
  render: () => h('div'),
}).mount('#app');
