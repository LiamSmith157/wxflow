# Spec Delta

## Purpose

定义 wxflow 与注入微信的 `AIHelpLib.dll` 之间如何交换媒体文件:wxflow 直接安装在微信所在的 Windows 上,双方看到同一个文件系统;wxflow 使用一个内部媒体工作目录存放临时文件和取回的媒体,媒体参数按来源解析成本地路径,并负责清理和自检。

## ADDED Requirements

### Requirement: 内部媒体工作目录

系统 SHALL 使用固定的内部目录 `~/.wxflow/wechat/` 存放 URL 下载的临时文件、Fetch Image 解密出的图片和 Fetch Voice 得到的音频。该目录 SHALL NOT 需要用户配置。发给 DLL 的路径 SHALL 与 wxflow 读写时使用的路径相同,不做任何转换。

#### Scenario: 发送本地图片

-   **WHEN** 节点发送 `D:\素材\a.jpg`
-   **THEN** DLL 收到的路径为 `D:\素材\a.jpg`

#### Scenario: 取图片

-   **WHEN** Fetch Image 调用 `image.get`
-   **THEN** 传给 DLL 的 `outDir` 为 `~/.wxflow/wechat/images/` 展开后的绝对路径,节点输出的文件路径 wxflow 可以直接读取

### Requirement: 媒体参数的来源

媒体参数 SHALL 按以下顺序识别:以 `http://` 或 `https://` 开头的 URL;本地绝对路径。本地绝对路径 SHALL 不限制所在目录。既不是 URL 也不是绝对路径的值 SHALL 使节点失败,错误信息说明媒体参数需要 URL 或绝对路径。来源种类 SHALL 可以注册扩展,新增来源不改变已有来源的行为。

#### Scenario: 任意目录下的绝对路径

-   **WHEN** 媒体参数为 `D:\其他\a.jpg`,且文件存在
-   **THEN** 系统使用该文件发送

#### Scenario: 相对路径

-   **WHEN** 媒体参数为 `海报/a.jpg`
-   **THEN** 节点失败,错误信息说明需要填写 URL 或绝对路径

### Requirement: URL 媒体下载

媒体参数为 URL 时,系统 SHALL 把文件下载到媒体工作目录的 `tmp/` 后再交给 DLL。下载 SHALL 遵守 wxflow 现有的出站访问限制,并 SHALL 有大小上限(默认 50MB,可配置);超出上限或下载失败时节点失败,SHALL NOT 发送部分文件。

#### Scenario: 下载并发送

-   **WHEN** Send Image 的图片参数为一个可访问的 `https://` 图片地址
-   **THEN** 图片被下载到 `tmp/` 并发送,发送结束后临时文件被删除

#### Scenario: 超过大小上限

-   **WHEN** URL 指向的文件大于大小上限
-   **THEN** 节点失败,错误信息说明超过上限,不调用 DLL 发送

#### Scenario: 被出站限制拒绝

-   **WHEN** URL 指向出站限制不允许访问的地址
-   **THEN** 节点失败,不发起下载

### Requirement: 媒体文件不存在时给出可操作的错误

媒体文件不存在时,节点 SHALL 失败,错误信息 SHALL 给出用户填写的路径并提示检查该路径;SHALL NOT 向用户显示堆栈。

#### Scenario: 本地文件缺失

-   **WHEN** 媒体参数为 `D:\素材\海报.jpg`,但该文件不存在
-   **THEN** 错误信息为类似"文件 `D:\素材\海报.jpg` 不存在,请检查路径"的提示

### Requirement: 保存流程时检查固定的本地路径

保存流程时,系统 SHALL 检查不含变量的本地绝对路径媒体参数;对应文件不存在时,SHALL 向用户显示警告,但 SHALL NOT 阻止保存。包含变量或为 URL 的参数 SHALL 不做检查。

#### Scenario: 保存时文件缺失

-   **WHEN** 运营人员保存一个 Send Image 图片参数为 `D:\素材\不存在.jpg` 的流程
-   **THEN** 流程保存成功,画布显示该节点的文件不存在警告

### Requirement: 临时与取回文件的清理

系统 SHALL 在发送结束后删除该次发送产生的临时文件,并 SHALL 定期删除 `tmp/` 中超过 24 小时的文件。获取的图片和语音文件 SHALL 至少保留 7 天(可配置),之后 SHALL 被删除。

#### Scenario: 清理遗留的临时文件

-   **WHEN** `tmp/` 中存在一个 25 小时前产生的文件
-   **THEN** 下一次定期清理后该文件不存在

### Requirement: 媒体工作目录自检

启动时系统 SHALL 检查媒体工作目录能否创建和写入,并 SHALL 把结果并入网关状态;只有异常时渠道实例页才显示原因。系统 SHALL 提供"发送测试图片"操作,向指定会话发送一张内置图片,用于确认发送媒体的整条链路可用。

#### Scenario: 媒体工作目录不可写

-   **WHEN** 媒体工作目录无法创建或写入时启动 wxflow
-   **THEN** 服务正常启动,网关状态报告媒体目录异常及原因

#### Scenario: 发送测试图片

-   **WHEN** 管理员对一个在线实例执行"发送测试图片",并指定一个会话
-   **THEN** 该会话收到内置测试图片;发送失败时,操作返回 DLL 报告的失败原因
