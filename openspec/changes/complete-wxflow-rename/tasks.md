## 1. 配置层:环境变量与数据目录

- [x] 1.1 新增 `getEnv()` 工具(WXFLOW_* 优先、FLOWISE_* 回退),补单元测试
- [x] 1.2 替换 `packages/server/src/utils/index.ts`、`packages/components/src/utils.ts` 及其余直读 `process.env.FLOWISE_*`/`DISABLE_FLOWISE_TELEMETRY` 的位置(共约 4 个文件)
- [x] 1.3 在 `commands/base.ts` 增加 `WXFLOW_*` flags,与旧 flag 并存
- [x] 1.4 新增 `getDefaultDataDir()`(~/.wxflow → ~/.flowise 回退),替换所有 `.flowise` 路径拼接(密钥、日志、上传、数据库、blob),补三种目录组合的测试
- [x] 1.5 回调签名头双发 `X-Wxflow-Signature`/`X-Flowise-Signature`;评估头同时接受两种;更新 `callbackDispatcher.test.ts`

## 2. 可见层:服务端与组件

- [x] 2.1 `commands/{start,worker,base}.ts` 日志、`index.ts` 日志、Prometheus/OpenTelemetry 描述、`DataSource.ts` applicationName、nvidia-nim client_id 中的 "Flowise" 改为 wxflow
- [x] 2.2 `package.json`(homepage、author、keywords)与子包 README、`.env.example` 注释、`packages/components` 注释中的 Flowise 字样清理(保留 LICENSE 与致谢)

## 3. 可见层:UI

- [x] 3.1 `packages/ui/index.html`、`public/index.html`、`manifest.json` 的 title/meta 去除 Flowise
- [x] 3.2 重命名 `flowise_*` logo 资源并更新 `Logo.jsx` 等引用
- [x] 3.3 `locales/en/layout.json` 的 "sunsetting Flowise" 横幅及 `flowiseVersion` 等 key/文案;同步 zh-CN
- [x] 3.4 `EmbedChat.jsx` 的 terms/companyLink、`PricingDialog`、`auth/expired` 中的官方邮箱与链接清理(第三方 npm 包名保留)

## 4. 部署文件

- [x] 4.1 `docker/docker-compose*.yml`:服务名、镜像、网络、容器内路径、entrypoint 改为 wxflow,环境变量改 `WXFLOW_*`
- [x] 4.2 `docker/.env.example`、`docker/worker/.env.example`、`packages/server/.env.example` 同步新变量名并注明旧名仍兼容
- [x] 4.3 `Dockerfile` 与 `.github/workflows` 残留检查;根 README 增加升级说明(旧变量、旧数据目录、compose 挂载)

## 5. 链接清理与验收

- [x] 5.1 清理 README 及子包文档中的 Flowise twitter/shields/AWS 图片/官方邮箱/docs 链接(`i18n/README-*.md` 与 archive 不动)
- [x] 5.2 验收 grep:剩余 "flowise" 均属 design.md 列出的保留项(内部符号、持久化标识、第三方标识、`docs.flowiseai.com` 文档链接、LICENSE/致谢、i18n README、archive)
- [x] 5.3 components/server `tsc --noEmit` 通过;新增与受影响的单元测试、UI i18n/layout 测试通过(未跑全量 `pnpm build`,本机仅 2GB 内存)
