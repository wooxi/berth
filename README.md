# Berth

独立、自托管的私有服务器泊位。项目从零创建，不 fork Termix，不依赖其代码。视觉令牌见 [DESIGN.md](./DESIGN.md)。

## 架构

- 前端：React + Vite（xterm.js 终端），由 Nginx 提供静态服务
- 后端：Node（ssh2 + ws），持有 SSH 私钥（只读挂载），浏览器永不见密钥
- 安全：登录会话（HttpOnly Cookie）、主机指纹固定（SHA256）、全部操作写审计日志
- 部署：Docker Compose 双层栈（Nginx + 后端），默认仅绑定内网网卡，无公网入口

## 接入的主机

| ID | 主机 | 指纹固定 | 采集内容 |
|---|---|---|---|
| pve | 192.0.2.20（示例：虚拟化宿主） | ✅ | 指标 / 日志 / 文件 / 终端 |
| ct101 | 192.0.2.40（示例：容器业务机） | ✅ | 指标 / 容器 / 日志 / 文件 / 终端 |
| ct103 | 192.0.2.60（示例：常驻代理机） | ✅ | 指标 / 容器 / 日志 / 文件 / 终端 |
| openwrt | 192.0.2.10（示例：路由器） | ⏸ 已登记未启用 | 主机密钥变更后待人工确认 |

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
