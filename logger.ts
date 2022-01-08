import pino from 'pino'

const transport = pino.transport({
    targets: [
        {
            level: 'debug',
            target: 'pino/file',
            options: {
                destination: './main.log.txt',
            },
        }, {
            level: 'info',
            target: 'pino-pretty',
            options: {},
        },
    ],
})

const baseLogger = pino(transport)
baseLogger.level = 'debug'

const logger = baseLogger.child({ name: 'bot' })

function getLogger (name: string): pino.Logger {
    return logger.child({ name: 'bot/' + name })
}

export {
    logger,
    getLogger,
}
