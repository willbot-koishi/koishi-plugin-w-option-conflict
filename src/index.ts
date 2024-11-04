import {  Context, Schema } from 'koishi'
import {} from '@koishijs/plugin-help'

export const name = 'w-option-conflict'

export interface Config {}

export const Config: Schema<Config> = Schema.object({})

declare module 'koishi' {
    namespace Argv {
        interface OptionConfig {
            conflictsWith?: MaybeArray<string | { option: string, value: any }>
        }
    }
}

type MaybeArray<T> = T | T[]

const maybeArray = <T>(xs: MaybeArray<T>): T[] => Array.isArray(xs) ? xs : [ xs ]

type Mat<T> = Record<string, Record<string, T>>

type ConflictReason = true | { value: any }

export function apply(ctx: Context) {
    // Define i18n locales.
    ctx.i18n.define('en-US', require('./locales/en-US.yml'))
    ctx.i18n.define('zh-CN', require('./locales/zh-CN.yml'))

    // Check option conflicts before each command execution.
    ctx.before('command/execute', (argv) => {
        const { command, options, session } = argv

        // Get conflict reason matrix from option config.
        const reasonMat = Object.entries(command._options).reduce<Mat<ConflictReason>>((mat, [ name1, def ]) => {
            mat[name1] ??= {}
            const conflicts = maybeArray(def.conflictsWith ?? [])
            conflicts.forEach(reason => {
                if (typeof reason === 'string') {
                    const name2 = reason
                    mat[name1][name2] = (mat[name2] ??= {})[name1] = true
                }
                else {
                    const { option: name2, value } = reason
                    mat[name1][name2] = { value } // Conflicts with value are single-way.
                }
            })
            return mat
        }, {})

        // Get conflict matrix of current command execution.
        // At most one of `currentMat[o1][o2]` and `currentMat[o2][o1]` will exist,
        // for avoiding duplicated error messages.
        const optionNames = Object.keys(options)
        const currentMat = optionNames.reduce<Mat<ConflictReason>>((mat, name1) => {
            mat[name1] = {}
            optionNames.forEach(name2 => {
                if (mat[name2]?.[name1]) return
                const reason = reasonMat[name1]?.[name2]
                if (! reason) return
                if (reason === true || reason?.value === options[name2]) mat[name1][name2] = reason
            })
            return mat
        }, {})

        // Convert current conflict matrix to 2D-array.
        const conflicts = Object
            .entries(currentMat)
            .map(([ name, reasonRow ]) => [ name, Object.entries(reasonRow) ] as const)
            .filter(([, reasons ]) => reasons.length)

        // If there's no conflicts, pass.
        if (! conflicts.length) return

        // Generate the error message.
        const conflictMsg = conflicts
            .map(([ name1, reasons ]) => session.text('conflict', [
                name1,
                reasons
                    .map(([ name2, reason ]) =>
                        reason === true
                            ? name2
                            : session.text('conflict-value', [ name2, reason.value ])
                    )
                    .join(session.text('comma'))
            ]))
            .join('\n')
        return conflictMsg
    })

    // Extend option help messages.
    ctx.on('help/option', (line, option, _command, session) => {
        return option.conflictsWith
            ? `${line} ${session.text('conflict-help', [
                maybeArray(option.conflictsWith)
                    .map(reason => typeof reason === 'string'
                        ? reason
                        : session.text('conflict-help-value', [ reason.option, reason.value ])
                    )
                    .join(session.text('comma'))
            ])}`
            : line
    })

    // Test command.
    ctx.command('conflict.test')
        .option('one', '-1', { conflictsWith: [ 'two', 'five' ] })
        .option('two', '-2', { conflictsWith: 'three' })
        .option('three', '-3', {
            conflictsWith: { option: 'four', value: false }
        })
        .option('four', '-4', { fallback: false })
        .option('five', '-5')
        .action((({ options }) => 'called with options: ' + Object.keys(options).join(', ')))
}
