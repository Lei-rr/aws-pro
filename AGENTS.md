# AWS-Pro Architecture Contract

This file is the authoritative architecture boundary for all agents working in this repository.
Do not redesign the project unless the user explicitly changes this contract.

## Final technology decision

- Backend: Fastify 5 + TypeBox, modular monolith.
- Frontend: Vue 3 + Tailwind + shadcn-vue, lightweight four-layer feature slicing.
- Do not migrate to NestJS or add a DI container/decorator framework.
- Preserve AWS product capabilities, not the retired directory layout.
- API remains `/api`; production/dev ports remain 2023/3023.

## Backend topology

```text
src/
  app.ts / server.ts
  bootstrap/       composition only
  plugins/         Fastify plugins only
  modules/         one-domain capabilities
  workflows/       business use cases spanning modules
  platform/        small generic runtime facilities
  shared/          domain-neutral HTTP/auth/AWS helpers
```

Dependency direction:

```text
app/bootstrap -> workflows -> modules -> platform/shared
app/bootstrap -> modules -> platform/shared
modules must not import workflows
```

- Each module owns its routes, handlers, schema, service, repository, client and types.
- Cross-module account deletion/cleanup belongs to a workflow.
- Module services may depend on a narrow shared account lookup contract, not on another module implementation.
- `bootstrap/` is the only construction root. No service registry, DI container or default `new` dependencies.
- Fastify handlers use `request.server.ctx.{modules,workflows}` only.

## AWS product invariants

The following capabilities must remain:

- username/password session; missing `data/config.json` creates `admin/admin` without overwriting an existing file;
- AWS accounts CRUD with masked secrets;
- Lightsail list/sync/create/start/stop/reboot/delete/static-IP/open-ports/remark;
- EC2 list/sync/create/start/stop/reboot/terminate/EIP/open-ports/remark;
- regions list/enable, vCPU quota, yearly billing/credits;
- durable Newbie Budget/EC2/Lambda/RDS tasks, SSE/poll logs, cancel and restart recovery.

Newbie remains an in-module durable state machine. Do not force it into DNS-Pro's generic batch JobService.
Its persisted worker token/lease, fencing, monotonic log sequence, cancellation and phase-aware recovery are product correctness requirements.

## Cache and storage

- Deployment invariant: one AWS-Pro process owns one data directory.
- Reconstructable query cache has exactly `platform/cache/memory-cache.ts` and `platform/cache/aws-cache.ts`.
- Cache is process-lifetime, has no TTL/capacity/sweeper, supports cold-read single-flight, explicit refresh overwrite and generation-fenced invalidation.
- Lightsail/EC2 local JSON remains source of truth; only explicit Sync calls AWS.
- Regions/Quota/Billing page entry and account selection remain explicit cache-only reads; only explicit refresh calls AWS.
- Durable local state uses JsonStore with process-local serialization and atomic replacement.
- Do not add distributed locks or shared-data multi-process infrastructure.

## Frontend topology

```text
web/src/
  app/
  pages/
  features/
    auth accounts dashboard lightsail ec2 newbie regions quota billing config
  shared/
```

- Pages compose features; features own business API/model/UI; shared owns no AWS product flow.
- Native fetch only; no axios or Ant Design Vue.
- Async account/region scope is captured before await and rechecked before success, error, toast, row patch or finally writes.
- Failed reloads preserve committed rows; only explicit refresh says `已刷新`.
- Keep top navigation and all AWS entries; account management stays in the top-right user menu.

## Complexity and change discipline

- Fix reproduced P0/P1 or abstractions reused by at least two real modules.
- No compatibility layer or parallel old/new architecture: make one cut and delete the old path.
- More than 100 net new non-business LOC or a new platform subsystem requires explicit user approval.
- Do not call real AWS create/sync/action APIs in verification. Use temporary data roots and fake clients.
- Required release closure: format, lint, server/web typecheck, architecture/dead-code/dependency/route/function probes, build, fresh npm ci, Docker, local HTTP/static/session/SIGTERM, GitHub Actions, then Huawei production smoke.
