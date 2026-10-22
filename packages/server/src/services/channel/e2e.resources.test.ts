// End-to-end: a flow "WeChat Event -> Send Image" whose image is a resource of the library. A simulated
// AIHelpLib.dll dials the real WeChat gateway; the resource is uploaded through the real resource service and
// resolved by the real media resolver (with the `res://` source registered the way the server does it), so what the
// DLL is asked to open is the stored file. Only storage (in-memory repositories) and the flow executor are replaced.
import fs from 'fs'
import net from 'net'
import os from 'os'
import path from 'path'
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

import { ChannelHub } from '../../channels/ChannelHub'
import { ChannelRegistry } from '../../channels/ChannelRegistry'
import { createChannelSender } from '../../channels/ChannelSender'
import { createChannelRuntime } from '../../channels/runtime'
import { MediaResolver } from '../../channels/media/resolver'
import { registerResourceSource } from '../../channels/media/resourceSource'
import { getGatewayStatus, startWeChatGateway, stopWeChatGateway } from '../../channels/wechat/gatewayService'
import { ChannelInstance } from '../../database/entities/ChannelInstance'
import { ChatFlow } from '../../database/entities/ChatFlow'
import { Workspace } from '../../enterprise/database/entities/workspace.entity'
import { utilBuildChatflow } from '../../utils/buildChatflow'
import { createChannelInstanceService } from '../channel-instances/core'
import { createResourceService } from '../resources/core'
import { uploadDir } from '../resources/store'
import { createChannelDispatcher } from './dispatcher'
import { runChannelFlow } from './runFlow'
import { createChannelSettingsService } from './settings'
import { createChannelSubscriptionService } from './subscriptions'

const { resolveVariables } = require('../../utils/buildAgentflow')
const { nodeClass: SendImageNode } = require('../../../../components/nodes/agentflow/WeChat/SendImage')

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
        if (!e.id) e.id = `id-${++this.seq}`
        if (!this.rows.includes(e)) {
            e.createdDate = new Date(this.seq)
            this.rows.push(e)
        }
        e.updatedDate = new Date()
        return e
    }
    async remove(e: any) {
        this.rows = this.rows.filter((r) => r !== e)
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
        // what the real DLL does with send.image: it opens the file at the given path right now
        const opened = msg.params?.path && fs.existsSync(msg.params.path) ? fs.readFileSync(msg.params.path) : undefined
        requests.push({ ...msg, opened })
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

const flowWith = (media: string) =>
    JSON.stringify({
        nodes: [
            {
                id: 'startAgentflow_0',
                data: { name: 'startAgentflow', inputs: { startInputType: 'wechatEvent', wechatEventType: 'msg.insert' } }
            },
            {
                id: 'wechatSendImageAgentflow_0',
                data: { name: 'wechatSendImageAgentflow', inputs: { wechatTo: '{{ $wechat.talker }}', wechatMedia: media } }
            }
        ],
        edges: [
            { source: 'startAgentflow_0', target: 'wechatSendImageAgentflow_0', sourceHandle: 'startAgentflow_0-output-startAgentflow' }
        ]
    })

const PNG = (marker: number) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(56, marker)])

