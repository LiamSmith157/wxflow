# Design

## Context

动机和范围见 proposal.md。设计受以下现状约束：

-   **wxflow 的流程从 Start 节点开始。** `Start.ts` 的 `startInputType` 已有 `chatInput`、`formInput`、`webhookTrigger`、`scheduleInput`，各自的参数用 `show: { startInputType }` 控制显隐。定时触发的做法是：保存流程时由 `services/chatflows` 同步一条 `ScheduleRecord`（含 `workspaceId`），再由 `schedule/ScheduleBeat.ts` 按记录启动运行。
-   **节点面板只显示一个分组。** `views/agentflowsv2/AddNodes.jsx` 只保留 `category === 'Agent Flows'` 的节点；画布图标来自 `store/constant.js` 的 `AGENTFLOW_ICONS`（Tabler 图标组件加颜色）。
-   **多租户与多数据库。** 实体带 `workspaceId`，权限由 `enterprise/rbac` 控制；迁移分 sqlite、postgres、mysql、mariadb 四套。
-   **部署有两种模式。** 默认在主进程内执行流程；`MODE=QUEUE` 时由 BullMQ worker 执行，可以多副本部署。
-   **部署方式。** wxflow 与微信在同一台 Windows 上：直接安装，或运行在 Docker Desktop（WSL2，Linux 容器）里。流程由运营人员配置。
-   **源项目 `wx_workflow`。** `server/src/engineapi.ts` 定义了引擎和网关之间的接口：`GatewayCalls`（`call` / `pool` / `trackJob` / `getVoiceWav`）和 `EngineSink`（`onEvent` / `onInstanceChange`）。网关为 `gateway.ts`（约 365 行）加 `msgdecode.ts`（zstd 解码），发送类方法为 `send.text|image|file|video|at|webcard|quote`，异步发送通过 `job.done` 事件回写终态。

## Goals / Non-Goals

**Goals:**

-   渠道无关的部分（适配器接口、事件格式、订阅匹配、安全阀）只写一次，以后接入 WhatsApp 时只需新增适配器和节点。
-   微信能力与源项目行为一致，`AIHelpLib.dll` 零改动。
-   不改变 Agentflow"每个流程恰好一个 Start 节点"的前提。

**Non-Goals:**

-   不移植源项目的引擎、执行历史和版本快照，这些由 wxflow 已有的执行记录和流程版本负责。
-   本 change 不支持在队列模式下使用微信节点（见决策 7）。
-   不提供跨工作区共享实例。
-   不支持 wxflow 与微信分别部署在两台机器上。

## Decisions

### 1. 渠道事件作为 Start 的输入类型，不做独立触发节点

Start 新增 `startInputType = 'wechatEvent'`，参数（均用 `show` 只在该类型下显示）：

| 参数                               | 说明                                                                   | 来源                            |
| ---------------------------------- | ---------------------------------------------------------------------- | ------------------------------- |
| 事件类型                           | 收到消息 / 快捷关键字命中 / 会话切换 / 媒体落盘 / 登录 / 登出 / 收付款 | `trigger.*`                     |
| 实例范围                           | 本工作区全部实例，或指定实例                                           | `scopeParam`                    |
| 方向                               | 默认只处理入站，可选入站+出站                                          | `trigger.message`               |
| 会话筛选、会话类型、消息类型       | 仅在"收到消息"时显示                                                   | `trigger.message`               |
| 媒体类型、收付款事件类型、资金流向 | 仅在对应事件下显示                                                     | `trigger.media` / `trigger.pay` |

事件数据作为 Start 的输出交给下游，字段沿用源项目的结构（`talker`、`sender`、`msgType`、`content`、`svrid`、`instance` 等）。下游用 `{{ $wechat.<字段> }}` 引用，做法与 webhook 的 `$webhook.*` 相同：事件放在 `agentflowRuntime.wechat`，由 `buildAgentflow.ts` 的变量解析处理，`ui-component/input/suggestionOption.js` 在变量提示里列出常用字段。

备选：在 WeChat 分组里放 11 个独立的触发节点，与源项目一致。没有选它，因为那需要让流程校验、画布和 `buildAgentflow` 都承认非 Start 的入口；而且以后每加一个渠道，还要再加一批触发节点。

### 2. 渠道适配器接口

把源项目的 `GatewayCalls` / `EngineSink` 改成与渠道无关的版本，放在 `packages/server/src/channels/`：

