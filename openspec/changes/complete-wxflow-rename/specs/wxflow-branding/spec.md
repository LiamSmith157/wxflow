# wxflow-branding Specification

## Purpose

定义产品对外呈现的名称统一为 wxflow 的行为,以及配置项与数据目录对旧 Flowise 名称的向后兼容,使新部署看到一致的品牌、既有部署无需迁移即可升级。

## ADDED Requirements

### Requirement: 用户可见文案使用 wxflow 名称

系统 SHALL 在用户可见的位置使用 "wxflow" 而非 "Flowise",包括服务启动与关闭日志、指标描述、浏览器页面标题与 meta 信息、界面中的英文文案、部署文件中的服务与镜像名称。`LICENSE`、版权声明与 README 中对上游 Flowise 的致谢 MAY 保留。

#### Scenario: 启动服务查看日志

-   **WHEN** 管理员启动服务或 worker
-   **THEN** 日志中的产品名称均为 wxflow,不出现 "Flowise"

#### Scenario: 打开管理后台页面

-   **WHEN** 用户在浏览器打开管理后台
-   **THEN** 页面标题、og/twitter meta 与 logo 均不指向 Flowise 官方站点或账号

### Requirement: 命令行入口为 wxflow

系统 SHALL 提供 `wxflow` 命令用于启动服务与 worker,部署文件(Dockerfile、docker-compose)SHALL 通过该命令启动,不得依赖 `flowise` 命令。

#### Scenario: 通过 docker-compose 启动

-   **WHEN** 管理员使用仓库内 docker-compose 文件启动
-   **THEN** 服务名、镜像名与启动命令均使用 wxflow

### Requirement: 环境变量兼容旧名称

系统 SHALL 识别 `WXFLOW_*` 形式的环境变量;当只设置了旧的 `FLOWISE_*` 变量时,系统 SHALL 继续按其值生效。两者同时设置时,`WXFLOW_*` 优先。

#### Scenario: 仅设置旧变量

-   **WHEN** 环境中只有 `FLOWISE_SECRETKEY_OVERWRITE`
-   **THEN** 系统使用该值,行为与改名前一致

#### Scenario: 新旧变量同时设置

-   **WHEN** `WXFLOW_SECRETKEY_OVERWRITE` 与 `FLOWISE_SECRETKEY_OVERWRITE` 值不同
-   **THEN** 系统使用 `WXFLOW_SECRETKEY_OVERWRITE` 的值

### Requirement: 数据目录兼容旧位置

默认数据目录 SHALL 为 `~/.wxflow`。当 `~/.wxflow` 不存在而 `~/.flowise` 存在时,系统 SHALL 继续使用 `~/.flowise`,以保证已有加密密钥、数据库、上传文件和日志可用。

#### Scenario: 全新安装

-   **WHEN** 主目录下两个目录均不存在
-   **THEN** 系统在 `~/.wxflow` 下创建数据

#### Scenario: 从旧版本升级

-   **WHEN** `~/.flowise/encryption.key` 已存在且 `~/.wxflow` 不存在
-   **THEN** 系统继续使用 `~/.flowise`,已保存的凭证可正常解密

### Requirement: HTTP 头同时支持新旧名称

回调请求 SHALL 同时携带 `X-Wxflow-Signature` 与 `X-Flowise-Signature`(值相同);评估请求 SHALL 同时接受 `X-Wxflow-Evaluation` 与 `X-Flowise-Evaluation`。

#### Scenario: 配置了回调密钥

-   **WHEN** 系统向配置了 secret 的回调地址发送请求
-   **THEN** 请求同时包含两个签名头且值一致

### Requirement: 已持久化的数据标识保持不变

系统 SHALL NOT 改变已写入流程数据或数据库的标识(如凭证 ID 键、聊天 ID 键、加密数据前缀),使既有流程、凭证与历史数据无需迁移。

#### Scenario: 打开旧版本创建的流程

-   **WHEN** 用户打开改名前创建的、包含凭证引用的流程
-   **THEN** 凭证引用仍可解析,流程可正常运行
