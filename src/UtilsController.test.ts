import express, { Express } from 'express'
import { BaseEventController } from './BaseEventController'
import { UtilsController } from './UtilsController'

async function makeInitedUtilsController () {
    const app: Express = express()
    const controller: BaseEventController = new UtilsController({ serverUrl: 'https://localhost:3001' })
    await controller.init(app)
    return controller
}

test('UtilsController', async () => {
    const controller = await makeInitedUtilsController()
    expect(controller.name).toEqual('utils')
})

test('UtilsController match text', async () => {
    const controller = await makeInitedUtilsController()
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
