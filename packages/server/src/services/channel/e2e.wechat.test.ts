// End-to-end: a simulated AIHelpLib.dll dials the real WeChat gateway, the instance is assigned to a workspace, a
// "WeChat Event -> Cooldown -> Send Text" flow is enabled, and inbound messages go through the real hub, dispatcher,
// subscription/instance/settings services, channel runtime, sender and the real Cooldown and Send Text nodes.
// Only storage (in-memory repositories) and the flow executor (a small stand-in for utilBuildChatflow) are replaced.
import net from 'net'
import { ReadableStream } from 'stream/web'
import { WebSocket } from 'ws'

// @langchain/core expects the web streams globals, which Jest's node environment does not expose
Object.assign(globalThis, { ReadableStream })
// The components package pulls in optional peers that are not needed here
jest.mock('wxflow-components', () => new Proxy({ __esModule: true }, { get: (t: any, k: string) => (k in t ? t[k] : jest.fn()) }))
jest.mock('../../utils/logger', () => ({
    __esModule: true,
    default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}))
jest.mock('../../utils/getRunningExpressApp', () => ({ getRunningExpressApp: jest.fn() }))
jest.mock('../../utils/buildChatflow', () => ({ utilBuildChatflow: jest.fn() }))

import { ChatType } from '../../Interface'
import { ChannelHub } from '../../channels/ChannelHub'
import { ChannelRegistry } from '../../channels/ChannelRegistry'
import { createChannelSender } from '../../channels/ChannelSender'
import { createChannelRuntime } from '../../channels/runtime'
import { MediaResolver } from '../../channels/media/resolver'
import { getGatewayStatus, startWeChatGateway, stopWeChatGateway } from '../../channels/wechat/gatewayService'
import { ChannelInstance } from '../../database/entities/ChannelInstance'
import { ChannelSetting } from '../../database/entities/ChannelSetting'
import { ChannelSubscription } from '../../database/entities/ChannelSubscription'
import { Workspace } from '../../enterprise/database/entities/workspace.entity'
import { utilBuildChatflow } from '../../utils/buildChatflow'
import { createChannelInstanceService } from '../channel-instances/core'
import { createChannelDispatcher } from './dispatcher'
import { runChannelFlow } from './runFlow'
import { createChannelSettingsService } from './settings'
import { createChannelSubscriptionService } from './subscriptions'

const { resolveVariables } = require('../../utils/buildAgentflow')
const { nodeClass: CooldownNode, resetCooldownWindows } = require('../../../../components/nodes/agentflow/Cooldown/Cooldown')
const { nodeClass: SendTextNode } = require('../../../../components/nodes/agentflow/WeChat/SendText')

jest.setTimeout(30000)

const WS = 'ws-1'
const BOT = 'wxid_bot'
const FLOW_ID = 'flow-1'
const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }

/** Equality-only in-memory repository, enough for the services */
class FakeRepo {
    rows: any[] = []
    private seq = 0
    create(p: any) {
        return { ...p }
    }
    async save(e: any) {
        if (!e.id) {
            e.id = `id-${++this.seq}`
            e.createdDate = new Date(this.seq)
            this.rows.push(e)
        }
        return e
    }
    private match(r: any, where: any = {}) {
        return Object.entries(where).every(([k, v]) => r[k] === v)
    }
    async findOne({ where }: any) {
        return this.rows.find((r) => this.match(r, where)) ?? null
    }
    async find({ where }: any = {}) {
        return this.rows.filter((r) => this.match(r, where))
    }
    async delete(where: any) {
        this.rows = this.rows.filter((r) => !this.match(r, where))
    }
}

const freePort = (): Promise<number> =>
    new Promise((resolve) => {
        const s = net.createServer().listen(0, '127.0.0.1', () => {
            const port = (s.address() as net.AddressInfo).port
            s.close(() => resolve(port))
        })
    })

const waitFor = async (cond: () => boolean, timeoutMs = 5000) => {
    const start = Date.now()
    while (!cond()) {
        if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for condition')
        await new Promise((r) => setTimeout(r, 10))
    }
}

/** The simulated DLL: answers every request with ok + a job id, then reports the job as sent */
const connectDll = async (port: number, wxid: string) => {
    const requests: any[] = []
    const ws = new WebSocket(`ws://127.0.0.1:${port}`)
    await new Promise<void>((resolve, reject) => {
        ws.once('open', () => resolve())
        ws.once('error', reject)
    })
    let seq = 100
    ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString())
        if (msg.type !== 'req') return
        requests.push(msg)
        const jobid = `job-${requests.length}`
        ws.send(JSON.stringify({ type: 'res', id: msg.id, ok: true, result: { jobid } }))
        ws.send(JSON.stringify({ type: 'evt', seq: ++seq, event: 'job.done', data: { jobid, state: 'sent' } }))
    })
    ws.send(JSON.stringify({ type: 'hello', pid: 4242, version: '0.23.0' }))
    ws.send(JSON.stringify({ type: 'identify', wxid }))
    const pushMessage = (talker: string, text: string) =>
        ws.send(
            JSON.stringify({
                type: 'evt',
                seq: ++seq,
                event: 'msg.insert',
                data: {
                    op: 'insert',
                    table: 'Msg_x',
                    talker,
                    sender: talker,
                    direction: 'in',
                    row: {
                        local_id: String(seq),
                        server_id: String(8970000000000000000n + BigInt(seq)),
                        local_type: '1',
                        sort_seq: String(Date.now()),
                        message_content: { b64: Buffer.from(text, 'utf-8').toString('base64'), enc: 'raw', n: text.length }
                    }
                }
            })
        )
    return { ws, requests, pushMessage }
}

