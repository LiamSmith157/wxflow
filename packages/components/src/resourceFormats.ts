// What the resource library can turn into text for a model or a node. Kept apart from the parsers so the server (save-time
// checks) and the parameter dropdowns can use the list without loading the parsing libraries.

/** Extensions (lower case, with the dot) whose text can be extracted */
export const TEXT_EXTENSIONS: readonly string[] = ['.pdf', '.docx', '.xlsx', '.xls', '.pptx', '.txt']

export const canExtractText = (ext: string): boolean => TEXT_EXTENSIONS.includes((ext ?? '').toLowerCase())
