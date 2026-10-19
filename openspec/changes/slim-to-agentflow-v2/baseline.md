# Baseline (Flowise 3.1.4, upstream 9291856, 未做任何修改)

## 环境

-   Node v24.15.0(安装在 `/root/.local/share/node-v24.15.0`,每条命令前需要 `export PATH=/root/.local/share/node-v24.15.0/bin:$PATH`)
-   pnpm 10.26.0
-   机器:2 GB 内存,swap 6 GB(`/swap` 1 GB + `/swapfile2` 5 GB,均写入 `/etc/fstab`)
-   构建和测试必须设置 `NODE_OPTIONS=--max-old-space-size=4096`,并且串行执行(`turbo run <task> --concurrency=1`)。默认并行加 1.5 GB 堆上限时,`flowise-ui` 的 vite 构建会 OOM

## 构建:`turbo run build --concurrency=1`

结果:6/6 成功,耗时 14 分 30 秒(其中 3 个包使用了缓存)。

| 包                             | 输出目录 | 结果 |
| ------------------------------ | -------- | ---- |
| flowise-components             | `dist/`  | 成功 |
| @flowiseai/agentflow           | `dist/`  | 成功 |
| @flowiseai/observe             | `dist/`  | 成功 |
| flowise-ui                     | `build/` | 成功 |
| flowise-api(api-documentation) | `dist/`  | 成功 |
| flowise(server)                | `dist/`  | 成功 |

## 测试:`turbo run test --concurrency=1 --continue`

总耗时 1 小时 13 分(其中 flowise-components 约 66 分钟)。

| 包                   | 测试文件   | 用例      |
| -------------------- | ---------- | --------- |
| @flowiseai/agentflow | 73/73 通过 | 1255 通过 |
| @flowiseai/observe   | 25/25 通过 | 335 通过  |
| flowise(server)      | 32/32 通过 | 939 通过  |
| flowise-ui           | 2/2 通过   | 65 通过   |
| flowise-components   | 19/20 通过 | 903 通过  |

唯一没有通过的是 flowise-components 的 `src/recordManagerSecurity.test.ts`:整套测试并行时 jest worker 被 `SIGKILL`(OOM),没有执行任何断言。单独用 `jest -i` 重跑,7/7 通过。**基线中没有真实失败的用例。**

后续各阶段在同一台机器上验证 components 时,建议只跑受影响的测试文件(`jest <path>`),完整跑一遍太慢。全量测试留到每个阶段结束或最后的集成验收。

## v2 冒烟(任务 1.4,选项 B:不接真实模型)

### 运行方式

```bash
# 1. 启动服务(sqlite,数据目录放在临时目录;SECRETKEY_PATH 等目录必须预先创建)
export PATH=/root/.local/share/node-v24.15.0/bin:$PATH
export HTTP_SECURITY_CHECK=false PORT=3000 DATABASE_TYPE=sqlite DATABASE_PATH=<dir>/db LOG_PATH=<dir>/logs \
       BLOB_STORAGE_PATH=<dir>/storage SECRETKEY_PATH=<dir>/secret APIKEY_PATH=<dir>/apikey
mkdir -p <dir>/{db,logs,storage,secret,apikey}
cd packages/server/bin && ./run start

# 2. 首次需要注册管理员(开源版 /account/register 直接创建 owner)
curl -X POST localhost:3000/api/v1/account/register -H 'Content-Type: application/json' \
     -d '{"user":{"name":"smoke","email":"smoke@example.com","credential":"<password>"}}'

# 3. 运行脚本(浏览器式请求需要 x-request-from: internal 头,脚本已处理)
SMOKE_EMAIL=smoke@example.com SMOKE_PASSWORD=<password> python3 -I smoke.py --phase baseline
```

之后每个阶段结束都用 `--phase after` 对照(被删除接口必须 404,不传 `type` 缺省为 AGENTFLOW,已移除类别不再出现)。

### 基线结果:31 通过,0 失败

