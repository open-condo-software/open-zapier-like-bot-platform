import assert from 'assert'
import { Mutex } from 'async-mutex'
import child_process from 'child_process'
import { Express } from 'express'
import fs from 'fs'
import { isArray, isMatch } from 'lodash'
import path from 'path'
import { serializeError } from 'serialize-error'
import util from 'util'
import writeFileAtomic from 'write-file-atomic'

import { BaseEventController, BaseEventControllerOptions } from './BaseEventController'
import { getLogger } from './logger'

const logger = getLogger('storage')
const exec = util.promisify(child_process.exec)
const runMutex = new Mutex()
const commitMutex = new Mutex()
const writeMutex = new Mutex()

const DEBUG = false
const SYNC_INTERVAL = 1000 * 60

async function run (command): Promise<string> {
    const release = await runMutex.acquire()
    try {
        const { stderr, stdout } = await exec(command)
        // logger.debug({ step: 'exec', command, stderr, stdout })
        return stdout
    } finally {
        release()
    }
}

async function cloneRepo (repoUrl: string, repoPath: string) {
    if (DEBUG) console.log('cloneRepo()', repoUrl, repoPath)
    const repo = { repoUrl, repoPath }
    if (!fs.existsSync(repoPath)) {
        if (DEBUG) console.log(`cloneRepo() clone ${repoUrl} ${repoPath}`)
        await run(`git clone '${repoUrl}' '${repoPath}'`)
    }
    await syncRepo(repo, repoPath)
    return repo
}

async function syncRepo (repo: any, repoPath: string) {
    await run(`git -C '${repoPath}' pull origin master && git -C '${repoPath}' push origin master`)
}

async function commitFile (repo: any, repoPath: string, filename: string, meta: any = {}) {
    const release = await commitMutex.acquire()
    try {
        await run(`git -C '${repoPath}' add '${filename}'`)
        const stdout = await run(`git -C '${repoPath}' status -s`)
        if (stdout.trim()) {
            await run(`git -C '${repoPath}' commit -am '${meta.message.replace(/[\\']+/g, '') || 'commitFile()'}'`)
        }
    } finally {
        release()
    }
}

async function readTable (repo: any, repoPath: string, table: string): Promise<Array<any>> {
    try {
        const filePath = path.join(repoPath, table + '.list.json')
        const data = JSON.parse(await fs.promises.readFile(filePath, { encoding: 'utf-8' }))
        if (!isArray(data)) throw new Error('readData is not an array')
        return data
    } catch (error) {
        // TODO(pahaz): fix it ?!
        logger.warn({ step: 'readData', repoPath, table, error: serializeError(error) })
        return []
    }
}

async function writeTable (repo: any, repoPath: string, table: string, data: Array<any>, meta: any = {}) {
    const release = await writeMutex.acquire()
    try {
        const text = JSON.stringify(data, null, 2)
        const filePath = path.join(repoPath, table + '.list.json')
        const dirPath = path.dirname(filePath)
        if (!fs.existsSync(dirPath)) await fs.promises.mkdir(dirPath, { recursive: true })
        await writeFileAtomic(filePath, text, { encoding: 'utf-8' })
        // TODO(pahaz): split commit and write
        await commitFile(repo, repoPath, table + '.list.json', { message: 'writeTable', ...meta })
        await syncRepo(repo, repoPath)
    } finally {
        release()
    }
}

async function readJson (repo: any, repoPath: string, readPath: string) {
    try {
        const filePath = path.join(repoPath, readPath + '.data.json')
        return JSON.parse(await fs.promises.readFile(filePath, { encoding: 'utf-8' }))
    } catch (error) {
        logger.warn({ step: 'readJson', repoPath, path: repoPath, error: serializeError(error) })
        return null
    }
}

async function getJsonPaths (repo: any, repoPath: string, readPath: string) {
    try {
        const filePath = path.join(repoPath, readPath, '/')
        return (await fs.promises.readdir(filePath)).filter(p => p.endsWith('.data.json')).map(p => p.substr(0, p.length - '.data.json'.length))
    } catch (error) {
        logger.warn({ step: 'getJsonPaths', repoPath, path: readPath, error: serializeError(error) })
        return []
    }
}

