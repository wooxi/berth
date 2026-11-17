# Berth

私有服务器泊位 —— 自托管的 SSH 终端、文件管理、容器与日志控制台。

一套界面管住几台 Linux 主机：打开就能看到谁在线、谁在喘，点进去就是 shell、文件和容器。项目从零创建，不 fork 任何现有面板，视觉令牌见 [DESIGN.md](./DESIGN.md)。

## 能做什么

| 能力 | 说明 |
|---|---|
| 终端 | xterm.js 多会话，经 WebSocket 直连真实 SSH，自适应尺寸 |
| 文件管理 | 浏览、预览、编辑保存、上传、下载、新建文件/文件夹、重命名、复制、移动、改权限、递归删除 |
| 容器 | Docker 列表、状态、端口、镜像，可按运行中/已停止筛选 |
| 指标 | CPU、内存、磁盘、负载，30 秒轮询 |
| 日志 | journalctl 按服务单元拉取，支持暂停与跟随滚动 |
| 审计 | 每次读文件、写文件、开终端、执行操作都留痕，带操作者、主机、路径与结果 |
| 权限 | Connect / View / Edit / Manage 四级模型（策略已实现并有测试，尚未按资源强制执行） |

## 架构

- **前端** React + Vite，Nginx 提供静态服务
- **后端** Node + `ssh2` + `ws`，持有 SSH 私钥（只读挂载），浏览器永不见密钥
- **安全** 登录会话（HttpOnly Cookie）、SSH 主机密钥指纹固定（SHA256）、全操作审计
- **部署** Docker Compose 双层栈，默认只绑内网网卡，无公网入口

## 快速开始

```sh
pnpm install
pnpm dev          # 本地开发
pnpm build        # 构建前端 → dist/
pnpm test:policy  # 17 项授权/指纹策略测试
```

部署需要一个 `hosts.json` 描述已登记主机（模板见 [`server/hosts.example.json`](./server/hosts.example.json)），以及：

```sh
YARD_SESSION_SECRET  # 会话签名密钥
YARD_PASSWORD_HASH   # 登录口令的 SHA-256
```

```sh
docker compose --env-file secrets/env -f compose.prod.yaml up -d --build
```

更新前端时用 `rsync -a --delete dist/ /srv/berth/dist/` 原地覆盖——**不要删目录重建**，绑定挂载会指向失效的 inode。

## 目录

| 路径 | 内容 |
|---|---|
| `src/` | 前端：登录、概览、主机工作区（终端/文件/容器/日志）、凭据与权限 |
| `server/` | 后端：HTTP API、WebSocket 终端、SFTP 文件服务、采集器、审计 |
| `shared/` | 授权策略与主机登记校验，前后端共用，含 17 项测试 |
| `src/assets/fonts/` | 自托管可变字体（Inter / Noto Serif / JetBrains Mono），无外部请求 |

## 安全边界

- 单管理员模式，口令哈希存于 `secrets/env`；四级权限模型已实现策略层，尚未按资源强制执行
- 文件与终端以 root 经 SSH 操作，能力等同本机 shell：`/etc`、`/usr`、`/var` 均可改。仅 `/`、`/proc`、`/sys`、`/dev`、`/run` 拒绝删除
- 递归删除需显式确认，所有写入进审计
- **仅限可信内网**。要用公网访问，先加 TOTP 与来源限制

## 命名说明

展示层是 Berth；运行时的容器名（`yard-backend`、`yard-web`）、环境变量前缀（`YARD_*`）、Cookie 名与部署目录 `yard/` 沿用旧标识，以避免破坏已有部署。改名需同步重建容器与目录。

## 字体来源

`src/assets/fonts/` 内的可变字体取自 [Nwflower/dsh-claude-style](https://github.com/Nwflower/dsh-claude-style)（MIT）。