const flowData = JSON.stringify({
    nodes: [
        {
            id: 'startAgentflow_0',
            data: { name: 'startAgentflow', inputs: { startInputType: 'wechatEvent', wechatEventType: 'msg.insert' } }
        },
        { id: 'cooldownAgentflow_0', data: { name: 'cooldownAgentflow', inputs: { cooldownMinutes: 10 } } },
        {
            id: 'wechatSendTextAgentflow_0',
            data: {
                name: 'wechatSendTextAgentflow',
                inputs: { wechatTo: '{{ $wechat.talker }}', wechatText: '已收到:{{ $wechat.content }}' }
            }
        }
    ],
    edges: [
        { source: 'startAgentflow_0', target: 'cooldownAgentflow_0', sourceHandle: 'startAgentflow_0-output-startAgentflow' },
        { source: 'cooldownAgentflow_0', target: 'wechatSendTextAgentflow_0', sourceHandle: 'cooldownAgentflow_0-output-pass' }
    ]
})

describe('WeChat channel end to end', () => {
    const hub = new ChannelHub((e) => logger.error(`hub: ${(e as Error).message}`))
    const registry = new ChannelRegistry()
    const repos = new Map<any, FakeRepo>()
    const dataSource = {
        getRepository: (entity: any) => (repos.has(entity) ? repos.get(entity)! : repos.set(entity, new FakeRepo()).get(entity)!)
    }
    const instances = createChannelInstanceService(() => dataSource)
    const settings = createChannelSettingsService(() => dataSource)
    const subscriptions = createChannelSubscriptionService(() => dataSource)
    const sender = createChannelSender({ registry, getSettings: (ws) => settings.getSettings(ws) })
    const executions: Array<{
        chatflowId: string
        chatId: string
        chatType: unknown
        steps: Array<{ node: string; branch?: string; output?: any }>
    }> = []
    let dispatcher: ReturnType<typeof createChannelDispatcher>
    let dll: Awaited<ReturnType<typeof connectDll>>

    /** Stand-in for utilBuildChatflow: runs the saved flow node by node with the real node classes and records an execution */
    const executeFlow = async (req: any, _internal: boolean, chatType: unknown) => {
        const chatflowId = req.params.id as string
        const event = req.body.wechat
        const { nodes, edges } = JSON.parse(flowData)
        const record = { chatflowId, chatId: req.body.chatId, chatType, steps: [] as any[] }
        executions.push(record)
        const channels = createChannelRuntime(
            {
                registry,
                sender,
                resolver: new MediaResolver(),
                config: {
                    exchange: { dir: '/exchange', hostDir: 'C:\\wxflow\\exchange', mapped: true },
                    maxDownloadBytes: 1024,
                    sendWaitSeconds: 5,
                    fetchedRetentionDays: 7
                },
                listWorkspaceInstances: (ws, channel) => instances.listWorkspaceInstances(ws, channel),
                gatewayStatus: getGatewayStatus
            },
            { workspaceId: WS, event }
        )
        const options = { chatflowid: chatflowId, channels, agentflowRuntime: { wechat: event, state: {} } }
        const classes: Record<string, any> = { cooldownAgentflow: CooldownNode, wechatSendTextAgentflow: SendTextNode }

        let current = edges.find((e: any) => e.source === 'startAgentflow_0')
        while (current) {
            const node = nodes.find((n: any) => n.id === current.target)
            const instance = new classes[node.data.name]()
            const data: any = {
                id: node.id,
                inputs: { ...node.data.inputs },
                inputParams: Object.keys(node.data.inputs).map((name) => ({ name, acceptVariable: true })),
                inputAnchors: []
            }
            const resolved = (
                await resolveVariables(data, '', {}, undefined, [], [], '', [], {}, undefined, undefined, undefined, undefined, event)
            ).inputs
            const result = await instance.run({ ...data, inputs: resolved }, '', options)
            const conditions: Array<{ isFulfilled: boolean }> | undefined = result.output?.conditions
            const branchIndex = conditions ? conditions.findIndex((c) => c.isFulfilled) : -1
            const branch = branchIndex >= 0 ? instance.outputs[branchIndex].name : undefined
            record.steps.push({ node: node.data.name, branch, output: result.output })
            current = edges.find((e: any) => e.source === node.id && (!branch || e.sourceHandle.endsWith(`-output-${branch}`)))
        }
    }

    beforeAll(async () => {
        repos.set(Workspace, new FakeRepo())
        repos.get(Workspace)!.rows.push({ id: WS, name: 'Operations' })
        ;(utilBuildChatflow as jest.Mock).mockImplementation(executeFlow)

        hub.subscribeInstanceChanges((channel, pool) => instances.syncPool(channel, pool))
        dispatcher = createChannelDispatcher({
            getInstanceWorkspace: (channel, key) => instances.getInstanceWorkspace(channel, key),
            getSettings: (ws) => settings.getSettings(ws),
            findEnabled: (ws, channel, eventType) => subscriptions.findEnabled(ws, channel, eventType),
            runFlow: (subscription, event) => runChannelFlow(subscription, event),
            logger
        })
        hub.subscribeEvents((event) => dispatcher.handleEvent(event))

        const port = await freePort()
        const status = await startWeChatGateway({ registry, sink: hub, logger, env: { WECHAT_GATEWAY_PORT: String(port) } })
        expect(status.state).toBe('running')
        dll = await connectDll(port, BOT)
    })

    afterAll(async () => {
        dll?.ws.terminate()
        await stopWeChatGateway(registry)
        resetCooldownWindows()
    })

    it('records the instance when the simulated DLL comes online, unassigned', async () => {
        await waitFor(() => (repos.get(ChannelInstance)?.rows.length ?? 0) === 1)
        const [row] = repos.get(ChannelInstance)!.rows
        expect(row).toMatchObject({ channel: 'wechat', instanceKey: BOT, workspaceId: null })
        expect(instances.isOnline('wechat', BOT)).toBe(true)
    })

    it('ignores messages of an instance nobody has assigned to a workspace', async () => {
        await subscriptions.syncForChatflow(FLOW_ID, WS, flowData)
        await subscriptions.setEnabled(FLOW_ID, WS, true)
        dll.pushMessage('wxid_customer', '在吗')
        await waitFor(() => logger.debug.mock.calls.some(([m]) => String(m).includes('未分配工作区')))
        await dispatcher.whenIdle()
        expect(executions).toHaveLength(0)
        expect(dll.requests).toHaveLength(0)
    })

    it('runs the flow and sends the reply once the instance is assigned and the flow is enabled', async () => {
        const [row] = repos.get(ChannelInstance)!.rows
        await instances.assignInstance(row.id, WS, { workspaceId: WS, canManage: true })

        dll.pushMessage('wxid_customer', '报价多少')
        await waitFor(() => dll.requests.length === 1)
        await dispatcher.whenIdle()

        expect(dll.requests[0]).toMatchObject({
            type: 'req',
            method: 'send.text',
            params: { wxid: 'wxid_customer', content: '已收到:报价多少' }
        })
        expect(executions).toHaveLength(1)
        expect(executions[0]).toMatchObject({ chatflowId: FLOW_ID, chatType: ChatType.CHANNEL, chatId: `wechat:${BOT}:wxid_customer` })
        expect(executions[0].steps.map((s) => [s.node, s.branch])).toEqual([
            ['cooldownAgentflow', 'pass'],
            ['wechatSendTextAgentflow', undefined]
        ])
        expect(executions[0].steps[1].output).toMatchObject({ state: 'ok', jobId: 'job-1', instance: BOT, to: 'wxid_customer' })
    })

    it('takes the cooling-down branch for a second message of the same conversation', async () => {
        dll.pushMessage('wxid_customer', '还在吗')
        await waitFor(() => executions.length === 2)
        await dispatcher.whenIdle()

        expect(dll.requests).toHaveLength(1)
        expect(executions[1].steps.map((s) => [s.node, s.branch])).toEqual([['cooldownAgentflow', 'cooling']])
        expect(executions[1].steps[0].output).toMatchObject({ passed: false })
    })

    it('still answers a different conversation', async () => {
        dll.pushMessage('wxid_other', '你好')
        await waitFor(() => dll.requests.length === 2)
        await dispatcher.whenIdle()
        expect(dll.requests[1].params).toEqual({ wxid: 'wxid_other', content: '已收到:你好' })
        expect(executions).toHaveLength(3)
    })

    it('does not start the flow when the channel master switch is off', async () => {
        await settings.updateSettings(WS, { masterEnabled: false })
        dll.pushMessage('wxid_third', '有人吗')
        await waitFor(() => logger.debug.mock.calls.some(([m]) => String(m).includes('总闸已关闭')))
        await dispatcher.whenIdle()
        expect(executions).toHaveLength(3)
        expect(dll.requests).toHaveLength(2)
        expect(repos.get(ChannelSetting)!.rows).toHaveLength(1)
        expect(repos.get(ChannelSubscription)!.rows).toHaveLength(1)
    })
})
