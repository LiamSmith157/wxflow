# Tasks

## 1. 依赖与配置

-   [x] 1.1 在 `packages/server` 加入 `fzstd` 依赖(`ws` 已是依赖),验证 `pnpm install` 和 `pnpm --filter wxflow-server build` 成功
-   [x] 1.2 在 `packages/server/.env.example` 和 `docker/.env.example` 加入带注释的 `WECHAT_GATEWAY_PORT`(默认 56233,0 为关闭)、`WECHAT_GATEWAY_HOST`(默认 127.0.0.1)、`WECHAT_EXCHANGE_DIR`、`WECHAT_EXCHANGE_DIR_HOST`、URL 下载大小上限、发送终态等待秒数、取回文件保留天数;验证两个文件中的变量名一致

## 2. 数据层

-   [x] 2.1 新增实体 `ChannelInstance`、`ChannelSubscription`、`ChannelSetting`(字段见 design 决策 3、4、5),注册到 `database/entities/index.ts`;验证服务启动时 TypeORM 能加载这些实体
-   [x] 2.2 为 sqlite、postgres、mysql、mariadb 各写一个迁移,创建三张表及索引(`channel_instance` 的 `(channel, instanceKey)` 唯一、`channel_subscription` 的 `(workspaceId, channel, eventType, enabled)`、`channel_setting` 的 `workspaceId` 唯一),并在各自的 `index.ts` 中注册;用 sqlite 启动一次确认迁移执行且不改动已有表,其余三种数据库的迁移与 sqlite 版本逐列核对

## 3. 渠道适配器接口与注册表

-   [x] 3.1 在 `packages/server/src/channels/` 定义 `ChannelAdapter`、`ChannelSink`、统一事件结构 `{ channel, instance, event, data }` 和 `ChannelRegistry`(按渠道注册和取适配器);写单元测试,验证注册、获取和未注册渠道时的错误
-   [x] 3.2 提供测试用的 `MockChannelAdapter`,可以记录调用、模拟终态和推送事件;验证后续节点和触发测试都能只依赖它运行

## 4. 微信网关

-   [x] 4.1 移植 `wx_workflow` 的 `gateway.ts` 和 `msgdecode.ts` 为 `WeChatGateway`(实现 `ChannelAdapter`):连接、hello/身份识别、实例池、方法调用与超时、`job.done` 终态跟踪、`voice.*` 两帧协议;写测试,用一个模拟 DLL 的 WS 客户端验证上线、断线、调用成功、调用超时、终态回传和语音获取
-   [x] 4.2 实现 `msg.insert` 等事件的解码与转发(含 zstd),无法解码的事件记录日志后丢弃;参照源项目 `test/msgdecode.test.ts`、`test/gateway.test.ts` 中的样本移植测试,验证解出的发送人、会话、消息类型和内容,以及损坏数据不会断开连接
-   [x] 4.3 在服务启动时创建网关并注册到 `ChannelRegistry`:读取端口和监听地址、端口为 0 时不启动、`MODE=QUEUE` 时不启动并记录原因、绑定失败只记日志不退出,并提供网关状态查询;写测试覆盖这四种情况,并手动确认默认配置下 `127.0.0.1:56233` 可连、其他地址不可连

## 5. 交换目录与媒体

-   [x] 5.1 实现交换目录配置与双向路径映射(容器路径与 Windows 路径,含分隔符转换);单元测试覆盖设置和未设置主机路径两种情况,以及交换目录外路径被拒绝
-   [x] 5.2 实现可注册的媒体来源解析器,内置 URL、绝对路径、`assets/` 相对路径三种来源;URL 通过 `secureAxiosRequest` 下载到 `tmp/` 并限制大小;单元测试验证识别顺序、超限失败且不留部分文件、出站限制拒绝时不发起下载
-   [x] 5.3 实现面向运营人员的错误信息(使用 Windows 路径,说明应检查的目录,不含容器路径和堆栈);测试验证素材缺失时的错误文本
-   [x] 5.4 实现清理任务:发送结束删除本次临时文件;启动时和每小时删除 `tmp/` 中超过 24 小时的文件,以及 `images/`、`voice/` 中超过保留天数的文件;用伪造修改时间的文件写测试验证
-   [x] 5.5 实现启动自检(交换目录存在且可写,并写入探测文件),结果并入网关状态;测试验证目录不存在时服务仍启动且状态报告异常

## 6. 渠道实例与设置

