# Foundation (clear & frozen)

> 底座简单稳定；业务扩展只动 modules。  
> **只有 `src/plugins/*` 叫「插件」（Fastify 官方）。业务不叫插件。**  
> 理念对齐 [dns-pro](https://github.com/lei-rr/dns-pro)（端口与 API 前缀不同）。

## 两个词，不要混

| 词 | 是什么 | 目录 |
|---|---|---|
| **插件 Plugin** | Fastify HTTP 能力 | `src/plugins/*` + `@fastify/*` |
| **模块 Module** | 业务功能（路由+服务） | `src/modules/*` |

**什么时候做模块：** 有 API/页面的业务（account、lightsail…）  
**什么时候做插件：** 只碰 HTTP 壳（安全、静态、session、错误处理）  
**禁止：** 再写 `modules/*/index.ts` 假模块入口 / 自研 DI registry / Nest

## 目录

```text
src/
  app.ts              # Fastify 组装
  server.ts           # 进程入口 + ensureDataDirs
  app-context.ts      # 接线：new 服务 → ctx
  compose/
    http-modules.ts   # 路由表（追加一行）
  plugins/            # 唯一叫「插件」：官方 Fastify
  platform/           # ensure-data-dirs（可扩展 job/events）
  lib/                # aws / cache / storage / auth / http
  modules/
    auth account system
    lightsail ec2 region quota billing newbie
  types/fastify.d.ts
  config/app.ts + app-defaults.ts
```

## 请求路径

```text
Controller → request.server.ctx.<service>
API        → /api  （前端 baseURL；不用 /api/v1）
Bulk/长任务→ NewbieTaskService 后台执行 + SSE/轮询只读日志
```

## 鉴权

- 公开：`GET /api/health`、`POST|GET|DELETE /api/session`
- 其余业务 API + `GET /api/config`：统一走 compose 里一层 `authRequired`

## 加功能 3 步

1. `src/modules/<name>/`（routes + services）
2. `app-context.ts` new 服务并放进 return（仅控制器要用的）
3. `compose/http-modules.ts` 加一行 `register`

## 已删除（勿再引入）

- `modules/*/index.ts` 薄包装（compose 直接挂 routes）
- 自研 DI / AppPlugin / Nest
- schema 版本 meta.json / 内置备份 API

## Boot

1. config + dataRoot  
2. ensureDataDirs  
3. createAppContext（services + resume newbie jobs）  
4. buildApp（plugins + routes）  
5. listen  

## 与 dns-pro 的差异（有意保留）

| 项 | dns-pro | aws-pro |
|---|---|---|
| 端口 | 2022 / 3022 | 2023 / 3023 |
| API 前缀 | `/api` | `/api` |
| 业务 | DNS 厂商 | AWS 账号与资源 |
| platform/job+events | 有通用 Job/EventBus | 新手任务在 modules 内后台执行 |
