## Why

wxflow 目前只能由聊天、表单、webhook 和定时触发，无法响应微信里发生的事件，也不能向微信发送内容。另一个项目 `wx_workflow` 已经通过注入微信 4.x 的 `AIHelpLib.dll`（反向拨号 WS）做出一套微信事件工作流，但它是自研引擎、单租户，无法复用 wxflow 的 Agent、LLM、工具和工作区体系。本 change 把 `wx_workflow` 的微信节点能力移植到 wxflow，并同时搭好"渠道"这一层抽象，让之后接入 WhatsApp 时只需新增一个适配器和一组节点。

## What Changes

-   部署方式限定为 wxflow 与微信在同一台 Windows 上：直接安装，或运行在 Docker Desktop 里。两种方式共用同一套代码。
-   在 `packages/server` 内置微信网关：WS 服务端监听 `56233`（`wx_workflow` 用的是 `56230`，两者可同时运行），监听地址可配置，默认只监听本机。网关接受 `AIHelpLib.dll` 反向拨号，维护实例池，转发方法调用、跟踪异步发送任务并解码 `msg.insert` 事件。网关实现一个与渠道无关的适配器接口，以后 WhatsApp 用同一接口接入。
-   新增交换目录：wxflow 和 `AIHelpLib.dll` 都能访问的一个目录，配有容器路径与 Windows 路径之间的映射。发送的媒体、URL 下载的临时文件、取图片解密出的文件都放在这里。媒体参数支持三种来源：交换目录内的相对路径、绝对路径、`http(s)` URL。来源解析器可以注册新来源，供下一个 change 的资源库使用。
-   新增"渠道实例"：网关发现的每个微信实例都要由管理员分配给一个工作区；未分配的实例不触发任何流程，也不能被发送节点使用。管理后台新增"渠道实例"页面，沿用现有的工作区权限体系。
-   Start 节点新增输入类型 `WeChat 事件`，可配置事件类型（收到消息、快捷关键字命中、会话切换、媒体落盘、登录、登出、收付款）、实例范围、消息方向、会话类型和消息类型筛选。渠道事件到达后，系统在实例所属工作区内找出订阅了该事件的已启用流程，逐个启动运行。
-   渠道层内建安全阀，所有渠道共享：收到消息默认只处理入站消息（防自环）、每实例发送限速、渠道总闸。
-   节点面板新增 `WeChat` 分组，放微信专属节点：消息类型路由，发文本、图片、文件、视频、@消息、链接卡片、引用回复，查联系人，取图片，取语音。每个节点配 Tabler 图标，统一用微信绿主色。
-   `Agent Flows` 分组新增与渠道无关的通用节点：冷却窗口、延时（支持随机区间）、会话/发送人名单过滤。
-   不移植 `wx_workflow` 中已由 wxflow 现有节点覆盖的节点：`logic.condition`、`logic.keyword`（用 Condition）、`logic.setVar`（用 Update Flow State）、`logic.agentReturn`（用 Execute Flow / Agent as Tool）、`ai.*`（用 Agent / LLM）、`action.http`（用 HTTP）、`trigger.cron`（用 Schedule Input）、`trigger.agentCall`（用 Execute Flow）。
-   不在本 change 范围内（留给后续 change）：资源库（下一个 change，包括资源页、`res://` 引用和参数表单里的资源选择控件）、MinIO 等对象存储作为素材来源、会话状态（读取、写入、巡检，按 `(workspaceId, channel, instance, scope, talker)` 设计）、收款核实与审批事件、朋友圈节点、更新快捷关键字表、数据表（`db.*`）、WhatsApp 适配器、演练模式。

## Capabilities

### New Capabilities

-   `channel-gateway`: 渠道适配器接口，以及它的第一个实现：微信 WS 网关的连接、实例池、方法调用、异步任务终态回写、事件解码、监听地址与端口配置。
-   `channel-media`: 交换目录与路径映射、媒体来源解析（相对路径、绝对路径、URL）、临时文件清理和启动自检。
-   `channel-instances`: 渠道实例与工作区的绑定，未分配实例的处理，以及管理实例的接口与页面。
-   `channel-triggers`: Start 节点的渠道事件输入类型、事件到流程的订阅匹配，以及渠道层安全阀（防自环、发送限速、总闸）。
-   `wechat-nodes`: `WeChat` 分组中的微信专属节点，以及 `Agent Flows` 中新增的通用节点（冷却、延时、名单过滤）的输入、输出和行为。

### Modified Capabilities

-   `node-catalog`: 节点注册表除 Agentflow v2 节点外，还要提供 `WeChat` 类别的节点；节点面板按 `Agent Flows`、`WeChat` 两个分组显示。
-   `console-navigation`: 主菜单新增"渠道实例"条目。

## Impact

-   代码：`packages/server`（新增网关、`services/channel`、渠道实例和订阅相关实体与四种数据库的迁移、启动时接线）；`packages/components/nodes`（新增 WeChat 节点与通用节点，修改 Start 节点）；`packages/ui`（`AddNodes.jsx` 支持多分组，`AGENTFLOW_ICONS` 补充图标，新增渠道实例页面和菜单项，`nodes.json` 中英文案）。
-   依赖：`ws`（如尚未直接依赖），`fzstd`（`msg.insert` 解码）。
-   部署与配置：新增环境变量，用于设置网关端口（默认 `56233`）、监听地址和交换目录路径映射。`docker/` 下的 compose 文件和 `.env.example` 要加上 `127.0.0.1:56233` 端口映射和交换目录挂载卷。端口只在本机使用，不需要对外放行；`AIHelpLib.json` 的 `dialPort` 要改为 `56233`。
-   数据：新增数据表，不改动已有表，已保存的流程不受影响。
-   外部系统：`AIHelpLib.dll` 侧不做任何改动，所有节点能力都映射到它已有的 WS 方法。
