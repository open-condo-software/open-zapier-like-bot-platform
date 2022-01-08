import { EmitterWebhookEvent, Webhooks } from '@octokit/webhooks'
import { WebhookEventName } from '@octokit/webhooks-types'
import { WebhookEventHandlerError } from '@octokit/webhooks/dist-types/types'
import { Express } from 'express'

import { BaseEventController, BaseEventControllerOptions } from './BaseEventController'
import { getLogger } from './logger'

const logger = getLogger('github')

const WEBHOOK_HEADERS = [
    'x-github-event',
    'x-hub-signature-256',
    'x-github-delivery',
]

interface GithubControllerOptions extends BaseEventControllerOptions {
    secret: string
    callbackUrl: string
}

class GithubController extends BaseEventController {
    name = 'github'
    private webhooks: Webhooks<unknown>
    private callbackUrl: string

    constructor (private options: GithubControllerOptions) {
        super(options)
        this.callbackUrl = options.callbackUrl
        this.webhooks = new Webhooks({
            secret: options.secret,
        })
        this.webhooks.onAny((event: EmitterWebhookEvent) => {
            logger.debug({ controller: this.name, step: 'onEvent()', event })
            const { name, payload } = event
            this.emit(name, payload)
        })
    }

    async init (app: Express): Promise<void> {
        app.post(this.callbackUrl, async (request, response) => {
            const missingHeaders = WEBHOOK_HEADERS.filter((header) => !(header in request.headers)).join(', ')
            if (missingHeaders) {
                response.writeHead(400, { 'content-type': 'application/json' })
                response.end(JSON.stringify({ error: `Required headers missing: ${missingHeaders}` }))
                return
            }

            const eventName = request.headers['x-github-event'] as WebhookEventName
            const signatureSHA256 = request.headers['x-hub-signature-256'] as string
            const id = request.headers['x-github-delivery'] as string
            const body = request.body
            const query = request.query
            logger.debug({ controller: this.name, step: 'onCallback()', eventName, signatureSHA256, id, body, query })

            // GitHub will abort the request if it does not receive a response within 10s
            // See https://github.com/octokit/webhooks.js/issues/185
            let didTimeout = false
            const timeout = setTimeout(() => {
                didTimeout = true
                response.statusCode = 202
                response.end('still processing\n')
            }, 9000).unref()

            try {
                const payload = request.body

                await this.webhooks.verifyAndReceive({
                    id: id,
                    name: eventName as any,
                    payload: payload as any,
                    signature: signatureSHA256,
                })

                clearTimeout(timeout)

                if (didTimeout) return

                response.end('ok\n')
            } catch (error) {
                logger.error({ controller: this.name, action: 'ERROR<-onCallback()', error })

                clearTimeout(timeout)

                if (didTimeout) return

                const statusCode = Array.from(error as WebhookEventHandlerError)[0].status
                response.statusCode = typeof statusCode !== 'undefined' ? statusCode : 500
                response.end(String(error))
            }
        })
    }

    async action (name: string, args: { text: string, pattern: string }): Promise<any> {
        logger.debug({ controller: this.name, action: name, args })
        throw new Error(`unknown action name: ${name}`)
    }
}

export {
    GithubController,
    GithubControllerOptions,
}
