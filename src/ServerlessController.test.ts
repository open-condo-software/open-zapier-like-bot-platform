import express from 'express'
import { ServerlessController } from './ServerlessController'
import { StorageController } from './StorageController'

jest.setTimeout(160000)

async function makeInitedServerlessController () {
    const app = express()
    const storageController = new StorageController({
        url: './.storage',
        localCachePath: './.storage.test.tmp',
        serverUrl: 'https://localhost:3001',
    })
    await storageController.init(app)
    const controller = new ServerlessController({
        serverUrl: 'https://localhost:3001',
        storageController,
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
        service: 'test1-node-aws',
        archive: `${__dirname}/../test/test1-node-aws.serverless.zip`,
        namespace: 'test1',
    })
    console.log(result1)
    expect(result1.result).toContain('Packaging service')
    expect(result1.result).toContain('Ensuring that deployment bucket exists')
})

test('ServerlessController _deployServerless test2', async () => {
    const controller = await makeInitedServerlessController()
    const result1 = await controller.action('_deployServerless', {
        service: 'test2-node-aws',
        archive: `${__dirname}/../test/test2-node-aws.serverless.zip`,
        namespace: 'test2',
    })
    console.log(result1)
    expect(result1.result).toContain('Packaging service')
    expect(result1.result).toContain('Ensuring that deployment bucket exists')
})
