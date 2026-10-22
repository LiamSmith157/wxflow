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
            ['resources', '/resources'],
            ['apikey', '/apikey'],
            ['document-stores', '/document-stores'],
            ['channel-instances', '/channel-instances'],
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

    it('puts Channel Instances behind the channelInstances:view permission', () => {
        const entry = flatten(dashboard).find((n) => n.id === 'channel-instances')
        expect(entry.permission).toBe('channelInstances:view')
        expect(entry.title).toBe('menu:channelInstances')
        expect(en.channelInstances).toBe('Channel Instances')
        expect(zhCN.channelInstances).toBe('渠道实例')
    })

    it('puts Resources right after Variables, behind the resources:view permission', () => {
        const entries = flatten(dashboard).map((n) => n.id)
        expect(entries.indexOf('resources')).toBe(entries.indexOf('variables') + 1)
        const entry = flatten(dashboard).find((n) => n.id === 'resources')
        expect(entry.permission).toBe('resources:view')
        expect(entry.title).toBe('menu:resources')
        expect(en.resources).toBe('Resources')
        expect(zhCN.resources).toBe('资源库')
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