-   [x] 6.1 实现 `services/channel-instances`:网关上线时创建或更新实例(不改变工作区归属)、下线时更新状态,分配、改分配、取消分配,以及按工作区查询;单元测试覆盖规格 `channel-instances` 中的场景
-   [x] 6.2 在 `enterprise/rbac/Permissions.ts` 新增 `channelInstances:view`、`channelInstances:manage`;新增路由:实例列表、分配实例、网关状态与自检结果、读取和修改渠道设置(总闸、限速)、发送测试图片(内置一张测试图片资源);测试验证只有 view 权限时分配被拒绝、用户只能看到本工作区实例、未分配实例只对管理者可见
-   [x] 6.3 在 `packages/api-documentation` 的 swagger 中补充上述接口;验证文档生成命令成功且包含新路径

## 7. 渠道事件触发

-   [x] 7.1 在 `Start.ts` 新增 `wechatEvent` 输入类型及参数(事件类型、实例范围、方向、会话筛选、会话类型、消息类型、媒体类型、收付款事件类型、资金流向),均用 `show` 控制显隐,并在 `run()` 中把 `agentflowRuntime.wechat` 写入输出;测试验证其他输入类型的参数定义没有变化
-   [x] 7.2 在 `buildAgentflow.ts` 的变量解析中支持 `{{ $wechat.<字段> }}`(做法同 `$webhook.*`,缺失字段替换为空字符串),并在 `ui-component/input/suggestionOption.js` 中为 WeChat Event 流程列出常用字段;测试验证替换、缺失字段和提示列表
-   [x] 7.3 在 `services/chatflows` 保存、删除流程和改变 Start 输入类型时同步 `ChannelSubscription`:新订阅默认未启用,再次保存保留启用状态,改为其他输入类型或删除流程时移除订阅;新增启用开关接口(仿照 `/chatflows/:id/schedule/enabled`);测试覆盖规格中"需要手动启用"的四个场景
-   [x] 7.4 实现 `services/channel` 事件分发:实例到工作区解析、未分配实例丢弃、按订阅和筛选条件匹配(方向默认只入站)、为每个命中流程用 `createMockRequest` 加 `utilBuildChatflow` 启动运行并带上 `agentflowRuntime.wechat`、单个流程失败不影响其他流程、每实例事件队列有上限;用 `MockChannelAdapter` 写测试覆盖规格 `channel-triggers` 的匹配、实例范围、执行记录和积压场景
-   [x] 7.5 实现总闸与每实例发送限速(读取 `ChannelSetting`),总闸关闭时不触发流程、发送输出 `skipped`,超限时输出 `rate_limited` 且流程继续;测试覆盖这两个安全阀

## 8. WeChat 节点

-   [x] 8.1 在 `buildAgentflow.ts` 的节点运行参数中加入渠道句柄(注册表、触发事件、当前工作区),供 `packages/components` 中的节点使用,节点不直接依赖 `ws` 或网关实现;测试验证节点运行时能拿到句柄
-   [x] 8.2 在 `packages/components/nodes/agentflow/` 下新建 WeChat 节点共用模块:实例选择(默认触发实例,否则用参数指定并限定本工作区)、收件人默认值 `{{ $wechat.talker }}`、发送并等待终态(默认 30 秒,超时输出 `pending`)、统一的发送结果输出;用 `MockChannelAdapter` 写单元测试覆盖实例离线、收件人为空、成功、超时
-   [x] 8.3 实现 Send Text、Send @Mention、Send Link Card、Quote Reply 节点(`category: 'WeChat'`、`color: '#07C160'`、`name` 形如 `wechatSendTextAgentflow`);测试验证各自调用的 WS 方法和参数、@消息缺少被@者时失败、Quote Reply 在非消息触发时失败
-   [x] 8.4 实现 Send Image、Send File、Send Video 节点,媒体参数走第 5 组的来源解析和路径映射;测试验证 DLL 收到的是 Windows 路径、URL 来源发送后临时文件被删除
-   [x] 8.5 实现 Message Type Router(7 个输出分支,未连线分支直接结束)和 Search Contacts(单个/全部两种模式);测试验证图片消息走图片分支、非消息事件走其他分支、单个模式缺 wxid 时失败
-   [x] 8.6 实现 Fetch Image(调用 `image.get` 时 `outDir` 固定为 `images/` 的 Windows 路径,成功/失败两个分支)和 Fetch Voice(经 `voice.*` 取音频写入 `voice/`,成功/失败两个分支);测试验证输出路径可读、非图片消息走失败分支
-   [x] 8.7 在 `services/validation` 中检查不含变量的媒体参数,文件不存在时返回警告;保存流程后在画布上显示该警告且不阻止保存;测试验证缺失文件产生警告,含变量或 URL 的参数不检查