```
PASS  ping  status=200
PASS  login  status=200
PASS  nodes: 全部 15 个 v2 节点存在  missing=[]
INFO  nodes: 总数  300
PASS  GET /nodes/category/Chat Models  status=200 count=36
PASS  POST /chatflows 创建 AGENTFLOW  status=200
PASS  PUT /chatflows/:id 更新  status=200
PASS  GET /chatflows 列表包含新建 flow  status=200
INFO  基线:不传 type 创建(上游返回 400,任务 3.4 改为缺省 AGENTFLOW)  status=400 type=None
INFO  基线:创建 type=CHATFLOW  status=200
PASS  prediction: Start→CustomFunction→DirectReply(变量已替换)  status=200 text=OUT:fn-result-3
PASS  prediction: Condition 走 true 分支  status=200 text=BRANCH_TRUE
PASS  Iteration: 对数组逐项执行子节点  status=200 text='item-a
item-b
item-c'
PASS  Loop: 达到 maxLoopCount 后输出 fallbackMessage  status=200 text='LOOP_FALLBACK' fn_runs=2
PASS  Human Input(proceed): 首次执行在 Human Input 处暂停  status=200 exec=[('startAgentflow_0', 'FINISHED'), ('humanInputAgentflow_0', 'STOPPED')]
PASS  Human Input(proceed): 恢复后走 APPROVED 分支  status=200 text='APPROVED'
PASS  Human Input(reject): 首次执行在 Human Input 处暂停  status=200 exec=[('startAgentflow_0', 'FINISHED'), ('humanInputAgentflow_0', 'STOPPED')]
PASS  Human Input(reject): 恢复后走 REJECTED 分支  status=200 text='REJECTED'
PASS  executions: 有执行记录  status=200 total=28
PASS  executions: 详情可读取  status=200
PASS  public-chatflows 可匿名读取  status=200
PASS  prediction 流式返回 SSE  status=200 ctype=text/event-stream
PASS  Execute Flow: 调用另一个 v2 flow 并取得结果  status=200 text='EF:OUT:fn-result-3'(需要服务端 HTTP_SECURITY_CHECK=false,见 baseline.md)
PASS  document-store 创建  status=200
PASS  upsert-history 接口可用  status=200
PASS  tools 创建自定义工具  status=200
PASS  variables 创建  status=200
INFO  datasets 创建:开源版无 datasets:* 权限(需要 enterprise 许可),无法验证  status=403
PASS  apikey 创建  status=200
PASS  credentials 列表  status=200
PASS  components-credentials 列表  status=200
PASS  SDK: GET /nodes/:name  status=200
PASS  SDK: POST /node-load-method  status=200
PASS  SDK: POST /node-config  status=200
PASS  settings  status=200
INFO  基线:GET /assistants  status=200
INFO  基线:GET /marketplaces/templates  status=200
INFO  基线:GET /openai-assistants  status=412
INFO  基线:GET /openai-realtime  status=412
INFO  基线:GET /assistants/components/chatmodels  status=200
INFO  基线:POST /vector/internal-upsert  status=500
INFO  基线:POST /agentflowv2-generator/instruction  status=200
== baseline: 31 pass, 0 fail, 13 info ==
```

基线中的节点类别数量(共 300 个节点):

```
{"Agent Flows": 15, "Agents": 8, "Cache": 6, "Chains": 13, "Chat Models": 36, "Document Loaders": 41, "Embeddings": 18, "Engine": 4, "Graph": 1, "LLMs": 12, "Memory": 15, "Moderation": 2, "Multi Agents": 2, "Output Parsers": 4, "Prompts": 3, "Record Manager": 3, "Response Synthesizer": 4, "Retrievers": 15, "Sequential Agents": 11, "Text Splitters": 6, "Tools": 39, "Tools (MCP)": 11, "Utilities": 5, "Vector Stores": 26}
```

### 基线观察到的事实

-   **Execute Flow 默认被上游的 SSRF 防护拦截。** 它通过 HTTP 自调用 `{baseURL}/api/v1/prediction/{flowId}`,而 `localhost`/`127.0.0.0/8` 在默认拒绝列表里,报 `Access to this host is denied by policy`。冒烟用的测试服务设置了 `HTTP_SECURITY_CHECK=false` 才能自调用本机;这是**测试环境配置,不要带进生产**。被调用的 flow 需要是 public 的(或带 API Key)。

-   **`/` 能正常托管 UI**:`index.html` 与 JS 资源都返回 200。
-   **不传 `type` 创建 flow 时,上游返回 400**(`validateChatflowType(undefined)` 失败)。flow-types spec 要求改为缺省 `AGENTFLOW`,由任务 3.4 完成。
-   **开源版没有 `datasets:*` 权限**(`Permissions.ts` 中该权限对 open source 标记为 false),`POST /datasets/set` 对 owner 也返回 403。因此在没有 enterprise 许可的部署里,**Datasets / Evaluators / Evaluations 无法验证**,后续各阶段对这部分只能靠 `tsc` 和单元测试兜底。
-   `GET /openai-assistants`、`/openai-realtime` 返回 412(缺少 credential),路由存在。
-   `Utilities` 类别(5 个节点:customFunction、getVariable、ifElseFunction、setVariable、stickyNote)在 node-catalog spec 中没有归类。它们是 v1 画布用的节点(v2 有自己的 Custom Function / Sticky Note),任务 5.1 处理节点裁剪时需要决定,默认建议删除。

### 已纳入冒烟的控制流节点(不依赖 LLM)

Iteration(3 项数组逐项执行)、Loop(`maxLoopCount` 到达后输出 fallback)、Human Input(暂停,再分别用 proceed / reject 恢复)、Execute Flow(自调用另一个 v2 flow)。

### 未验证项(需要真实模型,或需要浏览器操作)

| 项目                                              | 原因               |
| ------------------------------------------------- | ------------------ |
| Agent / LLM / Condition Agent 节点实际调用模型    | 不接真实模型       |
| AI 生成 flow、AI 生成 prompt                      | 需要模型           |
| Agent 节点使用 Tool / MCP / Document Store 知识库 | 需要模型           |
| Evaluations / Datasets / Evaluators               | 开源版无权限(见上) |
| 画布交互、聊天面板、HITL 审批界面、embed          | 需要浏览器         |
| Schedule / Webhook / MCP endpoint 的触发          | 本次脚本未覆盖     |
| `packages/agentflow/examples` 能否加载保存        | 需要浏览器         |