describe('Send Image with a library resource, end to end', () => {
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

    const actor = { workspaceId: WS }
    let resourcesRoot: string
    let mediaRoot: string
    let resources: ReturnType<typeof createResourceService>
    let resolver: MediaResolver
    let currentFlow = flowWith('')
    const executions: Array<{ error?: string; sent?: any }> = []
    let dispatcher: ReturnType<typeof createChannelDispatcher>
    let dll: Awaited<ReturnType<typeof connectDll>>
    let posterId = ''

    const upload = (content: Buffer, originalName: string) => {
        fs.mkdirSync(uploadDir(resourcesRoot), { recursive: true })
        const file = path.join(uploadDir(resourcesRoot), `upload-${Math.random().toString(16).slice(2)}`)
        fs.writeFileSync(file, content)
        return { path: file, originalName }
    }

    /** Stand-in for utilBuildChatflow: runs the saved flow with the real Send Image node and records what happened */
    const executeFlow = async (req: any) => {
        const event = req.body.wechat
        const record: { error?: string; sent?: any } = {}
        executions.push(record)
        const channels = createChannelRuntime(
            {
                registry,
                sender,
                resolver,
                config: { mediaRoot, maxDownloadBytes: 1024, sendWaitSeconds: 5, fetchedRetentionDays: 7 },
                listWorkspaceInstances: (ws, channel) => instances.listWorkspaceInstances(ws, channel),
                gatewayStatus: getGatewayStatus
            },
            { workspaceId: WS, event }
        )
        const node = JSON.parse(currentFlow).nodes.find((n: any) => n.id === 'wechatSendImageAgentflow_0')
        const data: any = {
            id: node.id,
            inputs: { ...node.data.inputs },
            // the same flags as the real node: the media field is a dropdown that still takes variables
            inputParams: [
                { name: 'wechatTo', type: 'string', acceptVariable: true },
                { name: 'wechatMedia', type: 'asyncOptions', freeSolo: true, acceptVariable: true }
            ],
            inputAnchors: []
        }
        const resolved = (
            await resolveVariables(data, '', {}, undefined, [], [], '', [], {}, undefined, undefined, undefined, undefined, event)
        ).inputs
        try {
            const result = await new SendImageNode().run({ ...data, inputs: resolved }, '', {
                chatflowid: req.params.id,
                channels,
                agentflowRuntime: { wechat: event, state: {} }
            })
            record.sent = result.output
        } catch (e) {
            record.error = (e as Error).message
        }
    }

    beforeAll(async () => {
        resourcesRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wxflow-e2e-resources-'))
        mediaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wxflow-e2e-media-'))
        resources = createResourceService({
            getDataSource: () => dataSource,
            config: () => ({ root: resourcesRoot, maxBytes: 1024 * 1024 })
        })
        resolver = new MediaResolver()
        registerResourceSource(resolver, resources)

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

        await waitFor(() => (repos.get(ChannelInstance)?.rows.length ?? 0) === 1)
        await instances.assignInstance(repos.get(ChannelInstance)!.rows[0].id, WS, { workspaceId: WS, canManage: true })
        await subscriptions.syncForChatflow(FLOW_ID, WS, currentFlow)
        await subscriptions.setEnabled(FLOW_ID, WS, true)
    })

    afterAll(async () => {
        dll?.ws.terminate()
        await stopWeChatGateway(registry)
        fs.rmSync(resourcesRoot, { recursive: true, force: true })
        fs.rmSync(mediaRoot, { recursive: true, force: true })
    })

    /** Push a message and wait until the flow has run (and, when it sends, until the DLL got the request) */
    const trigger = async (text: string, expectRequest: boolean) => {
        const executionsBefore = executions.length
        const requestsBefore = dll.requests.length
        dll.pushMessage('wxid_customer', text)
        await waitFor(() => executions.length === executionsBefore + 1)
        if (expectRequest) await waitFor(() => dll.requests.length === requestsBefore + 1)
        await dispatcher.whenIdle()
        return { execution: executions[executions.length - 1], request: dll.requests[dll.requests.length - 1] }
    }

    it('sends the stored file of a resource picked from the list', async () => {
        const created = await resources.create(actor, upload(PNG(1), '海报 北京.png'), { name: '海报-北京', groupName: '海报' })
        posterId = created.id
        currentFlow = flowWith(`res://id/${posterId}`)

        const { execution, request } = await trigger('来一张海报', true)
        const stored = resources.pathOf({ workspaceId: WS, id: posterId, ext: '.png' })
        expect(request).toMatchObject({ method: 'send.image', params: { wxid: 'wxid_customer', path: stored } })
        expect(request.opened).toEqual(PNG(1))
        expect(execution.sent).toMatchObject({ state: 'ok', instance: BOT, to: 'wxid_customer' })
        // a library file is never a temporary file: it must still be there after the send
        expect(fs.existsSync(stored)).toBe(true)
    })

    it('sends the new file after the resource was replaced, with the flow untouched', async () => {
        await resources.replaceFile(actor, posterId, upload(PNG(2), 'neu.png'))

        const { request } = await trigger('再来一张', true)
        expect(request.params.path).toBe(resources.pathOf({ workspaceId: WS, id: posterId, ext: '.png' }))
        expect(request.opened).toEqual(PNG(2))
    })

    it('still finds the resource by its id after it was renamed', async () => {
        await resources.update(actor, posterId, { name: '海报-北京-秋季' })
        const { request } = await trigger('改名后', true)
        expect(request.opened).toEqual(PNG(2))
    })

    it('picks the resource named by a variable that is filled from the message', async () => {
        currentFlow = flowWith('res://name/{{ $wechat.content }}')
        const { request } = await trigger('海报-北京-秋季', true)
        expect(request.opened).toEqual(PNG(2))
    })

    it('lists the flow as a user of the resource', async () => {
        dataSource
            .getRepository(ChatFlow)
            .rows.push({ id: FLOW_ID, name: '海报自动回复', workspaceId: WS, flowData: flowWith(`res://id/${posterId}`) })
        expect(await resources.usages(actor, posterId)).toEqual([{ id: FLOW_ID, name: '海报自动回复', via: 'id' }])
        expect((await resources.list(actor))[0].usageCount).toBe(1)
    })

    it('fails the node with a clear message, and sends nothing, when the name does not exist', async () => {
        const requestsBefore = dll.requests.length
        const { execution } = await trigger('海报-拉萨', false)
        expect(execution.error).toBe('资源 `海报-拉萨` 不存在')
        expect(dll.requests).toHaveLength(requestsBefore)
    })

    it('fails the node with "resource not found" after the resource was deleted, and sends nothing', async () => {
        currentFlow = flowWith(`res://id/${posterId}`)
        await resources.remove(actor, posterId)
        const requestsBefore = dll.requests.length

        const { execution } = await trigger('还有海报吗', false)
        expect(execution.error).toContain('资源不存在')
        expect(execution.error).toContain(`res://id/${posterId}`)
        expect(dll.requests).toHaveLength(requestsBefore)
    })
})
