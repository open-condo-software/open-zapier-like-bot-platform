import pino from 'pino'

const logger = pino({ name: 'bot' })

function getLogger (name: string): pino.Logger {
    return logger.child({ name: 'bot/' + name })
}

export {
    logger,
    getLogger,
}
