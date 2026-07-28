# aws-pro

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![GHCR](https://img.shields.io/badge/GHCR-lei--rr%2Faws--pro-blue?logo=github)](https://ghcr.io/lei-rr/aws-pro)
[![Branch](https://img.shields.io/badge/branch-fast-success)](https://github.com/lei-rr/aws-pro/tree/fast)

AWS 账号 / Lightsail / EC2 / 区域 / 配额 / 账单 / 新手任务管理面板（Node.js 版）。

- 后端：Fastify 5 + TypeScript
- 前端：Vue 3 + Vite + Tailwind CSS + shadcn 风格组件
- 存储：本地 JSON（无数据库）
- 部署：Docker + GitHub Actions → GHCR
- 底座理念：与 dns-pro 对齐（**插件 ≠ 模块**）

> **默认分支：`fast`**（Node / Fastify / Vue 版本）

## 功能

- 多 AWS 账号管理
- Lightsail：同步 / 创建 / 启停重启删除 / 静态 IP / 开放端口 / 备注
- EC2：同步 / 创建 / 启停重启终止 / EIP / 安全组端口 / 备注
- 区域列表与启用
- vCPU 配额查询
- 年度账单与抵扣
- 新手任务（Budget / EC2 / Lambda / RDS）
  - **后台执行**，关闭页面不中断
  - SSE + 轮询只读日志，可恢复进行中任务

## 快速开始

### 环境要求

- Node.js `>= 20`
- npm `>= 10`
- 可选：Docker / Docker Compose

### 本地运行

```bash
git clone -b fast https://github.com/lei-rr/aws-pro.git
cd aws-pro
npm install
npm run build
npm start
```

访问：

```text
http://127.0.0.1:2023
```

默认登录：`admin / admin`  
（未配置 `data/config.json`，或用户名/密码为空时自动使用该默认值）

### 开发

| 服务 | 端口 |
|---|---|
| 生产 / Docker | `2023` |
| 本地后端 | `3023` |
| 本地前端 Vite | `5173` |

```bash
npm run dev          # 后端 3023
npm run dev:web      # 前端 5173，代理到 3023
npm run verify       # lint + typecheck + web typecheck + build
```

## Docker 部署

### 镜像

推荐统一使用 `latest`（默认分支 `fast` 构建后会打上该标签）。

| 标签 | 说明 |
|---|---|
| `ghcr.io/lei-rr/aws-pro:latest` | **推荐**，默认分支最新构建 |
| `ghcr.io/lei-rr/aws-pro:fast` | `fast` 分支标签（同 latest） |
| `ghcr.io/lei-rr/aws-pro:sha-<commit>` | 指定提交 |

### Compose（推荐）

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
docker pull ghcr.io/lei-rr/aws-pro:latest

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

### 私有镜像拉取

若仓库/包为私有，先登录 GHCR：

```bash
echo <GITHUB_TOKEN> | docker login ghcr.io -u <GITHUB_USER> --password-stdin
```

## 架构

| 词 | 含义 | 目录 |
|---|---|---|
| **插件** | Fastify HTTP 壳 | 仅 `src/plugins/*` |
| **模块** | 业务 | `src/modules/*` |

```text
Controller → request.server.ctx.<service>
API        → /api
```

加功能：modules → app-context 接线 → compose 一行。

## 数据目录

`data/` **只放运行时私有数据**，已在 `.gitignore` 排除，**不会进入 GitHub**。

| 文件 | 说明 |
|---|---|
| `data/config.json` | 登录账号（可选；缺省默认 admin/admin） |
| `data/accounts.json` | AWS 账号密钥 |
| `data/lightsail-instances.json` | Lightsail 缓存 |
| `data/ec2-instances.json` | EC2 缓存 |
| `data/newbie-tasks.json` | 新手任务状态/日志 |

区域中文名 / Lightsail 蓝图内置在代码：

```text
src/config/app-defaults.ts
```

不再使用 `data/app-config.json`。

Compose 请挂载：

```text
./data:/app/data
```

## 发布说明

1. 推送到 `fast` 分支
2. GitHub Actions 自动构建并推送镜像到 GHCR
3. 镜像标签：
   - 分支名：`fast`
   - 默认分支：`latest`
   - commit：`sha-...`
4. 服务器执行 `docker compose pull && up -d` 更新

本地发版前建议：

```bash
npm run verify
```

## 分支

| 分支 | 说明 |
|---|---|
| `fast` | **默认 / 推荐**，Node.js + Fastify + Vue |
| `main` | 历史分支（不再作为默认） |

## 许可证

MIT
