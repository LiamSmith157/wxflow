import dashboard from './dashboard'
import agentsettings from './agentsettings'
import en from '@/i18n/locales/en/menu.json'
import zhCN from '@/i18n/locales/zh-CN/menu.json'

jest.mock('@tabler/icons-react', () => new Proxy({}, { get: (_, key) => (key === '__esModule' ? undefined : () => null) }))

const flatten = (node) => [node, ...(node.children || []).flatMap(flatten)]

describe('menu items', () => {
    it('keeps the same entries, order and urls as before translation was introduced', () => {
        const entries = flatten(dashboard).map(({ id, url }) => [id, url])
        expect(entries).toEqual([
            ['dashboard', undefined],
            ['primary', undefined],
            ['agentflows', '/agentflows'],
            ['executions', '/executions'],
            ['tools', '/tools'],
            ['credentials', '/credentials'],
            ['variables', '/variables'],
            ['apikey', '/apikey'],
            ['document-stores', '/document-stores'],
            ['evaluations', undefined],
            ['datasets', '/datasets'],
            ['evaluators', '/evaluators'],
            ['evaluations', '/evaluations'],
            ['management', undefined],
            ['sso', '/sso-config'],
            ['roles', '/roles'],
            ['users', '/users'],
            ['workspaces', '/workspaces'],
            ['login-activity', '/login-activity'],
            ['others', undefined],
            ['logs', '/logs'],
            ['account', '/account']
        ])
    })

    it('keeps the agent settings entries', () => {
        expect(agentsettings.children.map((c) => c.id)).toEqual([
            'viewMessages',
            'viewLeads',
            'chatflowConfiguration',
            'duplicateChatflow',
            'loadChatflow',
            'exportChatflow',
            'deleteChatflow'
        ])
    })

    it('uses a menu:* i18n key as every non-empty title and defines it in both languages', () => {
        const titles = [...flatten(dashboard), ...flatten(agentsettings)].map((n) => n.title).filter(Boolean)
        expect(titles.length).toBeGreaterThan(0)
        titles.forEach((title) => {
            expect(title).toMatch(/^menu:/)
            const key = title.replace('menu:', '')
            expect(en[key]).toBeTruthy()
            expect(zhCN[key]).toBeTruthy()
        })
    })
})
