# Tasks

## 1. 数据层与配置

-   [x] 1.1 新增实体 `Resource`（字段见 design 决策 1），注册到 `database/entities/index.ts`；为 sqlite、postgres、mysql、mariadb 各写一个迁移，创建 `resource` 表和 `(workspaceId, nameKey)` 唯一索引，并在各自的 `index.ts` 中注册；用 sqlite 启动一次，确认迁移执行且没有改动已有表，其余三种数据库的迁移与 sqlite 版本逐列核对
-   [x] 1.2 在 `packages/server/.env.example` 和 `docker/.env.example` 加入带注释的 `RESOURCE_MAX_MB`（默认 50）；验证两个文件中的变量名一致

## 2. 资源服务

-   [x] 2.1 实现 `services/resources` 的名称规范化与校验（去首尾空白、1 到 100 个字符、禁止 `/`、`\`、`{`、`}`、`nameKey` 转小写）和类型识别（按文件头魔数归为 image/video/file，不在允许列表中则拒绝）；单元测试覆盖 `resource-library` 规格中名称和类型相关的场景，包括把 `.exe` 改名成 `.jpg` 上传
-   [x] 2.2 实现文件存放：先写到 `~/.wxflow/resources/.upload/` 临时文件，校验通过后改名到 `<workspaceId>/<id><ext>`，失败时删除临时文件；大小超过 `RESOURCE_MAX_MB` 时拒绝；用临时目录写测试，验证成功路径、超限和类型不符时都不留下文件
-   [x] 2.3 实现创建、列表（`kind`、`group`、`search` 筛选）、改名、改分组、替换文件（类型必须相同、扩展名变化时删除旧文件、目标文件被占用时返回可读错误）和删除（同时删除文件）；单元测试覆盖工作区隔离、重名、替换类型不符和删除后文件不存在
-   [x] 2.4 实现 `findUsages`，以及批量统计列表中每个资源的使用数（design 决策 5）：匹配 `res://id/<id>`、不含变量的完整 `res://name/<名称>`（不区分大小写），跳过含 `{{` 的值；测试覆盖按 ID 引用、按名称引用、变量引用不计入、其他工作区的流程不计入

## 3. 接口与权限

-   [x] 3.1 在 `enterprise/rbac/Permissions.ts` 新增 `resources` 类别和 `resources:view|create|update|delete` 权限；新增 design 决策 6 中的路由和 controller，上传使用 multer 磁盘存储而不是 `getMulterStorage()`；测试验证只有 view 权限时删除被拒绝、其他工作区的资源返回 404、配置了 `STORAGE_TYPE=s3` 时文件仍然写到本地
-   [x] 3.2 在 `packages/api-documentation` 的 swagger 中补充资源接口；验证文档生成命令成功，并包含新路径

## 4. 资源引用解析

-   [x] 4.1 `MediaContext` 新增 `workspaceId` 和节点允许的资源类型；实现 `res://` 来源（`res://id/` 按 ID 查找，`res://name/` 按 `nameKey` 查找，限定当前工作区，校验类型，解析结果为本地路径且 `temporary: false`），在服务启动时注册到媒体来源解析器，排在 URL 和绝对路径之前；单元测试覆盖 `resource-references` 规格中 ID 引用、名称引用、资源已删除、名称找不到、类型不匹配，以及 URL 参数行为不变
-   [x] 4.2 在 WeChat 节点共用模块中把 `workspaceId` 和各节点允许的类型（Send Image 为 image、Send Video 为 video、Send File 不限）传给解析器；用 `MockChannelAdapter` 写测试，验证 Send Image 引用图片资源时 DLL 收到资源文件的本地路径、发送后文件不被删除
-   [x] 4.3 在 `services/validation` 的 WeChat 媒体参数检查中加入资源引用检查：不含变量的引用找不到资源或类型不匹配时产生警告，不阻止保存；测试覆盖已删除资源、类型不匹配和含变量的引用

## 5. 选择控件

-   [x] 5.1 先确认 `buildAgentflow` 会对 `asyncOptions` 参数值做变量替换（写一个测试，参数值为 `res://name/海报-{{ $wechat.city }}`）；如果不会，在 design 决策 4 中改用备选方案后再继续 5.2
-   [x] 5.2 把 Send Image、Send File、Send Video 的媒体参数改为 `asyncOptions` 加 `freeSolo`，新增按类型过滤的 loadMethod（通过 `options.searchOptions` 限定工作区，按分组、名称排序，`name` 为 `res://id/<id>`，`label` 为资源名称，`description` 为分组），节点版本号加 1，参数说明里写上 URL、绝对路径和 `res://name/` 的示例；测试验证 loadMethod 的类型过滤和工作区隔离，以及旧流程中的字符串参数值不变
-   [x] 5.3 在画布上手动确认：下拉显示资源名称、选择后保存为 `res://id/...`、可以直接输入 URL 和 `res://name/...`；补充 `locales/zh-CN/nodes.json` 中参数说明和占位符的中文，运行 `i18n/nodesCoverage.test.js`
-   [x] 5.4 下拉预览：loadMethod 的选项带上资源的 `id`、`kind`、`ext`、`updatedDate`（`INodeOptionsValue.resource`）；`ResourceThumb` 移到 `ui-component/resources`，加 `size` 参数和按格式区分的默认图标（压缩包、pdf、doc、xls、csv、ppt、txt、视频、通用文件），缩略图的 object URL 按 `id + updatedDate` 缓存，下载失败不缓存；`AsyncDropdown` 在资源选项和选中值前显示它；补充测试并在画布上确认

## 6. 资源页

-   [x] 6.1 新增 `views/resources` 页面（design 决策 8）：左侧分组列表及数量，右侧资源表格（图片缩略图、类型图标、名称、分组、类型、大小、使用中），按名称搜索，上传对话框（文件、名称、分组），编辑对话框（改名、改分组，分组可以选择已有的或新输入），替换文件，下载；按权限隐藏创建、修改、删除按钮；写组件测试覆盖分组筛选、搜索和按权限隐藏按钮
-   [x] 6.2 实现删除和改名确认：删除前调用 `usages` 列出流程并要求确认；改名时用 `byName=1` 列出按名称引用的流程，提示这些引用会失效；页面说明变量引用无法统计；组件测试覆盖有引用、无引用和取消三种情况
-   [x] 6.3 在 `menu-items/dashboard.js` 中 Variables 之后加入 Resources 菜单项（`resources:view` 权限）和路由；在 `locales/{en,zh-CN}` 中补充菜单和页面文案；更新 `menu-items.test.js`，验证无权限时菜单不显示，切换语言后条目顺序不变

## 7. 文档与集成验证

-   [x] 7.1 在 `README.md` 的"接入微信"章节加入资源库用法：上传、在节点里选择、`res://name/` 加变量的写法、改名和删除的影响，以及 `~/.wxflow/resources/` 需要备份；对照第 2 到 6 组的实际行为逐条核对
-   [x] 7.2 端到端测试：上传一张图片资源，保存一个"收到消息 → Send Image（选择该资源）"流程，用模拟 DLL 推送入站消息，验证模拟客户端收到的 `send.image` 路径指向资源文件；替换文件后再推送一次，验证发送的是新文件；删除资源后再推送一次，验证节点失败并给出"资源不存在"的错误

## Workflow follow-up

-   前置条件：`add-wechat-channel` 的第 13 组（简化媒体目录）完成并归档后再开始实现本 change。
-   实现与验证完成后用 `/opsx:archive` 归档本 change。
-   以后可以考虑：标签、Save to Resource 节点、回收站、引用索引表、其他节点接入资源选择。
