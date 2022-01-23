import express from 'express'
import { RuleController } from './DynamicRuleController'
import { StorageController } from './StorageController'
import { TelegramController } from './TelegramController'

async function makeInitedDynamicRuleController () {
    const app = express()
    const storageController = new StorageController({
        url: `${__dirname}/../test/empty-test-git-storage`,
        localCachePath: './.storage.test.rule.tmp',
        serverUrl: 'https://localhost:3001',
    })
    await storageController.init(app)
    const controller = new RuleController({
        serverUrl: 'https://localhost:3001',
        storageController,
        ruleControllers: [
            new TelegramController({ serverUrl: 'https://localhost:3001', token: '', callbackUrl: '' }),
            storageController,
        ],
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
    expect(result).toEqual({
        namespace: 'test',
        error: 'AssertionError [ERR_ASSERTION]: rules: "do"."action" name should not starts with _',
    })
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
    expect(result).toEqual({
        namespace: 'test',
        error: 'AssertionError [ERR_ASSERTION]: rules: "controller" name should not starts with _',
    })
})

test('DynamicRuleController rules', async () => {
    const controller = await makeInitedDynamicRuleController()
    const result = await controller.action('_updateRules', {
        namespace: 'test',
        rules: JSON.stringify([
            {
                'controller': 'github',
                'when': 'check_run',
                'case': '{{ action == "completed" and check_run.status == "completed" and sender.login == "pahaz" }}',
                'do': [
                    {
                        'controller': 'telegram',
                        'action': 'sendMessage',
                        'args': {
                            'chatId': '-144812829',
                            'text': '<b><u>{{ check_run.name | escape }}</u></b>: <code>{{ check_run.conclusion }}</code>\n<a href="{{ check_run.html_url }}">{{ repository.full_name }}/run/{{ check_run.id }}</a> (<pre>{{ check_run.check_suite.head_branch | escape }}</pre>)\nby <a href="{{ sender.html_url }}">{{ sender.login }}</a>',
                            'mode': 'HTML',
                        },
                    },
                ],
            },
            {
                'controller': 'telegram',
                'when': 'message',
                'case': '{{ sticker.set_name == "Cat2O" and sticker.file_unique_id == "AgADQQADKA9qFA" }}',
                'do': [
                    {
                        'controller': 'telegram',
                        'action': 'sendSticker',
                        'args': {
                            'chatId': '{{ chat.id }}',
                            'sticker': 'CAACAgIAAxkBAAIBA2HHn2i4ZT38s_hEy8cSBnddF0J4AAI1AAMoD2oUUlHZS3d3sAUjBA',
                        },
                    },
                ],
            },
            {
                'controller': 'telegram',
                'when': 'message',
                'case': '{{ r/(привет|что это|ты кто|что умеешь|как)/ig.test(text) and chat.type == "private" }}',
                'do': [
                    {
                        'controller': 'telegram',
                        'action': 'sendMessage',
                        'args': {
                            'chatId': '{{ chat.id }}',
                            'text': 'Я БоТ! Короче, мне надо прислать `rules.json` файлик!',
                            'mode': 'Markdown',
                        },
                    },
                ],
            },
            {
                'controller': 'telegram',
                'when': 'message',
                'case': '{{ new_chat_participant.username === "DevBot" or group_chat_created }}',
                'do': [
                    {
                        'controller': 'telegram',
                        'action': 'sendMessage',
                        'args': {
                            'chatId': '{{ chat.id }}',
                            'text': 'Привет! Я программируемый бот!',
                        },
                    },
                ],
            },
            {
                'controller': 'telegram',
                'when': 'message',
                'case': '{{ r/^(скажи|подскажи|какой)?.*(chatId|чатид|чат ид|ид чата)/ig.test(text) }}',
                'do': [
                    {
                        'controller': 'telegram',
                        'action': 'sendMessage',
                        'args': {
                            'chatId': '{{ chat.id }}',
                            'text': 'Если что, <pre>chatId</pre> этого чатика <code>{{ chat.id }}</code>',
                            'mode': 'HTML',
                        },
                    },
                ],
            },
            {
                'controller': 'scheduler',
                'when': '* * * * *',
                'do': [
                    {
                        'controller': 'telegram',
                        'action': 'sendMessage',
                        'args': {
                            'chatId': '-744812727',
                            'text': 'БДИ!',
                        },
                    },
                ],
            },
        ]),
    })
    expect(result).toEqual({
        namespace: 'test',
        error: 'Error: unknown rule controller name: github. Allowed: telegram, storage',
    })
})
