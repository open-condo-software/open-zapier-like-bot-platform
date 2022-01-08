import express from 'express'
import { RuleController } from './DynamicRuleController'
import { TestController } from './main.test'
import { StorageController } from './StorageController'
import { TelegramController } from './TelegramController'

test('DynamicRuleController.init()', async () => {
    const app = express()
    const controller = new RuleController({
        serverUrl: 'https://localhost:3001',
        allowed: ['test'],
        controllers: [
            new TelegramController({ serverUrl: 'https://localhost:3001', token: '' }),
            new StorageController({ serverUrl: 'https://localhost:3001', url: '', localCachePath: 'ignore.test' }),
            new TestController({ serverUrl: 'https://localhost:3001' }),
        ],
        howToUpdateRule: [],
    })
    await controller.init(app)
    expect(controller.name).toEqual('_rule')
})
