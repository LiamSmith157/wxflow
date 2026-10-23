# Spec Delta

## Purpose

定义资源库中的资源在流程运行时如何被载入为节点可用的内容：文档的文本提取规则，以及把资源内容或信息交给后续节点的 Load Resource 节点。

## ADDED Requirements

### Requirement: 提取文档资源的文本

系统 SHALL 能从以下格式的资源中提取纯文本：pdf、docx、xlsx、xls、pptx、txt。表格文件 SHALL 按工作表逐个输出，并标明工作表名称。txt SHALL 能正确读取 UTF-8（含或不含 BOM）和 GBK 编码的中文。

#### Scenario: 提取 pdf 文本

-   **WHEN** 流程载入一个含文字的 pdf 资源 `产品手册`
-   **THEN** 得到的文本包含该 pdf 的正文文字

#### Scenario: 提取表格

-   **WHEN** 流程载入一个有"价目表"和"折扣"两个工作表的 xlsx 资源
-   **THEN** 得到的文本先后包含两个工作表的内容，每部分前标明工作表名称

#### Scenario: GBK 编码的 txt

-   **WHEN** 流程载入一个 GBK 编码、内容为中文的 txt 资源
-   **THEN** 得到的文本中文显示正确，没有乱码

### Requirement: 无法提取文本时节点失败

当资源是图片、视频、zip、doc、ppt，或文件内容中提取不到任何文字（如扫描版 pdf）时，需要文本的节点 SHALL 失败，错误信息 SHALL 给出资源名称和原因。

#### Scenario: 旧版 doc 文件

-   **WHEN** 流程需要资源 `合同模板`（.doc 文件）的文本
-   **THEN** 节点失败，提示该格式不支持提取文本，建议另存为 docx 后替换资源文件

#### Scenario: 扫描版 pdf

-   **WHEN** 流程需要一个只有扫描图片、没有文字层的 pdf 资源的文本
-   **THEN** 节点失败，提示该资源中没有可提取的文字

### Requirement: 提取的文本有字符上限

单个资源提取出的文本 SHALL 有字符上限，默认 50000 个字符，可以通过配置修改。超过上限时 SHALL 只保留前面的内容，并在末尾注明内容已截断及原始长度。

#### Scenario: 超长文档

-   **WHEN** 上限为 50000，资源提取出 120000 个字符
-   **THEN** 得到的文本为前 50000 个字符，末尾注明已截断、原文共 120000 个字符

### Requirement: Load Resource 节点选择资源

Load Resource 节点 SHALL 提供一个资源参数：可以从下拉中选择当前工作区的任意类型资源，也可以输入 `res://name/<名称>`（可以含变量）。该参数 SHALL NOT 接受本地绝对路径或 URL；输入这类值时节点 SHALL 失败，并说明只能载入资源库中的资源。

#### Scenario: 按变量选择资源

-   **WHEN** 资源参数为 `res://name/价目表-{{ $flow.state.city }}`，`city` 为 `上海`，资源库中有 `价目表-上海`
-   **THEN** 节点载入资源 `价目表-上海`

#### Scenario: 输入本地路径

-   **WHEN** 资源参数为 `C:\data\secret.txt`
-   **THEN** 节点失败，提示只能载入资源库中的资源

### Requirement: Load Resource 节点的返回内容

Load Resource 节点 SHALL 提供"返回内容"选项，决定节点输出的内容：文本内容（默认，规则同文本提取）、本地路径、资源信息（包含 ID、名称、分组、类型、内容类型、大小、本地路径的 JSON）。选择"文本内容"但资源无法提取文本时，节点 SHALL 失败，规则同文本提取。

#### Scenario: 返回文本内容

-   **WHEN** Load Resource 选择资源 `产品手册`（pdf），返回内容为"文本内容"，后续 LLM 节点的输入消息引用该节点的输出
-   **THEN** LLM 收到的输入消息中包含产品手册的文本

#### Scenario: 返回资源信息

-   **WHEN** Load Resource 选择图片资源 `海报-北京`，返回内容为"资源信息"
-   **THEN** 节点输出一个 JSON，其中名称为 `海报-北京`、类型为 `image`，并包含资源的 ID、大小和本地路径

#### Scenario: 视频请求文本内容

-   **WHEN** Load Resource 选择视频资源 `开业视频`，返回内容为"文本内容"
-   **THEN** 节点失败，提示 `开业视频` 是视频，无法提取文本

#### Scenario: 把资源交给 WeChat 发送

-   **WHEN** Load Resource 选择图片资源，返回内容为"本地路径"，后续 Send Image 的媒体参数引用该节点的输出
-   **THEN** Send Image 发送该图片

### Requirement: Load Resource 节点写入 flow state

Load Resource 节点 SHALL 支持与其他 Agentflow 节点相同的"更新 flow state"参数，可以把节点输出写入 flow state 的指定键，供后续节点引用。

#### Scenario: 写入 flow state

-   **WHEN** Load Resource 把输出写入 flow state 的 `manual` 键，后续 Custom Function 读取 `$flow.state.manual`
-   **THEN** Custom Function 读到的值与 Load Resource 节点的输出相同

### Requirement: Load Resource 的执行记录

Load Resource 节点的执行记录 SHALL 显示所载入资源的名称、类型和返回内容方式；当参数含变量时，SHALL 同时显示变量替换后的引用。

#### Scenario: 查看执行记录

-   **WHEN** 资源参数为 `res://name/价目表-{{ $flow.state.city }}` 的 Load Resource 节点运行后，用户在 Executions 中查看该节点
-   **THEN** 记录中显示 `res://name/价目表-上海`、资源名称 `价目表-上海`、类型和返回内容方式
