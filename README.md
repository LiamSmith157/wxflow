<!-- markdownlint-disable MD030 -->

<p align="center">
<img src="packages/ui/src/assets/images/wxflow_white.svg#gh-light-mode-only">
<img src="packages/ui/src/assets/images/wxflow_dark.svg#gh-dark-mode-only">
</p>

<h1 align="center">wxflow <sub>v0.0.1</sub></h1>

<p align="center">用可视化画布搭建、运行和嵌入 AI Agent 工作流(Agentflow v2)。</p>

wxflow 基于 [Flowise](https://github.com/FlowiseAI/Flowise) 3.1.4(上游提交 `9291856`)裁剪而来,只保留 Agentflow v2,不再跟随上游合并。许可证沿用 Apache-2.0,见 [LICENSE.md](LICENSE.md)。

## 📚 目录

-   [✨ 功能范围](#-功能范围)
-   [⚡ 快速开始](#-快速开始)
-   [🐳 Docker](#-docker)
-   [💬 接入微信](#-接入微信)
-   [👨‍💻 开发者](#-开发者)
-   [🌱 环境变量](#-环境变量)
-   [🔄 从 Flowise 命名版本升级](#-从-flowise-命名版本升级)
-   [🙌 贡献](#-贡献)
-   [📄 许可证与致谢](#-许可证与致谢)

## ✨ 功能范围

**保留**:

-   Agentflow v2 画布与执行引擎(含 Human Input、Iteration、Loop、Execute Flow)
-   Executions、Document Stores、Tools 与 Custom MCP Servers
-   Credentials、Variables、API Keys
-   Schedule 与 Webhook、MCP Endpoint、Evaluations
-   公开分享与 embed、AI 生成 flow
-   可嵌入的编辑器 SDK `packages/agentflow`(`@wxflow/agentflow`)
-   管理后台支持英文与简体中文界面

**已移除**:Chatflow、Agentflow v1(MULTIAGENT)、Assistants(Custom 与 OpenAI)、Marketplace 与自定义模板、LlamaIndex 节点、所有 v1 节点类别(Chains、Agents、Memory、Cache、Retrievers 等)、`packages/observe`。

flow 仍存放在 `chat_flow` 表、通过 `/chatflows` 接口访问,且只接受 `type = AGENTFLOW`。裁剪的方案、决策和验收记录在 `openspec/changes/archive/` 下的 `slim-to-agentflow-v2`。

## ⚡ 快速开始

wxflow 从源码运行,构建步骤见 [开发者](#-开发者)。构建完成后:

1. 启动服务

    ```bash
    pnpm start
    ```

2. 打开 [http://localhost:3000](http://localhost:3000)

## 🐳 Docker

### Docker Compose

`docker/docker-compose.yml` 使用本地镜像 `wxflow:latest`,请先构建镜像(见下文"构建镜像")。

1. 克隆本仓库
2. 进入项目根目录下的 `docker` 文件夹
3. 复制 `.env.example` 为同目录下的 `.env`
4. 运行 `docker compose up -d`
5. 打开 [http://localhost:3000](http://localhost:3000)
6. 停止容器:`docker compose stop`

### 构建镜像

1. 在仓库根目录构建:

    ```bash
    docker build --no-cache -t wxflow .
    ```

2. 运行:

    ```bash
    docker run -d --name wxflow -p 3000:3000 wxflow
    ```

3. 停止:

    ```bash
    docker stop wxflow
    ```

## 💬 接入微信

wxflow 可以接入已注入 `AIHelpLib.dll` 的微信:微信里的事件(收到消息、登录、收付款等)可以启动流程,流程里可以发消息、发图片文件、取回图片和语音。`AIHelpLib.dll` 本身不需要改动。

**前提**:wxflow 与微信在同一台 Windows 上(直接安装,或运行在 Docker Desktop 里);只支持默认的非队列模式。

### 部署

1. **启动网关**。网关随 wxflow 一起启动,默认监听 `127.0.0.1:56233`,只有本机能连。相关环境变量见 `packages/server/.env.example` 的 `WECHAT_*`,`WECHAT_GATEWAY_PORT=0` 可以关闭网关。
2. **准备交换目录**。图片、文件、视频是以 Windows 路径交给 DLL 读取的,所以 wxflow 和 DLL 必须看到同一个目录,下面有 `assets/`(你放素材)、`tmp/`(URL 下载的临时文件)、`images/`、`voice/`(取回的文件)、`resources/`(预留)。这个目录必须事先存在,启动时的自检不会替你创建它。
    - **直接安装**:默认目录是 `~/.wxflow/exchange`(Windows 上通常是 `C:\Users\<用户名>\.wxflow\exchange`),先手动创建;也可以用 `WECHAT_EXCHANGE_DIR` 指定别的目录。
    - **Docker Desktop**:先创建 `C:\wxflow\exchange`,`docker/docker-compose.yml` 已把它挂载到容器内的 `/exchange`,并把网关端口只映射到主机的 `127.0.0.1:56233`。详见 [docker/README.md](docker/README.md)。
3. **修改 `AIHelpLib.json`**:把 `dialPort` 设为 `56233`(与网关端口一致),重启微信。
4. **分配实例**:用有 `channelInstances:manage` 权限的账号打开左侧菜单 **Channel Instances**(渠道实例)。已上线的微信账号会出现在列表里,初始为"未分配";点击"分配给当前工作区"后,该账号的事件才会启动本工作区的流程,发送节点也才能使用它。一个实例只属于一个工作区。
5. **验证**:在同一个页面对在线实例点击"发送测试图片",向指定会话发一张内置图片。收到图片说明端口、交换目录和路径映射都正确。

### 搭建流程

-   **触发**:Start 节点的输入类型选 **WeChat Event**,再选择事件类型(收到消息、快捷关键字命中、会话切换、媒体落盘、登录、登出、收付款),以及实例范围和筛选条件。保存流程后,画布顶部会出现启用开关;**新流程默认未启用**,保存不会改变已有的启用状态,需要手动打开开关,事件才会启动它。
-   **节点**:节点面板的 **WeChat** 分组提供发送文本、@ 消息、链接卡片、引用回复、图片、文件、视频,以及消息类型路由、查询联系人、获取图片、获取语音。**Agent Flows** 分组里的 Cooldown、Delay、Talker Filter 也可用在微信流程里。收件人留空时默认回复触发流程的会话。
-   **发送结果**:发送节点会等待最终结果(默认 30 秒,`WECHAT_SEND_WAIT_SECONDS`),输出 `state`:`ok`、`fail`、`pending`(超时仍未知,流程继续)、`rate_limited`(超出限速,没有发送,流程继续)、`skipped`(总闸已关闭,没有发送)。
-   **素材**:图片、文件、视频参数支持三种写法,按这个顺序识别:`http(s)://` 网址(下载到 `tmp/`,发送后删除,大小上限 `WECHAT_MEDIA_MAX_MB`,默认 50MB,并受 wxflow 的出站访问限制约束)、交换目录内的绝对路径、相对于 `assets/` 的路径(如 `海报/a.jpg`)。保存流程时,不含变量的素材路径如果文件不存在,画布上会给出警告(不阻止保存);运行时找不到文件,错误信息会说明应检查哪个 Windows 目录。
-   **取回的文件**:获取图片写入 `images/`,获取语音写入 `voice/`(WAV),节点输出文件路径;这两个目录里的文件保留 7 天(`WECHAT_FETCHED_RETENTION_DAYS`),`tmp/` 里超过 24 小时的文件每小时清理一次。

### `{{ $wechat.* }}` 字段

触发流程的事件放在 `$wechat` 下,节点参数里用 `{{ $wechat.talker }}` 这样的写法引用,不存在的字段替换为空字符串。

| 事件           | 字段                                                                                                                                                                              |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 所有事件       | `channel`、`instance`(接收事件的微信 wxid)、`event`(如 `msg.insert`)                                                                                                              |
| 收到消息       | `talker`(会话:wxid 或群 ID)、`sender`、`content`、`msgType`(1 文本、3 图片、34 语音、5 链接、6 文件、43 视频)、`direction`(`in` / `out`)、`isGroup`、`svrid`、`localId`、`atList` |
| 快捷关键字命中 | `key`                                                                                                                                                                             |
| 会话切换       | `from`、`to`                                                                                                                                                                      |
| 媒体落盘       | `media`(`image` / `video` / `file`)                                                                                                                                               |
| 收付款         | `kind`、`direction`(`in` / `out` / 空)、`amount`、`counterparty`、`memo`、`talker`、`sender`                                                                                      |

### 安全阀

-   **防自环**:默认只处理入站消息,本账号自己发出的消息(包括流程自己的回复)不会再次启动流程。选择"入站和出站"时,Start 节点旁会显示风险警告。
-   **发送限速**:每个实例每分钟最多发送 20 条(可在渠道实例页修改),超出的不发送,节点输出 `rate_limited`,流程继续。
-   **渠道总闸**:渠道实例页的总闸关闭后,所有微信事件都不再启动流程,发送节点输出 `skipped`。总闸和限速按工作区生效。
-   **冷却**:Cooldown 节点让同一流程、同一会话在设定的分钟数内只放行一次。
-   **积压保护**:每个实例的待处理事件最多保留 200 条,超出时丢弃最旧的并记录日志。

### 常见问题

-   **启动日志提示无法监听端口 / 渠道实例页网关状态为"启动失败"**:`56233` 被占用(例如旧的 `wx_workflow` 还在运行)。关闭占用方,或设置 `WECHAT_GATEWAY_PORT` 换一个端口,并同步修改 `AIHelpLib.json` 的 `dialPort`(Docker 还要同步修改端口映射)。网关绑定失败只记录日志,wxflow 其余功能不受影响。
-   **渠道实例页没有实例**:依次检查 ① 网关状态是否为"运行中"(`MODE=QUEUE` 下网关不启动);② `AIHelpLib.json` 的 `dialPort` 是否等于网关端口,改完是否重启了微信;③ Docker 部署时端口映射是否存在。只有 `channelInstances:view` 权限的用户只能看到已分配给本工作区的实例,看不到未分配的实例,需要有管理权限的用户先分配。
-   **发送测试图片失败,或发送图片 / 文件时提示文件不存在**:路径映射或交换目录不对。先看渠道实例页的"交换目录"自检结果;Docker 部署时确认 `C:\wxflow\exchange` 已创建并挂载,且 `WECHAT_EXCHANGE_DIR_HOST` 与它一致;直接安装时不要设置 `WECHAT_EXCHANGE_DIR_HOST`。素材要放在交换目录的 `assets/` 下(或写交换目录内的绝对路径),交换目录之外的路径会被拒绝。
-   **流程没有被触发**:确认流程已打开启用开关、事件类型和筛选条件匹配、实例已分配给流程所在的工作区、渠道总闸是开启的。
-   **`MODE=QUEUE`**:队列模式下网关不会启动,微信节点会报错。微信功能目前只支持默认的单进程模式。

## 👨‍💻 开发者

wxflow 是一个 monorepo,包含以下模块:

-   `server`:Node 后端,提供 API 与执行逻辑
-   `ui`:React 前端(管理后台)
-   `components`:节点与第三方集成
-   `api-documentation`:由 express 自动生成的 swagger-ui API 文档
-   `agentflow`:可嵌入的 Agentflow v2 编辑器 SDK(`@wxflow/agentflow`)

### 环境要求

-   Node.js `^24`(见 `.nvmrc`)
-   pnpm `^10.26`:

    ```bash
    npm i -g pnpm
    ```

### 构建与启动

1.  克隆仓库并进入目录:

    ```bash
    git clone https://github.com/LiamSmith157/wxflow.git
    cd wxflow
    ```

2.  安装依赖:

    ```bash
    pnpm install
    ```

3.  构建:

    ```bash
    pnpm build
    ```

    <details>
    <summary>退出码 134(JavaScript heap out of memory)</summary>

    内存紧张时,调大 Node.js 堆内存后重新构建,建议同时串行构建(`turbo run build --concurrency=1`):

    ```bash
    # macOS / Linux / Git Bash
    export NODE_OPTIONS="--max-old-space-size=4096"

    # Windows PowerShell
    $env:NODE_OPTIONS="--max-old-space-size=4096"

    # Windows CMD
    set NODE_OPTIONS=--max-old-space-size=4096
    ```

    </details>

4.  启动:

    ```bash
    pnpm start
    ```

    访问 [http://localhost:3000](http://localhost:3000)。

5.  开发模式:

    -   在 `packages/ui` 下创建 `.env`,设置 `VITE_PORT`(参考 `.env.example`)
    -   在 `packages/server` 下创建 `.env`,设置 `PORT`(参考 `.env.example`)
    -   运行:

        ```bash
        pnpm dev
        ```

    代码改动会自动重新加载,访问 [http://localhost:8080](http://localhost:8080)。

> `packages/components` 的 `tsc` 不会清理 `dist`,而服务启动时按 `dist/nodes` 注册节点。删除或改名节点后,增量构建前请先执行 `pnpm clean`。

## 🌱 环境变量

wxflow 通过环境变量配置,写在 `packages/server/.env` 中(参考 `packages/server/.env.example`)。Docker 部署使用 `docker/.env`(参考 `docker/.env.example`)。

原先以 `FLOWISE_` 开头的变量现在以 `WXFLOW_` 开头,例如 `WXFLOW_SECRETKEY_OVERWRITE`、`WXFLOW_FILE_SIZE_LIMIT`、`WXFLOW_EE_LICENSE_KEY`、`DISABLE_WXFLOW_TELEMETRY`。旧名称仍作为回退可用;两者同时设置时以 `WXFLOW_*` 为准。

## 🔄 从 Flowise 命名版本升级

-   **数据目录**:默认改为 `~/.wxflow`。如果只存在 `~/.flowise`,wxflow 会继续使用它,加密密钥、数据库和上传文件都不受影响,不会自动迁移。
-   **Docker**:compose 服务、容器、网络和镜像统一命名为 `wxflow` / `wxflow-worker`,数据挂载到 `~/.wxflow`。若数据仍在 `~/.flowise`,请把 compose 里的卷改为 `~/.flowise:/home/node/.wxflow`。
-   **Webhook 回调**:同时发送 `X-Wxflow-Signature` 与旧的 `X-Flowise-Signature`,两者值相同。

## 🙌 贡献

欢迎贡献,请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 和 [行为准则](CODE_OF_CONDUCT.md)。安全问题请参见 [SECURITY.md](SECURITY.md)。

## 📄 许可证与致谢

本仓库源码以 [Apache License Version 2.0](LICENSE.md) 发布。

wxflow 源自 [Flowise](https://github.com/FlowiseAI/Flowise)(Apache-2.0),感谢 Flowise 作者与贡献者。