```
interface ChannelAdapter {
  channel: 'wechat'                          // 以后加 'whatsapp'
  call(instance, method, params, timeoutMs?) // 返回 { ok, result?, error? }
  pool(): ChannelInstanceRef[]
  trackJob(jobId, instance)
  fetchMedia?(instance, kind, ref)           // 微信语音走 voice.* 二进制两帧协议
}
interface ChannelSink {
  onEvent(channel, instance, event, data)
  onInstanceChange(channel, pool)
  onJobDone(channel, jobId, result, instance)
}
```

`WeChatGateway` 实现 `ChannelAdapter`，由 `index.ts` 启动时创建，并注册到 `ChannelRegistry`。节点执行时从 `ChannelRegistry` 取适配器，节点代码不直接依赖 `ws` 或网关实现。这和源项目的设计 D2 一致：测试里用 mock 适配器替换。

网关端口取自环境变量 `WECHAT_GATEWAY_PORT`，默认 `56233`；设置为 `0` 时不启动网关。监听地址取自 `WECHAT_GATEWAY_HOST`，默认 `127.0.0.1`；在 Docker 里设为 `0.0.0.0`（见决策 10）。

### 3. 实例归属工作区

新增实体 `ChannelInstance`：`id`、`channel`、`instanceKey`（微信为 wxid）、`displayName`、`workspaceId`（可空）、`lastSeenAt`。网关发现新实例时插入一条 `workspaceId = null` 的记录；管理员在"渠道实例"页把它分配给工作区。

-   未分配的实例：事件直接丢弃，发送节点也不能选择它。
-   一个实例只属于一个工作区。否则同一条消息会被多个工作区的流程同时回复，而防自环和限速都按实例计算。
-   页面和接口沿用 `enterprise/rbac`，新增 `channelInstances:view` / `channelInstances:manage` 权限。

### 4. 订阅索引，在保存流程时同步

仿照 `ScheduleRecord`：新增实体 `ChannelSubscription`，字段为 `chatflowId`、`workspaceId`、`channel`、`eventType`、`instanceScope`、`filters`（JSON）、`enabled`。`services/chatflows` 在保存、启用、停用、删除流程时，从 Start 节点的输入同步这条记录。启用开关仿照 `CanvasHeader.jsx` 里定时流程的开关；新流程默认未启用，再次保存不改变已有的启用状态，避免运营人员保存一个半成品流程后它就开始回复消息。

事件到达时，`services/channel` 按以下步骤处理：

1. 用 `(channel, instanceKey)` 找到实例所属的工作区。
2. 用 `(workspaceId, channel, eventType, enabled)` 查出订阅。
3. 在内存中逐条检查筛选条件（方向、会话、消息类型）。
4. 对每个命中的流程启动一次运行。

备选：每个事件到达时都去解析全部流程的 `flowData`，也就是源项目 `matchAndRun` 的做法。没有选它，因为在 wxflow 里流程数量和 `flowData` 都可能很大，每条微信消息都解析一遍代价太高。

运行用 `createMockRequest` 构造请求后调用 `utilBuildChatflow`，与 MCP 端点的做法相同，这样执行记录、凭证解析和工作区上下文都沿用现有流程。

### 5. 安全阀放在渠道层

| 安全阀   | 位置                              | 行为                                                                                    |
| -------- | --------------------------------- | --------------------------------------------------------------------------------------- |
| 防自环   | 订阅匹配                          | 方向默认只匹配入站；选了出站时，Start 参数旁显示警告                                    |
| 发送限速 | `ChannelRegistry.call` 的发送方法 | 每实例每分钟上限，默认 20；超限时不发送，节点输出 `skippedAs: 'rate_limited'`，流程继续 |
| 渠道总闸 | `services/channel` 入口           | 关闭后所有渠道事件都不触发流程，发送节点直接跳过                                        |
| 冷却窗口 | Agent Flows 的冷却节点            | 同一（流程，会话）在 N 分钟内只放行一次                                                 |

wxflow 没有现成的按工作区存放配置的表，所以新增实体 `ChannelSetting`（`workspaceId` 唯一，`masterEnabled` 默认开启，`sendRateLimitPerMinute` 默认 20）。总闸和限速都按工作区生效，限速计数按实例计算。

### 6. 发送类节点的异步终态

