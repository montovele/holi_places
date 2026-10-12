import assert from 'node:assert/strict'
import test from 'node:test'
import { communityModes, defaultAppearance, normalizeAppearance, readAppearance, saveAppearance } from './appearance.service.js'

test('appearance settings default safely and validate selectable options', () => {
  assert.deepEqual(normalizeAppearance(defaultAppearance), defaultAppearance)
  for (const communityMode of communityModes) {
    assert.equal(normalizeAppearance({ ...defaultAppearance, communityMode }).communityMode, communityMode)
  }
  assert.throws(() => normalizeAppearance({ ...defaultAppearance, brandIcon: 'javascript:alert(1)' }), { status: 400 })
  assert.throws(() => normalizeAppearance({ ...defaultAppearance, communityMode: 'unknown' }), { status: 400 })
  assert.throws(() => normalizeAppearance({
    ...defaultAppearance,
    colors: { ...defaultAppearance.colors, primary: 'url(javascript:alert(1))' },
  }), { status: 400 })
})

test('appearance read returns defaults until a saved global setting exists', async () => {
  const database = { async execute() { return [[]] } }
  assert.deepEqual(await readAppearance(database), defaultAppearance)
})

test('appearance read normalizes persisted JSON for the public navbar', async () => {
  const savedAppearance = {
    ...defaultAppearance,
    brandName: 'Comunidad Esperanza',
    brandIcon: 'heart',
    communityMode: 'directory',
    colors: { ...defaultAppearance.colors, primary: '#344E67' },
  }
  const database = {
    async execute(sql, parameters) {
      assert.match(sql, /FROM app_settings/)
      assert.deepEqual(parameters, ['public_appearance'])
      return [[{ settingValue: JSON.stringify(savedAppearance) }]]
    },
  }

  assert.deepEqual(await readAppearance(database), savedAppearance)
})

test('appearance updates persist only normalized settings and actor id', async () => {
  let saved
  const database = {
    async execute(sql, parameters) {
      assert.match(sql, /INSERT INTO app_settings/)
      saved = parameters
      return [{ affectedRows: 1 }]
    },
  }
  const result = await saveAppearance(database, defaultAppearance, 'root-1')
  assert.deepEqual(JSON.parse(saved[1]), result)
  assert.deepEqual(saved, ['public_appearance', JSON.stringify(defaultAppearance), 'root-1'])
})
