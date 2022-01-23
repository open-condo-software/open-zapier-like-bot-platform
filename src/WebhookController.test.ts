import cors from 'cors'
import crypto from 'crypto'
import express, { Express } from 'express'
import request from 'supertest'

import { StorageController } from './StorageController'
import { WebhookController } from './WebhookController'

jest.setTimeout(60000)

async function makeInitedWebhookController (): Promise<[WebhookController, Express]> {
    const app: Express = express()
    app.use(express.json())
    app.use(cors())
    const storageController = new StorageController({
        url: './.storage',
        localCachePath: './.storage.test.tmp',
        serverUrl: 'https://localhost:3001',
    })
    await storageController.init(app)
    const controller = new WebhookController({
        serverUrl: 'https://localhost:3001',
        storageController,
    })
    await controller.init(app)
    return [controller, app]
}

test('WebhookController', async () => {
    const [controller] = await makeInitedWebhookController()
    expect(controller.name).toEqual('webhook')
})

test('WebhookController create webhook', async () => {
    const [controller, app] = await makeInitedWebhookController()
    const handler = jest.fn()
    controller.on('any', handler)
    const result1 = await controller.action('_createWebhook', {
        namespace: 'test1',
        name: 'test2',
    })
    expect(result1).toMatchObject({
        namespace: 'test1',
        name: 'test2',
        status: '200',
        response: '{"status":"ok"}',
        headers: [['content-type', 'application/json; charset=utf-8']],
    })

    const hookId = crypto.randomBytes(20).toString('hex')
    const res1 = await request(app).get(`/wh/${result1.namespace}/${hookId}?hello=world`)
    expect(res1.status).toEqual(404)

    const res2 = await request(app).get(`/wh/${result1.namespace}/${result1.id}?hello=world`)
    expect(res2.status).toEqual(200)
    expect(res2.body).toEqual({ status: 'ok' })
    expect(handler.mock.calls[0][0]).toMatchObject({
        'controller': 'webhook',
        'data': {
            'headers': {
                'accept-encoding': 'gzip, deflate',
                'connection': 'close',
            },
            'hookId': result1.id,
            'method': 'GET',
            'name': 'test1:test2',
            'query': {
                'hello': 'world',
            },
            'url': `/wh/test1/${result1.id}?hello=world`,
        },
        'when': 'test1:test2',
    })

    const res3 = await request(app).post(`/wh/${result1.namespace}/${result1.id}?hello=world`).set('Accept', 'application/json').send({ name: 'john' })
    expect(res3.status).toEqual(200)
    expect(res3.body).toEqual({ status: 'ok' })
    expect(handler.mock.calls[1][0]).toMatchObject({
        'controller': 'webhook',
        'data': {
            'body': {
                'name': 'john',
            },
            'headers': {
                'accept': 'application/json',
                'accept-encoding': 'gzip, deflate',
                'connection': 'close',
                'content-type': 'application/json',
            },
            'hookId': result1.id,
            'method': 'POST',
            'name': 'test1:test2',
            'query': {
                'hello': 'world',
            },
            'url': `/wh/test1/${result1.id}?hello=world`,
        },
        'when': 'test1:test2',
    })

    const res4 = await request(app).put(`/wh/${result1.namespace}/${result1.id}?hello=world`).set('Accept', 'application/json').send({ name: 'john' })
    expect(res4.status).toEqual(404)
    expect(handler.mock.calls).toHaveLength(2)
})
