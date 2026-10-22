# Spec Delta

## Purpose

定义 wxflow 与即时通讯渠道之间的连接层:接受注入微信的 `AIHelpLib.dll` 反向拨号,维护在线实例,把节点的调用转成渠道方法,并把渠道里发生的事件和异步任务结果交给流程触发与节点执行使用。

## ADDED Requirements

### Requirement: 微信网关监听地址与端口可配置

系统 SHALL 在启动时开启一个 WebSocket 服务端,供 `AIHelpLib.dll` 反向拨号连接。端口默认 `56233`,监听地址默认 `127.0.0.1`,两者都 SHALL 可以通过环境变量覆盖。端口设为 `0` 时系统 SHALL NOT 开启网关,其余功能照常运行。

#### Scenario: 默认配置启动

-   **WHEN** 未设置网关相关环境变量时启动 wxflow
-   **THEN** 网关在 `127.0.0.1:56233` 接受连接,其他机器无法连接

#### Scenario: 在容器中启动

-   **WHEN** 网关监听地址设为 `0.0.0.0` 并启动 wxflow
-   **THEN** 通过端口映射从主机 `127.0.0.1:56233` 发起的连接能够连上网关

#### Scenario: 关闭网关

-   **WHEN** 网关端口设为 `0` 并启动 wxflow
-   **THEN** 不监听任何网关端口,流程编辑和其他触发方式照常可用

### Requirement: 网关启动失败不影响服务

网关端口被占用或无法绑定时,系统 SHALL 记录包含端口和原因的错误日志并继续运行其余功能,SHALL NOT 让整个服务退出。网关的运行状态(运行中/未启动/失败及原因、监听地址和端口) SHALL 可以通过渠道实例接口查询。

#### Scenario: 端口被占用

-   **WHEN** `56233` 已被其他进程占用时启动 wxflow
-   **THEN** 服务正常启动,日志记录绑定失败,渠道实例接口返回网关状态为失败并附带原因

### Requirement: 队列模式下不启用网关

当 wxflow 运行在队列模式(`MODE=QUEUE`)时,系统 SHALL NOT 开启网关,并 SHALL 在启动日志和网关状态中说明原因。

#### Scenario: 队列模式启动

-   **WHEN** 以 `MODE=QUEUE` 启动 wxflow
-   **THEN** 网关未监听端口,网关状态显示"队列模式下不可用"

### Requirement: 维护在线实例

网关 SHALL 在 `AIHelpLib.dll` 连接并完成身份识别后,把该微信实例(以 wxid 标识)记为在线;连接断开时 SHALL 记为离线。实例上线和下线 SHALL 通知渠道实例管理。

#### Scenario: 实例上线

-   **WHEN** 一个已登录微信的 `AIHelpLib.dll` 连接到网关并完成身份识别
-   **THEN** 该 wxid 出现在在线实例列表中

#### Scenario: 实例断开

-   **WHEN** 已连接的实例断开 WebSocket 连接
-   **THEN** 该 wxid 被标记为离线,之后对它的调用立即返回"实例离线"错误

### Requirement: 调用渠道方法

网关 SHALL 支持向指定实例发送一个方法调用并返回结果。调用 SHALL 有超时;实例离线、超时或 DLL 返回错误时,SHALL 返回包含错误码和错误信息的失败结果,而不是抛出未处理的异常。

#### Scenario: 调用成功

-   **WHEN** 节点通过网关向在线实例调用 `send.text`
-   **THEN** 返回成功结果,其中包含 DLL 返回的 `jobid`

#### Scenario: 调用超时

-   **WHEN** 实例在超时时间内没有响应
-   **THEN** 调用返回失败结果,错误信息说明超时

### Requirement: 跟踪异步任务终态

对返回 `jobid` 的调用,网关 SHALL 在收到对应的 `job.done` 事件时,把终态(成功或失败及原因)交给等待该任务的调用方。

#### Scenario: 收到终态

-   **WHEN** 一次发送返回 `jobid`,随后网关收到该 `jobid` 的 `job.done` 事件
-   **THEN** 等待该任务的调用方得到终态

### Requirement: 解码并转发渠道事件

网关 SHALL 把 DLL 推送的事件(包括经 zstd 压缩的 `msg.insert` 消息)解码为统一的事件结构 `{ channel, instance, event, data }`,并交给渠道事件处理。无法解码的事件 SHALL 被记录并丢弃,SHALL NOT 中断连接。

#### Scenario: 收到压缩的消息事件

-   **WHEN** DLL 推送一条压缩的 `msg.insert` 事件
-   **THEN** 渠道事件处理收到 `channel = 'wechat'`、包含发送人、会话、消息类型和内容的事件

#### Scenario: 收到损坏的事件

-   **WHEN** DLL 推送一条无法解码的事件
-   **THEN** 网关记录日志并丢弃该事件,连接保持

### Requirement: 获取语音数据

网关 SHALL 支持按消息 svrid 向实例获取语音音频,使用 DLL 的 `voice.*` 两帧协议(先收 JSON 响应,再收二进制帧)。二进制帧在超时内未到达时 SHALL 返回失败结果。

#### Scenario: 获取语音

-   **WHEN** 节点请求获取一条语音消息的音频
-   **THEN** 网关返回该消息的音频数据

### Requirement: 节点与网关实现解耦

节点和流程触发 SHALL 只通过与渠道无关的适配器接口使用网关,SHALL NOT 直接依赖 WebSocket 库或网关实现,使测试可以用模拟适配器代替真实网关。

#### Scenario: 使用模拟适配器测试节点

-   **WHEN** 测试中注册一个模拟的微信适配器并执行 Send Text 节点
-   **THEN** 节点调用到模拟适配器,不需要真实的 WebSocket 连接
