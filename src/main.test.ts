import express, { Express } from 'express'

import { BaseEventController, BaseEventControllerOptions } from './BaseEventController'
import { logger } from './logger'
import { main, setupRules, updateRules } from './main'

const TEST_CONTROLLER_OPTIONS = { serverUrl: 'https://localhost:3000' }

export class TestController extends BaseEventController {
    public name = 'test'
    public memory: Map<string, any>
    public messages: Array<any>

    constructor (options: BaseEventControllerOptions) {
        super(options)
        this.memory = new Map<string, any>()
        this.messages = new Array<any>()
    }

    async init (app: Express): Promise<void> {
        this.on('message', (event) => {
            this.messages.push(event)
        })
    }

    async action (name: string, args: any): Promise<void | any> {
        if (name === 'setToMemory') {
            this.memory.set(args.key, args.value)
        } else if (name === 'getFromMemory') {
            const key = args.key
            return this.memory.get(args.key)
        } else if (name === 'sendMessage') {
            await this.emit('message', args)
        } else {
            throw new Error('unexpected action name')
        }
    }
}

test('main([], [])', async () => {
    const app = await main([], [])
    expect(app).toBeTruthy()
})

test('main(rules, [controller(test)])', async () => {
    const debug = jest.spyOn(logger, 'debug')
    const info = jest.spyOn(logger, 'info')
    const error = jest.spyOn(logger, 'error')
    const controller = new TestController(TEST_CONTROLLER_OPTIONS)
    const rules: any = [
        {
            controller: 'test',
            when: 'message',
            do: [
                {
                    controller: 'test',
                    action: 'setToMemory',
                    args: {
                        key: '"lastMessage"',
                        value: 'value + "-test"',
                    },
                },
            ],
        },
    ]

    expect(jest.isMockFunction(logger.error)).toBeTruthy()

    await main(rules, [controller])
    await controller.action('sendMessage', { type: 'example', value: 'hello' })

    expect(error.mock.calls).toHaveLength(0)
    expect(error.mock.calls).toMatchObject([])
    expect(info.mock.calls).toHaveLength(1)
    expect(info.mock.calls).toMatchObject([
        [{
            'step': 'controller:event()',
            'controllerName': 'test',
            'eventName': 'message',
        }],
    ])
    expect(debug.mock.calls).toHaveLength(7)
    expect(debug.mock.calls).toMatchObject([
        [{ 'step': 'setup:controllers', 'count': 1 }],
        [{ 'step': 'setup:init(controller)', 'controllerName': 'test', 'controllerIndex': '0' }],
        [{ 'step': 'setup:rules', 'count': 1 }],
        [{
            'step': 'setup:create(rule)',
            'ruleIndex': '0',
            'ruleControllerName': 'test',
            'ruleWhen': 'message',
            'ruleDo': [{
                'controller': 'test',
                'action': 'setToMemory',
                'args': { 'key': '"lastMessage"', 'value': 'value + "-test"' },
            }],
        }],
        [{
            'step': 'controller:on()',
            'eventName': 'message',
            'ruleIndex': '0',
            'ruleControllerName': 'test',
            'ruleWhen': 'message',
        }],
        [{
            'step': 'action:do()',
            'eventName': 'message',
            'ruleIndex': '0',
            'ruleControllerName': 'test',
            'doIndex': '0',
            'doControllerName': 'test',
            'doAction': 'setToMemory',
            'doArgs': { 'key': '"lastMessage"', 'value': 'value + "-test"' },
        }],
        [{
            'step': 'controller:event(!)',
            'controllerName': 'test',
            'eventName': 'message',
            'eventData': { 'type': 'example', 'value': 'hello' },
        }],
    ])
    expect(controller.memory.size).toEqual(1)
    expect(controller.messages).toEqual([
        {
            'type': 'example',
            'value': 'hello',
        },
    ])
})

test('setupRules/updateRules', async () => {
    const controller = new TestController(TEST_CONTROLLER_OPTIONS)
    await controller.init(express())
    const on = jest.spyOn(controller, 'on')
    const off = jest.spyOn(controller, 'off')

    const rules1: any = [
        {
            controller: 'test',
            when: 'message',
            do: [
                {
                    controller: 'test',
                    action: 'setToMemory',
                    args: {
                        key: '"lastMessage"',
                        value: 'value + "-test"',
                    },
                },
            ],
        },
        {
            controller: 'test',
            when: 'message',
            do: [
                {
                    controller: 'test',
                    action: 'setToMemory',
                    args: {
                        key: 'lastMessage',
                        value: '777',
                    },
                },
            ],
        },
    ]
    const rules2: any = [
        {
            controller: 'test',
            when: 'message',
            do: [
                {
                    controller: 'test',
                    action: 'setToMemory',
                    args: {
                        key: '"lastMessage"',
                        value: 'value + "-test"',
                    },
                },
            ],
        },
        {
            controller: 'test',
            when: 'message',
            do: [
                {
                    controller: 'test',
                    action: 'setToMemory',
                    args: {
                        key: 'fooo',
                        value: '999',
                    },
                },
            ],
        },
    ]

    const c = { test: controller }
    const existing = await setupRules(rules1, c)
    const newExisting = await updateRules(rules2, existing, c)

    expect(existing).toHaveLength(2)
    expect(newExisting).toHaveLength(2)
    expect(on.mock.calls).toHaveLength(3)
    expect(off.mock.calls).toHaveLength(1)
})
