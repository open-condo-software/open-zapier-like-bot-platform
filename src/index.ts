export * from './BaseEventController'
export * from './DynamicRuleController'
export * from './EventStorageController'
export * from './GithubController'
export * from './JiraController'
export * from './StorageController'
export * from './TelegramController'
export * from './UtilsController'
export * from './S3Controller'
export * from './ServerlessController'
export * from './SchedulerController'
export * from './RequestController'
export * from './WebhookController'
export * from './CounterController'
export * from './logger'
export * from './main'

export let __version__ = ''
try {
    __version__ = JSON.parse(require('fs').readFileSync(`${__dirname}/../package.json`)).version
} catch (error) {
    console.warn(error)
}