源项目的发送方法在调用被接受后立即返回 `jobid`，终态稍后通过 `job.done` 事件到达。wxflow 的节点是同步执行的。做法：发送节点调用后最多等待 `job.done` 30 秒（可配置），等到就输出终态（`ok` / `fail`）；超时则输出 `state: 'pending'` 和 `jobId`，流程继续，不阻塞。终态晚到时只写日志，不回写已结束的运行。

备选：像源项目那样把步骤记为 pending，再回写执行记录。没有选它，因为 wxflow 的执行记录没有"步骤稍后改状态"的模型，为此改执行记录的范围太大。

### 7. 只支持非队列模式

网关是一个 WS 服务端，DLL 只连到一个进程。队列模式下流程在 worker 进程执行，worker 拿不到 WS 连接。本 change 的处理：`MODE=QUEUE` 时网关不启动，启动日志说明原因；WeChat 节点执行时返回明确的错误。渠道事件触发的运行固定在主进程执行。

备选：通过 Redis 在 worker 和主进程之间转发调用。可行，但需要新的请求/响应通道和超时处理，留到确实有多副本需求时再做。

### 8. 节点分组与图标

-   WeChat 节点的 `category = 'WeChat'`，`color = '#07C160'`；节点 `name` 以 `wechat` 开头、以 `Agentflow` 结尾，例如 `wechatSendTextAgentflow`。
-   `AddNodes.jsx` 改为按 `['Agent Flows', 'WeChat']` 这个白名单分组并依次显示；搜索时两组都参与。白名单写成常量，以后加 `WhatsApp` 只需追加一项。
-   通用节点（冷却、延时、名单过滤）放在 `Agent Flows`，沿用该分组的配色方式。
-   节点 label 和描述用英文，中文写进 `locales/zh-CN/nodes.json`，与 `console-node-i18n` 的规则一致。

节点清单（图标为 Tabler 组件；"收件人"默认值为触发会话，均支持变量）：

**WeChat 分组**

| 新节点 label        | 源节点                | 图标               | WS 方法                             | 参数                                                                           | 输出                                                      |
| ------------------- | --------------------- | ------------------ | ----------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------- |
| Message Type Router | `logic.msgType`       | `IconArrowsSplit2` | 无                                  | 无                                                                             | 7 个分支：文本、图片、语音、链接、文件、视频、其他/非消息 |
| Send Text           | `action.sendText`     | `IconMessage`      | `send.text`                         | 收件人、内容                                                                   | 发送结果                                                  |
| Send Image          | `action.sendImage`    | `IconPhoto`        | `send.image`                        | 收件人、图片（媒体来源，见决策 10）                                            | 发送结果                                                  |
| Send File           | `action.sendFile`     | `IconPaperclip`    | `send.file`                         | 收件人、文件（媒体来源）                                                       | 发送结果                                                  |
| Send Video          | `action.sendVideo`    | `IconMovie`        | `send.video`                        | 收件人、视频 mp4（媒体来源）、时长（可选）                                     | 发送结果                                                  |
| Send @Mention       | `action.sendAt`       | `IconAt`           | `send.at`                           | 群、正文、@所有人、被@者 wxid（不 @所有人时必填）、被@者昵称（可选）           | 发送结果                                                  |
| Send Link Card      | `action.sendWebcard`  | `IconLink`         | `send.webcard`                      | 收件人、标题、URL、描述（可选）                                                | 发送结果                                                  |
| Quote Reply         | `action.sendQuote`    | `IconQuote`        | `send.quote`                        | 收件人、正文；固定引用触发消息                                                 | 发送结果；不是由消息事件触发时报错                        |
| Search Contacts     | `action.contacts`     | `IconAddressBook`  | `contacts.avatar` / `contacts.list` | 模式（单个联系人 / 全部好友）、wxid（单个时必填）                              | 联系人信息或列表                                          |
| Fetch Image         | `action.fetchImage`   | `IconPhotoDown`    | `image.get`                         | svrid（默认取触发消息）、形态（原图/高清/缩略图）、等待秒数（默认 8，最多 60） | 成功/失败两个分支；成功时输出交换目录内的文件路径         |
| Fetch Voice         | `ai.asr` 的取音频部分 | `IconMicrophone`   | `voice.*` 两帧协议                  | svrid（默认取触发消息）                                                        | 成功/失败两个分支；成功时输出交换目录内的 WAV 路径        |

