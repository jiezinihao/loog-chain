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

## 分支与发布流程

仓库采用以下发布链路：

```text
功能分支 → release/<当前版本> → main → release/<下一版本>
```

### 开发者流程

以下命令中的版本号和功能分支名应替换为本次开发使用的实际名称。

#### 1. 从当前 release 创建功能分支

```bash
git fetch origin
git checkout release/0.2.0
git rebase origin/release/0.2.0
git checkout -b feature/home-page
```

功能分支必须从当前 release 创建，不要直接从 `main` 开始开发。

#### 2. 开发并提交代码

完成开发后，只提交本次需求涉及的文件：

```bash
git add apps/entry/src/views/HomeView.vue
git commit -m "feat: 完成首页功能"
```

提交前应在本地确认代码可以正常运行，并通过必要的检查。

#### 3. 同步 release 并推送功能分支

```bash
git fetch origin
git rebase origin/release/0.2.0
git push -u origin feature/home-page
```

如果 rebase 产生冲突，解决冲突后继续 rebase，再推送功能分支。

#### 4. 提交 PR

在 GitHub 页面创建 PR，并确认分支方向：

```text
base：release/<当前版本>
compare：功能分支
```

等待 `eslint`、`build` 检查通过并完成代码审查后，由维护者合并 PR。

### 仓库维护者发布流程

#### 1. 创建 release 到 main 的 PR

确认当前版本的功能 PR 已处理完成后，在 GitHub 页面创建发布 PR：

```text
base：main
compare：release/<当前版本>
```

等待 `eslint`、`build`、`release-source` 检查通过。`main` 要求线性历史，合并时使用 Squash Merge 或 Rebase Merge。

#### 2. 确认版本发布

发布 PR 合并后，`publish-release` 工作流会自动：

- 重新执行 ESLint 和构建。
- 创建对应版本的 Git Tag。
- 创建 GitHub Release。
- 上传前端构建产物。

在 GitHub 的 Actions 和 Releases 页面确认发布成功后，再开始下一版本。

#### 3. 创建下一版本 release

在 GitHub 页面执行：

```text
Actions
→ start-next-release
→ Run workflow
→ Use workflow from：main
→ version：下一版本号，例如 0.3.0
→ Run workflow
```

版本输入框只填写版本号，不要包含 `release/`。工作流会从最新 `main` 创建 `release/<下一版本>` 分支。

## AI 协作约定

项目级技能和工作约束见 [AGENTS.md](./AGENTS.md)。在开始界面设计、实现或审查前，先按其中规则读取相应技能。
