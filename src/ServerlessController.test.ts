import express from 'express'
import { TestController } from './main.test'
import { ServerlessController } from './ServerlessController'
import { StorageController } from './StorageController'
import { TelegramController } from './TelegramController'

jest.setTimeout(50000)

async function makeInitedServerlessController () {
    const app = express()
    const controller = new ServerlessController({
        serverUrl: 'https://localhost:3001',
        allowed: ['test'],
        controllers: [
            new TelegramController({ serverUrl: 'https://localhost:3001', token: '', callbackUrl: '' }),
            new StorageController({ serverUrl: 'https://localhost:3001', url: '', localCachePath: 'ignore.test' }),
            new TestController({ serverUrl: 'https://localhost:3001' }),
        ],
        howToUpdateServerless: [],
    })
    await controller.init(app)
    return controller
}

test('ServerlessController', async () => {
    const controller = await makeInitedServerlessController()
    expect(controller.name).toEqual('_serverless')
})

test('ServerlessController _deployServerless test1', async () => {
    const controller = await makeInitedServerlessController()
    const result1 = await controller.action('_deployServerless', {
        archive: `${__dirname}/../test/test1-node-aws.serverless.zip`,
        namespace: 'test1',
    })
    expect(result1).toContain('Packaging service')
    expect(result1).toContain('Ensuring that deployment bucket exists')
})

test('ServerlessController _deployServerless test2', async () => {
    const controller = await makeInitedServerlessController()
    const result1 = await controller.action('_deployServerless', {
        archive: `${__dirname}/../test/test2-node-aws.serverless.zip`,
        namespace: 'test2',
    })
    expect(result1).toContain('Packaging service')
    expect(result1).toContain('Ensuring that deployment bucket exists')
})
