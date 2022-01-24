import assert from 'assert'
import { Mutex } from 'async-mutex'
import ObsClient from 'esdk-obs-nodejs'
import { Express } from 'express'
import { isArray, isMatch } from 'lodash'
import fetch from 'node-fetch'
import path from 'path'
import { serializeError } from 'serialize-error'

import { BaseEventController, BaseEventControllerOptions } from './BaseEventController'
import { getLogger } from './logger'

const logger = getLogger('s3')
const writeMutex = new Mutex()

type StorageObject = Record<string, string>
type StorageQuery = Record<string, string>

function loadBinary (url) {
    return fetch(url)
        .then(response => {
            if (response.status == 200) {
                return response.buffer()
            } else {
                throw new Error('status != 200')
            }
        })
}

async function putFile (s3, data, mimetype, bucket, path, meta = {}) {
    return new Promise((resolve, reject) => {
        s3.putObject(
            {
                Body: data,
                ContentType: mimetype,
                Bucket: bucket,
                Key: path,
                Metadata: meta,
            },
            (error, data) => {
                if (error) {
                    reject(error)
                } else {
                    resolve({ data })
                }
            },
        )
    })
}


async function listAll (s3, bucket, path): Promise<Array<string>> {
    return new Promise((res, rej) => {
        const ret = []
        function _listAll (nextMarker) {
            s3.listObjects({
                Bucket: bucket,
                Prefix: path,
                Marker: nextMarker,
            }).then((result) => {
                if (result.CommonMsg.Status < 300) {
                    for (let j = 0; j < result.InterfaceResult.Contents.length; j++) {
                        ret.push(result.InterfaceResult.Contents[j]['Key'])
                    }
                    if (result.InterfaceResult.IsTruncated === 'true') {
                        _listAll(result.InterfaceResult.NextMarker)
                    } else {
                        res(ret)
                    }
                }
            }, rej)
        }
        _listAll(null)
    })
}



async function readTable (s3: any, bucket: string, folder: string, table: string): Promise<Array<any>> {
    try {
        const filePath = path.join(folder, table + '.list.json')
        const { SignedUrl } = s3.createSignedUrlSync({
            Method: 'GET',
            Bucket: bucket,
            Key: filePath,
            Expires: 300,
        })

        const data = JSON.parse(await loadBinary(SignedUrl))
        if (!isArray(data)) throw new Error('readData is not an array')
        return data
    } catch (error) {
        // TODO(pahaz): fix it ?!
        logger.warn({ step: 'readData', bucket, folder, table, error: serializeError(error) })
        return []
    }
}

async function writeTable (s3: any, bucket: string, folder: string, table: string, data: Array<any>, meta: any = {}) {
    const release = await writeMutex.acquire()
    try {
        const text = JSON.stringify(data, null, 2)
        const filePath = path.join(folder, table + '.list.json')
        return await putFile(s3, text, 'application/json', bucket, filePath)
    } finally {
        release()
    }
}

async function readJson (s3: any, bucket: string, folder: string, readPath: string) {
    try {
        const filePath = path.join(folder, readPath + '.data.json')
        const { SignedUrl } = s3.createSignedUrlSync({
            Method: 'GET',
            Bucket: bucket,
            Key: filePath,
            Expires: 300,
        })

        return JSON.parse(await loadBinary(SignedUrl))
    } catch (error) {
        logger.warn({ step: 'readJson', bucket, folder, readPath, error: serializeError(error) })
        return null
    }
}

async function getJsonPaths (s3: any, bucket: string, folder: string, readPath: string) {
    try {
        const filePath = path.join(folder, readPath, '/')
        return (await listAll(s3, bucket, filePath)).filter(p => p.endsWith('.data.json')).map(p => p.substring(filePath.length, p.length - '.data.json'.length))
    } catch (error) {
        logger.warn({ step: 'getJsonPaths', bucket, folder, path: readPath, error: serializeError(error) })
        return []
    }
}

async function writeJson (s3: any, bucket: string, folder: string, readPath: string, data: any, meta: any = {}) {
    const release = await writeMutex.acquire()
    try {
        const text = JSON.stringify(data, null, 2)
        const filePath = path.join(folder, readPath + '.data.json')
        return await putFile(s3, text, 'application/json', bucket, filePath, meta)
    } finally {
        release()
    }
}

interface S3ControllerOptions extends BaseEventControllerOptions {
    obsConfig: { 'bucket': string, 's3Options': { 'server': string, 'access_key_id': string, 'secret_access_key': string } }
    pathPrefix?: string
}

class S3Controller extends BaseEventController {
    name = 's3'
    private folder: string
    private server: string
    private bucket: string
    private s3: any

    constructor (options: S3ControllerOptions) {
        super(options)

        assert.strictEqual(typeof options.obsConfig, 'object', 'config error, require obsConfig!')
        this.bucket = options.obsConfig.bucket
        this.s3 = new ObsClient(options.obsConfig.s3Options)
        this.server = options.obsConfig.s3Options.server
        this.folder = options.pathPrefix || ''
    }

    async init (app: Express): Promise<void> {
        return
    }

    async action (name: string, args: { table: string, query?: StorageQuery, object?: StorageObject, path: string, value: string, _message?: string }): Promise<any> {
        // TODO(pahaz): normalize table!
        logger.debug({ controller: this.name, action: name, args })
        // TODO(pahaz): need to validate path and table for file path injections
        if (name === 'create') {
            const data = await readTable(this.s3, this.bucket, this.folder, args.table)
            data.push(args.object)
            await writeTable(this.s3, this.bucket, this.folder, args.table, data)
            return args.object
        } else if (name === 'createOrUpdate') {
            const data = await readTable(this.s3, this.bucket, this.folder, args.table)
            const filtered = data.filter(obj => isMatch(obj, args.query))
            if (filtered.length === 0) {
                data.push(args.object)
            } else {
                for (const obj of filtered) {
                    Object.assign(obj, args.object)
                }
            }
            await writeTable(this.s3, this.bucket, this.folder, args.table, data)
            return filtered.length === 0 ? data : filtered
        } else if (name === 'read') {
            const data = await readTable(this.s3, this.bucket, this.folder, args.table)
            const filtered = data.filter(obj => isMatch(obj, args.query))
            return filtered
        } else if (name === 'update') {
            const data = await readTable(this.s3, this.bucket, this.folder, args.table)
            const filtered = data.filter(obj => isMatch(obj, args.query))
            for (const obj of filtered) {
                Object.assign(obj, args.object)
            }
            await writeTable(this.s3, this.bucket, this.folder, args.table, data)
            return filtered
        } else if (name === 'delete') {
            const data = await readTable(this.s3, this.bucket, this.folder, args.table)
            console.log(data, args.query)
            const allowed = data.filter(obj => !isMatch(obj, args.query))
            await writeTable(this.s3, this.bucket, this.folder, args.table, allowed, (args._message) ? { message: args._message } : undefined)
            return data.filter(obj => isMatch(obj, args.query))
        } else if (name === 'readJson') {
            return await readJson(this.s3, this.bucket, this.folder, args.path)
        } else if (name === 'writeJson') {
            return await writeJson(this.s3, this.bucket, this.folder, args.path, args.value, (args._message) ? { message: args._message } : undefined)
        } else if (name === 'getJsonPaths') {
            if (!args.path) throw new Error('args.path is required')
            return await getJsonPaths(this.s3, this.bucket, this.folder, args.path)
        } else {
            throw new Error(`unknown action name: ${name}`)
        }
    }
}

export {
    S3Controller,
    S3ControllerOptions,
}
