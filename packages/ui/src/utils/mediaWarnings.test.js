import { joinNodeWarnings, mediaWarningsToMap } from './mediaWarnings'
import canvasReducer, { initialState } from '@/store/reducers/canvasReducer'
import { SET_MEDIA_WARNINGS } from '@/store/actions'

describe('mediaWarningsToMap', () => {
    it('maps warnings by node id', () => {
        const warnings = [
            {
                id: 'n1',
                label: 'Send Image',
                name: 'wechatSendImageAgentflow',
                issues: ['素材 `assets/a.jpg` 不存在,请检查 `C:\\wxflow\\exchange\\assets` 目录']
            },
            { id: 'n2', issues: ['x', 'y'] }
        ]
        expect(mediaWarningsToMap(warnings)).toEqual({ n1: [warnings[0].issues[0]], n2: ['x', 'y'] })
    })

    it('ignores empty or malformed entries and non-arrays', () => {
        expect(mediaWarningsToMap([{ id: 'n1', issues: [] }, { issues: ['x'] }, null, { id: 'n3' }])).toEqual({})
        expect(mediaWarningsToMap(undefined)).toEqual({})
        expect(mediaWarningsToMap({})).toEqual({})
    })
})

describe('joinNodeWarnings', () => {
    it('puts the node warning first and drops empty parts', () => {
        expect(joinNodeWarnings('outdated', ['missing file'])).toBe('outdated\nmissing file')
        expect(joinNodeWarnings('', ['missing file'])).toBe('missing file')
        expect(joinNodeWarnings('', undefined)).toBe('')
    })
})

describe('canvas reducer: media warnings', () => {
    it('stores and replaces the warnings', () => {
        const withWarnings = canvasReducer(initialState, { type: SET_MEDIA_WARNINGS, mediaWarnings: { n1: ['a'] } })
        expect(withWarnings.mediaWarnings).toEqual({ n1: ['a'] })
        expect(canvasReducer(withWarnings, { type: SET_MEDIA_WARNINGS, mediaWarnings: {} }).mediaWarnings).toEqual({})
        expect(canvasReducer(withWarnings, { type: SET_MEDIA_WARNINGS }).mediaWarnings).toEqual({})
    })

    it('starts without warnings', () => {
        expect(initialState.mediaWarnings).toEqual({})
    })
})

describe('canvas reducer: switching flows', () => {
    it('keeps the warnings when the same flow is set again and clears them for another flow', () => {
        const { SET_CHATFLOW } = require('@/store/actions')
        const a = canvasReducer(initialState, { type: SET_CHATFLOW, chatflow: { id: 'a' } })
        const withWarnings = canvasReducer(a, { type: SET_MEDIA_WARNINGS, mediaWarnings: { n1: ['x'] } })
        expect(canvasReducer(withWarnings, { type: SET_CHATFLOW, chatflow: { id: 'a', name: 'renamed' } }).mediaWarnings).toEqual({
            n1: ['x']
        })
        expect(canvasReducer(withWarnings, { type: SET_CHATFLOW, chatflow: { id: 'b' } }).mediaWarnings).toEqual({})
    })
})
