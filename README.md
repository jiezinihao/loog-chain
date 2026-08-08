# Think Chain

个人前端项目展示仓库，使用 pnpm workspace 管理，并以单一入口应用承载后续的模块导航与内容展示。

当前版本只完成工程基础设施，不包含页面、视觉设计或业务逻辑。

## 模块

- `hand-coded-blog`：老博客入口与迁移承载模块。
- `ai-3d`：AI 与 3D 体验模块。
- `thinking`：思想与笔记内容模块。

## 目录

```text
apps/
  entry/                  # 唯一的 Vue/Vite 前端入口
packages/
  hand-coded-blog/        # 老博客模块
  ai-3d/                  # AI-3D 模块
  thinking/               # 思想模块
.codex/skills/            # 项目级 AI 设计与审查技能
```

## 环境与命令

需要 Node.js 22+ 与 pnpm 10+。

```bash
pnpm install
pnpm dev
pnpm build
pnpm typecheck
```

## AI 协作约定

项目级技能和工作约束见 [AGENT.md](./AGENT.md)。在开始界面设计、实现或审查前，先按其中规则读取相应技能。
