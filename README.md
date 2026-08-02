# aws-pro

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![GHCR](https://img.shields.io/badge/GHCR-lei--rr%2Faws--pro-blue?logo=github)](https://ghcr.io/lei-rr/aws-pro)
[![Branch](https://img.shields.io/badge/branch-fast-success)](https://github.com/lei-rr/aws-pro/tree/fast)

AWS 账号、Lightsail、EC2、区域、配额、账单和新手任务管理面板。

- 后端：Fastify 5 + TypeBox + TypeScript
- 前端：Vue 3 + Vite + Tailwind CSS + shadcn 风格组件
- 存储：单进程、本地 JSON，无数据库
- 部署：Docker + GitHub Actions → GHCR
- API：仅 `/api`，无版本前缀

> 默认分支：`fast`

## 功能

- 多 AWS 账号管理，密钥在 API 响应中脱敏
- Lightsail：同步、创建、启停、重启、删除、静态 IP、开放端口、备注
- EC2：同步、创建、启停、重启、终止、EIP、安全组端口、备注
- 区域列表与启用
- vCPU 配额查询
- 年度账单与抵扣
- 新手任务：Budget、EC2、Lambda、RDS
  - 活动任务运行或清理期间禁止删除其 AWS 账号，避免任务失去清理凭据
  - 收到 SIGTERM 时停止接收新任务，并等待当前后台任务完成持久化后退出
  - 后台执行，关闭页面不终止
  - SSE + 轮询读取日志
  - 持久化阶段、日志序号、取消和重启恢复
  - 创建达成后执行资源清理，不等待 Lambda Active / RDS available

## 快速开始

### 环境要求

- Node.js `>= 22.13`
- npm `>= 10`
- 可选：Docker / Docker Compose

### 本地运行

```bash
git clone -b fast https://github.com/lei-rr/aws-pro.git
cd aws-pro
npm ci
npm run build
npm start
```

访问：`http://127.0.0.1:2023`

首次启动如果缺少 `data/config.json`，程序会生成：

```text
admin / admin
```

登录凭据直接来自 `data/config.json`，程序不提供「登录后修改密码」功能。修改生产环境账号密码请：停止服务 → 手工编辑 `data/config.json` 中的 `auth.username` / `auth.password` → 重启服务。已有配置不会被覆盖；配置损坏（`auth.username` / `auth.password` 缺失或为空）时登录会被拒绝。

Session 密钥优先读取 `SESSION_SECRET`；未设置时自动生成并持久化到 `data/session-secret`。部署升级必须保留该文件。

### 开发端口

| 服务 | 端口 |
|---|---:|
| 生产 / Docker | `2023` |
| 本地后端 | `3023` |
| 本地前端 Vite | `5173` |

```bash
npm run dev
npm run dev:web
npm run verify
```

`npm run verify` 会执行格式、Lint、前后端 Typecheck、架构、死码、依赖、冻结路由、可靠性/功能 Probe、构建和静态资源验收。

## Docker 部署

### 镜像标签

| 标签 | 说明 |
|---|---|
| `ghcr.io/lei-rr/aws-pro:latest` | `fast` 最新构建 |
| `ghcr.io/lei-rr/aws-pro:fast` | `fast` 分支标签 |
| `ghcr.io/lei-rr/aws-pro:sha-<commit>` | 指定提交 |

### Compose

```bash
mkdir -p aws-pro && cd aws-pro
cat > compose.yaml <<'EOF'
services:
  aws-pro:
    image: ghcr.io/lei-rr/aws-pro:latest
    container_name: aws-pro
    restart: unless-stopped
    ports:
      - "2023:2023"
    volumes:
      - ./data:/app/data
EOF

docker compose pull
docker compose up -d
```

### 单容器

```bash
docker run -d \
  --name aws-pro \
  --restart unless-stopped \
  -p 2023:2023 \
  -v "$PWD/data:/app/data" \
  ghcr.io/lei-rr/aws-pro:latest
```

### 更新

```bash
docker compose pull
docker compose up -d --force-recreate
```

私有包先登录 GHCR：

```bash
echo <GITHUB_TOKEN> | docker login ghcr.io -u <GITHUB_USER> --password-stdin
```

## 架构

```text
server/
  src/
    app.ts / server.ts
    bootstrap/       # 唯一组装点
    plugins/         # Fastify HTTP 壳
    modules/         # 单领域业务能力
    workflows/       # 跨模块业务用例
    platform/        # 存储、缓存等运行设施
    shared/          # HTTP、认证、AWS 中立工具

web/src/
  app/             # 启动、路由、布局、全局样式
  pages/           # 页面组合
  features/        # AWS 业务 API / model / UI
  shared/          # 通用组件与工具
```

依赖方向：

```text
app/bootstrap → workflows → modules → platform/shared
app/bootstrap → modules → platform/shared
pages → features → shared
```

运行时上下文固定为：

```text
request.server.ctx.{config, platform, modules, workflows}
```

账户删除及子资源清理由 Workflow 拥有；Newbie 保留为模块内持久状态机，不套用 DNS 批量 Job。

## 缓存和刷新

- 区域、配额和账单使用进程内永久缓存，无 TTL 和容量淘汰
- 冷读单飞；普通读取命中缓存
- `cache_only=1` 冷缺失返回空结果，不调用 AWS
- 只有显式刷新覆盖缓存
- mutation 精确失效，写入使用 generation fence 防止旧请求回填
- Lightsail / EC2 本地 JSON 是页面数据源，只有显式同步调用 AWS

## 数据目录

`data/` 仅放运行时私有数据，已被 Git 和 Docker 构建上下文排除。

| 文件 | 说明 |
|---|---|
| `data/config.json` | 登录账号；缺失时首次启动生成 admin/admin |
| `data/session-secret` | 自动生成的 Session 密钥，升级时保留 |
| `data/accounts.json` | AWS 账号密钥 |
| `data/lightsail-instances.json` | Lightsail 本地状态 |
| `data/ec2-instances.json` | EC2 本地状态 |
| `data/newbie-tasks.json` | 新手任务状态与日志 |

敏感 JSON 和 `session-secret` 创建/读取时会收紧到 `0600`。程序不会修改文件属主。

区域中文名和 Lightsail 蓝图目录内置在：

```text
server/src/shared/aws/aws-catalog.ts
```

部署必须挂载一个由单个 aws-pro 进程独占的数据目录：

```text
./data:/app/data
```

## 发布

1. 本地 `npm run verify`
2. 推送到 `fast`
3. GitHub Actions 先执行同一套 `npm run verify`
4. Verify 通过后才构建并推送 GHCR
5. 服务器拉取并强制重建容器

## 许可证

MIT
