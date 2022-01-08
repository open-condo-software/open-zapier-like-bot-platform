/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    verbose: true,
    transform: {
        '^.+\\.jsx?$': 'babel-jest',
        '^.+\\.ts?$': 'ts-jest',
    },
    transformIgnorePatterns: ['/node_modules/serialize-error/*.js'],
}
