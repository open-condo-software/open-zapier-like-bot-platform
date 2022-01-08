import express from 'express'
import { BaseEventController } from './BaseEventController'
import { StorageController } from './StorageController'

test('StorageController', async () => {
    const app = express()
    const controller = new StorageController({ url: './.storage', serverUrl: 'https://localhost:3001' })
    await controller.init(app)
    expect(controller.name).toEqual('storage')
})

test('StorageController CRUD', async () => {
    const app = express()
    const controller: BaseEventController = new StorageController({ url: './.storage', serverUrl: 'https://localhost:3001' })
    await controller.init(app)
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
    const app = express()
    const controller: BaseEventController = new StorageController({ url: './.storage', serverUrl: 'https://localhost:3001' })
    await controller.init(app)
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
