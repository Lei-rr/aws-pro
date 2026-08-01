#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import ts from 'typescript'
import { parse as parseSfc } from '@vue/compiler-sfc'

const root = process.cwd()
const errors = []
const normalize = (value) => value.replaceAll(path.sep, '/')
const absolute = (file) => path.join(root, file)
const exists = (file) => fs.existsSync(absolute(file))
const read = (file) => fs.readFileSync(absolute(file), 'utf8')
const walk = (dir) => {
  if (!exists(dir)) return []
  return fs.readdirSync(absolute(dir), { withFileTypes: true }).flatMap((entry) => {
    const next = path.posix.join(dir, entry.name)
    return entry.isDirectory() ? walk(next) : [next]
  })
}
const lineAt = (code, position) => code.slice(0, position).split('\n').length
const report = (rule, file, line, message) => errors.push(`${rule} ${file}:${line} ${message}`)
const sourceFiles = [...walk('src'), ...walk('web/src')].filter((file) => /\.(?:ts|vue)$/.test(file))

function scriptsFor(file) {
  const source = read(file)
  if (!file.endsWith('.vue')) return [{ code: source, offset: 0 }]
  const { descriptor, errors: parseErrors } = parseSfc(source, { filename: file })
  if (parseErrors.length) report('ARCH000', file, 1, `invalid Vue SFC: ${String(parseErrors[0])}`)
  return [descriptor.script, descriptor.scriptSetup]
    .filter(Boolean)
    .map((block) => ({ code: block.content, offset: block.loc.start.line - 1 }))
}
function resolveImport(from, specifier) {
  let base
  if (specifier.startsWith('@/')) base = path.join(root, 'web/src', specifier.slice(2))
  else if (specifier.startsWith('.')) base = path.resolve(path.dirname(absolute(from)), specifier)
  else return null
  const candidates = [base]
  if (base.endsWith('.js')) candidates.unshift(base.slice(0, -3) + '.ts')
  if (!path.extname(base)) candidates.push(`${base}.ts`, `${base}.vue`, path.join(base, 'index.ts'))
  const resolved = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile())
  return resolved ? normalize(path.relative(root, resolved)) : null
}

