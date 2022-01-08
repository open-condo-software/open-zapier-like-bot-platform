import { Express } from 'express'

import { BaseEventController, BaseEventControllerOptions } from './BaseEventController'
import { getLogger } from './logger'

const logger = getLogger('jira')

interface JiraControllerOptions extends BaseEventControllerOptions {
    callbackUrl: string
}

class JiraController extends BaseEventController {
    name = 'jira'
    private readonly callbackUrl: string

    constructor (private options: JiraControllerOptions) {
        super(options)
        this.callbackUrl = options.callbackUrl
    }

    async init (app: Express): Promise<void> {
        app.post(this.callbackUrl, async (request, response) => {
            const body = request.body
            const query = request.query
            const webhookEvent = body.webhookEvent
            if (!webhookEvent) {
                response.writeHead(400, { 'content-type': 'application/json' })
                response.end(JSON.stringify({ error: 'Required event name missing' }))
                return
            }

            const name = webhookEvent.replace(/(jira:|_created|_updated|_deleted)/g, '')
            logger.debug({ controller: this.name, step: 'onCallback()', name, body, query })
            this.emit(name, body)
            response.status(204).end()
        })
    }

    async action (name: string, args: { text: string, pattern: string }): Promise<any> {
        logger.debug({ controller: this.name, action: name, args })
        throw new Error(`unknown action name: ${name}`)
    }
}

export {
    JiraController,
    JiraControllerOptions,
}
