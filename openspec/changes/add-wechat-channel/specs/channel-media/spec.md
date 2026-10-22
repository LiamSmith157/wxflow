# Spec Delta

## Purpose

定义 wxflow 与注入微信的 `AIHelpLib.dll` 之间如何交换媒体文件:一个双方都能访问的交换目录、容器路径与 Windows 路径之间的映射、媒体参数的来源解析,以及临时文件的清理和配置自检,使直接安装和 Docker Desktop 部署都能发送和获取媒体。

## ADDED Requirements

### Requirement: 交换目录与路径映射

系统 SHALL 使用一个可配置的交换目录存放发给 DLL 的媒体和从 DLL 取回的媒体。系统 SHALL 支持配置该目录在 Windows 主机上的路径;配置后,发给 DLL 的路径 SHALL 转换为 Windows 路径,DLL 返回的交换目录内路径 SHALL 转换回 wxflow 可读的路径。未配置主机路径时两者视为相同。

#### Scenario: Docker 部署时发送图片

-   **WHEN** 交换目录为 `/exchange`、主机路径为 `C:\wxflow\exchange`,节点发送 `/exchange/assets/a.jpg`
-   **THEN** DLL 收到的路径为 `C:\wxflow\exchange\assets\a.jpg`

#### Scenario: 直接安装时发送图片

-   **WHEN** 未配置主机路径,交换目录为 `C:\wxflow\exchange`,节点发送 `assets/a.jpg`
-   **THEN** DLL 收到的路径为 `C:\wxflow\exchange\assets\a.jpg`

### Requirement: 媒体参数的来源

媒体参数 SHALL 接受三种值,按以下顺序识别:以 `http://` 或 `https://` 开头的 URL;绝对路径;其余视为相对于交换目录下 `assets/` 的路径。绝对路径 SHALL 位于交换目录内,否则节点失败。来源种类 SHALL 可以扩展,新增来源不改变已有三种的行为。

#### Scenario: 相对路径

-   **WHEN** 媒体参数为 `海报/a.jpg`
-   **THEN** 系统使用交换目录下的 `assets/海报/a.jpg`

#### Scenario: 交换目录外的绝对路径

-   **WHEN** 媒体参数为交换目录之外的绝对路径,例如 `D:\其他\a.jpg`
-   **THEN** 节点失败,错误信息说明文件必须放在交换目录内

### Requirement: URL 媒体下载

媒体参数为 URL 时,系统 SHALL 把文件下载到交换目录的临时区后再交给 DLL。下载 SHALL 遵守 wxflow 现有的出站访问限制,并 SHALL 有大小上限(默认 50MB,可配置);超出上限或下载失败时节点失败,SHALL NOT 发送部分文件。

#### Scenario: 下载并发送

-   **WHEN** Send Image 的图片参数为一个可访问的 `https://` 图片地址
-   **THEN** 图片被下载到临时区并发送,发送结束后临时文件被删除

#### Scenario: 超过大小上限

-   **WHEN** URL 指向的文件大于大小上限
-   **THEN** 节点失败,错误信息说明超过上限,不调用 DLL 发送

#### Scenario: 被出站限制拒绝

-   **WHEN** URL 指向出站限制不允许访问的地址
-   **THEN** 节点失败,不发起下载

### Requirement: 媒体文件不存在时给出可操作的错误

媒体文件不存在时,节点 SHALL 失败,错误信息 SHALL 使用 Windows 主机上的路径,并说明应检查的目录;SHALL NOT 向用户显示容器内路径或堆栈。

#### Scenario: 素材文件缺失

-   **WHEN** 媒体参数为 `海报/a.jpg`,但交换目录中没有该文件
-   **THEN** 错误信息为类似"素材 `assets/海报/a.jpg` 不存在,请检查 `C:\wxflow\exchange\assets` 目录"的提示

### Requirement: 保存流程时检查固定素材路径

保存流程时,系统 SHALL 检查不含变量的媒体参数;对应文件在交换目录中不存在时,SHALL 向用户显示警告,但 SHALL NOT 阻止保存。包含变量或为 URL 的参数 SHALL 不做检查。

#### Scenario: 保存时素材缺失

-   **WHEN** 运营人员保存一个 Send Image 图片参数为 `海报/不存在.jpg` 的流程
-   **THEN** 流程保存成功,画布显示该节点的素材不存在警告

### Requirement: 临时与取回文件的清理

系统 SHALL 在发送结束后删除该次发送产生的临时文件,并 SHALL 定期删除临时区中超过 24 小时的文件。获取的图片和语音文件 SHALL 至少保留 7 天(可配置),之后 SHALL 被删除。

#### Scenario: 清理遗留的临时文件

-   **WHEN** 临时区存在一个 25 小时前产生的文件
-   **THEN** 下一次定期清理后该文件不存在

### Requirement: 交换目录自检

启动时系统 SHALL 检查交换目录是否存在且可写,并 SHALL 通过渠道实例接口报告结果。系统 SHALL 提供"发送测试图片"操作,向指定会话发送一张内置图片,用于确认路径映射正确。

#### Scenario: 交换目录未挂载

-   **WHEN** 配置的交换目录不存在或不可写时启动 wxflow
-   **THEN** 服务正常启动,渠道实例接口报告交换目录异常及原因

#### Scenario: 发送测试图片

-   **WHEN** 管理员对一个在线实例执行"发送测试图片",并指定一个会话
-   **THEN** 该会话收到内置测试图片;路径映射错误时,操作返回 DLL 报告的失败原因
