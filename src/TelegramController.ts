import assert from 'assert'
import { randomBytes } from 'crypto'
import { Express } from 'express'
import * as fs from 'fs'
import { realpathSync } from 'fs'
import fetch from 'node-fetch'
import TelegramBot, { Message, ParseMode } from 'node-telegram-bot-api'
import { tmpdir } from 'os'
import path from 'path'
import { debug as getDebugger } from 'debug'

import { BaseEventController, BaseEventControllerOptions } from './BaseEventController'
import { getLogger } from './logger'

const logger = getLogger('telegram')
const debug = getDebugger('telegram')

interface TelegramControllerOptions extends BaseEventControllerOptions {
    token: string
    callbackUrl?: string
}

interface SendMessageActionArgs {
    text: string
    chatId: string | number
    mode?: ParseMode
}

type SendMessageResult = TelegramBot.Message

interface SendStickerActionArgs {
    chatId: string | number
    sticker: string
}

type SendStickerResult = TelegramBot.Message

interface ReadFileActionArgs {
    fileId: string
    encoding?: string
}

type ReadFileResult = string

interface TemporarilyDownloadFileLocallyActionArgs {
    fileId: string
}

type TemporarilyDownloadFileLocallyResult = string

class TelegramController extends BaseEventController {
    private token: string
    private bot: TelegramBot
    private callback?: string
    name = 'telegram'

    constructor (options: TelegramControllerOptions) {
        super(options)

        assert.strictEqual(typeof options.token, 'string', 'config error, require token!')
        this.token = options.token
        this.callback = options.callbackUrl
        debug('TelegramController(token=%s, callback=%s)', this.token, this.callback)
    }

    async init (app: Express): Promise<void> {
        if (this.callback) {
            this.bot = new TelegramBot(this.token)
            await this.bot.setWebHook(`${this.serverUrl}${this.callback}`)

            app.post(this.callback, (req, res) => {
                this.bot.processUpdate(req.body)
                res.sendStatus(200)
            })
        } else {
            this.bot = new TelegramBot(this.token, { polling: true })
        }

        this.bot.on('message', (msg: Message) => {
            logger.debug({ controller: this.name, message: msg })
            this.emit('message', msg)
        })
    }

    async action (name: string, args: { chatId: string | number, text: string, sticker: string, fileId: string, encoding?: string, mode?: ParseMode }): Promise<Message | any> {
        logger.debug({ controller: this.name, action: name, args })
        if (name === 'sendMessage') {
            return await this.sendMessageAction(args)
        } else if (name === 'sendSticker') {
            return await this.sendStickerAction(args)
        } else if (name === 'readFile') {
            return await this.readFileAction(args)
        } else if (name === '_temporarilyDownloadFileLocally') {
            return await this._temporarilyDownloadFileLocally(args)
        } else {
            throw new Error(`unknown action name: ${name}`)
        }
    }

    async sendMessageAction (args: SendMessageActionArgs): Promise<SendMessageResult> {
        if (args.text.length > 4096) {
            const chunks = chunkString(args.text, 4050)
            let result
            for (const index in chunks) {
                const message = `CH[${index}]:\`${chunks[index].replace(/[`]/g, '')}\``
                result = await this.bot.sendMessage(args.chatId, message, { parse_mode: args.mode })
            }
            return result
        }
        return await this.bot.sendMessage(args.chatId, args.text, { parse_mode: args.mode })
    }

    async sendStickerAction (args: SendStickerActionArgs): Promise<SendStickerResult> {
        return await this.bot.sendSticker(args.chatId, args.sticker)
    }

    async readFileAction (args: ReadFileActionArgs): Promise<ReadFileResult> {
        const url = await this.bot.getFileLink(args.fileId)
        const buffer = await loadBinary(url)
        return buffer.toString(args.encoding || 'utf-8')
    }

    async _temporarilyDownloadFileLocally (args: TemporarilyDownloadFileLocallyActionArgs): Promise<TemporarilyDownloadFileLocallyResult> {
        const url = await this.bot.getFileLink(args.fileId)
        const buffer = await loadBinary(url)
        const tmp = path.join(realpathSync(tmpdir()), randomBytes(20).toString('hex'))
        fs.writeFileSync(tmp, buffer)
        return tmp
    }
}

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
