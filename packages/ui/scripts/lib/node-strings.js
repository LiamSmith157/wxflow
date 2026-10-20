const fs = require('fs')
const path = require('path')

const DEFAULT_DIST = path.resolve(__dirname, '../../../components/dist/nodes')

const CATEGORIES = [
    'node.label',
    'node.category',
    'node.description',
    'param.label',
    'param.description',
    'param.placeholder',
    'param.hint',
    'param.warning',
    'option.label',
    'option.description'
]

const listJsFiles = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) return listJsFiles(full)
        return entry.name.endsWith('.js') ? [full] : []
    })

const addString = (strings, category, value) => {
    if (typeof value !== 'string' || !value.trim()) return
    if (!strings[value]) strings[value] = []
    if (!strings[value].includes(category)) strings[value].push(category)
}

const collectParams = (strings, params) => {
    if (!Array.isArray(params)) return
    params.forEach((param) => {
        if (!param || typeof param !== 'object') return
        addString(strings, 'param.label', param.label)
        addString(strings, 'param.description', param.description)
        addString(strings, 'param.placeholder', param.placeholder)
        addString(strings, 'param.hint', param.hint && param.hint.label)
        addString(strings, 'param.warning', param.warning)
        if (Array.isArray(param.options)) {
            param.options.forEach((option) => {
                addString(strings, 'option.label', option.label)
                addString(strings, 'option.description', option.description)
            })
        }
        collectParams(strings, param.array)
    })
}

/**
 * Instantiate every node class exported from the built `packages/components/dist/nodes` and collect the
 * user-facing English strings, keyed by text with the categories they appear in.
 */
const extractNodeStrings = (distDir = DEFAULT_DIST) => {
    if (!fs.existsSync(distDir)) {
        throw new Error(
            `Node definitions not found at ${distDir}. Build packages/components first (pnpm --filter flowise-components build).`
        )
    }
    const strings = {}
    const stats = { nodes: 0, failed: [] }
    listJsFiles(distDir).forEach((file) => {
        let mod
        try {
            mod = require(file)
        } catch (error) {
            stats.failed.push(`${path.relative(distDir, file)}: ${error.message}`)
            return
        }
        Object.values(mod).forEach((Candidate) => {
            if (typeof Candidate !== 'function') return
            let node
            try {
                node = new Candidate()
            } catch (error) {
                return
            }
            if (!node || !node.label || !(node.inputs || node.outputs || node.description)) return
            stats.nodes += 1
            addString(strings, 'node.label', node.label)
            addString(strings, 'node.category', node.category)
            addString(strings, 'node.description', node.description)
            collectParams(strings, node.inputs)
            collectParams(strings, node.outputs)
        })
    })
    return { strings, stats }
}

/** Markup that must survive translation unchanged. */
const hasMarkup = (text) => /<\/?[a-z][^>]*>|\]\(https?:\/\/|https?:\/\//i.test(text)

/**
 * Strings that look like identifiers rather than prose: model ids, dotted/slashed paths, snake/camel case
 * names, acronyms, versions and template placeholders. They stay in English.
 */
const looksLikeIdentifier = (text) => {
    const value = text.trim()
    if (/^\{\{.*\}\}$/.test(value) || /^\$\{.*\}$/.test(value)) return true
    if (/\s/.test(value)) return false
    if (value.startsWith('$')) return true
    if (/^[A-Z0-9]{2,6}$/.test(value)) return true
    if (/^[\w.:/@-]+$/.test(value) && /[\d._/:@-]/.test(value)) return true
    if (/^[a-z]+([A-Z][a-z0-9]*)+$/.test(value)) return true
    return false
}

const loadJson = (file, fallback) => {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch (error) {
        return fallback
    }
}

/**
 * Compare extracted English strings with a zh-CN `nodes.json`.
 * A string counts as covered when it has a non-empty translation or is exempt (identifier-like, or listed in
 * `keepEnglish`). Returns per-category coverage, the untranslated strings and translation keys that no longer
 * exist in the node definitions.
 */
const computeCoverage = (strings, translations = {}, keepEnglish = []) => {
    const exempt = new Set(keepEnglish)
    const byCategory = {}
    CATEGORIES.forEach((category) => {
        byCategory[category] = { total: 0, translated: 0, exempt: 0 }
    })
    const missing = []
    Object.entries(strings).forEach(([text, categories]) => {
        const isExempt = exempt.has(text) || looksLikeIdentifier(text)
        const translated = typeof translations[text] === 'string' && translations[text].trim() !== ''
        categories.forEach((category) => {
            const bucket = byCategory[category]
            bucket.total += 1
            if (translated) bucket.translated += 1
            else if (isExempt) bucket.exempt += 1
        })
        if (!translated && !isExempt) missing.push({ text, categories })
    })
    const extra = Object.keys(translations).filter((key) => !(key in strings))
    return { byCategory, missing, extra }
}

module.exports = { CATEGORIES, DEFAULT_DIST, extractNodeStrings, hasMarkup, looksLikeIdentifier, computeCoverage, loadJson }
