import { Express } from 'express'
// @ts-ignore
import { Job, scheduleJob, gracefulShutdown } from 'node-schedule'

import { BaseEventController, BaseEventControllerOptions } from './BaseEventController'
import { getLogger } from './logger'

const logger = getLogger('scheduler')

type SchedulerControllerOptions = BaseEventControllerOptions

class SchedulerController extends BaseEventController {
    name = 'scheduler'
    private jobs: Job[]
    private names: Set<string>

    constructor (private options: SchedulerControllerOptions) {
        super(options)
        this.jobs = []
        this.names = new Set()
    }

    async init (app: Express): Promise<void> {
        return
    }

    destroy (): Promise<any> {
        return gracefulShutdown()
    }

    on (name: string, listener: (data: any, meta?: any) => void) {
        super.on(name, listener)
        if (this.names.has(name)) return
        this.names.add(name)
        const job = scheduleJob(name, () => this.emit(name, {}))
        this.jobs.push(job)
    }

    async action (name: string, args: { text: string, pattern: string, case: string }): Promise<any> {
        logger.debug({ controller: this.name, action: name, args })
        throw new Error(`unknown action name: ${name}`)
    }
}

export {
    SchedulerController,
    SchedulerControllerOptions,
}
