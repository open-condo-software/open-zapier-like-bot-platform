import express, { Express } from 'express'
import { BaseEventController } from './BaseEventController'
import { SchedulerController } from './SchedulerController'

jest.setTimeout(70000)

async function makeInitedSchedulerController () {
    const app: Express = express()
    const controller: BaseEventController = new SchedulerController({ serverUrl: 'https://localhost:3001' })
    await controller.init(app)
    return controller
}

async function sleep (tt) {
    return new Promise((res) => {
        setTimeout(res, tt)
    })
}

test('SchedulerController', async () => {
    const controller = await makeInitedSchedulerController()
    expect(controller.name).toEqual('scheduler')
})

test('SchedulerController on action', async () => {
    const controller = await makeInitedSchedulerController()
    let VALUE = 1
    controller.on('* * * * *', () => {
        VALUE += 1
    })
    controller.on('* * * * *', () => {
        VALUE += 10
    })

    await sleep(1002 * 60)

    expect(VALUE).toEqual(12)
})