## 9. 通用节点

-   [x] 9.1 在 `Agent Flows` 类别实现 Cooldown(按流程加会话计时,放行/冷却中两个分支)、Delay(固定秒数或随机区间)、Talker Filter(发送人或会话、白名单或黑名单、`*` 前后缀匹配,通过/拦截两个分支);无会话上下文时 Cooldown 与 Talker Filter 走放行或通过分支并注明原因;单元测试覆盖规格 `wechat-nodes` 中三个节点的场景

## 10. 管理后台界面

-   [x] 10.1 修改 `views/agentflowsv2/AddNodes.jsx`:按常量 `['Agent Flows', 'WeChat']` 分组显示、搜索覆盖两组且结果仍分组;在 `store/constant.js` 的 `AGENTFLOW_ICONS` 中加入 14 个新节点的图标(见 design 决策 8);更新 `AddNodes.test.jsx`,验证分组顺序、搜索结果和图标渲染
-   [x] 10.2 在 `CanvasHeader.jsx` 为 WeChat Event 流程加入启用开关(仿照定时流程的开关),选择包含出站方向时在 Start 参数旁显示自环警告;测试验证开关调用启用接口、警告只在包含出站时出现
-   [x] 10.3 新增渠道实例页:网关状态、交换目录自检结果、总闸与限速设置、实例列表与分配、发送测试图片,以及没有实例时修改 `dialPort` 的提示;在 `menu-items/dashboard.js` 中加入 Channel Instances 菜单项(`channelInstances:view` 权限)和路由;更新 `menu-items.test.js`,并手动确认无权限用户看不到菜单
-   [x] 10.4 在 `locales/{en,zh-CN}` 中补充菜单、页面文案和分组标题,在 `locales/zh-CN/nodes.json` 中补充新节点的名称、描述、参数、选项和占位符的中文;运行节点文案覆盖率检查(`i18n/nodesCoverage.test.js`),验证新增文案全部有中文且没有多余条目

## 11. 部署与文档

-   [ ] 11.1 在 `docker/docker-compose.yml` 中加入 `127.0.0.1:56233:56233` 端口映射、`C:\wxflow\exchange` 到 `/exchange` 的挂载卷和 `WECHAT_*` 环境变量的注释示例,并在 `docker/README.md` 说明;验证 `docker compose config` 能正确解析
    -   BLOCKED: 本机未安装 docker,无法运行 `docker compose config`。改动已完成(端口映射、挂载卷、WECHAT\_\* 环境变量、docker/README.md),并用 YAML 解析器确认语法与默认值插值写法正确;需在装有 Docker 的机器上执行一次 `docker compose config` 后再勾选。
-   [x] 11.2 在 `README.md` 新增"接入微信"章节:两种部署方式、修改 `AIHelpLib.json` 的 `dialPort`、分配实例、`assets/` 素材目录、`{{ $wechat.* }}` 字段一览、安全阀说明、只支持非队列模式,以及常见问题(端口占用、实例页空白、路径映射错误);对照第 4 到 7 组的实际行为逐条核对

## 12. 集成验证

-   [x] 12.1 用模拟 DLL 的 WS 客户端做端到端测试:实例上线、分配到工作区、启用一个"收到消息 → Cooldown → Send Text"流程,推送一条入站消息后,验证模拟客户端收到 `send.text`、执行记录生成;再推送同一会话的第二条消息,验证走冷却分支
-   [ ] 12.2 在一台装有微信与 `AIHelpLib.dll` 的 Windows 上,分别用直接安装和 Docker Desktop 部署,手动验证:实例上线、发送测试图片、文本自动回复、发送 `assets/` 中的图片、Fetch Image 后转发、Fetch Voice 后交给 LLM,并测量发送终态的实际延迟,用来确定 30 秒默认值是否合适

## Workflow follow-up

-   实现与验证完成后用 `/opsx:archive` 归档本 change。
-   下一个 change:资源库(资源页、`res://` 来源、参数表单中的资源选择控件,文件存放在交换目录的 `resources/` 下)。
