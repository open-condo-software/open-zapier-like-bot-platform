require('dotenv').config()

const { TelegramController, RuleController, setupRules, main, logger } = require('ozyifttt')
const { fromPairs } = require('lodash')

const { getInitialRules } = require('./initial')

logger.level = 'debug'

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN

const telegramController = new TelegramController({
    token: TELEGRAM_TOKEN,
})

const internalDynamicRuleController = new RuleController({
    ruleControllers: [telegramController],
})

const controllers = [telegramController, internalDynamicRuleController]

main(controllers)
    .then(async (app) => {
        const namedControllers = fromPairs(controllers.map(c => [c.name, c]))
        await setupRules(getInitialRules(), namedControllers)
        return app
    })
