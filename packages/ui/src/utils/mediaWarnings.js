/** [{ id, issues: [...] }] from the media-warnings API -> { nodeId: [...] } for the canvas */
export const mediaWarningsToMap = (warnings) => {
    const map = {}
    for (const warning of Array.isArray(warnings) ? warnings : []) {
        if (warning?.id && Array.isArray(warning.issues) && warning.issues.length > 0) map[warning.id] = warning.issues
    }
    return map
}

/** The text of a node's warning tooltip: the node's own warning followed by its media warnings */
export const joinNodeWarnings = (nodeWarning, mediaIssues) =>
    [nodeWarning, ...(Array.isArray(mediaIssues) ? mediaIssues : [])].filter((x) => typeof x === 'string' && x).join('\n')
