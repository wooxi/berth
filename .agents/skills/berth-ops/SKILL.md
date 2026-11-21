---
name: berth-ops
description: Berth 私有服务器控制面板全链路运维与管理技能。当智能体需要部署或升级 Berth 前后端（Docker Compose / Nginx）、通过 CLI 或 API 登记/编辑/探测纳管服务器、查看健康状态与操作审计、通过 API 管理目标主机上的容器启停与日志、或排查 yard-backend / yard-web 故障时触发。
---

# Berth 服务运维与管理指南

Berth 是自托管的多服务器 SSH / SFTP / Docker 控制台。前端为 React + Tailwind v4 + shadcn/ui，后端为 Node 24（`ssh2` + `ws`），生产环境以 `yard-backend` 与 `yard-web` 双容器运行。

## 1. 服务架构与默认位置

- **代码仓库**：当前工作区（`src/` 前端、`server/` 后端、`shared/` 共享策略、`scripts/berth-hosts.mjs` CLI）
- **线上默认部署路径**：`/ssd/docker/yard/`（含 `dist/`、`server/`、`shared/`、`hosts.json`、`secrets/env`、`compose.prod.yaml`）
- **容器与端口**：
  - `yard-backend`：后端 API 与 WebSocket 终端（容器内 `8080`，健康检查 `/api/health`）
  - `yard-web`：Nginx 静态托管与反向代理（默认映射 `${YARD_LAN_BIND:-127.0.0.1}:5180->8080`）

## 2. 本地验证与构建

```sh
pnpm install --frozen-lockfile
pnpm build        # 类型检查 (tsc -b) + Vite 构建 → dist/
pnpm test:policy  # 运行 23 项授权/鉴权/主机登记单元测试
```

## 3. 生产部署与热更新

### 仅更新前端（修改了 `src/` 或 `index.html`）
`yard-web` 通过 bind mount 挂载 `./dist:/usr/share/nginx/html:ro`。**严禁删除 `dist` 目录本身重建**，否则会导致宿主机 inode 变更、容器内挂载失效。

```sh
# 1. 本地构建
pnpm build

# 2. 清理旧 chunk 并原地覆盖（以 192.168.100.6 为例）
ssh root@<HOST> "rm -rf /ssd/docker/yard/dist/assets/*"
scp -r dist/* root@<HOST>:/ssd/docker/yard/dist/
ssh root@<HOST> "chmod -R 755 /ssd/docker/yard/dist && docker exec yard-web nginx -s reload"
```

### 更新后端或全量重建（修改了 `server/`、`shared/` 或 `Dockerfile`）

```sh
# 同步后端源码与前端构建产物后重建 yard-backend
scp -r server/* root@<HOST>:/ssd/docker/yard/server/
scp -r shared/* root@<HOST>:/ssd/docker/yard/shared/
ssh root@<HOST> "cd /ssd/docker/yard && docker compose --env-file secrets/env -f compose.prod.yaml up -d --build"

# 验证状态（必须带 --env-file secrets/env）
ssh root@<HOST> "cd /ssd/docker/yard && docker compose --env-file secrets/env -f compose.prod.yaml ps"
curl -s http://<HOST>:5180/api/health
```

## 4. 纳管服务器管理（CLI / REST API）

设置环境变量 `BERTH_URL`（默认 `http://192.168.100.6:5180`）及凭据 `BERTH_API_TOKEN`（优先，对应服务端 `YARD_API_TOKEN`）或 `BERTH_PASSWORD`：

```sh
# 列出已登记主机及在线状态
BERTH_API_TOKEN=xxx node scripts/berth-hosts.mjs list

# 探测目标主机 SSH 公钥指纹（TOFU）
node scripts/berth-hosts.mjs probe --address 192.0.2.10 --port 22

# 登记新主机并自动探测指纹
BERTH_API_TOKEN=xxx node scripts/berth-hosts.mjs add \
  --id node-01 --label "Node 01" --address 192.0.2.10 --probe

# 修改既有主机配置（id 不可改）
BERTH_API_TOKEN=xxx node scripts/berth-hosts.mjs edit node-01 --group prod --role app
```

> **鉴权边界**：`YARD_API_TOKEN` 仅允许访问主机登记面（`GET/POST /api/hosts`、`PUT /api/hosts/:id`、`GET /api/hosts/:id/config`、`POST /api/hosts/probe`）。访问终端、文件、容器控制、日志接口时必须使用 `/api/login` 获取的 `yard_session` Cookie，Token 调用会返回 `403`。

## 5. 常用管理接口清单（需 `yard_session` Cookie）

- **健康与审计**：`GET /api/health`、`GET /api/audit?limit=100`
- **容器列表与控制**：
  - `GET /api/hosts/:id/containers`
  - `POST /api/hosts/:id/containers/:cid/start|stop|restart`
  - `GET /api/hosts/:id/containers/:cid/logs?lines=200`
- **系统日志**：`GET /api/hosts/:id/logs?unit=docker.service&lines=200`
- **文件管理**：`GET /api/hosts/:id/files?path=...`、`GET .../files/read`、`PUT .../files/write`、`POST .../files/(mkdir|rename|copy|move|chmod|touch|delete|upload)`

## 6. 常见故障排查

| 现象 | 原因 | 排查与修复 |
|---|---|---|
| `YARD_PASSWORD_HASH is missing` | 执行 `docker compose` 漏加 env 文件 | 始终附加 `--env-file secrets/env` |
| 页面更新后浏览器仍显示旧版或 404 | `dist` 目录被删重建导致 bind mount 失效，或权限不足 | 保证 `chmod -R 755 /ssd/docker/yard/dist` 并 `docker compose ... up -d --force-recreate yard-web` |
| 主机显示“连接失败” | 目标主机 SSH 密钥指纹变更或网络不可达 | 用 `scripts/berth-hosts.mjs probe` 重新采集指纹并用 `edit` 更新 |
| 后端健康检查失败 | `hosts.json` 格式错误或私钥权限不对 | `docker logs yard-backend --tail 50` 查看启动报错 |
