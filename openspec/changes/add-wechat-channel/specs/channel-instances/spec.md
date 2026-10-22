# Spec Delta

## Purpose

定义渠道实例(例如一个已登录的微信账号)如何被记录、分配给工作区和管理,确保每个实例的事件只触发一个工作区的流程,发送节点也只能使用本工作区的实例。

## ADDED Requirements

### Requirement: 记录发现的实例

网关发现一个之前没见过的实例时,系统 SHALL 为它创建一条记录(渠道、实例标识、显示名称、最近在线时间),初始不属于任何工作区。已记录的实例再次上线时 SHALL 更新显示名称和最近在线时间,SHALL NOT 改变其工作区归属。

#### Scenario: 新实例首次上线

-   **WHEN** 一个从未连接过的 wxid 连接到网关
-   **THEN** 渠道实例列表出现该实例,状态为在线,工作区为"未分配"

#### Scenario: 已分配实例重新上线

-   **WHEN** 一个已分配给工作区 A 的实例断线后重新连接
-   **THEN** 该实例仍属于工作区 A

### Requirement: 实例只属于一个工作区

每个实例 SHALL 最多属于一个工作区。有管理权限的用户 SHALL 能把实例分配给工作区、改分配到另一个工作区或取消分配。

#### Scenario: 分配实例

-   **WHEN** 有 `channelInstances:manage` 权限的管理员把一个未分配实例分配给工作区 A
-   **THEN** 该实例属于工作区 A,工作区 A 的流程开始接收它的事件

#### Scenario: 改分配

-   **WHEN** 管理员把属于工作区 A 的实例改分配给工作区 B
-   **THEN** 之后该实例的事件只触发工作区 B 的流程

### Requirement: 未分配实例不参与流程

未分配给工作区的实例产生的事件 SHALL NOT 触发任何流程,发送类节点 SHALL NOT 能使用该实例。

#### Scenario: 未分配实例收到消息

-   **WHEN** 一个未分配实例收到一条消息
-   **THEN** 没有任何流程被触发

### Requirement: 工作区只能看到和使用自己的实例

渠道实例列表 SHALL 只向用户返回其当前工作区的实例;未分配实例 SHALL 只对有管理权限的用户可见。节点参数中的实例选项 SHALL 只列出当前工作区的实例。

#### Scenario: 普通用户查看实例

-   **WHEN** 工作区 A 中只有 `channelInstances:view` 权限的用户打开渠道实例页
-   **THEN** 只看到属于工作区 A 的实例,看不到未分配实例和其他工作区的实例

### Requirement: 渠道实例页

管理后台 SHALL 提供渠道实例页,显示网关状态(运行状态、监听地址和端口)、交换目录自检结果,以及实例列表(显示名称、实例标识、在线状态、最近在线时间、所属工作区)。没有任何实例时,页面 SHALL 提示需要把 `AIHelpLib.json` 中的 `dialPort` 设为网关端口。

#### Scenario: 首次部署打开页面

-   **WHEN** 网关已运行但还没有实例连接,管理员打开渠道实例页
-   **THEN** 页面显示网关监听的地址和端口,并提示修改 `AIHelpLib.json` 的 `dialPort`

### Requirement: 渠道实例权限

渠道实例的查看和管理 SHALL 分别受 `channelInstances:view` 和 `channelInstances:manage` 权限控制,沿用现有的工作区角色体系。

#### Scenario: 无管理权限时分配实例

-   **WHEN** 只有 `channelInstances:view` 权限的用户调用分配实例的接口
-   **THEN** 请求被拒绝,实例归属不变