const imports = []
let routeCalls = 0
let schemaRoutes = 0
for (const file of sourceFiles) {
  for (const block of scriptsFor(file)) {
    const sf = ts.createSourceFile(
      file,
      block.code,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('.vue') ? ts.ScriptKind.TS : undefined
    )
    const visit = (node) => {
      let literal = null
      let typeOnly = false
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        literal = node.moduleSpecifier
        typeOnly = Boolean(node.importClause?.isTypeOnly || node.isTypeOnly)
      } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)
        literal = node.arguments[0]
      if (literal && ts.isStringLiteralLike(literal)) {
        const target = resolveImport(file, literal.text)
        if (target)
          imports.push({ from: file, to: target, typeOnly, line: block.offset + lineAt(block.code, node.getStart(sf)) })
      }
      if (
        file.startsWith('src/') &&
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === 'app' &&
        ['get', 'post', 'put', 'patch', 'delete'].includes(node.expression.name.text)
      ) {
        routeCalls += 1
        const options = node.arguments[1]
        if (
          options &&
          ts.isObjectLiteralExpression(options) &&
          options.properties.some((p) => ts.isPropertyAssignment(p) && p.name.getText(sf) === 'schema')
        )
          schemaRoutes += 1
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
}

function backendLayer(file) {
  if (/^src\/(?:app|server)\.ts$/.test(file)) return 'shell'
  if (file.startsWith('src/types/')) return 'shared'
  for (const layer of ['bootstrap', 'plugins', 'workflows', 'modules', 'platform', 'shared'])
    if (file.startsWith(`src/${layer}/`)) return layer
  return 'other'
}
function webLayer(file) {
  for (const layer of ['app', 'pages', 'features', 'shared']) if (file.startsWith(`web/src/${layer}/`)) return layer
  return 'other'
}
const backendAllowed = {
  shell: new Set(['shell', 'bootstrap', 'plugins', 'platform', 'shared']),
  bootstrap: new Set(['bootstrap', 'plugins', 'workflows', 'modules', 'platform', 'shared']),
  plugins: new Set(['bootstrap', 'platform', 'shared', 'modules', 'workflows']),
  workflows: new Set(['workflows', 'modules', 'platform', 'shared']),
  modules: new Set(['modules', 'platform', 'shared']),
  platform: new Set(['platform', 'shared']),
  shared: new Set(['shared']),
  other: new Set(),
}
const webAllowed = {
  app: new Set(['app', 'pages', 'features', 'shared']),
  pages: new Set(['pages', 'features', 'shared']),
  features: new Set(['features', 'shared']),
  shared: new Set(['shared']),
  other: new Set(),
}
for (const edge of imports) {
  if (edge.from.startsWith('src/') && edge.to.startsWith('src/')) {
    const from = backendLayer(edge.from),
      to = backendLayer(edge.to)
    if (!backendAllowed[from]?.has(to))
      report('ARCH001', edge.from, edge.line, `${from} must not import ${to}: ${edge.to}`)
    const fromModule = edge.from.match(/^src\/modules\/([^/]+)/)?.[1]
    const toModule = edge.to.match(/^src\/modules\/([^/]+)/)?.[1]
    if (fromModule && toModule && fromModule !== toModule)
      report('ARCH002', edge.from, edge.line, `module ${fromModule} must not deep-import module ${toModule}`)
  }
  if (edge.from.startsWith('web/src/') && edge.to.startsWith('web/src/')) {
    const from = webLayer(edge.from),
      to = webLayer(edge.to)
    if (!webAllowed[from]?.has(to)) report('ARCH003', edge.from, edge.line, `${from} must not import ${to}: ${edge.to}`)
    const fromFeature = edge.from.match(/^web\/src\/features\/([^/]+)/)?.[1]
    const toFeature = edge.to.match(/^web\/src\/features\/([^/]+)/)?.[1]
    if (fromFeature && toFeature && fromFeature !== toFeature)
      report('ARCH004', edge.from, edge.line, `feature ${fromFeature} must not import feature ${toFeature}`)
    if (['app', 'pages'].includes(from) && to === 'features' && !/^web\/src\/features\/[^/]+\/index\.ts$/.test(edge.to))
      report('ARCH019', edge.from, edge.line, `app/pages must import the feature public API: ${edge.to}`)
  }
}

const graph = new Map(sourceFiles.map((file) => [file, []]))
for (const edge of imports)
  if (!edge.typeOnly && graph.has(edge.from) && graph.has(edge.to)) graph.get(edge.from).push(edge.to)
let index = 0
const stack = []
const onStack = new Set()
const indices = new Map()
const low = new Map()
function strong(node) {
  indices.set(node, index)
  low.set(node, index)
  index++
  stack.push(node)
  onStack.add(node)
  for (const target of graph.get(node) ?? []) {
    if (!indices.has(target)) {
      strong(target)
      low.set(node, Math.min(low.get(node), low.get(target)))
    } else if (onStack.has(target)) low.set(node, Math.min(low.get(node), indices.get(target)))
  }
  if (low.get(node) === indices.get(node)) {
    const component = []
    let item
    do {
      item = stack.pop()
      onStack.delete(item)
      component.push(item)
    } while (item !== node)
    if (component.length > 1 || (graph.get(node) ?? []).includes(node))
      report('ARCH005', component.sort()[0], 1, `runtime cycle: ${component.sort().join(' -> ')}`)
  }
}
for (const node of graph.keys()) if (!indices.has(node)) strong(node)

for (const file of sourceFiles) {
  const code = read(file)
  if (
    file.startsWith('src/') &&
    !file.endsWith('.d.ts') &&
    !/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*\.ts$/.test(path.basename(file))
  )
    report('ARCH006', file, 1, 'backend filename must be kebab-case')
  if (file.endsWith('.vue') && !/^[A-Z][A-Za-z0-9]*\.vue$/.test(path.basename(file)))
    report('ARCH007', file, 1, 'Vue filename must be PascalCase')
  if (
    /new JsonStore\s*(?:<|\()/.test(code) &&
    !['src/bootstrap/create-platform.ts', 'src/bootstrap/create-modules.ts'].includes(file)
  )
    report('ARCH008', file, 1, 'new JsonStore only in composition root')
  if (/\b(?:CacheTtl|ttlMs|cacheMaxEntries|cacheSweepIntervalMs|globalCache|CacheManager|cacheManager)\b/.test(code))
    report('ARCH009', file, 1, 'cache TTL/capacity/sweeper/manager layers forbidden')
  if (/\bapp\.(?:get|post|put|patch|delete)\s*\(/.test(code) && !file.endsWith('.routes.ts'))
    report('ARCH010', file, 1, 'routes belong in *.routes.ts')
}
if (routeCalls !== 32) report('ARCH011', 'src', 1, `expected 32 routes, found ${routeCalls}`)
if (schemaRoutes !== routeCalls) report('ARCH012', 'src', 1, `${routeCalls - schemaRoutes} route(s) missing schema`)
for (const file of sourceFiles.filter((f) => f.endsWith('.handlers.ts'))) {
  const code = read(file)
  if (/request-parse\.js/.test(code)) report('ARCH013', file, 1, 'handlers must use schema-derived request types')
  for (const match of code.matchAll(/\b(?:request\.server|app)\.ctx\.([A-Za-z_$][\w$]*)/g))
    if (!['config', 'platform', 'modules', 'workflows'].includes(match[1]))
      report('ARCH014', file, lineAt(code, match.index), `flat ctx.${match[1]} forbidden`)
  if (file.startsWith('src/modules/') && /\brequest\.server\.ctx\.workflows\b/.test(code))
    report('ARCH018', file, 1, 'module handlers must not call workflows')
}
for (const legacy of [
  'src/app-context.ts',
  'src/compose',
  'src/config',
  'src/lib',
  'web/src/main.ts',
  'web/src/layouts',
  'web/src/router',
  'web/src/styles',
  'web/src/shared/types',
])
  if (exists(legacy)) report('ARCH015', legacy, 1, 'legacy path must be removed')
const cacheFiles = walk('src/platform/cache')
if (
  cacheFiles.length !== 2 ||
  !cacheFiles.includes('src/platform/cache/memory-cache.ts') ||
  !cacheFiles.includes('src/platform/cache/aws-cache.ts')
)
  report('ARCH016', 'src/platform/cache', 1, 'cache must contain only memory-cache.ts and aws-cache.ts')
for (const required of [
  'src/bootstrap/create-context.ts',
  'src/bootstrap/create-modules.ts',
  'src/bootstrap/create-platform.ts',
  'src/bootstrap/create-workflows.ts',
  'src/bootstrap/start-context.ts',
  'src/bootstrap/register-routes.ts',
  'web/src/app/bootstrap.ts',
  'web/src/app/router/index.ts',
  'web/src/app/layouts/AppLayout.vue',
])
  if (!exists(required)) report('ARCH017', required, 1, 'required terminal path missing')

if (errors.length) {
  console.error(`Architecture check failed (${errors.length}):`)
  for (const error of errors.sort()) console.error(error)
  process.exit(1)
}
console.log(`architecture=ok files=${sourceFiles.length} imports=${imports.length} routes=${routeCalls}`)
