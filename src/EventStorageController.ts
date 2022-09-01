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
    onEventControllers: Array<BaseEventController>
    onEventSendToTelegramChatId?: string
    onEventSendDelay?: number
    storageController: BaseEventController
    telegramController?: BaseEventController
    skip?: (event: any) => boolean,
    webEventAccessToken?: string,
    webEventListAccessToken?: string,
}

class EventStorageController extends BaseEventController {
    name = '_event'
    private controllers: Record<string, BaseEventController>
    private telegram?: BaseEventController
    private storage: BaseEventController
    private memoryEvents: Array<any>
    private memoryEventIndex: number
    private onEventSendToTelegramChatId?: string
    private onEventSendDelay: number
    private onEventSendIndex: number
    private onEventSendTimeoutHandler: NodeJS.Timeout
    private skip: (event: any) => boolean
    private webEventAccessToken: string
    private webEventListAccessToken: string

    constructor (private options: EventStorageControllerOptions) {
        super(options)
        this.telegram = options.telegramController
        this.storage = options.storageController
        this.controllers = fromPairs(options.onEventControllers.map(c => [c.name, c]))
        assert.strictEqual(typeof this.storage, 'object', 'EventStorage config error: no storage!')
        assert.ok(options.onEventControllers.length > 0, 'EventStorage config error: no controllers!')
        this.memoryEvents = new Array<any>(MAX_MEMORY_EVENTS)
        this.memoryEventIndex = 0
        this.onEventSendIndex = 0
        this.onEventSendDelay = options.onEventSendDelay || 3000
        this.onEventSendToTelegramChatId = options.onEventSendToTelegramChatId
        this.webEventAccessToken = options.webEventAccessToken
        this.webEventListAccessToken = options.webEventListAccessToken
        this.skip = options.skip
    }

    async init (app: Express): Promise<void> {
        const controllerNames = Object.keys(this.controllers)
        logger.debug({ controller: this.name, step: 'init()', controllers: controllerNames })
        // NOTE: subscribe on all evens
        for (const controllerName of controllerNames) {
            const controller = this.controllers[controllerName]
            controller.on('any', async (event) => {
                const { id: eventId, controller, when } = event
                if (this.skip && this.skip(event)) {
                    logger.debug({ controller: this.name, step: 'SKIPPED', eventId, eventController: controller, eventWhen: when })
                    return
                }

                // NOTE: store in memory
                this.memoryEvents[this.memoryEventIndex] = event
                this.memoryEventIndex = (this.memoryEventIndex + 1) % MAX_MEMORY_EVENTS

                // NOTE: store in storage
                try {
                    await this.storage.action('writeJson', {
                        path: `${STORAGE_EVENT_PATH_PREFIX}/${controller}/${when}/${eventId.substring(0, 2)}/${eventId}`,
                        value: event,
                        _message: `event:${controller}:${when}:${eventId}`,
                    })
                } catch (error) {
                    logger.error({ controller: this.name, step: 'onWriteEvent()', error: serializeError(error) })
                }

                // NOTE: send to telegram
                if (!this.onEventSendTimeoutHandler) {
                    const onEventSendMessage = async () => {
                        let newEvents
                        if (this.onEventSendIndex < this.memoryEventIndex) {
                            newEvents = this.memoryEvents.slice(this.onEventSendIndex, this.memoryEventIndex)
                        } else if (this.onEventSendIndex === this.memoryEventIndex) {
                            logger.error({
                                controller: this.name,
                                step: 'onSendEventMessage() index === sentIndex',
                                index: this.memoryEventIndex,
                                sentIndex: this.onEventSendIndex,
                            })
                        } else if (this.onEventSendIndex > this.memoryEventIndex) {
                            // NOTE: index overflow!
                            newEvents = this.memoryEvents.slice(this.onEventSendIndex, MAX_MEMORY_EVENTS)
                            newEvents = newEvents.concat(this.memoryEvents.slice(0, this.memoryEventIndex))
                        }

                        this.onEventSendIndex = this.memoryEventIndex
                        this.onEventSendTimeoutHandler = null

                        if (this.telegram && this.onEventSendToTelegramChatId) {
                            const text = newEvents
                                .map(({ id: eventId, controller, when }) => `<code>${controller}</code>:<code>${when}</code>:<a href="${this.serverUrl}/_event/${controller}/${when}/${eventId}?token=${this.webEventAccessToken}" rel="nofollow">${eventId}</a>`)
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
                                    index: this.memoryEventIndex,
                                    sentIndex: this.onEventSendIndex,
                                })
                            }
                        }
                    }

                    this.onEventSendTimeoutHandler = setTimeout(onEventSendMessage, this.onEventSendDelay)
                }
            })
        }
        app.get('/_event/:controller/:when/:id', async (request, response) => {
            try {
                if (!this.webEventAccessToken) {
                    // NOTE: we don't give access to the event list without token config!
                    response
                        .writeHead(500, { 'content-type': 'application/json' })
                        .end(JSON.stringify({ message: 'wrong server token config' }))
                    return
                }

                const { id: eventId, controller, when } = request.params
                if (this.webEventAccessToken) {
                    const token = request.query.token
                    if (!token || token !== this.webEventAccessToken) {
                        response
                            .writeHead(403, { 'content-type': 'application/json' })
                            .end(JSON.stringify({ message: 'wrong access token', token }))
                        return
                    }
                }

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
        app.get('/_last_events', async (request, response) => {
            try {
                if (!this.webEventListAccessToken) {
                    // NOTE: we don't give access to the last events list without token config!
                    response
                        .writeHead(500, { 'content-type': 'application/json' })
                        .end(JSON.stringify({ message: 'wrong server token config' }))
                    return
                }
                if (this.webEventListAccessToken) {
                    const token = request.query.token
                    if (!token || token !== this.webEventListAccessToken) {
                        response
                            .writeHead(403, { 'content-type': 'application/json' })
                            .end(JSON.stringify({ message: 'wrong access token' }))
                        return
                    }
                }

                let events = this.memoryEvents.slice(0, this.memoryEventIndex)
                if (this.memoryEvents[this.memoryEventIndex + 1] && this.memoryEventIndex + 1 < MAX_MEMORY_EVENTS) {
                    events = this.memoryEvents.slice(this.memoryEventIndex + 1, MAX_MEMORY_EVENTS).concat(events)
                }

                const urls = events.map(({ id: eventId, controller, when }) => `${this.serverUrl}/_event/${controller}/${when}/${eventId}?token=${this.webEventAccessToken}`)
                response
                    .writeHead(200, { 'content-type': 'application/json' })
                    .end(JSON.stringify(urls))
                return
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
