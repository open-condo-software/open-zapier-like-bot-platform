import express, { Express } from 'express'
import { BaseEventController } from './BaseEventController'
import { RequestController } from './RequestController'

jest.setTimeout(10000)

async function makeInitedRequestController () {
    const app: Express = express()
    const controller: BaseEventController = new RequestController({ serverUrl: 'https://localhost:3001' })
    await controller.init(app)
    return controller
}

test('RequestController', async () => {
    const controller = await makeInitedRequestController()
    expect(controller.name).toEqual('request')
})

test('RequestController fetch', async () => {
    const controller = await makeInitedRequestController()
    const result = await controller.action('fetch', {
        url: 'https://en9pjhcbl6wyai1.m.pipedream.net',
    })
    expect(result.status).toEqual(200)
    expect(result.text).toContain('Pipedream')
    expect(result.json).toMatchObject({
        'body': {},
        'headers': {
            'accept': '*/*',
            'accept-encoding': 'gzip,deflate',
            'host': 'en9pjhcbl6wyai1.m.pipedream.net',
            'user-agent': 'node-fetch/1.0 (+https://github.com/bitinn/node-fetch)',
        },
    })
    expect(result.headers.get('access-control-allow-origin')).toEqual('*')
    expect(result.headers.get('connection')).toEqual('close')
    expect(result.headers.get('content-type')).toEqual('application/json; charset=utf-8')
    expect(result.headers.get('x-pd-status')).toEqual('sent to coordinator')
    expect(result.headers.get('x-powered-by')).toEqual('Express')
})
