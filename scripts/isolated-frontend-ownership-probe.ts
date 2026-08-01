#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8')

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
  'frontend-ownership-probe=ok mutation_guards=5 list_dispose=1 refresh_owner=1 sse_owner=1 scope_fences=4 feature_bypass=0'
)
