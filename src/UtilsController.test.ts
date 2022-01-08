import express from 'express'
import { UtilsController } from './UtilsController'

test('UtilsController', async () => {
    const app = express()
    const controller = new UtilsController({ serverUrl: 'https://localhost:3001' })
    await controller.init(app)
    expect(controller.name).toEqual('utils')
})

test('UtilsController match text', async () => {
    const app = express()
    const controller = new UtilsController({ serverUrl: 'https://localhost:3001' })
    await controller.init(app)
    const result1 = await controller.action('match', {
        pattern: '^(?<name>[a-z]+) (?<value>[0-9]+)$',
        text: 'some 123 some',
    })
    expect(result1).toEqual({})
    const result2 = await controller.action('match', {
        pattern: '^(?<name>[a-z]+) (?<value>[0-9]+)$',
        text: 'some 123',
    })
    expect(result2).toEqual({
        name: 'some',
        value: '123',
    })
})
