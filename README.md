# aws-pro

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![GHCR](https://img.shields.io/badge/GHCR-lei--rr%2Faws--pro-blue?logo=github)](https://ghcr.io/lei-rr/aws-pro)

AWS 账号 / Lightsail / EC2 / 区域 / 配额 / 账单 / 新手任务管理面板（Node.js 版）。

- 后端：Fastify + TypeScript
- 前端：Vue 3 + Vite + Ant Design Vue + Pinia
- 存储：本地 JSON（无数据库）
- 部署：Docker + GitHub Actions → GHCR

## 功能

- 多 AWS 账号管理
- Lightsail 实例同步 / 创建 / 启停重启删除 / 静态 IP / 开放端口 / 备注
- EC2 实例同步 / 创建 / 启停重启终止 / EIP / 安全组端口 / 备注
- 区域列表与启用
- vCPU 配额查询
- 年度账单与抵扣
- 新手任务（Budget / EC2 / Lambda / RDS，SSE 实时日志）

## 快速开始

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

默认登录：

```text
admin / admin
```

## 开发

| 服务 | 端口 |
|---|---|
| 生产 / Docker | `2023` |
| 本地后端 | `3023` |
| 本地前端 Vite | `5173` |

```bash
npm run dev          # 后端 3023
npm run dev:web      # 前端 5173，代理到 3023
```

## Docker

```bash
docker pull ghcr.io/lei-rr/aws-pro:latest
docker compose pull
docker compose up -d
```

或：

```bash
docker run -d   --name aws-pro   --restart unless-stopped   -p 2023:2023   -v "$PWD/data:/app/data"   ghcr.io/lei-rr/aws-pro:latest
```

## 数据目录

| 文件 | 说明 |
|---|---|
| `data/config.json` | 登录账号 |
| `data/accounts.json` | AWS 账号密钥 |
| `data/app-config.json` | 区域/镜像预置 |
| `data/lightsail-instances.json` | Lightsail 快照 |
| `data/ec2-instances.json` | EC2 快照 |
| `data/newbie-tasks.json` | 新手任务状态 |

## 分支

- `fast`：Node.js / Fastify / Vue 版本（推荐）
- `main`：历史 PHP 版本

## 许可证

MIT
