import { asciiNormalizeName, normalizeName, shellQuote } from './utils'

test('normalizeName()', () => {
    expect(normalizeName('+1234')).toEqual('1234')
    expect(normalizeName('-1234')).toEqual('-1234')
    expect(normalizeName('-123.4')).toEqual('-123-4')
    expect(normalizeName(' hello world ')).toEqual('hello-world')
    expect(normalizeName(' привет rfr дела ae ġ ș !.;"%,!;".')).toEqual('привет-rfr-дела-ae-ġ-ș')
    expect(normalizeName('-привет')).toEqual('-привет')
})

test('shellQuote()', () => {
    expect(shellQuote('-123')).toEqual('-123')
    expect(shellQuote('hello!')).toEqual('\'hello!\'')
    expect(shellQuote('how $USER')).toEqual('\'how $USER\'')
    expect(shellQuote('\'"double"\', "\'single\'"')).toEqual('\'\'"\'"\'"double"\'"\'"\', "\'"\'"\'single\'"\'"\'"\'')
    expect(shellQuote('привет')).toEqual('\'привет\'')
    expect(`unzip ${shellQuote('/private/var/folders/39/y9t283gj2z3_70w9cv5tfn1c0000gn/T/e8f33feac1b747b8a5fa77db614446ce52b642c6')} -d ${shellQuote('/tmp/0w9cv5tfn1c0/qweq')}`).toEqual('unzip \'/private/var/folders/39/y9t283gj2z3_70w9cv5tfn1c0000gn/T/e8f33feac1b747b8a5fa77db614446ce52b642c6\' -d /tmp/0w9cv5tfn1c0/qweq')
})

test('asciiNormalizeName()', () => {
    expect(asciiNormalizeName('-123')).toEqual('-123')
    expect(asciiNormalizeName('-1234')).toEqual('-1234')
    expect(asciiNormalizeName('-123.4')).toEqual('-123-4')
    expect(asciiNormalizeName(' hello world ')).toEqual('hello-world')
    expect(asciiNormalizeName(' привет rfr дела ae ġ ș !.;"%,!;".')).toEqual('privet-rfr-dela-ae-s-percent')
})
