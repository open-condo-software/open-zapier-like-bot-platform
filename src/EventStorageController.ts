import assert from 'assert'
import { Express } from 'express'
import { fromPairs } from 'lodash'
import { serializeError } from 'serialize-error'

import { BaseEventController, BaseEventControllerOptions } from './BaseEventController'
import { getLogger } from './logger'

const STORAGE_EVENT_PATH_PREFIX = 'events'
const MAX_MEMORY_EVENTS = 5000
const logger = getLogger('event')

interface EventStorageControllerOptions extends BaseEventControllerOptions {
    controllers: Array<BaseEventController>
    onEventSendToTelegramChatId: string
    onEventSendDelay?: number
    storageController: any
    telegramController: any
    skip?: (event: any) => boolean,
}

class EventStorageController extends BaseEventController {
    name = '_event'
    private controllers: Record<string, BaseEventController>
    private telegram: BaseEventController
    private storage: BaseEventController
    private memoryEvents: Array<any>
    private memoryEventIndex: number
    private onEventSendToTelegramChatId: string
    private onEventSendDelay: number
    private onEventSendIndex: number
    private onEventSendTimeoutHandler: NodeJS.Timeout
    private skip: (event: any) => boolean

    constructor (private options: EventStorageControllerOptions) {
        super(options)
        this.telegram = options.telegramController
        this.storage = options.storageController
        this.controllers = fromPairs(options.controllers.map(c => [c.name, c]))
        assert.strictEqual(typeof this.telegram, 'object', 'EventStorage config error: no telegram!')
        assert.strictEqual(typeof this.storage, 'object', 'EventStorage config error: no storage!')
        assert.ok(options.controllers.length > 0, 'EventStorage config error: no controllers!')
        this.memoryEvents = new Array<any>(MAX_MEMORY_EVENTS)
        this.memoryEventIndex = 0
        this.onEventSendIndex = 0
        this.onEventSendDelay = options.onEventSendDelay || 3000
        this.onEventSendToTelegramChatId = options.onEventSendToTelegramChatId
        this.skip = options.skip
    }

    async init (app: Express): Promise<void> {
        const controllerNames = Object.keys(this.controllers)
        logger.debug({ controller: this.name, step: 'init()', controllers: controllerNames })
        for (const controllerName of controllerNames) {
            const controller = this.controllers[controllerName]
            controller.on('any', async (event) => {
                const { id: eventId, controller, when } = event
                if (this.skip && this.skip(event)) {
                    logger.debug({ controller: this.name, step: 'SKIPPED', eventId, eventController: controller, eventWhen: when })
                    return
                }
                this.memoryEvents[this.memoryEventIndex++ % MAX_MEMORY_EVENTS] = event
                if (!this.onEventSendTimeoutHandler) {
                    const onEventSendMessage = async () => {
                        if (this.onEventSendIndex >= this.memoryEventIndex) throw new Error('index problem!')
                        const newEvents = this.memoryEvents.slice(this.onEventSendIndex, this.memoryEventIndex)
                        this.onEventSendIndex = this.memoryEventIndex
                        this.onEventSendTimeoutHandler = null
                        const text = newEvents
                            .map(({ id: eventId, controller, when }) => `<code>${controller}</code>:<code>${when}</code>:<a href="${this.serverUrl}/_event/${controller}/${when}/${eventId}">${eventId}</a>`)
                            .join('\n')

                        try {
                            await this.telegram.action('sendMessage', {
                                chatId: this.onEventSendToTelegramChatId,
                                text,
                                mode: 'HTML',
                            })
                        } catch (error) {
                            logger.error({
                                controller: this.name,
                                step: 'onSendEventMessage()',
                                error: serializeError(error),
                            })
                        }
                    }

                    this.onEventSendTimeoutHandler = setTimeout(onEventSendMessage, this.onEventSendDelay)
                }

                try {
                    await this.storage.action('writeJson', {
                        path: `${STORAGE_EVENT_PATH_PREFIX}/${controller}/${when}/${eventId.substr(0, 2)}/${eventId}`,
                        value: event,
                        _message: `event:${controller}:${when}:${eventId}`,
                    })
                } catch (error) {
                    logger.error({ controller: this.name, step: 'onWriteEvent()', error: serializeError(error) })
                }
            })
        }
        app.get('/_event/:controller/:when/:id', async (request, response) => {
            try {
                const { id: eventId, controller, when } = request.params
                for (const event of this.memoryEvents) {
                    if (!event) break
                    if (event.id === eventId) {
                        response
                            .writeHead(200, { 'content-type': 'application/json' })
                            .end(JSON.stringify(event))
                        return
                    }
                }
                const event = await this.storage.action('readJson', { path: `${STORAGE_EVENT_PATH_PREFIX}/${controller}/${when}/${eventId.substr(0, 2)}/${eventId}` })
                if (event) {
                    response
                        .writeHead(200, { 'content-type': 'application/json' })
                        .end(JSON.stringify(event))
                    return
                }
                response.status(404).end()
            } catch (error) {
                logger.error({ controller: this.name, step: 'onAPIResult()', error: serializeError(error) })
                response.status(500).end()
            }
        })
    }

    async action (name: string, args: { eventId: string, data: string }): Promise<any> {
        logger.debug({ controller: this.name, step: 'action()', action: name, args })
        throw new Error(`unknown action name: ${name}`)
    }
}

export {
    EventStorageController,
    EventStorageControllerOptions,
}
