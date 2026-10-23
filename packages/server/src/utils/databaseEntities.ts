// The entities handed to component nodes (load methods, node runs) as `options.databaseEntities`. A node looks one up by
// name and quietly gets nothing when it is missing here, so every entity a node reads must be listed.
// Kept out of utils/index.ts so tests can check it without loading the whole server.
import type { IDatabaseEntity } from 'wxflow-components'
import { ChatFlow } from '../database/entities/ChatFlow'
import { ChatMessage } from '../database/entities/ChatMessage'
import { Credential } from '../database/entities/Credential'
import { Tool } from '../database/entities/Tool'
import { Lead } from '../database/entities/Lead'
import { Variable } from '../database/entities/Variable'
import { DocumentStore } from '../database/entities/DocumentStore'
import { DocumentStoreFileChunk } from '../database/entities/DocumentStoreFileChunk'
import { CustomMcpServer } from '../database/entities/CustomMcpServer'
import { ChannelInstance } from '../database/entities/ChannelInstance'
import { Resource } from '../database/entities/Resource'

export const databaseEntities: IDatabaseEntity = {
    ChatFlow: ChatFlow,
    ChatMessage: ChatMessage,
    Tool: Tool,
    Credential: Credential,
    Lead: Lead,
    Variable: Variable,
    DocumentStore: DocumentStore,
    DocumentStoreFileChunk: DocumentStoreFileChunk,
    CustomMcpServer: CustomMcpServer,
    ChannelInstance: ChannelInstance,
    Resource: Resource
}
