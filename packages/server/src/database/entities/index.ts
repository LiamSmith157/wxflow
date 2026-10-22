import { ChatFlow } from './ChatFlow'
import { ChatMessage } from './ChatMessage'
import { ChatMessageFeedback } from './ChatMessageFeedback'
import { Credential } from './Credential'
import { Tool } from './Tool'
import { Variable } from './Variable'
import { DocumentStore } from './DocumentStore'
import { DocumentStoreFileChunk } from './DocumentStoreFileChunk'
import { Lead } from './Lead'
import { UpsertHistory } from './UpsertHistory'
import { Dataset } from './Dataset'
import { DatasetRow } from './DatasetRow'
import { EvaluationRun } from './EvaluationRun'
import { Evaluation } from './Evaluation'
import { Evaluator } from './Evaluator'
import { ApiKey } from './ApiKey'
import { Execution } from './Execution'
import { CustomMcpServer } from './CustomMcpServer'
import { LoginActivity, WorkspaceShared, WorkspaceUsers } from '../../enterprise/database/entities/EnterpriseEntities'
import { User } from '../../enterprise/database/entities/user.entity'
import { Organization } from '../../enterprise/database/entities/organization.entity'
import { Role } from '../../enterprise/database/entities/role.entity'
import { OrganizationUser } from '../../enterprise/database/entities/organization-user.entity'
import { Workspace } from '../../enterprise/database/entities/workspace.entity'
import { WorkspaceUser } from '../../enterprise/database/entities/workspace-user.entity'
import { LoginMethod } from '../../enterprise/database/entities/login-method.entity'
import { LoginSession } from '../../enterprise/database/entities/login-session.entity'
import { ScheduleRecord } from './ScheduleRecord'
import { ScheduleTriggerLog } from './ScheduleTriggerLog'
import { ChannelInstance } from './ChannelInstance'
import { ChannelSubscription } from './ChannelSubscription'
import { ChannelSetting } from './ChannelSetting'

export const entities = {
    ChatFlow,
    ChatMessage,
    ChatMessageFeedback,
    Credential,
    Tool,
    Variable,
    UpsertHistory,
    DocumentStore,
    DocumentStoreFileChunk,
    Lead,
    Dataset,
    DatasetRow,
    Evaluation,
    EvaluationRun,
    Evaluator,
    ApiKey,
    User,
    WorkspaceUsers,
    LoginActivity,
    WorkspaceShared,
    Execution,
    CustomMcpServer,
    Organization,
    Role,
    OrganizationUser,
    Workspace,
    WorkspaceUser,
    LoginMethod,
    LoginSession,
    ScheduleRecord,
    ScheduleTriggerLog,
    ChannelInstance,
    ChannelSubscription,
    ChannelSetting
}
