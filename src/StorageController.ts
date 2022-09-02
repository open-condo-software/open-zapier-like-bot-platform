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
import { debug as getDebugger } from 'debug'

import { BaseEventController, BaseEventControllerOptions } from './BaseEventController'
import { getLogger } from './logger'
import { shellQuote } from './utils'

const logger = getLogger('storage')
const debug = getDebugger('storage')
const exec = util.promisify(child_process.exec)
const runMutex = new Mutex()
const commitMutex = new Mutex()
const writeMutex = new Mutex()

const SYNC_INTERVAL = 1000 * 60

type StorageObject = Record<string, string>
type StorageQuery = Record<string, string>

async function run (command): Promise<string> {
    const release = await runMutex.acquire()
    try {
        debug('start command "%s"', command)
        const { stderr, stdout } = await exec(command)
        debug('command "%s" stdout=%o; stderr=%o', command, stdout, stderr)
        return stdout
    } finally {
        release()
    }
}

async function cloneRepo (repoUrl: string, repoPath: string, repoBranch?: string) {
    debug('cloneRepo(repoUrl=%s, repoPath=%s, repoBranch=%s)', repoUrl, repoPath, repoBranch)
    const repo = { repoUrl, repoPath }
    if (!fs.existsSync(repoPath)) {
        debug(`cloneRepo(...): clone %s %s`, repoUrl, repoPath)
        await run(`git clone ${shellQuote(repoUrl)} ${shellQuote(repoPath)}`)
    }
    await syncRepo(repo, repoPath, repoBranch)
    return repo
}

async function syncRepo (repo: any, repoPath: string, repoBranch?: string) {
    const branch = (repoBranch) ? ` origin ${shellQuote(repoBranch)}` : ''
    await run(`git -C ${shellQuote(repoPath)} pull ${branch} && git -C ${shellQuote(repoPath)} push ${branch}`)
}

async function commitFile (repo: any, repoPath: string, filename: string, meta: any = {}) {
    const release = await commitMutex.acquire()
    try {
        await run(`git -C ${shellQuote(repoPath)} add ${shellQuote(filename)}`)
        const stdout = await run(`git -C ${shellQuote(repoPath)} status -s`)
        if (stdout.trim()) {
            await run(`git -C ${shellQuote(repoPath)} commit -am ${shellQuote(meta.message || '-')}`)
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

async function _copyFilesRecursively (fromPath: string, toPath: string) {
    if (!fs.lstatSync(fromPath).isDirectory()) throw new Error('fromPath is not a directory')
    if (!fs.existsSync(toPath)) await fs.promises.mkdir(toPath, { recursive: true })

    const entries = await fs.promises.readdir(fromPath, { withFileTypes: true })
    for (const entry of entries) {
        entry.isDirectory() ?
            await _copyFilesRecursively(path.join(fromPath, entry.name), path.join(toPath, entry.name)) :
            await fs.promises.copyFile(path.join(fromPath, entry.name), path.join(toPath, entry.name))
    }
}

async function copyFiles (repo: any, repoPath: string, toPath: string, fromPath: string, meta: any = {}) {
    const release = await writeMutex.acquire()
    try {
        const destinationPath = path.join(repoPath, toPath)
        await _copyFilesRecursively(fromPath, destinationPath)
        await commitFile(repo, repoPath, toPath, { message: 'copyFiles', ...meta })
    } finally {
        release()
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
    branch?: string
}

class StorageController extends BaseEventController {
    name = 'storage'
    private url: string
    private repo: any
    private setIntervalId: NodeJS.Timeout
    private syncInterval: number
    private repoPath: string
    private branch: string

    constructor (options: StorageControllerOptions) {
        super(options)

        assert.strictEqual(typeof options.url, 'string', 'config error, require url!')

        this.url = options.url
        this.syncInterval = SYNC_INTERVAL
        this.repoPath = options.localCachePath || '.storage.tmp'
        this.branch = options.branch
        debug('StorageController(url=%s, repoPath=%s, branch=%s)', this.url, this.repoPath, this.branch)
    }

    async init (app: Express): Promise<void> {
        this.repo = await cloneRepo(this.url, this.repoPath, this.branch)
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

    async action (name: 'create', args: { table: string, object: StorageObject }): Promise<StorageObject>;
    async action (name: 'createOrUpdate', args: { table: string, query: StorageQuery, object: StorageObject }): Promise<Array<StorageObject>>;
    async action (name: 'read', args: { table: string, query: StorageQuery }): Promise<Array<StorageObject>>;
    async action (name: 'update', args: { table: string, query: StorageQuery, object: StorageObject }): Promise<Array<StorageObject>>;
    async action (name: 'delete', args: { table: string, query: StorageQuery }): Promise<Array<StorageObject>>;
    async action (name: 'readJson', args: { path: string }): Promise<StorageObject>;
    async action (name: 'writeJson', args: { path: string, value: StorageObject }): Promise<StorageObject>;
    async action (name: 'getJsonPaths', args: { path: string }): Promise<Array<string>>;
    async action (name: '_copyFromLocalPath', args: { path: string, fromPath: string }): Promise<void>;
    async action (name: string, args: Record<string, any>): Promise<any> {
        logger.debug({ controller: this.name, action: name, args })
        // TODO(pahaz): normalize table!
        // TODO(pahaz): need to validate path and table for file path injections
        if (name === 'create') {
            const data = await readTable(this.repo, this.repoPath, args.table)
            data.push(args.object)
            await writeTable(this.repo, this.repoPath, args.table, data, (args._message) ? { message: args._message } : undefined)
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
            await writeTable(this.repo, this.repoPath, args.table, data, (args._message) ? { message: args._message } : undefined)
            return filtered.length === 0 ? data : filtered
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
            await writeTable(this.repo, this.repoPath, args.table, data, (args._message) ? { message: args._message } : undefined)
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
        } else if (name === '_copyFromLocalPath') {
            if (!args.path) throw new Error('args.path is required')
            if (!args.fromPath) throw new Error('args.fromPath is required')
            await copyFiles(this.repo, this.repoPath, args.path, args.fromPath, (args._message) ? { message: args._message } : undefined)
            return
        } else {
            throw new Error(`unknown action name: ${name}`)
        }
    }
}

export {
    StorageController,
    StorageControllerOptions,
}
