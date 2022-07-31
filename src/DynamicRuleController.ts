import assert from 'assert'
import { Mutex } from 'async-mutex'
import { Express } from 'express'
import { fromPairs, isArray, isPlainObject, toPairs } from 'lodash'

import { BaseEventController, BaseEventControllerOptions } from './BaseEventController'
import { getLogger } from './logger'
import { Rules, setupRules, updateRules } from './main'
import { asciiNormalizeName } from './utils'

const STORAGE_RULE_PATH_PREFIX = 'rules'
const logger = getLogger('rule')
const writeMutex = new Mutex()


function validateNamespaceAndRules (namespace: string, ruleObjects: Rules) {
    assert.ok(/^[\w-_]+$/g.test(namespace), 'namespace is not valid')
    assert.ok(isArray(ruleObjects), 'rules json is not an array')
    for (const rule of ruleObjects) {
        assert.ok(!rule.controller.startsWith('_'), 'rules: "controller" name should not starts with _')
        assert.ok(!rule.when.startsWith('_'), 'rules: "when" condition should not starts with _')
        assert.ok(!rule.case || !rule.case.startsWith('_'), 'rules: "case" condition should not starts with _')
        assert.ok(Array.isArray(rule.do), 'rules: "do" is not an array')
        for (const does of rule.do) {
            assert.ok(!does.controller.startsWith('_'), 'rules: "do"."controller" name should not starts with _')
            assert.ok(!does.action.startsWith('_'), 'rules: "do"."action" name should not starts with _')
            assert.ok(isPlainObject(does.args), 'rules: "do"."args" is not an object')
            toPairs(does.args).forEach(([key, val]) => {
                assert.ok(typeof val === 'string' || (isPlainObject(val)), `rules: "do"."args" (${key}) value is not a string or an object`)
                assert.ok(!key.startsWith('_'), `rules: "do"."args" (${key}) should not starts with _`)
            })
        }
    }
}

interface RuleControllerOptions extends BaseEventControllerOptions {
    ruleControllers: Array<BaseEventController>
    storageController?: BaseEventController
}

interface UpdateRulesActionArgs {
    namespace: string
    rules: string
    _message?: string
}

interface UpdateRulesResult {
    namespace: string
    result?: string
    error?: string
}

class RuleController extends BaseEventController {
    name = '_rule'
    private controllers: Record<string, BaseEventController>
    private namespaces: Record<string, any>
    private storage?: BaseEventController

    constructor (private options: RuleControllerOptions) {
        super(options)
        this.storage = options.storageController
        this.controllers = fromPairs(
            options.ruleControllers
                .map(c => [c.name, c]))
        if (!this.storage) logger.warn({ controller: this.name, message: 'You created Dynamic Rule Controller without storage Controller options! All your new rules will be stored only in memory!' })
        assert.ok(isPlainObject(this.controllers), 'RuleController config error: no ruleControllers!')
        this.namespaces = {}
    }

    async init (app: Express): Promise<void> {
        logger.debug({ controller: this.name, step: 'init()', controllers: Object.keys(this.controllers) })
        if (this.storage) {
            const namespaces: Array<string> = await this.storage.action('getJsonPaths', { path: STORAGE_RULE_PATH_PREFIX })
            for (const namespace of namespaces) {
                const rules = await this.storage.action('readJson', { path: `${STORAGE_RULE_PATH_PREFIX}/${namespace}` })
                this.namespaces[namespace] = await setupRules(rules, this.controllers)
            }
        }
    }

    async action (name: string, args: UpdateRulesActionArgs): Promise<any> {
        logger.debug({ controller: this.name, step: 'action()', action: name, args })
        if (name === '_updateRules') {
            return await this._updateRulesAction(args)
        } else {
            throw new Error(`unknown action name: ${name}`)
        }
    }

    async _updateRulesAction (args: UpdateRulesActionArgs): Promise<UpdateRulesResult> {
        const release = await writeMutex.acquire()
        const namespace = asciiNormalizeName(args.namespace)
        try {
            // TODO(pahaz): need to normalize rules! For example, we can add some namespace prefix for storage paths!
            const ruleObjects = JSON.parse(args.rules)
            validateNamespaceAndRules(namespace, ruleObjects)
            const disposers = this.namespaces[namespace] || []
            this.namespaces[namespace] = await updateRules(ruleObjects, disposers, this.controllers)
            if (this.storage) {
                await this.storage.action('writeJson', {
                    path: `${STORAGE_RULE_PATH_PREFIX}/${namespace}`,
                    value: ruleObjects,
                    _message: args._message,
                })
            }
            const ruleIds: Array<string> = this.namespaces[namespace].map(x => x.ruleId)
            ruleIds.sort()
            return {
                namespace,
                result: ruleIds.join('\n'),
            }
        } catch (error) {
            return {
                namespace,
                error: error.toString(),
            }
        } finally {
            release()
        }
    }
}

export {
    RuleController,
    RuleControllerOptions,
}
