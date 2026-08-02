#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { useListPage } from '../web/src/shared/lib/use-list-page.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8')

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const previousWarn = console.warn
console.warn = (...args: unknown[]) => {
  if (!String(args[0] ?? '').includes('onScopeDispose() is called when there is no active effect scope'))
    previousWarn(...args)
}
const oldListLoad = deferred<void>()
const newListLoad = deferred<void>()
let listLoads = 0
const listControls = useListPage({
  pageSizeScope: 'aws-owner-probe',
  load: () => (++listLoads === 1 ? oldListLoad.promise : newListLoad.promise),
})
const oldRequest = listControls.runLoad()
const newRequest = listControls.runLoad()
newListLoad.resolve()
await newRequest
assert.equal(listControls.loading.value, false, 'obsolete list request kept the latest scope loading')
oldListLoad.resolve()
await oldRequest
console.warn = previousWarn

const guardedEntries: Array<[string, string, string]> = [
  ['web/src/pages/accounts/AccountsPage.vue', 'async function save()', 'if (saving.value) return'],
  [
    'web/src/features/ec2/ui/CreateEc2Dialog.vue',
    'async function submit()',
    'if (creating.value || loading.value) return',
  ],
  [
    'web/src/features/lightsail/ui/CreateInstanceDialog.vue',
    'async function submit()',
    'if (creating.value || loading.value) return',
  ],
  ['web/src/pages/ec2/Ec2Page.vue', 'async function saveRemark()', 'if (remarkSaving.value) return'],
  ['web/src/pages/lightsail/LightsailPage.vue', 'async function saveRemark()', 'if (remarkSaving.value) return'],
]
for (const [file, signature, guard] of guardedEntries) {
  const code = read(file)
  const start = code.indexOf(signature)
  assert.ok(start >= 0, `${file}: missing ${signature}`)
  assert.ok(code.slice(start, start + 240).includes(guard), `${file}: mutation entry missing synchronous guard`)
}

const listPage = read('web/src/shared/lib/use-list-page.ts')
assert.match(listPage, /onScopeDispose\(\(\) => \{[\s\S]*requestVersion \+= 1/)
assert.match(listPage, /if \(wait\) await[\s\S]*if \(!load\.isLatest\(\) \|\| owner !== refreshVersion\) return/)

const newbie = read('web/src/pages/newbie/NewbiePage.vue')
assert.match(newbie, /function openStream\(taskId: string, version: number\)/)
assert.match(newbie, /version !== watchVersion \|\| eventSource !== stream/)
assert.match(newbie, /ownerAccountId !== accountId\.value \|\| ownerStep !== step\.value/)

const regions = read('web/src/pages/regions/RegionsPage.vue')
assert.match(regions, /const owner = accountId\.value[\s\S]*await confirmDialog[\s\S]*owner !== accountId\.value/)

for (const file of [
  'web/src/features/ec2/ui/CreateEc2Dialog.vue',
  'web/src/features/lightsail/ui/CreateInstanceDialog.vue',
]) {
  const code = read(file)
  assert.match(code, /scope !== openedScope\.value\) open\.value = false/)
}

// ---- P1: AccountsPage save() must snapshot form before submit, success branch reads only snapshot ----
{
  const code = read('web/src/pages/accounts/AccountsPage.vue')
  const saveSection = code.slice(code.indexOf('async function save()'))
  assert.ok(saveSection.startsWith('async function save()'), 'AccountsPage: missing save()')
  assert.ok(
    /const originalId = form\.original_id/.test(saveSection),
    'AccountsPage: save() must snapshot original_id before submit'
  )
  const afterAwait = saveSection.slice(saveSection.indexOf('await accountApi.save'))
  const successBranch = afterAwait.slice(0, afterAwait.indexOf('  } catch'))
  assert.ok(!/form\./.test(successBranch), 'AccountsPage: save() success branch must not read reactive form (ABA)')
}

// ---- P1: create dialogs must invalidate on close and only trust own dialog generation ----
for (const file of [
  'web/src/features/ec2/ui/CreateEc2Dialog.vue',
  'web/src/features/lightsail/ui/CreateInstanceDialog.vue',
]) {
  const code = read(file)
  assert.match(code, /const dialogGeneration = createScopeGeneration\(\)/, `${file}: missing dialogGeneration`)
  assert.match(code, /dialogGeneration\.invalidate\(\)/, `${file}: close must invalidate dialogGeneration`)
  assert.match(code, /const owner = dialogGeneration\.claim\(\)/, `${file}: submit must claim dialogGeneration`)
  assert.match(code, /!owner\.active\(\)/, `${file}: responses must check owner.active()`)
  assert.match(
    code,
    /if \(owner\.active\(\)\) (creating|loading)\.value = false/,
    `${file}: finally must respect owner`
  )
}

// ---- P1: saveRemark must carry instance identity + dialog generation (close-reopen ABA) ----
for (const file of ['web/src/pages/lightsail/LightsailPage.vue', 'web/src/pages/ec2/Ec2Page.vue']) {
  const code = read(file)
  assert.match(code, /const remarkGeneration = createScopeGeneration\(\)/, `${file}: missing remarkGeneration`)
  assert.match(code, /remarkGeneration\.invalidate\(\)/, `${file}: must invalidate remarkGeneration on close/reopen`)
  assert.match(code, /const owner = remarkGeneration\.claim\(\)/, `${file}: saveRemark must claim remarkGeneration`)
  assert.match(code, /owner\.active\(\)/, `${file}: saveRemark responses must check owner.active()`)
  assert.match(
    code,
    /ownerKey !== `\$\{accountId\.value\}::\$\{region\.value\}::/,
    `${file}: saveRemark owner must include instance identity`
  )
  assert.match(code, /watch\(remarkOpen,/, `${file}: missing remarkOpen close watch`)
}

// ---- P1: NewbiePage must invalidate restore/create owners on unmount + P2: pollTask pre-fetch check ----
{
  const code = read('web/src/pages/newbie/NewbiePage.vue')
  assert.match(
    code,
    /onBeforeUnmount\(\(\) => \{[\s\S]*?disposed = true[\s\S]*?restoreVersion \+= 1[\s\S]*?stopWatching\(\)/,
    'NewbiePage: onBeforeUnmount must set disposed, bump restoreVersion, stop watching'
  )
  assert.match(
    code,
    /if \(disposed \|\| version !== restoreVersion\) return/,
    'NewbiePage: restore must guard disposed'
  )
  assert.match(
    code,
    /disposed \|\| ownerAccountId !== accountId\.value \|\| ownerStep !== step\.value/,
    'NewbiePage: startTask must guard disposed'
  )
  assert.match(
    code,
    /async function pollTask\(taskId: string, version: number\) \{\s*\n\s*if \((?:disposed \|\| )?version !== watchVersion\) return/,
    'NewbiePage: pollTask must check version before fetch'
  )
}

let bypasses = 0
for (const layer of ['app', 'pages']) {
  const base = path.join(root, 'web/src', layer)
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(absolute)
      else if (/\.(?:ts|vue)$/.test(entry.name)) {
        const code = fs.readFileSync(absolute, 'utf8')
        bypasses += [...code.matchAll(/@\/features\/[^/'"]+\//g)].length
      }
    }
  }
  visit(base)
}
assert.equal(bypasses, 0, 'app/pages must use feature public APIs')

console.log(
  'frontend-ownership-probe=ok mutation_guards=5 list_owner=1 list_dispose=1 refresh_owner=1 sse_owner=1 scope_fences=4 feature_bypass=0'
)
