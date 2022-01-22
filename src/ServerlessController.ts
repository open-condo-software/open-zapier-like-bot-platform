import assert from 'assert'
import { Mutex } from 'async-mutex'
import child_process from 'child_process'
import { randomBytes } from 'crypto'
import { Express } from 'express'
import * as fs from 'fs'
import { mkdirSync, realpathSync } from 'fs'
import { dump, load } from 'js-yaml'
import { fromPairs, merge, trim } from 'lodash'
import { tmpdir } from 'os'
import path from 'path'
import util from 'util'
import { open } from 'yauzl'

import { BaseEventController, BaseEventControllerOptions } from './BaseEventController'
import { getLogger } from './logger'
import { Rules, setupRules } from './main'

const logger = getLogger('serverless')
const exec = util.promisify(child_process.exec)
const runMutex = new Mutex()
const writeMutex = new Mutex()

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

async function getFilePaths (filepath): Promise<Array<string>> {
    const result = []
    return new Promise((res, rej) => {
        open(filepath, function (err, zipfile) {
            if (err) throw err
            zipfile.on('entry', function (entry) {
                result.push(entry.fileName)
            })
            zipfile.on('error', function (err) {
                rej(err)
            })
            zipfile.on('close', () => {
                res(result)
            })
        })
    })
}

export async function getServerlessYmlPrefixAndValidateArchiveFilenames (filepath: string): Promise<string> {
    const filenames = await getFilePaths(filepath)
    const wrongNames = filenames.filter((x) => !/^[a-zA-Z0-9-._/]+$/g.test(x))
    if (wrongNames.length > 0) throw new Error('wrong filename detected')
    const wrongPatterns = filenames.filter((x) => /\/\.\.\//g.test(x))
    if (wrongPatterns.length > 0) throw new Error('wrong filename detected')
    const wrongPatterns2 = filenames.filter((x) => x.startsWith('/'))
    if (wrongPatterns2.length > 0) throw new Error('wrong filename detected')
    const serverlessYamlPaths = filenames.filter((x) => /serverless\.yml$/.exec(x))
    if (serverlessYamlPaths.length > 1) throw new Error('multiple serverless.yml found')
    if (serverlessYamlPaths.length < 1) throw new Error('no serverless.yml found')
    return serverlessYamlPaths[0].substring(0, serverlessYamlPaths[0].length - 'serverless.yml'.length)
}

async function validateAndOverwriteServerlessYml (filepath: string, namespace: string, overwrite: Record<string, any>): Promise<void> {
    const allowedKeys = ['service', 'frameworkVersion', 'functions', 'provider']
    const doc: any = load(fs.readFileSync(filepath, 'utf8'))
    if (namespace && !overwrite.service && !doc.service.startsWith(`micro${namespace}-`)) throw new Error(`serverless.yml: your "service" value should starts with "micro${namespace}-"`)
    if (!/^[a-zA-Z0-9-._]+$/g.test(doc.service) || doc.service === '..' || doc.service == '.') throw new Error('serverless.yml: your "service" has a wrong pattern')
    const notAllowed = Object.keys(doc).filter((key) => !allowedKeys.includes(key))
    if (notAllowed.length) throw new Error(`serverless.yml: contains not allowed keys: ${notAllowed.join(', ')}`)
    const mergedResult = merge(doc, { ...overwrite })
    const serverlessYml = dump(mergedResult)
    fs.writeFileSync(filepath, serverlessYml)
}

interface ServerlessControllerOptions extends BaseEventControllerOptions {
    overwriteServerlessYmlConfig?: Record<string, any>
    howToUpdateServerless: Rules
    controllers: Array<BaseEventController>
    allowed?: Array<string>
}

class ServerlessController extends BaseEventController {
    name = '_serverless'
    private controllers: Record<string, BaseEventController>
    private telegram: BaseEventController
    private storage: BaseEventController
    private howToUpdateServerless: Rules
    private overwriteServerlessYmlConfig: Record<string, any>

    constructor (options: ServerlessControllerOptions) {
        super(options)
        this.howToUpdateServerless = options.howToUpdateServerless
        this.telegram = options.controllers.find(x => x.name === 'telegram')
        this.storage = options.controllers.find(x => x.name === 'storage')
        this.overwriteServerlessYmlConfig = options.overwriteServerlessYmlConfig || {}
        this.controllers = fromPairs(
            options.controllers
                .filter(c => (options.allowed) ? options.allowed.includes(c.name) : true)
                .map(c => [c.name, c]))
        assert.strictEqual(typeof this.telegram, 'object', 'ServerlessController config error: no telegram!')
        assert.strictEqual(typeof this.storage, 'object', 'ServerlessController config error: no storage!')
    }

    async init (app: Express): Promise<void> {
        logger.debug({ controller: this.name, step: 'init()', controllers: Object.keys(this.controllers) })
        await setupRules(this.howToUpdateServerless, {
            ...this.controllers,
            [this.name]: this,
            telegram: this.telegram,
            storage: this.storage,
        })
    }

    async action (name: string, args: { namespace: string, service: string, archive: string, _message?: string }): Promise<any> {
        logger.debug({ controller: this.name, step: 'action()', action: name, args })
        if (name === '_deployServerless') {
            const release = await writeMutex.acquire()
            try {
                const serverlessPrefix = await getServerlessYmlPrefixAndValidateArchiveFilenames(args.archive)
                const namespaceName = trim(args.namespace.replace(/[_.-]+/g, '-'), '-').toLowerCase()
                const serviceName = trim(args.service.replace(/[_.-]+/g, '-'), '-').toLowerCase()
                const service = `m-${namespaceName}--${serviceName}`
                if (!/^[0-9a-zA-Z-]+$/g.test(serviceName)) throw new Error('wrong service name pattern allow only [0-9a-z-]')
                if (!/^[0-9a-zA-Z-]+$/g.test(namespaceName)) throw new Error('wrong namespace name pattern allow only [0-9a-z-]')
                const tmp = path.join(realpathSync(tmpdir()), randomBytes(20).toString('hex'))
                const serverlessRoot = path.join(tmp, serverlessPrefix)
                mkdirSync(tmp)
                await run(`unzip '${args.archive}' -d '${tmp}'`)
                await validateAndOverwriteServerlessYml(path.join(serverlessRoot, 'serverless.yml'), namespaceName, {
                    ...this.overwriteServerlessYmlConfig,
                    service,
                })
                await this.storage.action('_copyFromLocalPath', { path: `serverless/${namespaceName}/${service}`, fromPath: serverlessRoot, _message: args._message })
                return await run(`cd '${serverlessRoot}' && serverless deploy || echo "EXIT CODE ERROR: "$?`)
            } catch (error) {
                return error.toString()
            } finally {
                release()
            }
        } else {
            throw new Error(`unknown action name: ${name}`)
        }
    }
}

export {
    ServerlessController,
    ServerlessControllerOptions,
}
