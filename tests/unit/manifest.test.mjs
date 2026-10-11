import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = file => JSON.parse(readFileSync(join(root, file), 'utf8'))

test('plugin.json and package.json agree on the version', () => {
  assert.equal(read('.claude-plugin/plugin.json').version, read('package.json').version)
})

test('marketplace lists the plugin at the repo root', () => {
  const marketplace = read('.claude-plugin/marketplace.json')
  const entry = marketplace.plugins.find(p => p.name === 'roundup')
  assert.ok(entry, 'roundup entry missing')
  assert.equal(entry.source, './')
})

test('userConfig pickers default to one of their options', () => {
  const { userConfig } = read('.claude-plugin/plugin.json')
  for (const [key, field] of Object.entries(userConfig)) {
    if (field.options) assert.ok(field.options.includes(field.default), `${key} default not in options`)
  }
})
