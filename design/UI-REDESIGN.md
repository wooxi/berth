# Berth UI 重设计方案(v3)

预览:`design/preview-v2.html`(已按本方案精简配色,可切换浅/深主题)

## 1. 技术栈建议:在现有基础上"加库",不推倒重来

现有项目已是 React 19 + Vite + TypeScript + Radix Dialog + lucide-react + xterm,**保留**,仅补以下现成组件,不再手写样式:

| 用途 | 选型 | 说明 |
|---|---|---|
| 样式 | **Tailwind CSS v4** | 取代 45KB 手写 `index.css`;令牌用 CSS 变量 |
| 组件库 | **shadcn/ui**(基于 Radix) | 代码拷进项目,可控;已有 Radix 依赖,无缝衔接 |
| 图标 | lucide-react(已有) | 保持 |
| 命令面板 | shadcn `Command`(cmdk) | 替换手写 `CommandPalette.tsx` |
| 表格 | shadcn `Table` + **TanStack Table** | 文件列表排序/多选 |
| 图表 | shadcn `Chart`(Recharts) | KPI 迷你图、资源分布 |
| 通知 | **Sonner** | toast |
| 主题 | `next-themes` 风格的 `data-theme` / `.dark` 切换 | 浅/深 + 跟随系统 |
| 终端 | xterm.js(已有) | 主题色读 CSS 变量 |
| 编辑器(文件编辑) | CodeMirror 6 或 Monaco | 按需 |
| 字体 | **Geist Sans / Geist Mono**(自托管) | 替换 Inter + Noto Serif + JetBrains Mono,去掉衬线 |
| 路由/数据 | TanStack Router + TanStack Query(可选) | 与其他智能体的功能开发解耦 |

## 2. 组件映射(尽量不自造)

| 界面元素 | 组件 |
|---|---|
| 主机侧栏 | shadcn `Sidebar` + `Badge` + `ScrollArea` |
| 顶栏/面包屑 | `Breadcrumb`、`Button`、`DropdownMenu` |
| KPI 卡片 / 主机卡片 | `Card` + `Progress` |
| 工作区标签 | `Tabs` |
| 文件列表 | `Table`、`ContextMenu`、右侧 `Sheet` 做详情 |
| 日志 | `ToggleGroup` 过滤 + `Input` + 虚拟列表 |
| 容器 | `Card` + `AlertDialog`(停止/重启确认) |
| 凭据/策略 | `Table`、`Switch`、`Dialog`、`Form` |
| 命令面板 | `Command` + `Dialog` |

## 3. 配色:一个主色 + 中性色 + 极少状态色

原则:除主色外,界面只有灰阶;状态色仅用于状态点/徽标,且低饱和。

| 令牌 | 浅色(暖纸 + 深墨绿) | 深色(暖石墨 + 薄荷) |
|---|---|---|
| background | `#f3f0ea` | `#0f0f0e` |
| surface(卡片) | `#fdfcf9` | `#191918` |
| border | `#e4dfd4` | `#262523` |
| foreground | `#1d1c19` | `#ecebe8` |
| muted-foreground | `#57544c` / `#8d897e` | `#a4a29c` / `#6f6d68` |
| **primary(唯一主色)** | `#1f4d43` 深墨绿 | `#8fd5bf` 薄荷 |
| 成功 | 同主色 | 同主色 |
| 警告 | `#9a6b1f` | `#d9ad5f` |
| 危险 | `#a8402f` | `#e5796c` |

- 浅色:暖米纸底 + 墨绿,偏"高级文具/出版物"质感,避免纯白与高饱和蓝。
- 信息色并入中性灰,不再单独设蓝色。
- 无渐变、无彩色阴影;只有浮层使用阴影。

## 4. 布局
- 三栏:64px 图标导轨 → 264px 主机面板 → 内容区。
- 概览 = KPI(4) + 主机卡片网格 + 右侧(最近操作/资源分布)。
- 工作区 = 主机身份条 + `Tabs`(终端/文件/日志/容器)。
- ≤860px:主机面板折叠为抽屉(`Sheet`)。

## 5. 落地步骤(待确认后执行)
1. 引入 Tailwind v4 + shadcn/ui,写入上述令牌到 `globals.css`,提供 `.dark`。
2. 用 shadcn 组件重写外壳(`App.tsx`、侧栏、顶栏)。
3. 逐页替换:Overview → Console 标签页 → Access → Login。
4. 删除旧 `index.css`,更新 `DESIGN.md`。
5. 不改 `api.ts` / `server/` / `shared/`,便于其他智能体并行开发功能。

