# Design

## Context

动机和范围见 proposal.md，行为要求见 `specs/resource-library` 和 `specs/resource-references`。设计受以下现状约束：

-   **前置 change `add-wechat-channel`。** 它把媒体来源解析器简化为 URL 和本地绝对路径两种来源，并保留了来源注册接口（`channels/media/resolver.ts`）。媒体工作目录固定为 `~/.wxflow/wechat/`，wxflow 直接安装在微信所在的 Windows 上，发给 DLL 的路径就是本地路径。保存流程时，`services/validation` 已经会对 WeChat 媒体参数给出警告。
-   **已有的工作区资源模式。** `Variable` 等实体带 `workspaceId`，权限在 `enterprise/rbac/Permissions.ts` 中按类别定义（如 `variables:view|create|update|delete`），菜单项在 `menu-items/dashboard.js` 中按权限显示。迁移分 sqlite、postgres、mysql、mariadb 四套。
-   **blob 存储。** `storageUtils` 和 `getMulterStorage()` 会按 `STORAGE_TYPE` 把文件写到本地、S3、GCS 或 Azure。DLL 只能读本地路径。
-   **节点参数。** `INodeParams` 支持 `asyncOptions` 加 `loadMethod`（WeChat 节点的 Instance 参数就是这样做的），也支持 `freeSolo`。WeChat 的媒体参数现在是 `string` 加 `acceptVariable`。

## Goals / Non-Goals

**Goals:**

-   资源库的数据模型和接口不出现渠道相关字段，以后其他节点接入时不用迁移数据。
-   引用解析只有一个入口（在媒体来源解析器上注册的 `res://` 来源），节点代码不直接访问资源表。

**Non-Goals:**

-   不做资源的版本历史。替换文件会覆盖旧文件。
-   不做缩略图生成。图片预览直接返回原图，由前端缩放显示。
-   不支持导出或导入流程时一并带上资源。

## Decisions

### 1. 数据模型

新增实体 `Resource`，对应表 `resource`：

| 字段                         | 说明                                                  |
| ---------------------------- | ----------------------------------------------------- |
| `id`                         | uuid                                                  |
| `workspaceId`                | 所属工作区                                            |
| `name`                       | 显示名称，工作区内唯一                                |
| `nameKey`                    | `name` 去掉首尾空白后转小写，用于唯一索引和按名称查找 |
| `group`                      | 一级分组，可为空                                      |
| `kind`                       | `image` / `video` / `file`                            |
| `mimeType`、`ext`、`size`    | 当前文件的内容类型、扩展名和字节数                    |
| `originalName`               | 上传时的原文件名，用于下载和展示                      |
| `createdDate`、`updatedDate` | 时间戳                                                |

唯一索引为 `(workspaceId, nameKey)`。之所以单独存 `nameKey`，是因为四种数据库对大小写不敏感比较的支持不一致，统一在应用层规范化最可靠。

分组只作为一个字符串字段，不建分组表。资源页的分组列表就是当前工作区所有非空 `group` 的去重结果。备选是建一张分组表来支持空分组和排序，但第一期用不上。

### 2. 文件存放

文件路径为 `~/.wxflow/resources/<workspaceId>/<resourceId><ext>`，不用原文件名，避免中文、空格和重名问题，按 ID 也能直接定位。

上传使用 multer 的磁盘存储，先写到 `~/.wxflow/resources/.upload/` 下的临时文件。校验类型和大小都通过后，再改名到最终位置。任何一步失败都删除临时文件，所以不会留下部分文件。这里不用 `getMulterStorage()`，因为它会按 `STORAGE_TYPE` 把文件写到对象存储。

替换文件时，先把新文件写到临时位置，校验通过后再覆盖旧文件，并更新 `mimeType`、`ext`、`size`、`originalName`。如果扩展名变了（例如 png 换成 jpg），旧文件在覆盖成功后删除。

