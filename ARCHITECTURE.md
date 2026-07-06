# ARCHITECTURE

本文件是本项目的开发规范与架构约定，底层架构与 `dns.guolei.cc` 保持一致，业务模块按 AWS 域独立演进。

目标不是追求教科书式分层，而是在当前项目规模下，保持：

- 边界清楚
- 职责稳定
- 代码可持续演进
- 不过度封装
- 不围绕单个功能无限优化

后续开发默认严格遵循本文件，除非有明确的系统级理由需要调整。

## 1. 总体原则

1. 先做系统架构优化，再做模块功能扩展。
2. 不为抽象而抽象，不为统一而统一。
3. 模块之间不允许横向直接耦合业务实现。
4. 能在当前层清楚表达的逻辑，不新增一层包装。
5. 发现结构性问题时，优先做局部重构，不继续堆补丁。
6. 新增复杂能力前，先判断是否会破坏现有边界。

## 2. 后端分层约定

当前后端统一采用以下层次：

1. `controller`
2. `controller/concerns`
3. `service`
4. `repository`
5. `support`

### 2.1 Controller 约定

`controller` 只负责：

- 路由参数读取
- 输入校验
- query 参数解析
- 调用 `service` / `workflow`
- 响应包装

`controller` 禁止负责：

- 多步业务编排
- 状态跃迁判断
- 副作用清理/同步
- provider 级缓存处理

### 2.2 Controller Concerns 约定

统一使用：

- `ResolvesQueryParams`
- `ResolvesAccountRegion`
- `ValidatesInput`

`ResolvesAccountRegion` 是需要同时解析 `account_id` / `region` 的 controller 统一入口，负责从 `post`、`put`、`get` 读取参数，调用 `AwsValidator` 校验，并返回 `[account, account_id, region]`。

`ResolvesQueryParams` 负责无业务语义的 query / form 标量解析，例如 `stringQuery()`、`boolQuery()`、`boolPost()`。布尔参数必须通过该 concern 解析，避免 PHP 将字符串 `"false"` 转成 `true`。

`ValidatesInput` 是控制层结构化输入校验入口：

- `queryInput()` / `postInput()` / `putInput()`：返回 `checked()` 后的净化输入
- `rawQueryInput()` / `rawPostInput()` / `rawPutInput()`：先校验，再返回原始输入

规则：

1. 默认使用净化输入。
2. 只有在 service 需要保留未声明字段时，才使用 `raw*Input()`。
3. controller 不再重复手写相同的参数提取、校验和账号加载逻辑。

## 3. Service 分层约定

`service` 分成三类：

1. 领域服务（Domain Service）
2. 编排服务（Workflow / Orchestration Service）
3. Provider Gateway / Provider

### 3.1 领域服务

领域服务负责：

- 单一业务域动作
- 资源定位
- 领域数据拼装
- 纯业务规则

领域服务不负责：

- 多步用例编排
- 副作用降级包装

典型类：

- `AccountService`
- `LightsailService`
- `RegionService`
- `QuotaService`
- `BillingService`

### 3.2 Workflow / Orchestration Service

只有在满足下面两个条件时才新增 workflow：

1. 一个用例涉及多个 service 协作
2. 一个用例带有副作用、降级、同步、清理、状态跃迁

workflow 负责：

- 多步用例编排
- 副作用容错与降级
- 清理前收集 / 清理后处理

workflow 不负责：

- provider 原始访问
- 本地持久化
- 单一领域动作本身

### 3.3 Provider Gateway / Provider

所有真正承担外部 AWS SDK / API 访问职责的类，统一放在 `service/aws/`。

Provider 负责：

- AWS SDK 调用
- provider 级缓存
- AWS 返回结果映射
- AWS 错误转换
- 幂等调用和临时错误重试

Provider 不负责：

- 业务编排
- workflow 降级语义
- 本地持久化

约定：

1. provider 内部重复的 `try/catch -> AwsError::convert()` 统一走 `AwsProviderCall`。
2. 限流、瞬时错误、幂等成功码统一走 `AwsRetry`，不要在业务 service 中散落 sleep / retry 循环。

## 4. Repository 约定

所有本地持久化统一进入 `repository/`。

当前 repository：

- `AccountRepository`
- `InstanceRepository`
- `Ec2InstanceRepository`
- `NewbieTaskRepository`
- `AppConfigRepository`
- `AwsConfigRepository`

