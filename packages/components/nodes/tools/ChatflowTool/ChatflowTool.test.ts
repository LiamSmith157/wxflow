const { nodeClass: ChatflowTool } = require('./ChatflowTool')

const makeOptions = (rows: Array<{ id: string; name: string }>, searchOptions?: Record<string, unknown>) => {
    const findBy = jest.fn().mockResolvedValue(rows)
    const options = {
        appDataSource: { getRepository: jest.fn().mockReturnValue({ findBy }) },
        databaseEntities: { ChatFlow: class ChatFlow {} },
        searchOptions
    }
    return { options, findBy }
}

describe('ChatflowTool listChatflows', () => {
    it('only looks up AGENTFLOW flows and keeps the workspace filter', async () => {
        const { options, findBy } = makeOptions([], { workspaceId: 'ws-1' })

        await new ChatflowTool().loadMethods.listChatflows({}, options)

        expect(findBy).toHaveBeenCalledWith({ workspaceId: 'ws-1', type: 'AGENTFLOW' })
    })

    it('does not let the search options override the AGENTFLOW restriction', async () => {
        const { options, findBy } = makeOptions([], { type: 'MULTIAGENT' })

        await new ChatflowTool().loadMethods.listChatflows({}, options)

        expect(findBy).toHaveBeenCalledWith({ type: 'AGENTFLOW' })
    })

    it('labels every entry as AgentflowV2', async () => {
        const { options } = makeOptions([{ id: 'a', name: 'Alpha' }])

        const result = await new ChatflowTool().loadMethods.listChatflows({}, options)

        expect(result).toEqual([{ label: 'Alpha', name: 'a', description: 'AgentflowV2' }])
    })

    it('returns nothing when there is no data source', async () => {
        const result = await new ChatflowTool().loadMethods.listChatflows({}, {})

        expect(result).toEqual([])
    })
})
