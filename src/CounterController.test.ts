import express, { Express } from 'express'
import { CounterController } from './CounterController'
import { StorageController } from './StorageController'

async function makeInitedCounterController () {
    const app: Express = express()
    const storageController = new StorageController({
        url: './.storage',
        localCachePath: './.storage.test.tmp',
        serverUrl: 'https://localhost:3001',
    })
    await storageController.init(app)
    const controller = new CounterController({ serverUrl: 'https://localhost:3001', storageController })
    await controller.init(app)
    return controller
}

test('CounterController', async () => {
    const controller = await makeInitedCounterController()
    expect(controller.name).toEqual('counter')
})

test('CounterController get unknown', async () => {
    const controller = await makeInitedCounterController()
    const result1 = await controller.action('get', {
        namespace: 'test/counter1',
        key: 'unknown',
    })
    expect(result1).toEqual(0)
})

test('CounterController set 999, increment, decrement, get', async () => {
    const controller = await makeInitedCounterController()
    const result1 = await controller.action('set', {
        namespace: 'test/counter1',
        key: 'set/test1',
        value: '999',
    })
    expect(result1).toEqual(999)
    const result2 = await controller.action('increment', {
        namespace: 'test/counter1',
        key: 'set/test1',
    })
    expect(result2).toEqual(1000)
    const result3 = await controller.action('increment', {
        namespace: 'test/counter1',
        key: 'set/test1',
        value: '20',
    })
    expect(result3).toEqual(1020)
    const result4 = await controller.action('get', {
        namespace: 'test/counter1',
        key: 'set/test1',
    })
    expect(result4).toEqual(1020)
    const result5 = await controller.action('decrement', {
        namespace: 'test/counter1',
        key: 'set/test1',
    })
    expect(result5).toEqual(1019)
    const result6 = await controller.action('decrement', {
        namespace: 'test/counter1',
        key: 'set/test1',
        value: '20',
    })
    expect(result6).toEqual(999)
    const result7 = await controller.action('get', {
        namespace: 'test/counter1',
        key: 'set/test1',
    })
    expect(result7).toEqual(999)
})

test('CounterController setIfNotExists 0', async () => {
    const controller = await makeInitedCounterController()
    const result1 = await controller.action('setIfNotExists', {
        namespace: 'test/counter1',
        key: 'set/test2',
        value: '0',
    })
    expect(result1).toEqual(0)
    const result2 = await controller.action('setIfNotExists', {
        namespace: 'test/counter1',
        key: 'set/test2',
        value: '8',
    })
    expect(result2).toEqual(0)
    const result3 = await controller.action('setIfNotExists', {
        namespace: 'test/counter1',
        key: 'set/test2/1',
        value: '8',
    })
    expect(result3).toEqual(8)
    const result4 = await controller.action('get', {
        namespace: 'test/counter1',
        key: 'set/test2',
    })
    expect(result4).toEqual(0)
    const result5 = await controller.action('get', {
        namespace: 'test/counter1',
        key: 'set/test2/1',
    })
    expect(result5).toEqual(8)
})

test('CounterController sum, avg, mean, median', async () => {
    const controller = await makeInitedCounterController()
    await controller.action('set', {
        namespace: 'test/counter1',
        key: 'xss/v1',
        value: '0',
    })
    await controller.action('set', {
        namespace: 'test/counter1',
        key: 'xss/v2',
        value: '4',
    })
    await controller.action('set', {
        namespace: 'test/counter1',
        key: 'xss/v3',
        value: '11',
    })

    expect(await controller.action('sum', { namespace: 'test/counter1', key: 'xss' })).toEqual(15)
    expect(await controller.action('avg', { namespace: 'test/counter1', key: 'xss' })).toEqual(5)
    expect(await controller.action('mean', { namespace: 'test/counter1', key: 'xss' })).toEqual(5)
    expect(await controller.action('median', { namespace: 'test/counter1', key: 'xss' })).toEqual(4)

    await controller.action('set', {
        namespace: 'test/counter1',
        key: 'ss/v1',
        value: '0',
    })
    await controller.action('set', {
        namespace: 'test/counter1',
        key: 'ss/v2',
        value: '4',
    })
    await controller.action('set', {
        namespace: 'test/counter1',
        key: 'ss/v3',
        value: '11',
    })
    await controller.action('set', {
        namespace: 'test/counter1',
        key: 'ss/v4',
        value: '6',
    })

    expect(await controller.action('sum', { namespace: 'test/counter1', key: 'ss' })).toEqual(21)
    expect(await controller.action('avg', { namespace: 'test/counter1', key: 'ss' })).toEqual(5.25)
    expect(await controller.action('mean', { namespace: 'test/counter1', key: 'ss' })).toEqual(5.25)
    expect(await controller.action('median', { namespace: 'test/counter1', key: 'ss' })).toEqual(5)

    await controller.action('unset', {
        namespace: 'test/counter1',
        key: 'ss/v4',
    })

    expect(await controller.action('sum', { namespace: 'test/counter1', key: 'ss' })).toEqual(15)
    expect(await controller.action('avg', { namespace: 'test/counter1', key: 'ss' })).toEqual(5)
    expect(await controller.action('mean', { namespace: 'test/counter1', key: 'ss' })).toEqual(5)
    expect(await controller.action('median', { namespace: 'test/counter1', key: 'ss' })).toEqual(4)
})
