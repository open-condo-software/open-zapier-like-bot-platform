import assert from 'assert'
import { Mutex } from 'async-mutex'
import { debug as getDebugger } from 'debug'
import { Express } from 'express'
import { Knex, knex } from 'knex'
import { isEmpty } from 'lodash'
import path from 'path'
import { BaseEventController, BaseEventControllerOptions } from './BaseEventController'
import { getLogger } from './logger'

const logger = getLogger('postgres')
const debug = getDebugger('postgres')

const writeMutex = new Mutex()

type StorageObject = Record<string, string>
type StorageQuery = Record<string, string>

interface PostgresControllerOptions extends BaseEventControllerOptions {
    postgresUrl: string
    table?: string
}

class PostgresController extends BaseEventController {
    name = 'postgres'
    private table: string
    private tableForObjs: string
    private db: Knex
    private postgresUrl: string

    constructor (options: PostgresControllerOptions) {
        super(options)
        assert.strictEqual(typeof options.postgresUrl, 'string', 'config error, require postgresUrl!')
        this.postgresUrl = options.postgresUrl
        this.table = options.table || 'data'
        this.tableForObjs = `${this.table}Objs`
        this.db = knex({
            client: 'pg',
            connection: this.postgresUrl,
        })
        debug('PostgresController(postgresUrl=%s, table=%s)', this.postgresUrl, this.table)
    }

    async init (app: Express): Promise<void> {
        await this.db.raw('select 1+1 as result')
        const table = this.table
        const tableForObjs = this.tableForObjs
        const hasDataTable = await this.db.schema.hasTable(this.table)
        const hasDataTableForObjs = await this.db.schema.hasTable(this.tableForObjs)
        debug('PostgresController(): inited! hasDataTable=%s', hasDataTable, hasDataTableForObjs)
        if (!hasDataTable) {
            await this.db.schema.createTable(this.table, function (table) {
                table.string('path')
                table.unique(['path'], { constraintName: `${table}_unique_path` } as any)
                table.jsonb('value')
                table.string('_message')
            })
        }
        if (!hasDataTableForObjs) {
            await this.db.schema.createTable(this.tableForObjs, function (table) {
                table.string('table')
                table.index(['table'], `${tableForObjs}_table_index`)
                table.jsonb('object')
                table.index(['object'], `${tableForObjs}_object_index`)
                table.string('_message')
            })
        }
    }

    async action (name: 'create', args: { table: string, object: StorageObject }): Promise<StorageObject>;
    async action (name: 'createOrUpdate', args: { table: string, query: StorageQuery, object: StorageObject }): Promise<Array<StorageObject>>;
    async action (name: 'read', args: { table: string, query: StorageQuery }): Promise<Array<StorageObject>>;
    async action (name: 'update', args: { table: string, query: StorageQuery, object: StorageObject }): Promise<Array<StorageObject>>;
    async action (name: 'delete', args: { table: string, query: StorageQuery }): Promise<Array<StorageObject>>;
    async action (name: string, args: any): Promise<any> {
        // TODO(pahaz): normalize table!
        logger.debug({ controller: this.name, action: name, args })
        if (args.path) {
            args.path = path.normalize(args.path).replace(/\/+$/, '')
            if (args.path.startsWith('.') || args.path.startsWith('/') || args.path.includes('..')) throw new Error('found wrong path format')
        }

        // TODO(pahaz): need to validate path and table for file path injections
        if (name === 'create') {
            return await this._createAction(args)
        } else if (name === 'read') {
            return await this._readAction(args)
        } else if (name === 'createOrUpdate') {
            return await this._createOrUpdateAction(args)
        } else if (name === 'update') {
            return await this._updateAction(args)
        } else if (name === 'delete') {
            return await this._deleteAction(args)
        } else if (name === 'readJson') {
            return await this._readJsonAction(args)
        } else if (name === 'writeJson') {
            return await this._writeJsonAction(args)
        } else if (name === 'getJsonPaths') {
            return await this._getJsonPathAction(args)
        } else {
            throw new Error(`unknown action name: ${name}`)
        }
    }

    async _readJsonAction ({ path, _message }: { path: string, _message?: string }): Promise<StorageObject> {
        const result = await this.db.select('path', 'value', '_message')
            .from(this.table)
            .where('path', path)
        if (result.length === 0) {
            return null
        } else if (result.length === 1) {
            return result[0].value
        }
        throw new Error('invalid table state! key is duplicated')
    }

    async _writeJsonAction ({ path, value, _message }: { path: string, value: StorageObject, _message?: string }): Promise<StorageObject> {
        const result = await this.db.insert({ path, value, _message })
            .into(this.table)
            .onConflict('path')
            .merge(['value', '_message'])
            .returning(['path', 'value', '_message'])
        return result as any
    }

    async _getJsonPathAction ({ path }: { path: string }): Promise<StorageObject[]> {
        const result = await this.db.select('path')
            .from(this.table)
            .whereLike('path', `${path}%`)
        return result
            .map(x => x.path.substring(path.length))
            .map(x => (x.startsWith('/') ? x.substring(1) : x))
    }

    async _createAction ({ table, object }: { table: string, object: StorageObject }) {
        const result = await this.db.insert({ table, object })
            .into(this.tableForObjs)
            .returning('object') as any
        return result[0].object
    }

    async _readAction (args: { table: string, query: StorageQuery }) {
        let result
        if (isEmpty(args.query)) {
            result = await this.db.select('object')
                .from(this.tableForObjs)
                .where('table', args.table)
        } else {
            result = await (this.db.select('object')
                .from(this.tableForObjs) as any)
                .whereJsonSupersetOf('object', args.query)
        }
        return result.map(x => x.object)
    }

    async _deleteAction (args: { table: string, query: StorageQuery }) {
        let result
        if (isEmpty(args.query)) {
            result = await this.db
                .from(this.tableForObjs)
                .where('table', args.table)
                .delete('object')
        } else {
            result = await (this.db
                .from(this.tableForObjs) as any)
                .whereJsonSupersetOf('object', args.query)
                .andWhere('table', args.table)
                .delete('object')
        }
        return result.map(x => x.object)
    }

    private async _updateAction (args: { table: string, query: StorageQuery, object: StorageObject }): Promise<Array<StorageObject>> {
        const result = await this.db.update({
            // NOTE(pahaz): think about JSON.stringify(args.object) here
            object: (this.db).raw(`?? || ?`, ['object', args.object]),
        })
            .whereJsonSupersetOf('object', args.query)
            .andWhere('table', args.table)
            .returning('object')
            .from(this.tableForObjs)
        return result.map(x => x.object)
    }

    async _createOrUpdateAction (args: { table: string, query: StorageQuery, object: StorageObject }): Promise<Array<StorageObject>> {
        // TODO(pahaz): optimize it!
        const release = await writeMutex.acquire()
        try {
            const items = await this._readAction(args)
            if (items.length === 0) {
                return await this._createAction(args)
            }
            return await this._updateAction(args)
        } finally {
            release()
        }
    }
}

export {
    PostgresController,
    PostgresControllerOptions,
}
