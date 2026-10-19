const { nodeClass: ExecuteFlow } = require('./ExecuteFlow')

const makeOptions = (rows: Array<{ id: string; name: string }>, searchOptions?: Record<string, unknown>) => {
    const findBy = jest.fn().mockResolvedValue(rows)
    const options = {
        appDataSource: { getRepository: jest.fn().mockReturnValue({ findBy }) },
        databaseEntities: { ChatFlow: class ChatFlow {} },
        searchOptions
    }
    return { options, findBy }
}

describe('ExecuteFlow listFlows', () => {
    it('only looks up AGENTFLOW flows and keeps the workspace filter', async () => {
        const { options, findBy } = makeOptions([], { workspaceId: 'ws-1' })

        await new ExecuteFlow().loadMethods.listFlows({}, options)

        expect(findBy).toHaveBeenCalledWith({ workspaceId: 'ws-1', type: 'AGENTFLOW' })
    })

    it('does not let the search options override the AGENTFLOW restriction', async () => {
        const { options, findBy } = makeOptions([], { type: 'CHATFLOW' })

        await new ExecuteFlow().loadMethods.listFlows({}, options)

        expect(findBy).toHaveBeenCalledWith({ type: 'AGENTFLOW' })
    })

    it('labels every entry as Agentflow V2 and sorts by name', async () => {
        const { options } = makeOptions([
            { id: 'b', name: 'Zeta' },
            { id: 'a', name: 'Alpha' }
        ])

        const result = await new ExecuteFlow().loadMethods.listFlows({}, options)

        expect(result).toEqual([
            { label: 'Alpha', name: 'a', description: 'Agentflow V2' },
            { label: 'Zeta', name: 'b', description: 'Agentflow V2' }
        ])
    })

    it('returns nothing when there is no data source', async () => {
        const result = await new ExecuteFlow().loadMethods.listFlows({}, {})

        expect(result).toEqual([])
    })
})
