import {  Context, Schema } from 'koishi'
import {} from '@koishijs/plugin-help'

export const name = 'w-option-conflict'

export interface Config {}

export const Config: Schema<Config> = Schema.object({})

declare module 'koishi' {
    namespace Argv {
        interface OptionConfig {
            conflictsWith?: string | string[]
        }
    }
}

const maybeArray = <T>(xs: T | T[]): T[] => Array.isArray(xs) ? xs : [ xs ]

type Mat<T> = Record<string, Record<string, T>>

export function apply(ctx: Context) {
    // Define i18n locales.
    ctx.i18n.define('en-US', require('./locales/en-US.yml'))
    ctx.i18n.define('zh-CN', require('./locales/zh-CN.yml'))

    // Check option conflicts before each command execution.
    ctx.before('command/execute', (argv) => {
        const { command, options, session } = argv

        // Get conflict matrix from option config.
        // `conflictMat[option1][option2]` is true <=> option1 conflicts with option2.
        const conflictMat = Object.entries(command._options).reduce<Mat<true>>((mat, [ name, def ]) => {
            mat[name] ??= {}
            const conflicts = maybeArray(def.conflictsWith ?? [])
            conflicts.forEach(conflictName => {
                (mat[conflictName] ??= {})[name] = mat[name][conflictName] = true
            })
            return mat
        }, {})

        // Get conflict matrix of current command execution.
        // At most one of `subUpperMat[o1][o2]` and `subUpper[o2][o1]` will be true,
        // for avoiding duplicated error messages.
        const optionNames = Object.keys(options)
        const subUpperMat = optionNames.reduce<Mat<true>>((mat, name1) => {
            optionNames.forEach(name2 => {
                if (conflictMat[name1][name2] && ! mat[name2]?.[name1])
                    (mat[name1] ??= {})[name2] = true
            })
            return mat
        }, {})

        // Convert current conflict matrix to 2D-array.
        const conflicts = Object
            .entries(subUpperMat)
            .map(([ name1, name2s ]) => [ name1, Object.keys(name2s) ] as const)
            .filter(([, name2s ]) => name2s.length)

        // If there's no conflicts, pass.
        if (! conflicts.length) return

        // Generate the error message.
        const conflictMsg = conflicts
            .map(([ name1, name2s ]) => session.text('conflict', [ name1, name2s.join(', ') ]))
            .join('\n')
        return conflictMsg
    })

    // Extend option help messages.
    ctx.on('help/option', (line, option, _command, session) => {
        return option.conflictsWith
            ? `${line} ${session.text('conflict-with', [ maybeArray(option.conflictsWith).join(', ') ])}`
            : line
    })

    // Test command.
    ctx.command('conflict.test')
        .option('one', '-1', { conflictsWith: 'two' })
        .option('two', '-2', { conflictsWith: 'three' })
        .option('three', '-3')
        .action((({ options }) => 'called with options: ' + Object.keys(options).join(', ')))
}
