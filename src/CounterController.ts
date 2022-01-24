import { Express } from 'express'
import { toPairs } from 'lodash'

import { BaseEventController, BaseEventControllerOptions } from './BaseEventController'
import { getLogger } from './logger'
import { asciiNormalizeName } from './utils'

const STORAGE_COUNTERS_PATH_PREFIX = 'counters'
const logger = getLogger('counter')
const N = (x: any): number => Number(x) || 0

function median (values: Array<number>): number {

    if (values.length === 0) return 0
    values.sort((a, b) => a - b)
    const half = Math.floor(values.length / 2)
    if (values.length % 2) return values[half]
    return (values[half - 1] + values[half]) / 2.0
}

interface CounterControllerOptions extends BaseEventControllerOptions {
    storageController: BaseEventController
}

class CounterController extends BaseEventController {
    name = 'counter'
    private storage: BaseEventController

    constructor (private options: CounterControllerOptions) {
        super(options)
        this.storage = options.storageController
    }

    async init (app: Express): Promise<void> {
        return
    }

    // async action (name: string, args: ({ key: string, value: string } | { key: string } | { key: string, keyTo: string }) & { namespace: string }): Promise<any> {
    async action (name: string, args: { key: string, keyTo?: string, value?: string, namespace: string, _message: string }): Promise<any> {
        logger.debug({ controller: this.name, action: name, args })
        const namespace = asciiNormalizeName(args.namespace)
        const path = `${STORAGE_COUNTERS_PATH_PREFIX}/${namespace}`
        const data = await this.storage.action('readJson', { path }) || {}
        if (name === 'set') {
            const value = N(args.value)
            const key = args.key
            data[key] = value
            await this.storage.action('writeJson', { path, value: data })
            return value
        } else if (name === 'unset') {
            const key = args.key
            if (key in data) {
                const current = N(data[key])
                delete data[key]
                await this.storage.action('writeJson', { path, value: data })
                return current
            }
            return 0
        } else if (name === 'setIfNotExists') {
            const value = N(args.value)
            const key = args.key
            if (key in data) return data[key]
            data[key] = value
            await this.storage.action('writeJson', { path, value: data })
            return value
        } else if (name === 'get') {
            const key = args.key
            return N(data[key])
        } else if (name === 'copy') {
            const key = args.key
            const keyTo = args.keyTo
            if (key in data) {
                data[keyTo] = data[key]
                await this.storage.action('writeJson', { path, value: data })
                return N(data[key])
            }
            if (keyTo in data) {
                delete data[keyTo]
                await this.storage.action('writeJson', { path, value: data })
                return 0
            }
            return 0
        } else if (name === 'rename') {
            const key = args.key
            const keyTo = args.keyTo
            if (key in data) {
                data[keyTo] = data[key]
                delete data[key]
                await this.storage.action('writeJson', { path, value: data })
                return N(data[keyTo])
            }
            if (keyTo in data) {
                delete data[keyTo]
                await this.storage.action('writeJson', { path, value: data })
                return 0
            }
            return 0
        } else if (name === 'increment') {
            const key = args.key
            const value = N(args.value) !== 0 ? N(args.value) : 1
            data[key] = N(data[key]) + value
            await this.storage.action('writeJson', { path, value: data })
            return data[key]
        } else if (name === 'decrement') {
            const key = args.key
            const value = N(args.value) !== 0 ? N(args.value) : 1
            data[key] = N(data[key]) + value
            await this.storage.action('writeJson', { path, value: data })
            return data[key]
        } else if (name === 'sum') {
            const key = args.key
            return toPairs(data).reduce((s, [k, val]) => s + (k.startsWith(key) ? N(val) : 0), 0)
        } else if (name === 'avg' || name == 'mean') {
            const key = args.key
            const [summa, count] = toPairs(data).reduce(([s, n], [k, val]) => [s + (k.startsWith(key) ? N(val) : 0), n + (k.startsWith(key) ? 1 : 0)], [0, 0])
            return (count > 0) ? summa / count : 0
        } else if (name === 'median') {
            const key = args.key
            const values = toPairs(data).filter(([k, val]) => k.startsWith(key)).map(([k, val]) => N(val))
            return median(values)
        } else {
            throw new Error(`unknown action name: ${name}`)
        }
    }
}

export {
    CounterController
    ,
    CounterControllerOptions
    ,
}
