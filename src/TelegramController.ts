import assert from 'assert'
import * as crypto from 'crypto'
import { Express } from 'express'
import fetch from 'node-fetch'
import TelegramBot, { Message, ParseMode } from 'node-telegram-bot-api'

import { BaseEventController, BaseEventControllerOptions } from './BaseEventController'
import { getLogger } from './logger'

const logger = getLogger('telegram')

class HttpError extends Error {
    private response: any

    constructor (response) {
        super(`${response.status} for ${response.url}`)
        this.name = 'HttpError'
        this.response = response
    }
}

function loadBinary (url) {
    return fetch(url)
        .then(response => {
            if (response.status == 200) {
                return response.buffer()
            } else {
                throw new HttpError(response)
            }
        })
}

interface TelegramControllerOptions extends BaseEventControllerOptions {
    token: string
}

class TelegramController extends BaseEventController {
    private token: string
    private bot: TelegramBot
    private callback: string
    name = 'telegram'

    constructor (options: TelegramControllerOptions) {
        super(options)

        assert.strictEqual(typeof options.token, 'string', 'config error, require token!')
        this.token = options.token
        this.callback = '/cb/' + crypto.randomBytes(20).toString('hex')
    }

    async init (app: Express): Promise<void> {
        this.bot = new TelegramBot(this.token)
        this.bot.setWebHook(`${this.serverUrl}${this.callback}`)

        app.post(this.callback, (req, res) => {
            this.bot.processUpdate(req.body)
            res.sendStatus(200)
        })

        this.bot.on('message', (msg: Message) => {
            logger.debug({ controller: this.name, message: msg })
            this.emit('message', msg)
        })
    }

    async action (name: string, args: { chatId: string | number, text: string, sticker: string, fileId: string, encoding?: string, mode?: ParseMode }): Promise<Message | any> {
        logger.debug({ controller: this.name, action: name, args })
        if (name === 'sendMessage') {
            if (args.text.length > 4096) {
                const chunks = chunkString(args.text, 4050)
                for (const index in chunks) {
                    const message = `CH[${index}]:\`${chunks[index].replace(/[`]/g, '')}\``
                    await this.bot.sendMessage(args.chatId, message, { parse_mode: args.mode })
                }
                return
            }
            return await this.bot.sendMessage(args.chatId, args.text, { parse_mode: args.mode })
        } else if (name === 'sendSticker') {
            return await this.bot.sendSticker(args.chatId, args.sticker)
        } else if (name === 'readFile') {
            const url = await this.bot.getFileLink(args.fileId)
            const buffer = await loadBinary(url)
            return buffer.toString(args.encoding || 'utf-8')
        } else {
            throw new Error(`unknown action name: ${name}`)
        }
    }
}

function chunkString (str: string, len: number): Array<string> {
    const size = Math.ceil(str.length / len)
    const r = Array(size)
    let offset = 0

    for (let i = 0; i < size; i++) {
        r[i] = str.substr(offset, len)
        offset += len
    }

    return r
}

export {
    TelegramController,
    TelegramControllerOptions,
}
