import { Express } from 'express'

import { BaseEventController, BaseEventControllerOptions } from './BaseEventController'
import { AbortActionError } from './errors'
import { getLogger } from './logger'

const logger = getLogger('utils')

type UtilsControllerOptions = BaseEventControllerOptions

class UtilsController extends BaseEventController {
    name = 'utils'

    constructor (private options: UtilsControllerOptions) {
        super(options)
    }

    async init (app: Express): Promise<void> {
        return
    }

    async action (name: string, args: { text: string, pattern: string, case: string }): Promise<any> {
        logger.debug({ controller: this.name, action: name, args })
        if (name === 'match') {
            const re = new RegExp(args.pattern, 'mg')
            const match = re.exec(args.text)
            if (match) {
                return match.groups
            }
            return {}
        } else if (name === 'abort') {
            if (args.case.toLowerCase() === 'true') {
                throw new AbortActionError('ABORT')
            }
        } else {
            throw new Error(`unknown action name: ${name}`)
        }
    }
}

export {
    UtilsController,
    UtilsControllerOptions,
}
