#!/usr/bin/env node
/**
 * Print the user-facing English strings of every node defined in packages/components.
 *
 *   node scripts/extract-node-strings.js [output.json] [--dist <path>]
 *
 * Output: { stats, strings: { "<text>": { categories: [...], markup?: true, identifier?: true } } }
 */
/* eslint-disable no-console */
const fs = require('fs')
const { extractNodeStrings, hasMarkup, looksLikeIdentifier, DEFAULT_DIST } = require('./lib/node-strings')

const args = process.argv.slice(2)
const distIndex = args.indexOf('--dist')
const dist = distIndex >= 0 ? args.splice(distIndex, 2)[1] : DEFAULT_DIST
const output = args[0]

const { strings, stats } = extractNodeStrings(dist)
const entries = Object.fromEntries(
    Object.entries(strings).map(([text, categories]) => [
        text,
        { categories, ...(hasMarkup(text) && { markup: true }), ...(looksLikeIdentifier(text) && { identifier: true }) }
    ])
)
const result = { stats: { nodes: stats.nodes, failed: stats.failed, uniqueStrings: Object.keys(entries).length }, strings: entries }

if (output) {
    fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n')
    console.log(`${result.stats.uniqueStrings} strings from ${result.stats.nodes} nodes (${stats.failed.length} failed) -> ${output}`)
} else {
    console.log(JSON.stringify(result, null, 2))
}
if (stats.failed.length) process.exitCode = 1
