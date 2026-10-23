# Spec Delta

## Purpose

定义流程如何引用资源库中的资源：两种 `res://` 引用格式、运行时如何解析成本地文件、类型校验，以及节点媒体参数中的资源选择控件和保存流程时的引用检查。

## ADDED Requirements

### Requirement: 按 ID 引用资源

`res://id/<资源 ID>` SHALL 解析为当前工作区中该 ID 对应资源的本地文件。资源改名或改分组后，该引用 SHALL 仍然有效。资源不存在或不属于当前工作区时，节点 SHALL 失败，错误信息说明资源不存在、可能已被删除。

#### Scenario: 改名后仍然有效

-   **WHEN** 流程引用 `res://id/<海报的 ID>`，资源从 `海报-北京` 改名为 `海报-北京-秋季`
-   **THEN** 流程运行时发送该资源

#### Scenario: 资源已被删除

-   **WHEN** 流程引用的 `res://id/...` 对应的资源已被删除
-   **THEN** 节点失败，错误信息说明资源不存在、可能已被删除

### Requirement: 按名称引用资源

`res://name/<名称>` SHALL 在变量替换之后，按名称（规则同资源名称唯一性）在当前工作区中查找资源。找不到时节点 SHALL 失败，错误信息 SHALL 给出替换后的名称。

#### Scenario: 用变量选择资源

-   **WHEN** 媒体参数为 `res://name/海报-{{ $wechat.city }}`，`$wechat.city` 为 `上海`，资源库中有 `海报-上海`
-   **THEN** 节点发送资源 `海报-上海`

#### Scenario: 名称找不到

-   **WHEN** 替换后的名称为 `海报-拉萨`，资源库中没有该资源
-   **THEN** 节点失败，错误信息为类似"资源 `海报-拉萨` 不存在"的提示

### Requirement: 资源类型必须与节点匹配

Send Image SHALL 只接受图片资源，Send Video SHALL 只接受视频资源，Send File SHALL 接受任意类型的资源。类型不匹配时节点 SHALL 失败，并说明资源的实际类型。

#### Scenario: 用视频资源发图片

-   **WHEN** Send Image 的媒体参数引用了一个视频资源
-   **THEN** 节点失败，提示该资源是视频，不能作为图片发送

### Requirement: 媒体参数的来源顺序

Send Image、Send File、Send Video 的媒体参数 SHALL 按以下顺序识别：`res://` 资源引用；`http(s)://` URL；本地绝对路径。资源引用 SHALL NOT 改变 URL 和本地绝对路径的已有行为。

#### Scenario: 已保存的 URL 参数

-   **WHEN** 资源库上线前保存的流程中，Send Image 参数为一个 `https://` 地址
-   **THEN** 流程照常下载该地址并发送

### Requirement: 媒体参数的资源选择控件

Send Image、Send File、Send Video 的媒体参数 SHALL 提供下拉选择，只列出当前工作区中类型匹配的资源（Send File 列出全部类型），按分组排列，支持按名称搜索。下拉中每个资源名称前 SHALL 显示预览：图片显示缩略图；视频、压缩包（zip、rar、7z 等）和其他文件按格式显示默认图标，未知格式显示通用文件图标。选中的资源在参数框中 SHALL 同样显示该预览。选择资源后，参数值 SHALL 为该资源的 `res://id/` 引用，界面 SHALL 显示资源名称而不是 ID。该参数 SHALL 仍然允许直接输入 URL、本地绝对路径或 `res://name/` 引用。

#### Scenario: 从下拉选择图片

-   **WHEN** 用户在 Send Image 的媒体参数中选择资源 `海报-北京`
-   **THEN** 参数值保存为 `res://id/<海报-北京 的 ID>`，界面显示 `海报-北京`

#### Scenario: 下拉按类型过滤

-   **WHEN** 资源库中有图片和视频，用户打开 Send Video 媒体参数的下拉
-   **THEN** 下拉只列出视频资源

#### Scenario: 下拉显示缩略图和格式图标

-   **WHEN** 资源库中有图片 `海报-北京` 和压缩包 `素材包.zip`，用户打开 Send File 媒体参数的下拉
-   **THEN** `海报-北京` 前显示该图片的缩略图，`素材包` 前显示压缩包图标

#### Scenario: 手动输入

-   **WHEN** 用户在媒体参数中输入 `res://name/海报-{{ $wechat.city }}`
-   **THEN** 参数值按原样保存

### Requirement: 保存流程时检查资源引用

保存流程时，系统 SHALL 检查媒体参数中不含变量的资源引用。资源不存在或类型与节点不匹配时，SHALL 在画布上显示警告，但 SHALL NOT 阻止保存。含变量的引用 SHALL 不做检查。

#### Scenario: 引用的资源已被删除

-   **WHEN** 用户保存一个 Send Image 引用了已删除资源的流程
-   **THEN** 流程保存成功，画布上该节点显示资源不存在的警告

#### Scenario: 含变量的引用

-   **WHEN** 用户保存一个媒体参数为 `res://name/海报-{{ $wechat.city }}` 的流程
-   **THEN** 该参数不产生警告
