# Yard

独立、自托管的服务器管理工作台。项目从零创建，不 fork Termix，不依赖其代码；交互设计参考 Termix 的权限分级与终端体验。

## 架构

- 前端：React + Vite（xterm.js 终端），由 Nginx 提供静态服务
- 后端：Node（ssh2 + ws），持有 SSH 私钥（只读挂载），浏览器永不见密钥
- 安全：登录会话（HttpOnly Cookie）、主机指纹固定（SHA256）、全部操作写审计日志
- 部署：CT103 `192.168.100.6:5180`，仅内网，无公网入口

## 接入的主机

| ID | 主机 | 指纹固定 | 采集内容 |
|---|---|---|---|
| pve | 192.168.100.2（PVE 宿主） | ✅ | 指标 / 日志 / 文件 / 终端 |
| ct101 | 192.168.100.4（业务容器） | ✅ | 指标 / 容器 / 日志 / 文件 / 终端 |
| ct103 | 192.168.100.6（Agent 常驻） | ✅ | 指标 / 容器 / 日志 / 文件 / 终端 |
| openwrt | 192.168.100.1（软路由） | ⏸ 已登记未启用 | 主机密钥变更后待人工确认 |

## 目录结构

- `src/` 前端（登录、概览、终端、文件、容器、日志审计、权限）
- `server/` 后端（API、WebSocket 终端、采集器、审计）
- `shared/` 授权策略与主机登记校验（前后端共用，含 17 项测试）
- `compose.prod.yaml` + `Dockerfile` + `nginx.prod.conf` 部署编排

## 常用命令

```sh
pnpm install          # 安装依赖
pnpm dev              # 本地开发（mock）
pnpm build            # 前端构建 → dist/
pnpm test:policy      # 17 项策略测试
docker compose --env-file secrets/env -f compose.prod.yaml up -d --build   # 部署/更新
```

## 安全边界

- 当前为单管理员模式（口令哈希存于 `secrets/env`），权限级别 Connect/View/Edit/Manage 为设计预览，尚未按资源强制执行
- 容器启停、文件写、远程命令执行未开放；终端为真实 SSH shell，操作以审计日志留痕
- 仅限可信内网使用，禁止加入公网反代或端口转发