规则：

1. `service` 和 `support` 不直接 new `JsonStore`。
2. 新增任何本地文件数据源时，先建 repository，再由 service 调用。
3. repository 只负责本地数据访问，不负责业务编排。

## 5. Support 约定

`support/` 只放基础设施和共享技术能力：

- `JsonStore`
- `ApiResponse`
- `AuthSession`
- `StreamResponse`
- `ErrorMessages`
- `AwsValidator`
- `SecretMasker`

禁止把业务模块逻辑塞入 `support/`。

## 6. 模块边界约定

业务模块：

- `account`
- `lightsail`
- `ec2`
- `newbie`
- `region`
- `quota`
- `billing`
- `aws`

规则：

1. 业务模块之间不允许横向直接调用彼此业务实现。
2. 跨模块复用只能走：`support/`、`service/concerns/`、中立支撑服务或 AWS provider。
3. 不允许因为局部便利把一个业务模块的实现塞进另一个业务模块。
4. 前端跨模块复用组件必须放入 `public/assets/shared/components`，例如 `AccountSelect`、`RegionSelect`、实例表格骨架、备注弹窗、静态 IP 单元格、复制按钮。
5. 前端跨模块复用 API / store 必须放入 `public/assets/shared/api` 或 `public/assets/shared/stores`，例如账号列表、系统配置、Dashboard 只读实例聚合。

## 7. 前端架构约定

前端分三层：

1. `modules/`：业务模块
2. `shared/`：共享 API、store、组件与工具
3. `routes/`：系统级路由解析

规则：

1. 页面错误展示统一通过共享错误文案工具处理。
2. 不允许新代码直接写 `message.error(error)` 或 `message.error(error.message)`。
3. 使用：`errorMessage(error)`。
4. 高风险页面必须做请求生命周期保护（latest-only token）。
5. route 切换时，旧弹窗和旧上下文必须及时关闭或失效。
6. `modules/` 内只放本模块页面、API、store 和私有组件；被两个以上模块引用的组件必须迁移到 `shared/`。
7. `shared/` 不能反向引用 `modules/`，否则共享层会退化成业务模块聚合层。

## 8. 请求生命周期约定

对以下类型页面，必须做 latest-only 保护：

- account/region/instance 切换后会触发异步加载的页面
- 多个异步请求可能交错返回的页面

规则：

1. 当前项目允许页面内部自己维护 token。
2. 只有在多处模式完全一致时，才允许再抽共享工具。
3. 在没有明显收益前，不为 token 模式单独再加抽象层。

## 9. 何时允许继续拆分

满足下列条件才允许继续拆 service / provider / workflow：

1. 当前类已经同时承担两类以上稳定职责
2. 拆分后调用链更清楚，而不是更长
3. 拆分能减少跨模块耦合

禁止因为下面原因拆分：

1. 只是觉得文件有点长
2. 为了形式上“更像架构图”
3. 为了把每个模块都套成同样层数

## 10. 何时停止优化

当某块已经满足：

- controller 足够薄
- workflow 只承接编排
- domain service 只承接领域动作
- provider 只承接 AWS 访问
- repository 只承接本地持久化

就停止继续拆，避免系统臃肿。

## 11. 后续开发要求

后续新代码默认必须遵守：

1. 不新增绕过 repository 的本地文件访问
2. 不在 controller 中重新塞业务编排
3. 不在前端直接使用不统一的错误提示写法
4. 不新增横向模块依赖
5. 不为了单个功能持续膨胀某个模块

如确需突破以上规则，必须先说明这是系统级调整，而不是局部便利性改动。

## 12. 本地数据 Schema

本项目使用 `data/` 下的 JSON 文件作为轻量本地持久化。所有读写必须经过 `repository/`。

### 12.1 `data/config.json`

```json
{
  "auth": {
    "username": "admin",
    "password": "change-me"
  }
}
```

用途：单用户登录凭据。

### 12.2 `data/app-config.json`

```json
{
  "regions": {
    "ap-northeast-1": "东京"
  },
  "ec2_regions": {
    "us-east-1": "弗吉尼亚州"
  },
  "blueprints": {
    "ubuntu_24_04": "Ubuntu 24.04"
  }
}
```

