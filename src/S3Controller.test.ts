import { config } from 'dotenv'
import express from 'express'
import { BaseEventController } from './BaseEventController'
import { S3Controller } from './S3Controller'

config()
const obsConfig = JSON.parse(process.env.OBS_CONFIG)

async function makeInitedStorageController () {
    const app = express()
    const controller: BaseEventController = new S3Controller({
        obsConfig,
        serverUrl: 'https://localhost:3001',
    })
    await controller.init(app)
    return controller
}

test('S3Controller', async () => {
    const controller = await makeInitedStorageController()
    expect(controller.name).toEqual('s3')
})

test('S3Controller CRUD', async () => {
    const id1 = 'ид1'
    const table = 'test1тт'
    const controller = await makeInitedStorageController()
    await controller.action('create', { table, object: { id: id1, name: 'foo' } })
    const read1 = await controller.action('read', { table, query: {} })
    expect(read1).toEqual([{ id: id1, name: 'foo' }])
    await controller.action('update', { table, query: { id: id1 }, object: { name: 'new', bar: 22 } })
    const read2 = await controller.action('read', { table, query: {} })
    expect(read2).toEqual([{ id: id1, name: 'new', bar: 22 }])
    await controller.action('delete', { table, query: { id: id1 } })
    const read3 = await controller.action('read', { table, query: {} })
    expect(read3).toEqual([])
})

test('S3Controller createOrUpdate', async () => {
    const controller = await makeInitedStorageController()
    await controller.action('createOrUpdate', { table: 'test1', query: { id: 1 }, object: { id: 1, name: 'foo' } })
    const read1 = await controller.action('read', { table: 'test1', query: {} })
    expect(read1).toEqual([{ id: 1, name: 'foo' }])
    await controller.action('createOrUpdate', { table: 'test1', query: { id: 1 }, object: { name: 'new', bar: 22 } })
    const read2 = await controller.action('read', { table: 'test1', query: {} })
    expect(read2).toEqual([{ id: 1, name: 'new', bar: 22 }])
    await controller.action('delete', { table: 'test1', query: { id: 1 } })
    const read3 = await controller.action('read', { table: 'test1', query: {} })
    expect(read3).toEqual([])
})

test('S3Controller write/read Json', async () => {
    const app = express()
    const controller: BaseEventController = new S3Controller({
        obsConfig,
        serverUrl: 'https://localhost:3001',
    })
    await controller.init(app)
    await controller.action('writeJson', { path: 'test1/1', value: { id: 1, name: 'foo' }, _message: 't1' })
    await controller.action('writeJson', { path: 'test1/2', value: { id: 2, name: 'boo' }, _message: 't2' })
    const read1 = await controller.action('readJson', { path: 'test1/1' })
    expect(read1).toEqual({ id: 1, name: 'foo' })
    const read2 = await controller.action('getJsonPaths', {  path: 'test1' })
    expect(read2).toEqual(['1', '2'])
})

test('StorageController write/read Json with the same path', async () => {
    const controller = await makeInitedStorageController()
    await controller.action('writeJson', { path: 'test2', value: { id: 1, name: 'foo' }, _message: 't1' })
    await controller.action('writeJson', { path: 'test2/', value: { id: 2, name: 'boo' }, _message: 't2' })
    await controller.action('writeJson', { path: './test2/././', value: { id: 4, name: 'foo' }, _message: 't2' })
    await controller.action('writeJson', { path: './test2/.././ss', value: { id: 25, name: 'boo' }, _message: 't2' })
    await controller.action('writeJson', { path: 'test2/x./y', value: { id: 24, name: 'boo' }, _message: 't2' })
    await expect(async () => {
        await controller.action('writeJson', { path: './../../.././', value: { id: 34, name: 'boo' }, _message: 't2' })
    }).rejects.toThrow('found wrong path format')
    await expect(async () => {
        await controller.action('writeJson', { path: './test2/.././', value: { id: 44, name: 'boo' }, _message: 't2' })
    }).rejects.toThrow('found wrong path format')
    await expect(async () => {
        await controller.action('writeJson', { path: '/test2/', value: { id: 43, name: 'boo' }, _message: 't2' })
    }).rejects.toThrow('found wrong path format')
    await expect(async () => {
        await controller.action('writeJson', { path: 'test2/x../y', value: { id: 54, name: 'boo' }, _message: 't2' })
    }).rejects.toThrow('found wrong path format')
    expect(await controller.action('readJson', { path: 'test2' })).toEqual({ id: 4, name: 'foo' })
    expect(await controller.action('readJson', { path: 'test2/' })).toEqual({ id: 4, name: 'foo' })
    expect(await controller.action('readJson', { path: './test2/././' })).toEqual({ id: 4, name: 'foo' })
    expect(await controller.action('readJson', { path: './test2/././xx/..' })).toEqual({ id: 4, name: 'foo' })
    expect(await controller.action('readJson', { path: './test2/././xx/../' })).toEqual({ id: 4, name: 'foo' })
    const read2 = await controller.action('getJsonPaths', {  path: 'test2' })
    expect(read2).toEqual(['', 'x./y'])
})
