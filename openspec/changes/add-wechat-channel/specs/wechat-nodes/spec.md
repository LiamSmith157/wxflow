# Spec Delta

## Purpose

定义 `WeChat` 分组中微信专属节点,以及 `Agent Flows` 中新增的通用节点(冷却、延时、名单过滤)的参数、输出和行为,使运营人员可以在 Agentflow 里处理微信消息、发送内容和获取媒体。

## ADDED Requirements

### Requirement: 发送类节点使用本工作区的实例

发送和获取类 WeChat 节点 SHALL 默认使用触发事件的实例;不是由渠道事件触发时,SHALL 使用节点参数中指定的实例,可选范围只包括当前工作区已分配的实例。没有可用实例、实例离线或网关未运行时,节点 SHALL 失败并给出说明原因的错误。

#### Scenario: 由消息触发

-   **WHEN** 实例 X 收到消息触发流程,流程中的 Send Text 未指定实例
-   **THEN** 消息通过实例 X 发送

#### Scenario: 实例离线

-   **WHEN** 定时触发的流程中,Send Text 指定的实例当前离线
-   **THEN** 节点失败,错误信息说明该实例离线

### Requirement: 收件人默认为触发会话

发送类节点的收件人参数 SHALL 默认为触发事件的会话,并 SHALL 支持填写固定 wxid 或引用变量。收件人解析为空时,节点 SHALL 失败。

#### Scenario: 默认收件人

-   **WHEN** 收到消息触发流程,Send Text 的收件人保持默认
-   **THEN** 消息发往触发消息所在的会话

#### Scenario: 非消息触发且未填收件人

-   **WHEN** 定时触发的流程中,Send Text 的收件人保持默认
-   **THEN** 节点失败,错误信息说明收件人为空

### Requirement: 发送结果

发送类节点 SHALL 输出发送状态(`ok`、`fail`、`pending`、`rate_limited` 或 `skipped`)、`jobId`(如有)和错误信息。节点 SHALL 等待异步终态,最长 30 秒(可配置);超时时 SHALL 输出 `pending` 并让流程继续。

#### Scenario: 发送成功

-   **WHEN** Send Text 发送后在等待时间内收到成功终态
-   **THEN** 节点输出 `ok` 和对应的 `jobId`

#### Scenario: 终态超时

-   **WHEN** 等待时间内没有收到终态
-   **THEN** 节点输出 `pending`,下游节点继续执行

### Requirement: 发送文本、@消息和链接卡片

系统 SHALL 提供 Send Text(参数:收件人、内容)、Send @Mention(参数:群、正文、@所有人、被@者 wxid、被@者昵称)和 Send Link Card(参数:收件人、标题、URL、描述)节点。文本类参数 SHALL 支持引用变量。Send @Mention 在不 @所有人且未填被@者 wxid 时 SHALL 失败。

#### Scenario: @群成员

-   **WHEN** Send @Mention 的被@者 wxid 引用触发消息的发送人
-   **THEN** 群里发出一条 @该发送人 的消息

#### Scenario: 缺少被@者

-   **WHEN** Send @Mention 未勾选 @所有人,且被@者 wxid 为空
-   **THEN** 节点失败,不调用 DLL

### Requirement: 引用回复

系统 SHALL 提供 Quote Reply 节点(参数:收件人、正文),引用触发流程的那条消息进行回复。流程不是由消息事件触发时,节点 SHALL 失败并说明原因。

#### Scenario: 引用触发消息

-   **WHEN** 收到消息触发流程,Quote Reply 执行
-   **THEN** 会话中出现一条引用该消息的回复

#### Scenario: 非消息触发

-   **WHEN** 定时触发的流程执行 Quote Reply
-   **THEN** 节点失败,错误信息说明只能用于消息事件触发的流程

### Requirement: 发送图片、文件和视频

系统 SHALL 提供 Send Image、Send File 和 Send Video 节点(参数:收件人、媒体;Send Video 另有可选的时长)。媒体参数 SHALL 按渠道媒体规则解析(URL 或本地绝对路径)。

#### Scenario: 发送本地图片

-   **WHEN** Send Image 的媒体参数为 `D:\素材\海报.jpg`,且该文件存在
-   **THEN** 会话收到这张图片

#### Scenario: 发送上游取到的图片

-   **WHEN** Send Image 的媒体参数引用上游 Fetch Image 输出的路径
-   **THEN** 会话收到这张图片

### Requirement: 消息类型路由

