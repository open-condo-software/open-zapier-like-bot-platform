import cors from 'cors'
import crypto from 'crypto'
import express, { Express } from 'express'
import { isArray, isEqual, isObject, map, mapValues, set } from 'lodash'
import nunjucks, { Template } from 'nunjucks'
import httpLogger from 'pino-http'
import { serializeError } from 'serialize-error'

import { BaseEventController } from './BaseEventController'
import { AbortActionError } from './errors'

import { logger } from './logger'

type DoArray =
    { controller: 'telegram', action: 'sendMessage', args: { chatId: string, text: string, mode?: 'HTML' | 'MarkdownV2' | 'Markdown' } }
    | { controller: 'telegram', action: 'sendSticker', args: { chatId: string, sticker: string } }
    | { controller: 'telegram', action: 'readFile', args: { fileId: string, encoding?: string } }
    | { controller: 'storage', action: 'create', args: { table: string, object: any } }
    | { controller: 'storage', action: 'createOrUpdate', args: { table: string, query: any, object: any } }
    | { controller: 'storage', action: 'read', args: { table: string, query: any } }
    | { controller: 'storage', action: 'update', args: { table: string, query: any, object: any } }
    | { controller: 'storage', action: 'delete', args: { table: string, query: any } }
    | { controller: 'utils', action: 'match', args: { pattern: string, text: string } }
    | { controller: 'utils', action: 'abort', args: { case: string } }

type RuleArray =
    { controller: 'telegram', when: 'message' }
    | { controller: 'github', when: 'push' }
    | { controller: 'github', when: 'pull_request' }
    | { controller: 'github', when: 'issues' }
    | { controller: 'github', when: 'repository' }
    | { controller: 'github', when: 'check_run' }
    | { controller: 'github', when: 'issue_comment' }
    | { controller: 'github', when: 'pull_request_review_comment' }
    | { controller: 'jira', when: 'issuelink' }
    | { controller: 'jira', when: 'issue' }
    | { controller: 'jira', when: 'comment' }
    | { controller: 'jira', when: 'attachment' }
    | { controller: 'test', when: 'message' }


type Rule = RuleArray & { case?: string, do: Array<DoArray & { as?: string }> }
type Rules = Array<Rule>
type RuleDisposer = { controller: BaseEventController, ruleWhen: string, eventHandler: (data: any, meta: any) => void, rule: Rule, ruleId: string }
type RuleDisposers = Array<RuleDisposer>

const nunjucksEnv = nunjucks.configure({ autoescape: false })

function nunjucksRecursiveCompile (obj) {
    if (!obj) return obj
    if (isArray(obj)) {
        return map(obj, nunjucksRecursiveCompile)
    } else if (isObject(obj)) {
        return mapValues(obj, nunjucksRecursiveCompile)
    } else if (typeof obj === 'string') {
        return nunjucks.compile(obj, nunjucksEnv)
    } else {
        return obj
    }
}

function nunjucksRecursiveRender (compiledTemplate: Record<string, any>, event: Record<string, any>, context?: Record<string, any>) {
    if (!compiledTemplate) return compiledTemplate
    if (compiledTemplate instanceof Template) {
        return compiledTemplate.render({ ...event, ...(context || {}), _: event })
    } else if (isArray(compiledTemplate)) {
        return map(compiledTemplate, x => nunjucksRecursiveRender(x, event, context))
    } else if (isObject(compiledTemplate)) {
        return mapValues(compiledTemplate, x => nunjucksRecursiveRender(x, event, context))
    } else {
        return compiledTemplate
    }
}


async function setupControllers (controllers: Array<BaseEventController>, app: express.Express) {
    const c: { [key: string]: BaseEventController } = {}
    logger.debug({ step: 'setup:controllers', count: controllers.length })
    for (const controllerIndex in controllers) {
        const controller = controllers[controllerIndex]
        let controllerName
        try {
            controllerName = controller.name
            logger.debug({ step: 'setup:init(controller)', controllerName, controllerIndex })
            if (typeof c[controller.name] !== 'undefined') throw new Error('controller name is already inited')
            await controller.init(app)
            c[controller.name] = controller
            controller.on('any', (event) => {
                const { id: eventId, controller, when, time, data } = event
                logger.info({ step: 'controller:event()', eventId, controller, when, time })
                logger.debug({ step: 'controller:event(!)', eventId, controller, when, time, data })
            })
        } catch (error) {
            logger.error({
                step: 'ERROR<-setup:init(controller)',
                error: serializeError(error),
                controllerName, controllerIndex,
            })
            throw error
        }
    }
    return c
}

async function updateRules (rules: Rules, existing: RuleDisposers, c: { [key: string]: BaseEventController }): Promise<RuleDisposers> {
    logger.debug({ step: 'update:rules', rules: rules.length, existing: existing.length })
    const result: RuleDisposers = []
    const newRules: Rules = []
    for (const rule of rules) {
        const foundDisposer = existing.find(x => isEqual(x.rule, rule))
        if (foundDisposer) {
            // already exists
            result.push(foundDisposer)
        } else {
            newRules.push(rule)
        }
    }
    const removeRules: RuleDisposers = existing.filter(x => !result.find(y => y.ruleId === x.ruleId))
    result.push(...await setupRules(newRules, c))
    // NOTE(pahaz): we want to dispose after setup is completed without errors
    logger.debug({ step: 'dispose:rules', count: removeRules.length, ruleIds: removeRules.map(x => x.ruleId) })
    for (const { controller, ruleWhen, eventHandler } of removeRules) {
        controller.off(ruleWhen, eventHandler)
    }
    return result
}

