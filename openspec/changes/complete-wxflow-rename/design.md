# Design

## Context

审计(`grep -ri flowise`,排除 node_modules/archive)显示残留分四类:
1. 纯可见文案(日志、meta、locale、compose、README):可安全替换。
2. 配置入口(`FLOWISE_*` 环境变量、`~/.flowise`、`X-Flowise-*` 头):直接改名会破坏现有部署。
3. 持久化标识(`FLOWISE_CREDENTIAL_ID`、`flowise_chatId`、`FlowiseCredential_` 前缀):已写入流程 JSON / 数据库。
4. 内部符号与第三方(`InternalFlowiseError` ×1000+、`flowise-embed*` 等 npm 包):改动大且无用户价值,或无法改。

## Goals / Non-Goals

**Goals:** 类 1 全部替换;类 2 提供 wxflow 新名并保持旧名回退;清理失效的 Flowise 官方推广链接。

**Non-Goals:** 不重命名类 3、类 4;不迁移用户数据;不改 LICENSE/致谢、`i18n/README-*.md`、archive。

## Decisions

- **环境变量回退集中在一处**:新增小工具 `getEnv(name)`(读 `WXFLOW_<X>`,否则 `FLOWISE_<X>`;`DISABLE_WXFLOW_TELEMETRY` 同理),替换约 4 个文件内的 `process.env.FLOWISE_*` 直读,并在 oclif `commands/base.ts` 增加对应 flag。备选:启动时把 FLOWISE_* 拷贝到 WXFLOW_*——隐式、难测,放弃。
- **数据目录解析集中为 `getDefaultDataDir()`**:`~/.wxflow` 存在 → 用它;否则 `~/.flowise` 存在 → 用它;否则 `~/.wxflow`。`server/utils/index.ts` 与 `components/src/utils.ts` 中所有 `path.join(getUserHome(), '.flowise', …)` 改走该函数(加密密钥、日志、上传、数据库、blob)。加密密钥丢失会导致凭证不可读,因此绝不自动迁移/移动文件。
- **HTTP 头双发**:回调同时设置两个签名头;评估头读取时两者任一即可。
- **docker-compose 容器内路径**:`/home/node/.flowise` 改为 `/home/node/.wxflow`,宿主目录同改 `~/.wxflow`;文档注明旧用户可保留原挂载并设置 `SECRETKEY_PATH` 等变量。
- **logo 资源**:`flowise_*.svg/png` 重命名为 `wxflow_*`,同步 import;图像内容是否重绘不在本次范围(沿用现有图)。
- **链接**:有 wxflow 对应物则替换;没有的(twitter、shields、AWS 邮件背景图/logo、官方邮箱、邮件模板里的社交图标、FUNDING)删除,避免指向他人账号。节点说明与界面里的 `docs.flowiseai.com` 文档链接**保留**:wxflow 暂无自有文档站,这些文档仍是唯一的功能说明。
- **实施中的决定**:
  - UI 的 "We're sunsetting Flowise" 横幅描述的是上游停更,无法如实改写为 wxflow,整体移除(组件、状态、locale、测试)。
  - 内部符号保留:`FlowiseMemory` 等包装类、`flowiseOptions`、`lc_namespace`、`removeFlowiseCredentialId`、Prometheus 指标名 `flowise_*`、AWS 密钥默认前缀 `Flowise`、`JWT_ISSUER/AUDIENCE` 默认值、`DATABASE_NAME`、i18n key 名(`flowiseVersion` 等)。
  - 第三方服务标识保留:Vectara `source`、Astra 默认集合名、FireCrawl/Oxylabs/Cerebras 的 integration 标识、Pipedream 预览用户,改动会影响对方侧的数据或统计。
  - 内部请求头 `flowise-tool` 改为 `wxflow-tool`,服务端两种都接受。
  - Header 的 GitHub star 按钮与 About 的"最新版本"检查仍指向上游 FlowiseAI/Flowise 仓库,wxflow 暂无自有仓库地址,留待后续决定。
  - 邮件发件人默认 `noreply@wxflow.local` 仅为占位,部署时应设置 `SENDER_EMAIL`。
  - Docker Hub/ECR 发布流程的镜像名占位为 `wxflow/wxflow`、`wxflow/wxflow-worker`,命名空间需按实际账号调整。

## Risks / Trade-offs

- 漏掉某处直读 `process.env.FLOWISE_*` → 旧变量失效。缓解:完成后 grep 断言 `process.env.FLOWISE` 仅出现在 `getEnv` 内。
- 数据目录判断出错会让用户"丢失"数据。缓解:单元测试覆盖三种目录组合。
- docker-compose 改容器内路径,旧用户沿用旧挂载会数据落在新路径。缓解:README 升级说明。
