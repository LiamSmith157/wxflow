<!-- markdownlint-disable MD030 -->

<p align="center">
<img src="packages/ui/src/assets/images/wxflow_white.svg#gh-light-mode-only">
<img src="packages/ui/src/assets/images/wxflow_dark.svg#gh-dark-mode-only">
</p>

<div align="center">

English | [繁體中文](./i18n/README-TW.md) | [简体中文](./i18n/README-ZH.md) | [日本語](./i18n/README-JA.md) | [한국어](./i18n/README-KR.md)

</div>

<h1>wxflow <sub>v0.0.1</sub></h1>

> wxflow 基于 [Flowise](https://github.com/FlowiseAI/Flowise) 开发。

<h3>Build AI Agents, Visually</h3>

## 关于本仓库

**wxflow v0.0.1**,使用 Flowise 开发。

本仓库基于 [Flowise](https://github.com/FlowiseAI/Flowise) 3.1.4(上游提交 `9291856`)裁剪而来,**只保留 Agentflow v2**,许可证沿用 Apache-2.0(见 `LICENSE.md`)。它不再跟随上游合并。

**已移除**:Chatflow、Agentflow v1(MULTIAGENT)、Assistants(Custom 与 OpenAI)、Marketplace 与自定义模板、LlamaIndex 节点、所有 v1 节点类别(Chains、Agents、Memory、Cache、Retrievers 等)、`packages/observe`。

**保留**:Agentflow v2 画布与执行引擎(含 Human Input、Iteration、Loop、Execute Flow)、Executions、Document Stores、Tools 与 Custom MCP Servers、Credentials、Variables、API Keys、Schedule 与 Webhook、MCP Endpoint、Evaluations、公开分享与 embed、AI 生成 flow,以及可嵌入的编辑器 SDK `packages/agentflow`。flow 仍然存放在 `chat_flow` 表、通过 `/chatflows` 接口访问,且只接受 `type = AGENTFLOW`。

请按下面"Developers"一节从源码构建:

-   需要 Node.js `^24` 与 pnpm `^10.26`(见 `.nvmrc` 与 `package.json` 的 `engines`)。
-   构建在内存紧张的机器上需要 `NODE_OPTIONS=--max-old-space-size=4096`,并且建议串行(`turbo run build --concurrency=1`)。
-   `packages/components` 的 `tsc` 不会清理 `dist`,而服务启动时按 `dist/nodes` 注册节点;删除或改名节点后,增量构建前先执行 `pnpm clean`。
-   裁剪的方案、决策和验收记录在 `openspec/changes/slim-to-agentflow-v2/`。

## 📚 Table of Contents

-   [⚡ Quick Start](#-quick-start)
-   [🐳 Docker](#-docker)
-   [👨‍💻 Developers](#-developers)
-   [🌱 Env Variables](#-env-variables)
-   [🙌 Contributing](#-contributing)
-   [📄 License](#-license)

## ⚡Quick Start

wxflow is run from source (see [Developers](#-developers)). After building:

1. Start wxflow
    ```bash
    pnpm start
    ```

2. Open [http://localhost:3000](http://localhost:3000)

## 🐳 Docker

### Docker Compose

1. Clone this repository
2. Go to `docker` folder at the root of the project
3. Copy `.env.example` file, paste it into the same location, and rename to `.env` file
4. `docker compose up -d`
5. Open [http://localhost:3000](http://localhost:3000)
6. You can bring the containers down by `docker compose stop`

### Docker Image

1. Build the image locally:

    ```bash
    docker build --no-cache -t wxflow .
    ```

2. Run image:

    ```bash
    docker run -d --name wxflow -p 3000:3000 wxflow
    ```

3. Stop image:

    ```bash
    docker stop wxflow
    ```

## 👨‍💻 Developers

wxflow has several modules in a single mono repository.

-   `server`: Node backend to serve API logics
-   `ui`: React frontend
-   `components`: Third-party nodes integrations
-   `api-documentation`: Auto-generated swagger-ui API docs from express
-   `agentflow`: Embeddable Agentflow v2 editor SDK (`@wxflow/agentflow`)

### Prerequisite

-   Install [PNPM](https://pnpm.io/installation)
    ```bash
    npm i -g pnpm
    ```

### Setup

1.  Clone the repository:

    ```bash
    git clone <this-repository-url> wxflow
    ```

2.  Go into repository folder:

    ```bash
    cd wxflow
    ```

3.  Install all dependencies of all modules:

    ```bash
    pnpm install
    ```

4.  Build all the code:

    ```bash
    pnpm build
    ```

    <details>
    <summary>Exit code 134 (JavaScript heap out of memory)</summary>  
    If you get this error when running the above `build` script, try increasing the Node.js heap size and run the script again:

    ```bash
    # macOS / Linux / Git Bash
    export NODE_OPTIONS="--max-old-space-size=4096"

    # Windows PowerShell
    $env:NODE_OPTIONS="--max-old-space-size=4096"

    # Windows CMD
    set NODE_OPTIONS=--max-old-space-size=4096
    ```

    Then run:

    ```bash
    pnpm build
    ```

    </details>

5.  Start the app:

    ```bash
    pnpm start
    ```

    You can now access the app on [http://localhost:3000](http://localhost:3000)

6.  For development build:

    -   Create `.env` file and specify the `VITE_PORT` (refer to `.env.example`) in `packages/ui`
    -   Create `.env` file and specify the `PORT` (refer to `.env.example`) in `packages/server`
    -   Run:

        ```bash
        pnpm dev
        ```

    Any code changes will reload the app automatically on [http://localhost:8080](http://localhost:8080)

## 🌱 Env Variables

wxflow is configured through environment variables, set in the `.env` file inside the `packages/server` folder (see `packages/server/.env.example`).

Variables that used to start with `FLOWISE_` now start with `WXFLOW_` (for example `WXFLOW_SECRETKEY_OVERWRITE`, `WXFLOW_FILE_SIZE_LIMIT`, `WXFLOW_EE_LICENSE_KEY`, `DISABLE_WXFLOW_TELEMETRY`). The old names keep working as a fallback; if both are set, `WXFLOW_*` wins.

## 🔄 Upgrading from the earlier Flowise-named build

-   **Data directory**: the default is now `~/.wxflow`. If only `~/.flowise` exists, wxflow keeps using it, so your encryption key, database and uploads are untouched. Nothing is moved automatically.
-   **Docker**: the compose services, containers, network and image are now named `wxflow` / `wxflow-worker`, and the data is mounted at `~/.wxflow`. If you keep your data in `~/.flowise`, change the volume line in your compose file to `~/.flowise:/home/node/.wxflow`.
-   **Webhook callbacks** now send `X-Wxflow-Signature` and also the legacy `X-Flowise-Signature`, with the same value.

## 📄 License

Source code in this repository is made available under the [Apache License Version 2.0](LICENSE.md).
