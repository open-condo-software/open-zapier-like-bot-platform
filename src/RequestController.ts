import { Express } from 'express'
import fetch, { ReferrerPolicy, RequestRedirect } from 'node-fetch'

import { BaseEventController, BaseEventControllerOptions } from './BaseEventController'
import { getLogger } from './logger'

const logger = getLogger('request')

type RequestControllerOptions = BaseEventControllerOptions

class RequestController extends BaseEventController {
    name = 'request'

    constructor (private options: RequestControllerOptions) {
        super(options)
    }

    async init (app: Express): Promise<void> {
        return
    }

    async action (name: string, args: { method?: string, url: string, body?: string, headers?: Iterable<readonly [string, string]>, redirect?: RequestRedirect, referrer?: string, referrerPolicy?: ReferrerPolicy, compress?: boolean }): Promise<any> {
        logger.debug({ controller: this.name, action: name, args })
        if (name === 'fetch') {
            return this.fetchAction(args)
        } else {
            throw new Error(`unknown action name: ${name}`)
        }
    }

    async fetchAction (args: { method?: string, url: string, body?: string, headers?: Iterable<readonly [string, string]>, redirect?: RequestRedirect, referrer?: string, referrerPolicy?: ReferrerPolicy, compress?: boolean }): Promise<any> {
        const result = await fetch(args.url, { ...args })
        const data = await result.buffer()
        try {
            result.text = data.toString() as any
        } catch (error) {
            // pass
        }
        try {
            result.json = JSON.parse(data.toString()) as any
        } catch (error) {
            // pass
        }
        return result
    }
}

export {
    RequestController,
    RequestControllerOptions,
}
