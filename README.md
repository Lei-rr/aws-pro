# aws-pro

AWS 实例管理面板，集账号管理、Lightsail / EC2 实例运维、区域管理、vCPU 配额查询与年度账单于一体。

基于 ThinkPHP 8 + Vue 3（无构建 ESM）。

## 功能

- **账号管理**：多 AWS 账号（Access Key / Secret Key）的增删改查，密钥脱敏展示
- **Lightsail 实例**：跨账号 / 区域同步实例列表，创建实例，启停 / 重启 / 删除，分配 / 释放静态 IP，开放端口，备注维护
- **EC2 实例**：同步实例列表，创建实例，启动 / 停止 / 重启 / 终止，开放安全组全端口，创建时支持 IPv6 自动 VPC / Subnet 配置
- **新手任务**：固定 `us-east-1` 执行 Budget、EC2、Lambda、RDS，可选择全部顺序执行或单项重试，并通过 SSE 输出实时日志
- **区域管理**：查看账号下已启用区域，按系统白名单启用新区域
- **配额查询**：查询各区域 vCPU 配额使用情况
- **账单**：年度费用与抵扣额度统计（基于 AWS Cost Explorer）

## 技术栈

- **后端**：PHP 8.0+ / ThinkPHP 8，分层为 controller → service → repository，数据走 JSON 文件存储（无数据库）
- **前端**：Vue 3 + Vue Router + Pinia + Ant Design Vue，**无构建（原生 ESM）**，浏览器直接加载 `public/assets` 下的源码，改完即生效、无需 npm build
- **第三方 SDK**：AWS SDK for PHP（Lightsail / EC2 / Budgets / Lambda / RDS / IAM / STS / Cost Explorer / Service Quotas / Account）

## 数据存储

全部业务数据以 JSON 文件存放在 `data/` 目录，通过 `app\support\JsonStore`（文件锁 + 原子写 + 事务）读写：

| 文件 | 内容 | 是否入库 |
| --- | --- | --- |
| `config.json` | 登录凭据（明文，单用户） | 否（含敏感信息） |
| `accounts.json` | AWS 账号密钥 | 否（含敏感信息） |
| `instances.json` | Lightsail 实例快照 | 否（运行时数据） |
| `ec2-instances.json` | EC2 实例快照 | 否（运行时数据） |
| `newbie-tasks.json` | 新手任务记录 | 否（运行时数据） |
| `app-config.json` | 区域 / 系统镜像预置配置 | 是 |
| `config.json.example` | 凭据模板 | 是 |

## 鉴权

单用户场景，凭据来源为 `data/config.json` 的 `auth.username` / `auth.password`（明文）：

```json
{
  "auth": {
    "username": "admin",
    "password": "change-me"
  }
}
```

- 该文件不会自动创建，缺失或凭据为空时直接禁止登录，需手动按 `config.json.example` 创建
- 修改用户名 / 密码直接编辑该文件，应用内不提供在线改密
- 登录失败一次后强制要求图形验证码，防暴力破解

## 部署

1. 安装依赖：

   ```
   composer install
   ```

2. 创建登录凭据：

   ```
   cp data/config.json.example data/config.json
   # 编辑 data/config.json 设置用户名和密码
   ```

3. 将 Web 服务器（Nginx / OpenResty 等）站点根指向 `public/` 目录，PHP 8.0+（FPM）。

4. 前端为原生 ESM 免构建，静态资源在 `public/assets`、第三方库在 `public/static`。修改前端代码后执行以下命令刷新缓存版本号（cache-bust）：

   ```
   php think assets:version
   ```

## 目录约定

- `app/controller`：HTTP 入口，按模块分目录
- `app/service`：业务逻辑，`service/aws` 为 AWS SDK 封装
- `app/repository`：JSON 文件数据访问层
- `app/support`：基础设施（JsonStore / AppConfig / AuthSession / ApiResponse / ErrorMessages 等）
- `route/`：API 路由（SPA catch-all + `api` 分组，受保护端点走 `auth.required` 中间件）
- `data/`：运行时 JSON 数据（敏感文件不入库）

## 版权信息

基于 ThinkPHP 开发，ThinkPHP 遵循 Apache2 开源协议发布。详见 [LICENSE.txt](LICENSE.txt)。
