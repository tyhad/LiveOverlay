import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SceneStore } from '../src/scene-store.ts'

async function tempStore() {
  const dir = await mkdtemp(join(tmpdir(), 'liveoverlay-scene-'))
  const filePath = join(dir, 'scenes.json')
  return { dir, filePath, store: new SceneStore(filePath) }
}

const scene = (id, elements = []) => ({ id, name: id, canvas: { width: 1920, height: 1080 }, elements })

test('file tidak ada: scene default dibuat dan ditulis', async () => {
  const { dir, filePath, store } = await tempStore()
  try {
    const scenes = await store.getScenes()
    assert.equal(scenes.length, 1)
    assert.equal(scenes[0].id, 'default')
    assert.equal(JSON.parse(await readFile(filePath, 'utf8')).length, 1)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('JSON bukan array ditandai corrupt dan tidak ditimpa', async () => {
  const { dir, filePath, store } = await tempStore()
  try {
    await writeFile(filePath, '{}')
    const result = await store.read()
    assert.equal(result.scenesFileExists, true)
    assert.equal(result.scenesFileCorrupt, true)
    await store.getScenes()
    assert.equal(await readFile(filePath, 'utf8'), '{}')
    await assert.rejects(() => store.save(scene('x')), (err) => err.status === 409)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('JSON rusak ditandai corrupt dan tidak ditimpa', async () => {
  const { dir, filePath, store } = await tempStore()
  try {
    await writeFile(filePath, '{"scenes": [')
    assert.equal((await store.read()).scenesFileCorrupt, true)
    await store.getScenes()
    assert.equal(await readFile(filePath, 'utf8'), '{"scenes": [')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('dua scene: save/delete dan cache mengikuti perubahan file', async () => {
  const { dir, filePath, store } = await tempStore()
  try {
    await writeFile(filePath, JSON.stringify([scene('a'), scene('b')]))
    const first = await store.getScenes()
    assert.deepEqual(first.map((s) => s.id), ['a', 'b'])
    assert.equal(await store.getScenes(), first) // cache hit: objek sama

    await store.save(scene('c'))
    assert.deepEqual((await store.getScenes()).map((s) => s.id), ['a', 'b', 'c'])

    await new Promise((resolve) => setTimeout(resolve, 15))
    await writeFile(filePath, JSON.stringify([scene('z')]))
    assert.deepEqual((await store.getScenes()).map((s) => s.id), ['z'])

    await store.delete('z')
    assert.deepEqual((await store.getScenes()).map((s) => s.id), ['default'])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('penulisan atomik tidak meninggalkan file .tmp', async () => {
  const { dir, store } = await tempStore()
  try {
    await store.persist([scene('a')])
    assert.deepEqual(await readdir(dir), ['scenes.json'])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
