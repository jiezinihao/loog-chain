export type PortalModuleId = 'hand-coded-blog' | 'ai-3d' | 'thinking';

export interface PortalModule {
  id: PortalModuleId;
  index: string;
  eyebrow: string;
  title: string;
  description: string;
  action: string;
  path: string;
}

// 入口文案与路由集中维护，后续接入真实模块时无需改动选择器逻辑。
export const portalModules: PortalModule[] = [
  {
    id: 'hand-coded-blog',
    index: '01',
    eyebrow: 'ARCHIVE / HAND-CODED',
    title: '手写旧章',
    description: '古法编程blog',
    action: '进入博客',
    path: '/hand-coded-blog',
  },
  {
    id: 'ai-3d',
    index: '02',
    eyebrow: 'SYNTHESIS / DIMENSION',
    title: 'AI · 3D',
    description: '探索AI生成、快速落地实践',
    action: '进入实验场',
    path: '/ai-3d',
  },
  {
    id: 'thinking',
    index: '03',
    eyebrow: 'NOTES / REFLECTION',
    title: '思想切面',
    description: '收集、归纳、总结',
    action: '进入思想',
    path: '/thinking',
  },
];