async function setupRules (rules: Rules, c: { [key: string]: BaseEventController }): Promise<RuleDisposers> {
    logger.debug({ step: 'setup:rules', count: rules.length })
    const result: RuleDisposers = []
    for (const ruleIndex in rules) {
        const rule = rules[ruleIndex]
        const ruleId = crypto.randomBytes(20).toString('hex')
        let ruleControllerName, ruleWhen, ruleCase, ruleCaseCompiled, ruleDo, ruleDoCompiled
        try {
            ruleControllerName = rule.controller
            ruleWhen = rule.when
            ruleCase = rule.case
            ruleDo = rule.do
            logger.debug({
                step: 'setup:create(rule)',
                ruleId, ruleIndex, ruleControllerName, ruleWhen, ruleCase, ruleDo,
            })
            const controller = c[ruleControllerName]
            if (!controller) throw new Error(`unknown rule.controller name: ${ruleControllerName}, allowed: ${Object.keys(c).join(', ')}`)
            if (ruleCase && typeof ruleCase !== 'string') throw new Error('unknown rule.case type')
            if (ruleCase) {
                // NOTE: try to compile before subscribe
                ruleCaseCompiled = nunjucksRecursiveCompile(ruleCase)
            }
            if (!ruleDo || !Array.isArray(ruleDo)) throw new Error('unknown rule.do type')
            ruleDoCompiled = ruleDo.map(({ args, ...others }) => ({ args: nunjucksRecursiveCompile(args), ...others }))
            const eventHandler = async (data, { id: eventId }) => {
                const event = { ...data }
                logger.debug({
                    step: 'controller:on()',
                    eventId, ruleId, ruleIndex, ruleControllerName, ruleWhen,
                })
                try {
                    if (ruleCase && ruleCaseCompiled) {
                        const ruleCaseResult = nunjucksRecursiveRender(ruleCaseCompiled, event)
                        logger.debug({
                            step: 'controller:on(rule.case)',
                            eventId, ruleId, ruleCase, ruleCaseResult,
                        })
                        if (ruleCaseResult.toLowerCase() !== 'true') {
                            return
                        }
                    }
                    for (const doIndex in ruleDoCompiled) {
                        const d = ruleDoCompiled[doIndex]
                        const doControllerName = d.controller
                        const doAction = d.action
                        const doAs = d.as
                        const doId = crypto.randomBytes(20).toString('hex')
                        let doArgs
                        try {
                            const actionController = c[doControllerName]
                            if (!actionController) throw new Error('unknown do action controller name')
                            doArgs = nunjucksRecursiveRender(d.args, event)
                            logger.debug({
                                step: 'action:do()',
                                eventId, ruleId, ruleIndex, ruleControllerName, ruleWhen,
                                doId, doIndex, doControllerName, doAction, doArgs, doAs,
                            })
                            const result = await actionController.action(doAction, doArgs)
                            if (result) {
                                logger.debug({
                                    step: 'action:do(result)',
                                    eventId, ruleId, ruleIndex, ruleControllerName, ruleWhen,
                                    doId, doIndex, doControllerName, doAction, doArgs, doAs,
                                    result,
                                })
                            }
                            if (doAs) {
                                set(event, doAs, result)
                            }
                        } catch (error) {
                            if (error instanceof AbortActionError || error.message.startsWith('ABORT')) {
                                logger.debug({ step: 'ABORT<-action:do()', eventId, ruleId, doId })
                            } else {
                                logger.error({
                                    step: 'ERROR<-action:do()',
                                    error: serializeError(error),
                                    eventId, ruleId, ruleIndex, ruleControllerName, ruleWhen,
                                    doId, doIndex, doControllerName, doAction, doArgs, doAs,
                                })
                            }
                            throw error
                        }
                    }
                } catch (error) {
                    if (error instanceof AbortActionError || error.message.startsWith('ABORT')) {
                        logger.debug({ step: 'ABORT<-controller:on()', eventId, ruleId })
                    } else {
                        logger.error({
                            step: 'ERROR<-controller:on()',
                            error: serializeError(error),
                            eventId, ruleId, ruleIndex, ruleControllerName, ruleWhen,
                        })
                    }
                    throw error
                }
            }

            controller.on(ruleWhen, eventHandler)
            result.push({ controller, ruleWhen, eventHandler, rule, ruleId })
        } catch (error) {
            logger.error({
                step: 'ERROR<-setup:create(rule)',
                error: serializeError(error),
                ruleIndex, ruleControllerName, ruleWhen, ruleCase, ruleDo,
            })
            // dispose registered events ... if any error
            for (const { controller, ruleWhen, eventHandler } of result) {
                controller.off(ruleWhen, eventHandler)
            }
            throw error
        }
    }

    return result
}

async function main (rules: Rules, controllers: Array<BaseEventController>): Promise<Express> {
    const logReqRes = httpLogger({ logger, name: 'http', useLevel: 'debug' })
    const app = express()
    app.use(express.json())
    app.use(cors())
    app.use(function reqIdAndLog (request, response, next) {
        request['id'] = request.headers['X-Request-Id'] = crypto.randomBytes(20).toString('hex')
        response.setHeader('X-Request-Id', request['id'])
        logReqRes(request, response)
        next()
    })

    const c = await setupControllers(controllers, app)
    await setupRules(rules, c)

    return app
}

export {
    updateRules,
    setupRules,
    main,
    Rule,
    Rules,
}