"发送结果"指 `state`（`ok` / `fail` / `pending` / `rate_limited` / `skipped`）、`jobId` 和错误信息，见决策 5、6；`skipped` 表示总闸关闭。

**Agent Flows 分组（通用）**

| 新节点 label  | 源节点           | 图标            | 参数                                                                                    | 输出                   |
| ------------- | ---------------- | --------------- | --------------------------------------------------------------------------------------- | ---------------------- |
| Cooldown      | `logic.cooldown` | `IconSnowflake` | 窗口分钟数（默认 10）                                                                   | 放行 / 冷却中 两个分支 |
| Delay         | `logic.delay`    | `IconHourglass` | 秒数；或随机区间的下限、上限                                                            | 单出口                 |
| Talker Filter | `logic.filter`   | `IconFilter`    | 过滤字段（发送人 / 会话）、名单模式（白名单 / 黑名单）、名单（支持 `*` 前后缀模糊匹配） | 通过 / 拦截 两个分支   |

Start 节点的"WeChat 事件"输入类型不新增节点，只在参数区使用 `IconBrandWechat`。

与源项目的差异：

-   去掉所有 `saveTo` 参数。源项目把结果写进 `{{vars.xxx}}`，wxflow 用节点输出代替，下游通过节点输出引用来取。
-   冷却和名单过滤在没有会话上下文时（例如由聊天或定时触发）直接放行，并在输出里注明原因。

### 9. 取语音代替 `ai.asr`

源项目的 `ai.asr` 一个节点做两件事：通过 `voice.*` 两帧协议取到 WAV，再送去语音识别。在 wxflow 里拆开：WeChat 分组的 Fetch Voice 只负责取音频，写入交换目录并输出路径；识别交给下游的 LLM/Agent 或现有的语音转文字组件。取图片同理。

### 10. 部署方式与媒体路径

`send.image|file|video` 的参数是 DLL 在 Windows 上读取的文件路径。AIHelpLib 的 WS 协议只有 DLL 到服务器方向的二进制帧（`voice.*`），没有服务器向 DLL 推送文件的方法，而 DLL 不能改动。因此 wxflow 和 DLL 必须共享一个目录。

```
 Windows 主机
 +---------------------------------------------------------------+
 |  微信 + AIHelpLib.dll                                          |
 |     | 拨号 ws://127.0.0.1:56233     （AIHelpLib.json dialPort） |
 |     v                                                         |
 |  Docker Desktop  -p 127.0.0.1:56233:56233                     |
 |  +---------------------------------------------------------+ |
 |  | wxflow 容器    WECHAT_GATEWAY_HOST=0.0.0.0               | |
 |  |   /exchange  <== 挂载 ==>  C:\wxflow\exchange            | |
 |  |      assets/     素材（运营人员在 Windows 上直接放文件）    | |
 |  |      tmp/        URL 下载的临时文件，发送后清理            | |
 |  |      images/     Fetch Image 时 DLL 解密到这里（outDir）   | |
 |  |      voice/      Fetch Voice 写入的 WAV                    | |
 |  |      resources/  预留给下一个 change 的资源库              | |
 |  +---------------------------------------------------------+ |
 +---------------------------------------------------------------+
```

-   **网关监听地址。** 直接安装时监听 `127.0.0.1`。在容器里监听 `0.0.0.0`，端口只映射到主机的 `127.0.0.1`，所以仍然只有本机能连。
-   **路径映射。** `WECHAT_EXCHANGE_DIR` 是 wxflow 看到的交换目录（容器内为 `/exchange`），`WECHAT_EXCHANGE_DIR_HOST` 是同一目录在 Windows 上的路径（`C:\wxflow\exchange`）。发给 DLL 前，把交换目录内的路径换成 Windows 路径；DLL 返回的路径（如 `image.get` 的结果）反向转换。直接安装时两者相同，不设置 `WECHAT_EXCHANGE_DIR_HOST` 即可。
-   **媒体来源解析器。** 媒体参数按顺序识别：

    1. `http(s)://` 开头：用 `secureAxiosRequest` 下载到 `tmp/`，沿用现有的出站访问限制，大小上限可配置，默认 50MB；
    2. 绝对路径：必须位于交换目录内，否则报错；
    3. 其他：视为相对于 `assets/` 的路径。

    解析器提供注册接口，下一个 change 的资源库会注册 `res://` 来源，文件存放在 `resources/` 下。

