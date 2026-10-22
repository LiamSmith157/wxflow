# Spec Delta

## Purpose

定义渠道事件如何启动 Agentflow:Start 节点的渠道事件输入类型、事件到已启用流程的订阅匹配、事件数据如何交给下游,以及所有渠道共享的安全阀(防自环、发送限速、总闸)。

## ADDED Requirements

### Requirement: Start 节点的 WeChat 事件输入类型

Start 节点 SHALL 提供 `WeChat Event` 输入类型。选中后 SHALL 显示事件类型(收到消息、快捷关键字命中、会话切换、媒体落盘、登录、登出、收付款)和实例范围(本工作区全部实例或指定实例);其他参数 SHALL 只在对应事件类型下显示。其他输入类型的参数和行为 SHALL 保持不变。

#### Scenario: 选择收到消息事件

-   **WHEN** 用户把 Start 的输入类型设为 `WeChat Event`,事件类型设为"收到消息"
-   **THEN** 表单显示方向、会话筛选、会话类型和消息类型参数,不显示收付款和媒体相关参数

#### Scenario: 选择收付款事件

-   **WHEN** 事件类型设为"收付款"
-   **THEN** 表单显示收付款事件类型和资金流向参数,不显示消息相关参数

### Requirement: 渠道事件流程需要手动启用

使用渠道事件输入类型的流程 SHALL 有独立的启用开关,显示在画布顶部,与定时流程的开关相同。新保存的流程 SHALL 默认未启用;再次保存 SHALL NOT 改变已有的启用状态。只有已启用的流程 SHALL 被渠道事件触发。

#### Scenario: 首次保存

-   **WHEN** 运营人员第一次保存一个 WeChat Event 流程
-   **THEN** 流程处于未启用状态,收到消息不会触发它

#### Scenario: 启用后修改再保存

-   **WHEN** 已启用的 WeChat Event 流程被修改并再次保存
-   **THEN** 流程保持启用,之后的事件按修改后的配置匹配

#### Scenario: 改成其他输入类型

-   **WHEN** 已启用的 WeChat Event 流程把 Start 输入类型改为 Chat Input 并保存
-   **THEN** 该流程不再被任何渠道事件触发

#### Scenario: 删除流程

-   **WHEN** 删除一个已启用的 WeChat Event 流程
-   **THEN** 之后的渠道事件不会再尝试运行它

### Requirement: 事件匹配并启动流程

渠道事件到达时,系统 SHALL 找出事件所属实例的工作区中所有已启用、事件类型相同且筛选条件全部满足的流程,并为每个流程启动一次运行。一个事件命中多个流程时 SHALL 分别运行,互不影响;一个流程运行失败 SHALL NOT 阻止其他流程运行。

#### Scenario: 两个流程订阅同一事件

-   **WHEN** 工作区 A 有两个已启用的"收到消息"流程,筛选条件都满足,实例收到一条消息
-   **THEN** 两个流程各运行一次,各自产生一条执行记录

#### Scenario: 筛选条件不满足

-   **WHEN** 流程的消息类型筛选为"图片",实例收到一条文本消息
-   **THEN** 该流程不运行

#### Scenario: 指定实例范围

-   **WHEN** 流程的实例范围指定为实例 X,工作区内另一个实例 Y 收到消息
-   **THEN** 该流程不运行

### Requirement: 事件数据交给下游节点

渠道事件触发的运行 SHALL 把事件数据作为 Start 节点的输出,包括渠道、实例、事件类型,以及事件本身的字段(收到消息时包括发送人、会话、消息类型、内容和 svrid)。下游节点的参数 SHALL 能用 `{{ $wechat.<字段> }}` 引用这些字段,编辑参数时的变量提示 SHALL 列出常用字段。

#### Scenario: 回复消息发送人

-   **WHEN** 收到消息触发流程,Send Text 的内容为 `你好,{{ $wechat.sender }}`
-   **THEN** 发出的文本中 `{{ $wechat.sender }}` 被替换为触发消息的发送人

#### Scenario: 变量提示

-   **WHEN** 用户在 WeChat Event 流程中编辑某个节点的文本参数并输入 `{{`
-   **THEN** 提示列表中出现 `$wechat.talker`、`$wechat.sender`、`$wechat.content` 等字段

#### Scenario: 引用不存在的字段

-   **WHEN** 参数引用了事件中没有的字段,例如登录事件中的 `{{ $wechat.content }}`
-   **THEN** 该引用替换为空字符串,节点继续执行

### Requirement: 渠道触发的运行有执行记录

渠道事件触发的运行 SHALL 产生与其他触发方式相同的执行记录,并 SHALL 只执行 AGENTFLOW 类型的流程。

#### Scenario: 查看执行记录

-   **WHEN** 一条消息触发了流程
-   **THEN** Executions 页面出现该次运行,可以查看各节点的输入输出

### Requirement: 默认只处理入站消息

"收到消息"事件的方向参数 SHALL 默认为只处理入站消息,即本账号发出的消息不触发流程。用户选择包含出站消息时,表单 SHALL 显示自环风险警告。

#### Scenario: 流程自己发出的消息

-   **WHEN** 一个方向为默认值的流程向会话发送了一条消息
-   **THEN** 这条出站消息不会再触发该流程

#### Scenario: 选择包含出站

-   **WHEN** 用户把方向改为包含出站
-   **THEN** 参数旁显示自环风险警告

### Requirement: 每实例发送限速

系统 SHALL 对每个实例的发送类调用限速,默认每分钟 20 次,可配置。超出限额的发送 SHALL NOT 调用 DLL,节点 SHALL 输出 `rate_limited` 状态,流程 SHALL 继续执行后续节点。

#### Scenario: 超过限额

-   **WHEN** 同一实例在一分钟内已经发送 20 次,又有节点要发送
-   **THEN** 该次发送没有执行,节点输出 `rate_limited`,下游节点照常运行

### Requirement: 渠道总闸

系统 SHALL 提供渠道总闸。总闸关闭时,渠道事件 SHALL NOT 触发任何流程,发送类节点 SHALL NOT 调用 DLL 并输出跳过状态。总闸状态 SHALL 在渠道实例页可见并可由有管理权限的用户切换。

#### Scenario: 关闭总闸后收到消息

-   **WHEN** 总闸关闭时实例收到一条消息
-   **THEN** 没有任何流程被触发

### Requirement: 事件积压有上限

系统 SHALL 为每个实例的待处理事件设置上限。积压超过上限时 SHALL 丢弃最早的事件并记录日志,SHALL NOT 让内存无限增长。

#### Scenario: 短时间大量消息

-   **WHEN** 实例在流程处理完之前收到超过上限数量的事件
-   **THEN** 最早的超额事件被丢弃并记录日志,服务继续运行
