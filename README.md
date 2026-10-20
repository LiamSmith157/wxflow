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
