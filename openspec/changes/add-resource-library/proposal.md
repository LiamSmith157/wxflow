# Proposal

## Why

WeChat 发送节点需要的海报、产品图、视频、文档等长期素材，目前只能在节点里填 URL 或本地绝对路径，没有地方统一存放、命名、查找和替换。`add-wechat-channel` 去掉了 `assets/` 素材目录约定，并预留了 `res://` 来源，本 change 用资源库把长期素材管起来。

## What Changes

-   新增通用资源库：按工作区隔离，管理图片、视频和常见文档。每个资源有名称（工作区内唯一）、一级分组、类型、大小和预览。资源库不绑定某个渠道，第一期只有 WeChat 的 Send Image、Send File、Send Video 使用它。
-   新增资源页（主菜单"Resources / 资源库"）：上传、按分组浏览、按名称搜索、改名、改分组、替换文件、删除。列表显示"使用中"，即引用该资源的流程数量，可以展开查看是哪些流程。删除和改名前提示受影响的流程，由用户确认，不强制阻止。
-   资源文件固定存放在本地 `~/.wxflow/resources/`，不经过 `STORAGE_TYPE` 配置的 blob 存储，因为 DLL 只能读取本地路径。
-   新增两种资源引用写法：`res://id/<id>` 由选择控件写入，改名后不会失效；`res://name/<名称>` 用于手写或用变量拼名称，比如 `res://name/海报-{{ $wechat.city }}`，运行时按名称查找。
-   Send Image、Send File、Send Video 的媒体参数改为下拉选择加可输入：下拉只列出类型匹配的资源，按分组排列，可以搜索；仍然可以直接输入 URL、本地绝对路径或 `res://name/...`。
-   保存流程时，检查固定的资源引用：资源不存在或类型不匹配时给出警告，不阻止保存。
-   不在本 change 范围内：标签、多级文件夹、从流程中把文件存入资源库（如 Save to Resource 节点）、回收站或软删除、对象存储作为资源来源、跨工作区共享资源、其他节点（LLM 图片输入、邮件附件等）接入资源选择。

## Capabilities

### New Capabilities

-   `resource-library`: 资源的存储、元数据、名称唯一性、分组、类型和大小限制、上传、改名、替换、删除，以及"使用中"统计和资源页。
-   `resource-references`: `res://id/` 和 `res://name/` 两种引用的格式与解析、类型校验、媒体参数中的资源选择控件，以及保存流程时的引用检查。

### Modified Capabilities

-   `console-navigation`: 主菜单新增 Resources 条目，按 `resources:view` 权限显示。

## Impact

-   代码：`packages/server`（新增 `Resource` 实体和四种数据库的迁移、`services/resources`、资源接口与文件上传、RBAC 中的 `resources:*` 权限、在媒体来源解析器上注册 `res://` 来源、保存流程时的引用检查）；`packages/components/nodes/agentflow/WeChat`（媒体参数改为可输入的下拉选择）；`packages/ui`（资源页、菜单项与路由、中英文案）；`packages/api-documentation`（新增接口的说明）。
-   依赖：前置 change 是 `add-wechat-channel`，需要用到它简化后的媒体来源解析器和注册接口。本 change 对 `console-navigation` 的修改以 `add-wechat-channel` 归档后的菜单为基础。
-   数据：新增 `resource` 表，不改动已有表。已保存流程里的 URL 和绝对路径参数照常工作。
-   部署与配置：新增资源上传大小上限的环境变量（默认 50MB）。资源文件位于 `~/.wxflow/resources/`，备份 wxflow 时要包含这个目录。