用途：Lightsail 区域中文名、EC2 区域中文名、镜像白名单等应用级只读配置。

### 12.3 `data/accounts.json`

```json
{
  "items": [
    {
      "id": "account-id",
      "access_key": "AKIA...",
      "secret_key": "...",
      "remark": "主账号"
    }
  ]
}
```

用途：AWS 账号凭据。对外返回时必须脱敏 `secret_key`。

### 12.4 `data/instances.json`

```json
{
  "items": [
    {
      "account_id": "account-id",
      "region": "ap-northeast-1",
      "name": "web-01",
      "state": "running",
      "public_ip": "1.2.3.4",
      "static_ip": "1.2.3.4",
      "ipv6": "",
      "zone": "ap-northeast-1a",
      "bundle_id": "medium_3_0",
      "bundle_specs": {
        "cpu": 2,
        "memory": 4,
        "disk": 80,
        "transfer": 4,
        "price": 24
      },
      "remark": "生产",
      "sort_order": 0,
      "created_at": 1783005976,
      "updated_at": 1783005976
    }
  ]
}
```

规则：

1. `bundle_specs` 是结构化规格，不存前端展示文案。
2. `price` 可以保存，但前端可按场景决定是否展示。
3. 新增实例字段必须先更新 `InstanceRepository` 的读写白名单。

### 12.5 `data/ec2-instances.json`

```json
{
  "items": [
    {
      "account_id": "account-id",
      "region": "us-east-1",
      "id": "i-1234567890abcdef0",
      "name": "ec2-web",
      "state": "running",
      "instance_type": "t3.micro",
      "public_ipv4": "1.2.3.4",
      "static_ip": "1.2.3.4",
      "public_ipv6": "2600:1f18::1",
      "private_ipv4": "172.31.0.10",
      "zone": "us-east-1a",
      "launched_at": "2026-07-06 12:00:00",
      "remark": "生产",
      "sort_order": 0,
      "created_at": 1783005976,
      "updated_at": 1783005976
    }
  ]
}
```

规则：新增 EC2 实例字段必须先更新 `Ec2InstanceRepository` 的读写白名单。`static_ip` 表示当前实例绑定的 Elastic IP；`remark` 只保存在本地 JSON，不写入 AWS。

### 12.6 `data/newbie-tasks.json`

```json
{
  "items": [
    {
      "id": "a1b2c3d4e5f67890",
      "account_id": "account-id",
      "region": "us-east-1",
      "step": "all",
      "step_label": "全部任务",
      "operation_ids": {
        "budget": "nt-a1b2c3d4e5f67890-budget",
        "ec2": "nt-a1b2c3d4e5f67890-ec2",
        "lambda": "nt-a1b2c3d4e5f67890-lambda",
        "rds": "nt-a1b2c3d4e5f67890-rds"
      },
      "status": "pending",
      "cancel_requested": false,
      "message": "",
      "created_at": 1783005976,
      "updated_at": 1783005976
    }
  ]
}
```

用途：记录新手任务临时状态，用于 SSE 开始前交接、运行中并发锁和终止请求传递；任务结束后立即删除，不持久化完成/失败结果。`operation_ids` 用于当前任务内的幂等资源名 / token，避免创建请求响应异常时重复创建。`cancel_requested` 表示前端已请求终止，runner 会停止后续步骤并尽量清理已创建资源。`step` 支持 `all`、`budget`、`ec2`、`lambda`、`rds`；`all` 按固定顺序执行，单项用于失败后重试。任务执行日志通过 SSE 实时输出，不落盘保存。

## 13. API Meta 约定

列表类接口统一在 `data.meta` 中返回数据来源信息：

```json
{
  "data": {
    "items": [],
    "meta": {
      "cached": false,
      "source": "aws",
      "refreshed_at": 1783005976
    }
  }
}
```

字段含义：

- `cached`：是否来自缓存。
- `source`：数据来源，当前可用值包括 `aws`、`cache`、`local`。
- `refreshed_at`：服务端生成响应的 Unix 时间戳，仅用于调试或接口消费，不作为前端缓存生成时间展示。

规则：

1. 缓存 payload 只保存业务数据，不把 `meta` 写入业务缓存。
2. 前端必须容忍旧响应缺少 `meta`。
3. 需要展示缓存状态时，统一通过共享 meta 工具格式化。