类型判断以文件头的魔数为准，扩展名只作参考，防止把 `.exe` 改名成 `.jpg` 上传。允许的类型列表见 `resource-library` 规格；上限取自 `RESOURCE_MAX_MB`，默认 50。

备选：放进 blob 存储，发送前再下载到本地。这样不仅多了一次复制，还要处理缓存失效。微信渠道已经限定为同机部署，本地存储没有实际损失。

### 3. 引用格式与解析

```
res://id/<uuid>          选择控件写入，按 ID 查找
res://name/<名称>         手写或拼变量，变量替换后按 nameKey 查找
```

两种前缀写得很明确，解析时不用猜，以后需要也可以加别的形式。

解析由注册到媒体来源解析器的 `resourceSource` 完成。它排在 URL 和绝对路径前面，只匹配 `res://` 开头的值。`MediaContext` 要新增 `workspaceId`，供它限定查找范围；这是对 `add-wechat-channel` 接口唯一的改动。解析结果是资源文件的本地路径，`temporary: false`，发送后不删除。

类型校验也在解析时完成：调用方在 `MediaContext` 中带上节点允许的类型（Send Image 为 `image`，Send Video 为 `video`，Send File 不限）。

变量替换发生在节点运行之前（`buildAgentflow` 对参数统一处理），所以 `res://name/海报-{{ $wechat.city }}` 到达解析器时已经是 `res://name/海报-上海`。

### 4. 选择控件

媒体参数从 `string` 改为 `asyncOptions` 加 `freeSolo: true`，`loadMethod` 为 `listResources`：

-   选项的 `name` 为 `res://id/<id>`，`label` 为资源名称，`description` 为分组。这样界面显示的是名称，保存的是 ID；
-   loadMethod 按节点的类型过滤（每个节点各自声明 `listImageResources` 等，或者共用一个方法，通过参数传入类型），按分组、名称排序；
-   `freeSolo` 让用户可以直接输入 URL、绝对路径或 `res://name/...`。

loadMethod 在 `packages/components` 中运行，通过 `options.appDataSource` 和 `databaseEntities` 查询 `Resource`，并用 `options.searchOptions` 中的 `workspaceId` 限定范围，做法同现有的工作区隔离 loadMethod。

节点版本号加 1。已保存流程中的参数值是字符串，切换控件类型后按 `freeSolo` 的输入值原样显示，不需要迁移。

备选：保留 `string` 输入，旁边加一个"选择资源"按钮。这样可以保留变量提示，但需要新增一种参数渲染方式，而且输入框里只能显示 `res://id/...`，看不到资源名称。代价见 Risks 第一条。

### 5. 使用情况统计

`services/resources` 提供 `findUsages(workspaceId, resource)`：读取该工作区所有 AGENTFLOW 流程的 `flowData`，在文本中查找 `res://id/<id>`，以及 `res://name/<名称>` 后面紧跟引号的完整字面量（名称不区分大小写，含 `{{` 的值跳过）。返回流程的 id 和名称。

资源列表接口需要每个资源的使用数，为此一次读取工作区全部流程，对所有资源批量统计，不对每个资源分别扫描。

备选：在保存流程时维护一张引用索引表，查询更快。但这要在 `services/chatflows` 的保存、删除、导入路径上都同步维护。第一期流程数量有限，实时扫描足够；以后变慢了再加索引，接口不变。

### 6. 接口

| 方法与路径                         | 权限               | 说明                                                           |
| ---------------------------------- | ------------------ | -------------------------------------------------------------- |
| `GET /api/v1/resources`            | `resources:view`   | 列表，支持 `kind`、`group`、`search` 筛选，每项带 `usageCount` |
| `POST /api/v1/resources`           | `resources:create` | multipart 上传：`file`、`name`、`group`                        |
| `PUT /api/v1/resources/:id`        | `resources:update` | 改名、改分组                                                   |
| `PUT /api/v1/resources/:id/file`   | `resources:update` | 替换文件                                                       |
| `DELETE /api/v1/resources/:id`     | `resources:delete` | 删除资源和文件                                                 |
| `GET /api/v1/resources/:id/file`   | `resources:view`   | 预览或下载（`?download=1` 时带附件文件名）                     |
| `GET /api/v1/resources/:id/usages` | `resources:view`   | 引用该资源的流程；`?byName=1` 时只返回按名称引用的流程         |

