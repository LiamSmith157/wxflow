# Spec Delta

## ADDED Requirements

### Requirement: 资源选择参数在各节点中行为一致

所有提供资源选择的节点参数 SHALL 使用相同的选择方式：只列出当前工作区中节点所接受类型的资源，按分组排列，支持按名称搜索；选择后参数值为 `res://id/` 引用，界面显示资源名称；可以直接输入 `res://name/` 引用并含变量。提供资源选择的参数包括 Send Image、Send File、Send Video 的媒体参数，Load Resource 的资源参数，LLM 和 Agent 的附加资源。

#### Scenario: 在 Load Resource 中选择

-   **WHEN** 用户在 Load Resource 的资源参数中选择资源 `产品手册`
-   **THEN** 参数值保存为 `res://id/<产品手册 的 ID>`，界面显示 `产品手册`

#### Scenario: WeChat 节点行为不变

-   **WHEN** 用户在 Send Image 的媒体参数中选择图片资源，或输入 URL
-   **THEN** 保存的值和运行结果与本 change 之前相同

### Requirement: 只接受资源引用的参数

Load Resource 的资源参数和 LLM、Agent 的附加资源 SHALL 只接受 `res://id/` 和 `res://name/` 引用。变量替换后的值不是资源引用时（例如本地绝对路径、URL 或其他文本），节点 SHALL 失败，并说明该参数只能使用资源库中的资源。Send Image、Send File、Send Video 的媒体参数仍然接受 URL 和本地绝对路径。

#### Scenario: 变量替换后得到 URL

-   **WHEN** LLM 附加资源的一项为 `{{ $flow.state.file }}`，替换后为 `https://example.com/a.pdf`
-   **THEN** 节点失败，提示附加资源只能使用资源库中的资源

## MODIFIED Requirements

### Requirement: 保存流程时检查资源引用

保存流程时，系统 SHALL 检查以下参数中不含变量的资源引用：Send Image、Send File、Send Video 的媒体参数，Load Resource 的资源参数，LLM 和 Agent 的附加资源。资源不存在或类型与节点不匹配时，SHALL 在画布上显示警告，但 SHALL NOT 阻止保存。含变量的引用 SHALL 不做检查。Load Resource 和附加资源中不含变量、又不是资源引用的值 SHALL 产生"只能使用资源库中的资源"的警告。

#### Scenario: 引用的资源已被删除

-   **WHEN** 用户保存一个 Send Image 引用了已删除资源的流程
-   **THEN** 流程保存成功，画布上该节点显示资源不存在的警告

#### Scenario: 含变量的引用

-   **WHEN** 用户保存一个媒体参数为 `res://name/海报-{{ $wechat.city }}` 的流程
-   **THEN** 该参数不产生警告

#### Scenario: 附加资源类型不匹配

-   **WHEN** 用户保存一个 LLM 节点，附加资源中有一项是 `res://name/开业视频`，该资源是视频
-   **THEN** 流程保存成功，画布上该 LLM 节点显示该资源是视频、不能附加的警告

#### Scenario: Load Resource 填了本地路径

-   **WHEN** 用户保存一个资源参数为 `C:\data\a.pdf` 的 Load Resource 节点
-   **THEN** 流程保存成功，画布上该节点显示只能使用资源库中资源的警告
