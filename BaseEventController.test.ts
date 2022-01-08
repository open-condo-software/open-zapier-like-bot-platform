import express, { Express } from 'express'
import { BaseEventController, BaseEventControllerOptions } from './BaseEventController'

test('BaseEventController', async () => {
    const app = express()

    class StoreInMemoryController extends BaseEventController {
        public name = 'memory'
        private memory: Map<string, string>

        constructor (options: BaseEventControllerOptions) {
            super(options)
            this.memory = new Map<string, string>()
        }

        async init (app: Express): Promise<void> {
            return Promise.resolve(undefined)
        }

        async action (name: string, args: any): Promise<void> {
            if (name !== 'set') throw new Error('unexpected action name')
            if (typeof args.key !== 'string' || typeof args.value !== 'string') throw new Error('invalid argument')
            this.memory.set(args.key, args.value)
            this.emit('set', args)
        }
    }

    const controller = new StoreInMemoryController({ serverUrl: 'https://localhost:3000' })
    await controller.init(app)
    expect(controller.name).toEqual('memory')
})
