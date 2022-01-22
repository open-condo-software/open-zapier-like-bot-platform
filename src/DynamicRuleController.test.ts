import express from 'express'
import { RuleController } from './DynamicRuleController'
import { TestController } from './main.test'
import { StorageController } from './StorageController'
import { TelegramController } from './TelegramController'

async function makeInitedDynamicRuleController () {
    const app = express()
    const controller = new RuleController({
        serverUrl: 'https://localhost:3001',
        allowed: ['test'],
        controllers: [
            new TelegramController({ serverUrl: 'https://localhost:3001', token: '', callbackUrl: '' }),
            new StorageController({ serverUrl: 'https://localhost:3001', url: '', localCachePath: 'ignore.test' }),
            new TestController({ serverUrl: 'https://localhost:3001' }),
        ],
        howToUpdateRule: [],
    })
    await controller.init(app)
    return controller
}

test('DynamicRuleController.init()', async () => {
    const controller = await makeInitedDynamicRuleController()
    expect(controller.name).toEqual('_rule')
})

test('DynamicRuleController validation action', async () => {
    const controller = await makeInitedDynamicRuleController()
    const result = await controller.action('_updateRules', {
        namespace: 'test',
        rules: JSON.stringify([
            {
                controller: 'telegram',
                when: 'message',
                case: '{{ chat.id and document.mime_type === "multipart/x-zip" and document.file_size < 12300100 and document.file_name.endsWith("serverless.zip") }}',
                do: [
                    {
                        controller: 'telegram',
                        action: '_temporarilyDownloadFileLocally',
                        as: 'localFilePath',
                        args: {
                            fileId: '{{ document.file_id }}',
                        },
                    },

                ],
            },
        ]),
    })
    expect(result).toEqual('AssertionError [ERR_ASSERTION]: rules: "do"."action" name should not starts with _')
})

test('DynamicRuleController validation controller', async () => {
    const controller = await makeInitedDynamicRuleController()
    const result = await controller.action('_updateRules', {
        namespace: 'test',
        rules: JSON.stringify([
            {
                controller: '_rules',
                when: 'message',
                case: '{{ chat.id and document.mime_type === "multipart/x-zip" and document.file_size < 12300100 and document.file_name.endsWith("serverless.zip") }}',
                do: [
                    {
                        'controller': 'telegram',
                        'action': 'sendMessage',
                        'args': {
                            'chatId': '{{ chat.id }}',
                            'text': 'Hi from `{{ chat.id }}`',
                            'mode': 'Markdown',
                        },
                    },
                ],
            },
        ]),
    })
    expect(result).toEqual('AssertionError [ERR_ASSERTION]: rules: "controller" name should not starts with _')
})
