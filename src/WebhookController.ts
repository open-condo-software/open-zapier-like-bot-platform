import assert from 'assert'
import crypto from 'crypto'
import { Express } from 'express'
import { fromPairs, trim } from 'lodash'
import { serializeError } from 'serialize-error'

import { BaseEventController, BaseEventControllerOptions } from './BaseEventController'
import { getLogger } from './logger'
import { asciiNormalizeName } from './utils'

const STORAGE_WEBHOOK_PATH_PREFIX = 'webhook'
const logger = getLogger('webhook')

interface WebhookControllerOptions extends BaseEventControllerOptions {
    storageController: BaseEventController
}

class WebhookController extends BaseEventController {
    name = 'webhook'
    private storage: BaseEventController

    constructor (private options: WebhookControllerOptions) {
        super(options)
        this.storage = options.storageController
        assert.strictEqual(typeof this.storage, 'object', 'EventStorage config error: no storage!')
    }

    async init (app: Express): Promise<void> {
        app.all('/wh/:namespace/:id', async (request, response) => {
            try {
                const { id: hookId, namespace } = request.params
                if (hookId.length < 10) return response.status(404).end()

                const hooks = await this.storage.action('read', {
                    table: `${STORAGE_WEBHOOK_PATH_PREFIX}/${namespace}`,
                    query: { namespace, id: hookId },
                })
                if (hooks.length === 1) {
                    const hook = hooks[0]
                    if (hook.methods.includes(request.method.toLowerCase())) {
                        const name = hook.name
                        const status = parseInt(hook.status) || 200
                        const headers = fromPairs<string>(hook.headers)
                        const data = hook.response
                        response
                            .writeHead(status, headers)
                            .end(data)
                        this.emit(`${namespace}:${name}`, {
                            hookId, name: `${namespace}:${name}`,
                            method: request.method,
                            url: request.url,
                            query: request.query,
                            body: request.body, // check memory leak?
                            headers: JSON.parse(JSON.stringify(request.headers)),
                        })
                        return
                    }
                }
                response.status(404).end()
            } catch (error) {
                logger.error({ controller: this.name, step: 'onAPIResult()', error: serializeError(error) })
                response.status(500).end()
            }
        })
    }

    async action (name: string, args: { namespace: string, name: string, methods?: string, _status?: string, _response?: string, _headers?: Iterable<readonly [string, string]>, _message?: string }): Promise<any> {
        logger.debug({ controller: this.name, action: name, args })
        if (name === '_createWebhook') {
            const hookId = crypto.randomBytes(20).toString('hex')
            const namespace = asciiNormalizeName(args.namespace)
            const name = asciiNormalizeName(args.name)
            const methods = asciiNormalizeName(args.methods || 'GET,POST')
            return await this.storage.action('create', {
                _message: args._message,
                table: `${STORAGE_WEBHOOK_PATH_PREFIX}/${namespace}`,
                object: {
                    id: hookId,
                    namespace,
                    name,
                    methods,
                    status: String(args._status || 200),
                    response: args._response || '{"status":"ok"}',
                    headers: args._headers || [['content-type', 'application/json; charset=utf-8']],
                },
            })
        } else {
            throw new Error(`unknown action name: ${name}`)
        }
    }
}

export {
    WebhookController,
    WebhookControllerOptions,
}
