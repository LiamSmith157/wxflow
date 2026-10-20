#!/usr/bin/env node
/**
 * Report how much of the node catalog has a zh-CN translation.
 *
 *   node scripts/nodes-coverage.js [--dist <path>] [--list] [--strict]
 *
 * --list    print every untranslated string
 * --strict  exit 1 when any non-exempt string is untranslated or any translation key is stale
 *
 * Exempt strings are identifier-like (see looksLikeIdentifier) or listed in scripts/node-keep-english.json.
 */
/* eslint-disable no-console */
const path = require('path')
const { CATEGORIES, DEFAULT_DIST, extractNodeStrings, computeCoverage, loadJson } = require('./lib/node-strings')

const args = process.argv.slice(2)
const distIndex = args.indexOf('--dist')
const dist = distIndex >= 0 ? args.splice(distIndex, 2)[1] : DEFAULT_DIST

const translations = loadJson(path.resolve(__dirname, '../src/i18n/locales/zh-CN/nodes.json'), {})
const keepEnglish = loadJson(path.resolve(__dirname, 'node-keep-english.json'), [])

const { strings } = extractNodeStrings(dist)
const { byCategory, missing, extra } = computeCoverage(strings, translations, keepEnglish)

console.log('category'.padEnd(20), 'total'.padStart(6), 'done'.padStart(6), 'exempt'.padStart(7), 'left'.padStart(6), ' coverage')
CATEGORIES.forEach((category) => {
    const { total, translated, exempt } = byCategory[category]
    const left = total - translated - exempt
    const pct = total ? (((translated + exempt) / total) * 100).toFixed(1) : '100.0'
    console.log(
        category.padEnd(20),
        String(total).padStart(6),
        String(translated).padStart(6),
        String(exempt).padStart(7),
        String(left).padStart(6),
        ` ${pct}%`
    )
})
console.log(`\nuntranslated strings: ${missing.length}, stale translation keys: ${extra.length}`)
if (args.includes('--list')) missing.forEach(({ text, categories }) => console.log(`  [${categories.join(',')}] ${text}`))
if (extra.length) extra.slice(0, 50).forEach((key) => console.log(`  stale: ${key}`))
if (args.includes('--strict') && (missing.length || extra.length)) process.exitCode = 1
