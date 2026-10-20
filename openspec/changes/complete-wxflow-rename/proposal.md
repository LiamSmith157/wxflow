## Why

上一次改名(077c6ae)只覆盖了包名、版本号、Docker 镜像名和 README,审计显示仍有约 370 个文件含 "flowise":启动日志、`flowise` CLI 命令、docker-compose 服务与镜像、HTML meta、logo 资源名、HTTP 头、官方推广链接、环境变量与 `~/.flowise` 数据目录等。用户在界面、日志和部署文件里仍会看到 Flowise,改名并未彻底。

## What Changes

范围已与用户确认:**可见层 + 配置层**,并保留上游署名。

- **可见层**:启动/关闭日志、Prometheus/OpenTelemetry 版本描述、`applicationName`、nvidia-nim `client_id`、UI 的 HTML meta(og/twitter)、logo 资源文件名、英文 locale 中的 "Flowise"、嵌入代码示例中的文案、`docker-compose*.yml` 服务/镜像/网络名、`.env.example` 注释、`Dockerfile`/CI 残留、各子包 README 与 package.json 的 homepage/author/keywords。
- **配置层**:环境变量新增 `WXFLOW_*` 对应项(`WXFLOW_SECRETKEY_OVERWRITE`、`WXFLOW_FILE_SIZE_LIMIT`、`WXFLOW_EE_LICENSE_KEY`、`DISABLE_WXFLOW_TELEMETRY` 等),旧 `FLOWISE_*` 作为回退继续生效;默认数据目录改为 `~/.wxflow`,但已存在 `~/.flowise` 时继续使用它;回调签名头新增 `X-Wxflow-Signature`,同时继续发送 `X-Flowise-Signature`;评估请求头同时接受 `X-Wxflow-Evaluation`。
- **失效链接清理**:Flowise 官方的 twitter、shields、AWS 图片、`team@/hello@/support@flowiseai.com` 邮箱、`docs.flowiseai.com` 部署文档链接,替换为 wxflow 自有地址或删除。
- **保留署名**:`LICENSE`、版权声明、README 的 "built with Flowise" 致谢保持不变。
- **不改动**(会破坏兼容或属历史/第三方):`InternalFlowiseError` 类名、`FLOWISE_CREDENTIAL_ID` 与 `flowise_chatId` 等持久化进流程数据的键、`FlowiseCredential_` 加密前缀、`FLOWISE_*` 文本转义标记、第三方 npm 包(`flowise-embed`、`flowise-embed-react`、`flowise-react-json-view`、`flowise-nim-container-manager`)、`i18n/README-*.md` 与 `openspec/changes/archive/`。

## Capabilities

### New Capabilities
- `wxflow-branding`: 产品对外呈现的名称(日志、界面、部署文件、CLI)统一为 wxflow,以及环境变量、数据目录、HTTP 头对旧 Flowise 名称的向后兼容规则。

### Modified Capabilities
<!-- 无:现有 console-* / api-surface 等规格的需求不变。 -->

## Impact

- 代码:`packages/server`(commands、metrics、DataSource、utils、callbackDispatcher、buildChatflow)、`packages/components`(utils、handler)、`packages/ui`(index.html、assets、locales/en、EmbedChat)、`docker/`、`Dockerfile`、各 README。
- 部署:升级用户无需改任何环境变量或迁移数据;docker-compose 服务名变更需用户重新 `up`。
- 外部集成:Webhook 接收方可继续校验 `X-Flowise-Signature`。