系统 SHALL 提供 Message Type Router 节点,按触发消息的主类型分到 7 个分支:文本、图片、语音、链接、文件、视频、其他/非消息。没有连线的分支 SHALL 直接结束,不报错。

#### Scenario: 图片消息

-   **WHEN** 一条图片消息触发流程并到达 Message Type Router
-   **THEN** 流程沿"图片"分支继续

#### Scenario: 非消息事件

-   **WHEN** 登录事件触发的流程到达 Message Type Router
-   **THEN** 流程沿"其他/非消息"分支继续

### Requirement: 查联系人

系统 SHALL 提供 Search Contacts 节点,有两种模式:按 wxid 查单个联系人(输出昵称和头像等信息,wxid 必填)和列出全部好友(输出好友列表)。结果 SHALL 作为节点输出供下游引用。

#### Scenario: 查发送人昵称

-   **WHEN** Search Contacts 以单个模式查询触发消息的发送人
-   **THEN** 节点输出包含该发送人的昵称

### Requirement: 获取图片

系统 SHALL 提供 Fetch Image 节点(参数:svrid,默认为触发消息;形态:原图、高清或缩略图;等待秒数,默认 8,最大 60),把图片解密到媒体工作目录并输出图片的本地路径。节点 SHALL 有成功和失败两个分支;找不到图片或等待超时时走失败分支。

#### Scenario: 获取收到的图片

-   **WHEN** 一条图片消息触发流程,Fetch Image 使用默认 svrid
-   **THEN** 流程走成功分支,输出的图片路径可以被下游节点直接读取

#### Scenario: 非图片消息

-   **WHEN** 文本消息触发的流程执行 Fetch Image
-   **THEN** 流程走失败分支

### Requirement: 获取语音

系统 SHALL 提供 Fetch Voice 节点(参数:svrid,默认为触发消息),把语音音频保存为媒体工作目录中的 WAV 文件并输出其本地路径。节点 SHALL 有成功和失败两个分支。

#### Scenario: 获取语音后识别

-   **WHEN** 一条语音消息触发流程,Fetch Voice 成功后连接到语音识别或 LLM 节点
-   **THEN** 下游节点可以读取输出路径中的音频

### Requirement: 冷却窗口

系统 SHALL 在 `Agent Flows` 分组提供 Cooldown 节点(参数:窗口分钟数,默认 10)。同一流程、同一会话在窗口内第一次到达时走"放行"分支,之后到达时走"冷却中"分支。没有会话上下文时 SHALL 走"放行"分支并在输出中注明原因。

#### Scenario: 窗口内第二次到达

-   **WHEN** 同一会话在 10 分钟内两次触发同一流程并到达 Cooldown
-   **THEN** 第一次走放行分支,第二次走冷却中分支

#### Scenario: 不同会话

-   **WHEN** 两个不同会话在窗口内各触发一次
-   **THEN** 两次都走放行分支

### Requirement: 延时

系统 SHALL 在 `Agent Flows` 分组提供 Delay 节点:按设定秒数等待后继续;同时填写随机区间下限和上限且上限不小于下限时,SHALL 在该区间内随机取等待时间。

#### Scenario: 随机延时

-   **WHEN** Delay 的随机区间为 3 到 8 秒
-   **THEN** 节点等待 3 到 8 秒之间的某个时长后继续

### Requirement: 名单过滤

系统 SHALL 在 `Agent Flows` 分组提供 Talker Filter 节点(参数:过滤字段为发送人或会话,模式为白名单或黑名单,名单支持以 `*` 做前缀或后缀模糊匹配),输出"通过"和"拦截"两个分支。没有会话上下文时 SHALL 走"通过"分支并在输出中注明原因。

#### Scenario: 白名单

-   **WHEN** 模式为白名单,名单为 `wxid_abc*`,发送人为 `wxid_abc123`
-   **THEN** 流程走通过分支

#### Scenario: 黑名单

-   **WHEN** 模式为黑名单,名单包含发送人的 wxid
-   **THEN** 流程走拦截分支

### Requirement: 节点外观

WeChat 分组的节点 SHALL 使用微信绿主色,并各自有区分功能的图标;新增节点的名称、描述、参数名和选项 SHALL 在 `zh-CN` 界面下显示中文。

#### Scenario: 中文界面查看节点

-   **WHEN** 界面语言为 `zh-CN` 时打开节点面板的 WeChat 分组
-   **THEN** 节点名称和描述显示为中文,每个节点显示对应图标