-   **Fetch Image** 调用 `image.get` 时固定传 `outDir` 为 `images/` 对应的 Windows 路径，保证 wxflow 能读到解密结果。

备选：

-   MinIO 等对象存储：仍然要先下载到交换目录才能发送，解决的是素材管理问题而不是路径问题。素材管理交给下一个 change 的资源库。以后如果需要多机共享，可以再注册一个 `s3://` 来源。
-   本期就移植资源库：参数表单要新增"选择资源"控件，工作量大，会拖慢网关和发送主链路的验证，所以放到下一个 change。

### 11. 面向运营人员的错误提示

流程由运营人员配置，而资源库要到下一个 change 才有，所以本期要让路径错误尽早、清楚地暴露出来：

-   保存流程时，检查不含变量的媒体参数：文件在交换目录中不存在时，在画布上给出警告，但不阻止保存。
-   执行时的错误信息使用 Windows 路径，并说明该检查什么，例如"素材 `assets/海报/a.jpg` 不存在，请检查 `C:\wxflow\exchange\assets` 目录"。不向用户显示容器路径或堆栈。

## Risks / Trade-offs

-   [端口 56233 被占用，或 Docker 没有映射端口] → 启动时如果绑定失败，只记录错误，不让整个服务器退出；"渠道实例"页显示网关状态、监听地址和端口。
-   [交换目录没挂载，或路径映射配错] → 启动时自检：交换目录可写，并按映射写入一个探测文件；结果显示在"渠道实例"页。映射是否正确只有 DLL 能验证，所以页面提供"发送测试图片"按钮，向指定会话发一张内置图片。
-   [临时文件堆积] → `tmp/` 中的文件在发送结束后删除；启动时和每小时清理一次超过 24 小时的文件。`images/` 和 `voice/` 中的文件保留 7 天，期限可配置。
-   [WSL2 挂载 Windows 目录读写较慢] → 图片和语音文件小，影响有限；大视频需要实测。必要时只把 `tmp/` 放在容器内部，复制后再交给 DLL。
-   [DLL 的 `dialPort` 还是 56230，连到旧项目] → 文档和"渠道实例"页的空状态里写明要修改 `AIHelpLib.json`。
-   [一条消息命中大量流程，造成发送风暴] → 每实例发送限速兜底；订阅匹配有日志，可以看出每个事件命中了几个流程。
-   [事件到达速度超过流程执行速度] → `services/channel` 对每个实例维护一个有上限的队列，满了就丢弃最旧的事件并记录日志，不让内存无限增长。
-   [源项目的 `{{talker}}` 模板写法与 Flowise 的变量引用方式不同] → 字段名保持源项目的命名，写法改为 `{{ $wechat.talker }}`；变量提示列表里列出常用字段，不额外做模板引擎。
-   [冷却和名单过滤需要 talker，但非渠道触发的流程没有 talker] → 没有会话上下文时，这类节点直接放行，并在节点输出里注明原因。
-   [只支持非队列模式] → 在启动日志和"渠道实例"页上明确提示；转发方案已在决策 7 中记录。

## Migration Plan

1. 四种数据库各新增一个迁移，创建 `channel_instance`、`channel_subscription` 和 `channel_setting` 表；不修改已有表。
2. 部署后网关默认监听 `127.0.0.1:56233`。Docker 部署时，在 compose 里加上 `127.0.0.1:56233:56233` 端口映射、`C:\wxflow\exchange:/exchange` 挂载卷，以及 `WECHAT_GATEWAY_HOST=0.0.0.0`、`WECHAT_EXCHANGE_DIR`、`WECHAT_EXCHANGE_DIR_HOST`。`docker/` 下的 compose 文件和 `.env.example` 要提供注释好的示例。
3. 把 `AIHelpLib.json` 的 `dialPort` 改为 `56233`，然后在"渠道实例"页分配实例，并用"发送测试图片"确认路径映射正确。
4. 回滚：设置 `WECHAT_GATEWAY_PORT=0` 关闭网关。新表不影响已有功能，可以保留；使用了 WeChat 事件 Start 的流程会停止触发，其他流程不受影响。

## Open Questions

-   发送节点等待 `job.done` 的默认超时取 30 秒是否合适，需要用真实微信实例测一下发送延迟再定。
-   "渠道实例"页在主菜单里放在哪一组（与 Credentials 同组，还是放进管理分组），可以在实现页面时再定。