删除和改名的确认在前端完成：先调 `usages`，展示结果，用户确认后再发删除或改名请求。服务端不做二次确认，也不因为有引用而拒绝请求（规格要求不强制阻止）。

### 7. 保存时检查

在 `services/validation` 现有的 WeChat 媒体参数检查中加入资源引用：不含 `{{` 的 `res://id/` 和 `res://name/` 引用，如果找不到资源或类型不匹配，就产生警告，格式与文件不存在的警告一致，画布上的显示方式不变。

### 8. 资源页

页面位于 `views/resources`，菜单项放在 Variables 之后。页面布局：

```
 +--------------------------------------------------------------+
 | Resources                       [搜索名称...]  [上传资源]     |
 +-------------+------------------------------------------------+
 | 全部 (20)   | [缩略图] 海报-北京    海报  图片 1.2MB  使用中 3 |
 | 海报 (12)   | [缩略图] 海报-上海    海报  图片 1.1MB  使用中 0 |
 | 产品图 (5)  | [视频]   开业视频     -     视频 18MB   使用中 1 |
 | 未分组 (3)  |                       [替换] [编辑] [下载] [删除]  |
 +-------------+------------------------------------------------+
```

左侧是分组列表，右侧是资源表格，"使用中"可以点开查看流程列表。编辑对话框里可以改名和改分组，分组输入支持选择已有分组或输入新分组。

## Risks / Trade-offs

-   [`freeSolo` 下拉框不支持 `{{ }}` 变量提示] → 用户仍然可以手动输入变量，运行时照常替换；在参数说明里写一个 `res://name/海报-{{ $wechat.city }}` 示例。实现时先确认 `buildAgentflow` 会对 `asyncOptions` 参数做变量替换。如果不会，就改用决策 4 的备选方案。
-   [流程导出到另一个 wxflow 后，`res://id/...` 失效] → 保存时检查会给出警告。按名称引用的流程只要目标环境里有同名资源就能用。跨环境迁移资源不在本期范围内。
-   [按名称统计引用是文本匹配，可能漏掉或误报] → 统计范围只覆盖不含变量的完整字面量，规格和页面都明确说明了统计口径。删除和改名只是提示，不阻止，统计不准也不会锁死操作。
-   [删除工作区后资源文件残留] → 在工作区删除的流程中加入删除对应的 `~/.wxflow/resources/<workspaceId>/` 目录；如果暂时没有接入点，就在启动时清理不属于任何现存工作区的目录。
-   [替换文件时 DLL 正在读取旧文件] → 先写临时文件再改名覆盖，Windows 上如果目标文件被占用，改名会失败，这时返回"文件正在使用，请稍后重试"，旧文件保持不变。
-   [备份遗漏] → 文档写明 `~/.wxflow/resources/` 需要和数据库一起备份。

## Migration Plan

1. 四种数据库各新增一个迁移，创建 `resource` 表和 `(workspaceId, nameKey)` 唯一索引；不修改已有表。
2. RBAC 新增 `resources:*` 权限。已有角色不自动获得这些权限，管理员按需分配；拥有全部权限的角色自动包含它们，规则与现有权限相同。
3. WeChat 媒体节点的版本号加 1。已保存流程中的 URL 和绝对路径参数不受影响。
4. 回滚：移除菜单项和接口即可，`resource` 表和资源目录保留，不影响其他功能；引用了 `res://` 的流程会在运行时报"不支持的媒体来源"。
