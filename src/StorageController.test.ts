import express from 'express'
import { BaseEventController } from './BaseEventController'
import { StorageController } from './StorageController'

async function makeInitedStorageController () {
    const app = express()
    const controller = new StorageController({ url: './.storage', localCachePath: './.storage.test.tmp', serverUrl: 'https://localhost:3001' })
    await controller.init(app)
    return controller as BaseEventController
}

test('StorageController', async () => {
    const controller = await makeInitedStorageController()
    expect(controller.name).toEqual('storage')
})

test('StorageController CRUD', async () => {
    const controller = await makeInitedStorageController()
    await controller.action('create', { table: 'test1', object: { id: 1, name: 'foo' } })
    const read1 = await controller.action('read', { table: 'test1', query: {} })
    expect(read1).toEqual([{ id: 1, name: 'foo' }])
    await controller.action('update', { table: 'test1', query: { id: 1 }, object: { name: 'new', bar: 22 } })
    const read2 = await controller.action('read', { table: 'test1', query: {} })
    expect(read2).toEqual([{ id: 1, name: 'new', bar: 22 }])
    await controller.action('delete', { table: 'test1', query: { id: 1 } })
    const read3 = await controller.action('read', { table: 'test1', query: {} })
    expect(read3).toEqual([])
})

test('StorageController createOrUpdate', async () => {
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

test('StorageController write/read Json', async () => {
    const controller = await makeInitedStorageController()
    await controller.action('writeJson', { path: 'test1/1', value: { id: 1, name: 'foo' }, _message: 't1' })
    await controller.action('writeJson', { path: 'test1/2', value: { id: 2, name: 'boo' }, _message: 't2' })
    const read1 = await controller.action('readJson', { path: 'test1/1' })
    expect(read1).toEqual({ id: 1, name: 'foo' })
    const read2 = await controller.action('getJsonPaths', {  path: 'test1' })
    expect(read2).toEqual(['1', '2'])
})

test('StorageController _copyFiles', async () => {
    const controller = await makeInitedStorageController()
    await controller.action('_copyFromLocalPath', { path: 'test1/dir1', fromPath: `${__dirname}/../test/storage-test-files`, _message: '_copyFiles test' })
    const read1 = await controller.action('read', { table: 'test1/dir1/my', query: {} })
    expect(read1).toEqual([{ id: 1, name: 'bar' }])
    const read2 = await controller.action('readJson', { path: 'test1/dir1/my' })
    expect(read2).toEqual({ id: 1, name: 'foo' })
})
