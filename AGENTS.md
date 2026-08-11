# Think Chain Agent Guide

## 项目边界

- 本仓库是 pnpm monorepo；唯一可运行入口是 `apps/entry`。
- `packages/hand-coded-blog`、`packages/ai-3d` 和 `packages/thinking` 是相互独立的业务模块；未经明确需求，不跨模块改动。
- 当前阶段仅维护工程骨架。没有明确页面需求时，不创建页面、组件、视觉稿或虚构接口。
- 保持方案简单：优先复用现有结构，不为了未来假设提前抽象。

## 技术约定

- 使用 Vue 3、Vite 与 TypeScript。
- 依赖版本由根目录 `pnpm-workspace.yaml` 的 `catalog` 统一管理；不要在子包中重复写版本号。
- 使用 pnpm 命令，禁止生成 npm 或 yarn 锁文件。
- 新增生产代码使用中文注释说明意图；不写无意义注释。

## 设计技能

所有技能均为项目级文件，已固定在 `.codex/skills/`，必须按任务类型使用：

1. 涉及页面布局、视觉风格、交互、响应式或前端 UI 实现时，先完整阅读 `.codex/skills/ui-ux-pro-max/SKILL.md`，并按需查询其本地规则与数据。
2. 涉及 UI、可访问性、设计或体验审查时，先完整阅读 `.codex/skills/web-design-guidelines/SKILL.md`，并在每次审查前拉取其声明的最新规则。
3. 纯工程配置、构建、依赖或非视觉逻辑任务，不加载上述设计技能，避免无关上下文。

## 主题规范

- 后续新增或修改页面时，必须同时考虑 Light 与 Dark 两套主题，覆盖背景、表面、文字、边框及交互状态等主要视觉层级。
- 页面样式优先使用语义化颜色变量，并根据根节点的 `data-theme` 映射两套独立色板；禁止通过 `brightness()` 等整体滤镜模拟另一套主题。
- 两套主题需分别保证正文、辅助文字和交互状态具有足够对比度，不能仅验证其中一种主题。

### 异步业务包的主题应用

- 主题状态统一来自 `apps/entry/src/composables/useTheme.ts` 写入的 `html[data-theme]`，业务包不得维护第二份主题状态。
- 异步加载的业务包中，在 `<style scoped>` 内使用祖先主题选择器可能无法稳定覆盖默认 Dark 变量。页面根节点必须增加模块专用标记，例如 `data-ai-3d-theme-root`。
- Light 色板映射应放在独立的非 scoped `<style>` 中，使用完整全局选择器；scoped 样式只保留默认色板和组件布局：

```css
html[data-theme='light'] [data-ai-3d-theme-root] {
  --page-background: #f1f0ec;
  --page-foreground: #20232a;
}
```

- Three.js、Canvas、ECharts 等命令式渲染不会自动读取更新后的 CSS 变量。需要监听 `html` 的 `data-theme` 变化，从页面主题根节点重新读取语义变量并更新材质或画布，同时在卸载时清理监听器。
- 主题相关修改至少检查首次进入页面、Dark 切换 Light、Light 切换 Dark 三种场景，确认页面样式与命令式渲染内容同步变化。

## 验证

- 安装或依赖变动后，运行 `pnpm install` 更新 `pnpm-lock.yaml`。
- 入口构建相关改动使用 `pnpm build` 验证；类型相关改动使用 `pnpm typecheck` 验证。
- 未经请求，不新增页面截图、浏览器自动化或端到端测试。
