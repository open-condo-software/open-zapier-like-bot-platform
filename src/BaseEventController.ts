import crypto from 'crypto'
import { Express } from 'express'

const EventEmitter = require('events')

interface BaseEventControllerOptions {
    serverUrl: string
    [key: string]: any
}

abstract class BaseEventController {
    public readonly name: string = 'undefined'
    protected readonly serverUrl: string
    private readonly emitter: typeof EventEmitter

    protected constructor (options: BaseEventControllerOptions) {
        this.emitter = new EventEmitter()
        this.serverUrl = options.serverUrl
    }

    public abstract init (app: Express): Promise<void>

    public abstract action (name: string, args: any): Promise<any>

    public on (name: string, listener: (data: any, meta?: any) => void): void {
        this.emitter.on(name, listener)
    }

    public off (name: string, listener: (data: any, meta?: any) => void): void {
        this.emitter.off(name, listener)
    }

    public emit (name: string, data: any): void {
        const id = crypto.randomBytes(20).toString('hex')
        const time = new Date().toISOString()
        const meta = { id, time, controller: this.name, when: name }
        this.emitter.emit(name, data, meta)
        this.emitter.emit('any', { ...meta, data }, meta)
    }
}

export {
    BaseEventControllerOptions,
    BaseEventController,
}
