import { Express } from 'express'

import { BaseEventController, BaseEventControllerOptions } from './BaseEventController'
import { AbortActionError } from './errors'
import { getLogger } from './logger'

const logger = getLogger('utils')

type UtilsControllerOptions = BaseEventControllerOptions

interface MatchActionArgs {
    text: string
    pattern: string
}

interface MatchResult {
    [key: string]: any
}

interface AbortActionArgs {
    case: string
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface AbortResult {
}

class UtilsController extends BaseEventController {
    name = 'utils'

    constructor (private options: UtilsControllerOptions) {
        super(options)
    }

    async init (app: Express): Promise<void> {
        return
    }

    async action (name: string, args: MatchActionArgs & AbortActionArgs): Promise<any> {
        logger.debug({ controller: this.name, action: name, args })
        if (name === 'match') {
            return await this.matchAction(args)
        } else if (name === 'abort') {
            return await this.abortAction(args)
        } else {
            throw new Error(`unknown action name: ${name}`)
        }
    }

    async matchAction (args: MatchActionArgs): Promise<MatchResult> {
        const re = new RegExp(args.pattern, 'mg')
        const match = re.exec(args.text)
        if (match) {
            return match.groups
        }
        return {}
    }

    async abortAction (args: AbortActionArgs): Promise<AbortResult> {
        if (args.case.toLowerCase() === 'true') {
            throw new AbortActionError('ABORT')
        }
        return {}
    }
}

export {
    UtilsController,
    UtilsControllerOptions,
}