async function writeJson (repo: any, repoPath: string, readPath: string, data: any, meta: any = {}) {
    const release = await writeMutex.acquire()
    try {
        const text = JSON.stringify(data, null, 2)
        const filePath = path.join(repoPath, readPath + '.data.json')
        const dirPath = path.dirname(filePath)
        if (!fs.existsSync(dirPath)) await fs.promises.mkdir(dirPath, { recursive: true })
        await writeFileAtomic(filePath, text, { encoding: 'utf-8' })
        // TODO(pahaz): split commit and write
        await commitFile(repo, repoPath, readPath + '.data.json', { message: 'writeJson', ...meta })
        await syncRepo(repo, repoPath)
        return data
    } finally {
        release()
    }
}

interface StorageControllerOptions extends BaseEventControllerOptions {
    url: string
    localCachePath?: string
}

class StorageController extends BaseEventController {
    name = 'storage'
    private url: string
    private repo: any
    private setIntervalId: NodeJS.Timeout
    private syncInterval: number
    private repoPath: string

    constructor (options: StorageControllerOptions) {
        super(options)

        assert.strictEqual(typeof options.url, 'string', 'config error, require url!')

        this.url = options.url
        this.syncInterval = SYNC_INTERVAL
        this.repoPath = options.localCachePath || '.storage.tmp'
    }

    async init (app: Express): Promise<void> {
        this.repo = await cloneRepo(this.url, this.repoPath)
        this.setIntervalId = setInterval(async () => {
            const release = await writeMutex.acquire()
            try {
                await syncRepo(this.repo, this.repoPath)
            } catch (error) {
                logger.error({ step: 'sync', controller: this.name, error })
            } finally {
                release()
            }
        }, this.syncInterval)
    }

    async action (name: string, args: { table: string, query?: { [key: string]: any }, object?: any, path: string, value: string, _message?: string }): Promise<any> {
        logger.debug({ controller: this.name, action: name, args })
        // TODO(pahaz): need to validate path and table for file path injections
        if (name === 'create') {
            const data = await readTable(this.repo, this.repoPath, args.table)
            data.push(args.object)
            await writeTable(this.repo, this.repoPath, args.table, data)
            return args.object
        } else if (name === 'createOrUpdate') {
            const data = await readTable(this.repo, this.repoPath, args.table)
            const filtered = data.filter(obj => isMatch(obj, args.query))
            if (filtered.length === 0) {
                data.push(args.object)
            } else {
                for (const obj of filtered) {
                    Object.assign(obj, args.object)
                }
            }
            await writeTable(this.repo, this.repoPath, args.table, data)
            return filtered.length === 0 ? args.object : filtered
        } else if (name === 'read') {
            const data = await readTable(this.repo, this.repoPath, args.table)
            const filtered = data.filter(obj => isMatch(obj, args.query))
            return filtered
        } else if (name === 'update') {
            const data = await readTable(this.repo, this.repoPath, args.table)
            const filtered = data.filter(obj => isMatch(obj, args.query))
            for (const obj of filtered) {
                Object.assign(obj, args.object)
            }
            await writeTable(this.repo, this.repoPath, args.table, data)
            return filtered
        } else if (name === 'delete') {
            const data = await readTable(this.repo, this.repoPath, args.table)
            const allowed = data.filter(obj => !isMatch(obj, args.query))
            await writeTable(this.repo, this.repoPath, args.table, allowed, (args._message) ? { message: args._message } : undefined)
            return data.filter(obj => isMatch(obj, args.query))
        } else if (name === 'readJson') {
            return await readJson(this.repo, this.repoPath, args.path)
        } else if (name === 'writeJson') {
            return await writeJson(this.repo, this.repoPath, args.path, args.value, (args._message) ? { message: args._message } : undefined)
        } else if (name === 'getJsonPaths') {
            if (!args.path) throw new Error('args.path is required')
            return await getJsonPaths(this.repo, this.repoPath, args.path)
        } else {
            throw new Error(`unknown action name: ${name}`)
        }
    }
}

export {
    StorageController,
    StorageControllerOptions,
}
