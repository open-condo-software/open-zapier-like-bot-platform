import assert from 'assert'
import { Mutex } from 'async-mutex'
import { Express } from 'express'
import { fromPairs, isArray, isObject, toPairs } from 'lodash'

import { BaseEventController, BaseEventControllerOptions } from './BaseEventController'
import { getLogger } from './logger'
import { Rules, setupRules, updateRules } from './main'

const STORAGE_RULE_PATH_PREFIX = 'rules'
const logger = getLogger('rule')
const writeMutex = new Mutex()


function validateNamespaceAndRules (namespace: string, ruleObjects: Rules) {
    const namespaceValidator = /^[\w-_]+$/g
    assert.ok(namespaceValidator.test(namespace), 'namespace is not valid')
    assert.ok(isArray(ruleObjects), 'rules json is not an array')
    for (const rule of ruleObjects) {
        assert.ok(!rule.controller.startsWith('_'), 'rules: "controller" name should not starts with _')
        assert.ok(!rule.when.startsWith('_'), 'rules: "when" condition should not starts with _')
        assert.ok(!rule.case || !rule.case.startsWith('_'), 'rules: "case" condition should not starts with _')
        assert.ok(Array.isArray(rule.do), 'rules: "do" is not an array')
        for (const does of rule.do) {
            assert.ok(!does.controller.startsWith('_'), 'rules: "do"."controller" name should not starts with _')
            assert.ok(!does.action.startsWith('_'), 'rules: "do"."action" name should not starts with _')
            assert.ok(isObject(does.args), 'rules: "do"."args" is not an object')
            toPairs(does.args).forEach(([key, val]) => {
                assert.ok(typeof val === 'string', `rules: "do"."args" (${key}) value is not a string`)
                assert.ok(!key.startsWith('_'), `rules: "do"."args" (${key}) should not starts with _`)
            })
        }
    }
}

interface RuleControllerOptions extends BaseEventControllerOptions {
    howToUpdateRule: Rules
    controllers: Array<BaseEventController>
    allowed?: Array<string>
}

class RuleController extends BaseEventController {
    name = '_rule'
    private controllers: Record<string, BaseEventController>
    private telegram: BaseEventController
    private storage: BaseEventController
    private namespaces: Record<string, any>
    private howToUpdateRule: Rules

    constructor (private options: RuleControllerOptions) {
        super(options)
        this.telegram = options.controllers.find(x => x.name === 'telegram')
        this.storage = options.controllers.find(x => x.name === 'storage')
        this.controllers = fromPairs(
            options.controllers
                .filter(c => (options.allowed) ? options.allowed.includes(c.name) : true)
                .map(c => [c.name, c]))
        this.howToUpdateRule = options.howToUpdateRule
        assert.strictEqual(typeof this.telegram, 'object', 'RuleController config error: no telegram!')
        assert.strictEqual(typeof this.storage, 'object', 'RuleController config error: no storage!')
        this.namespaces = {}
    }

    async init (app: Express): Promise<void> {
        logger.debug({ controller: this.name, step: 'init()', controllers: Object.keys(this.controllers) })
        await setupRules(this.howToUpdateRule, { ...this.controllers, [this.name]: this, telegram: this.telegram, storage: this.storage })
        const namespaces: Array<string> = await this.storage.action('getJsonPaths', { path: STORAGE_RULE_PATH_PREFIX })
        for (const namespace of namespaces) {
            const rules = await this.storage.action('readJson', { path: `${STORAGE_RULE_PATH_PREFIX}/${namespace}` })
            this.namespaces[namespace] = await setupRules(rules, this.controllers)
        }
    }

    async action (name: string, args: { namespace: string, rules: string, _message?: string }): Promise<any> {
        logger.debug({ controller: this.name, step: 'action()', action: name, args })
        if (name === '_updateRules') {
            const release = await writeMutex.acquire()
            try {
                const ruleObjects = JSON.parse(args.rules)
                validateNamespaceAndRules(args.namespace, ruleObjects)
                const disposers = this.namespaces[args.namespace] || []
                this.namespaces[args.namespace] = await updateRules(ruleObjects, disposers, this.controllers)
                await this.storage.action('writeJson', { path: `${STORAGE_RULE_PATH_PREFIX}/${args.namespace}`, value: ruleObjects, _message: args._message })
                const ruleIds: Array<string> = this.namespaces[args.namespace].map(x => x.ruleId)
                ruleIds.sort()
                return ruleIds.join('\n')
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
    RuleController,
    RuleControllerOptions,
}
