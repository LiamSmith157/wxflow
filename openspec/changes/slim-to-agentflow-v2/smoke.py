#!/usr/bin/env python3
"""v2 冒烟脚本:不依赖 LLM 的后端检查。每个阶段结束后对照 baseline.md 运行。

用法:
  SMOKE_BASE=http://localhost:3000 SMOKE_EMAIL=... SMOKE_PASSWORD=... python3 -I smoke.py [--phase baseline|stage3|stage4|after]

baseline 阶段:被计划删除的模块只记录 INFO(当前返回什么)。
stage3 阶段:flow 类型约束必须生效(只接受 AGENTFLOW、缺省 AGENTFLOW),被删模块仍只记录 INFO。
stage4 阶段:在 stage3 之上,被删除的 API 必须返回 JSON 404,迁移后的新接口必须可用;节点类别仍只记录 INFO。
after 阶段:在 stage4 之上,已移除的节点类别和 LlamaIndex 节点也必须消失。
LLM 相关项(Agent/LLM 节点执行、AI 生成 flow、AI 生成 prompt、评估运行)不在此脚本范围内。
"""
import http.cookiejar
import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get('SMOKE_BASE', 'http://localhost:3000').rstrip('/') + '/api/v1'
EMAIL = os.environ['SMOKE_EMAIL']
PASSWORD = os.environ['SMOKE_PASSWORD']
PHASE = sys.argv[sys.argv.index('--phase') + 1] if '--phase' in sys.argv else 'baseline'
TYPES_ENFORCED = PHASE in ('stage3', 'stage4', 'after')
API_REMOVAL_ENFORCED = PHASE in ('stage4', 'after')
NODES_REMOVAL_ENFORCED = PHASE == 'after'

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
results = []


def call(method, path, body=None, internal=True, headers=None, raw=False):
    h = {'Content-Type': 'application/json', **(headers or {})}
    if internal:
        h['x-request-from'] = 'internal'
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=h)
    try:
        with opener.open(req, timeout=120) as r:
            payload = r.read().decode()
            ctype = r.headers.get('Content-Type', '')
            status = r.status
    except urllib.error.HTTPError as e:
        payload, ctype, status = e.read().decode(), e.headers.get('Content-Type', ''), e.code
    if raw:
        return status, payload, ctype
    try:
        return status, json.loads(payload) if payload else None, ctype
    except ValueError:
        return status, payload, ctype


def check(name, ok, detail=''):
    results.append(('PASS' if ok else 'FAIL', name, detail))
    print(f"{'PASS' if ok else 'FAIL'}  {name}  {detail}")


def info(name, detail=''):
    results.append(('INFO', name, detail))
    print(f'INFO  {name}  {detail}')


TEMPLATES = {}


def load_templates():
    _, nodes, _ = call('GET', '/nodes')
    for n in nodes:
        TEMPLATES[n['name']] = n


def node(nid, name, label, inputs, anchors=None):
    t = TEMPLATES[name]
    data = {
        'id': nid, 'label': label, 'version': t['version'], 'name': name, 'type': t['type'], 'color': t['color'],
        'baseClasses': t['baseClasses'], 'category': t['category'],
        'inputParams': [{**p, 'id': f"{nid}-input-{p['name']}-{p['type']}"} for p in t.get('inputs', [])],
        'inputAnchors': [], 'inputs': inputs,
        'outputAnchors': anchors if anchors is not None else [{'id': f'{nid}-output-{name}', 'label': label, 'name': name}],
        'outputs': {}, 'selected': False,
    }
    for k in ('hideInput', 'hideOutput'):
        if t.get(k):
            data[k] = True
    return {'id': nid, 'type': 'agentFlow', 'position': {'x': 0, 'y': 0}, 'data': data,
            'width': 200, 'height': 66, 'selected': False, 'positionAbsolute': {'x': 0, 'y': 0}, 'dragging': False}


def edge(src, handle, dst):
    return {'source': src, 'sourceHandle': handle, 'target': dst, 'targetHandle': dst, 'type': 'agentFlow',
            'data': {'sourceColor': '#7EE787', 'targetColor': '#4DDBBB', 'isHumanInput': False},
            'id': f'{src}-{handle}-{dst}'}


def start():
    return node('startAgentflow_0', 'startAgentflow', 'Start',
                {'startInputType': 'chatInput', 'formTitle': '', 'formDescription': '', 'formInputTypes': '', 'startState': ''})


def reply(nid, text):
    return node(nid, 'directReplyAgentflow', 'Direct Reply', {'directReplyMessage': text}, anchors=[])


def flow_function():
    fn = node('customFunctionAgentflow_0', 'customFunctionAgentflow', 'Custom Function',
              {'customFunctionInputVariables': '', 'customFunctionJavascriptFunction': 'return "fn-result-" + (1 + 2);',
               'customFunctionUpdateState': ''})
    nodes = [start(), fn, reply('directReplyAgentflow_0', '<p>OUT:{{ customFunctionAgentflow_0 }}</p>')]
    edges = [edge('startAgentflow_0', 'startAgentflow_0-output-startAgentflow', 'customFunctionAgentflow_0'),
             edge('customFunctionAgentflow_0', 'customFunctionAgentflow_0-output-customFunctionAgentflow', 'directReplyAgentflow_0')]
    return {'nodes': nodes, 'edges': edges, 'viewport': {'x': 0, 'y': 0, 'zoom': 1}}


def flow_condition():
    anchors = [{'id': f'conditionAgentflow_0-output-{i}', 'label': i, 'name': i, 'description': d}
               for i, d in enumerate(['Condition 0', 'Else'])]
    cond = node('conditionAgentflow_0', 'conditionAgentflow', 'Condition',
                {'conditions': [{'type': 'string', 'value1': 'a', 'operation': 'equal', 'value2': 'a'}]}, anchors=anchors)
    nodes = [start(), cond, reply('directReplyAgentflow_0', 'BRANCH_TRUE'), reply('directReplyAgentflow_1', 'BRANCH_FALSE')]
    edges = [edge('startAgentflow_0', 'startAgentflow_0-output-startAgentflow', 'conditionAgentflow_0'),
             edge('conditionAgentflow_0', 'conditionAgentflow_0-output-0', 'directReplyAgentflow_0'),
             edge('conditionAgentflow_0', 'conditionAgentflow_0-output-1', 'directReplyAgentflow_1')]
    return {'nodes': nodes, 'edges': edges, 'viewport': {'x': 0, 'y': 0, 'zoom': 1}}


VP = {'x': 0, 'y': 0, 'zoom': 1}


def sx(flow):
    return json.dumps(flow)


def flow_iteration():
    it = node('iterationAgentflow_0', 'iterationAgentflow', 'Iteration', {'iterationInput': '["a","b","c"]'})
    it['type'], it['width'], it['height'] = 'iteration', 481, 250
    fn = node('customFunctionAgentflow_0', 'customFunctionAgentflow', 'Custom Function',
              {'customFunctionInputVariables': [{'variableName': 'item', 'variableValue': '{{ $iteration }}'}],
               'customFunctionJavascriptFunction': 'return "item-" + $item;', 'customFunctionUpdateState': ''})
    fn['parentNode'], fn['extent'] = 'iterationAgentflow_0', 'parent'
    nodes = [start(), it, fn, reply('directReplyAgentflow_0', '<p>{{ iterationAgentflow_0 }}</p>')]
    edges = [edge('startAgentflow_0', 'startAgentflow_0-output-startAgentflow', 'iterationAgentflow_0'),
             edge('iterationAgentflow_0', 'iterationAgentflow_0-output-iterationAgentflow', 'directReplyAgentflow_0')]
    return {'nodes': nodes, 'edges': edges, 'viewport': VP}


def flow_loop():
    fn = node('customFunctionAgentflow_0', 'customFunctionAgentflow', 'Custom Function',
              {'customFunctionInputVariables': '', 'customFunctionJavascriptFunction': 'return "body";', 'customFunctionUpdateState': ''})
    lp = node('loopAgentflow_0', 'loopAgentflow', 'Loop',
              {'loopBackToNode': 'customFunctionAgentflow_0-Custom Function', 'maxLoopCount': 2,
               'fallbackMessage': 'LOOP_FALLBACK', 'loopUpdateState': ''}, anchors=[])
    edges = [edge('startAgentflow_0', 'startAgentflow_0-output-startAgentflow', 'customFunctionAgentflow_0'),
             edge('customFunctionAgentflow_0', 'customFunctionAgentflow_0-output-customFunctionAgentflow', 'loopAgentflow_0')]
    return {'nodes': [start(), fn, lp], 'edges': edges, 'viewport': VP}


def flow_human_input():
    anchors = [{'id': f'humanInputAgentflow_0-output-{i}', 'label': 'Human Input', 'name': 'humanInputAgentflow'} for i in (0, 1)]
    hi = node('humanInputAgentflow_0', 'humanInputAgentflow', 'Human Input',
              {'humanInputDescriptionType': 'fixed', 'humanInputDescription': 'Approve?', 'humanInputEnableFeedback': True},
              anchors=anchors)

    def human_edge(handle, target, label):
        e = edge('humanInputAgentflow_0', handle, target)
        e['data'] = {'sourceColor': '#6E6EFD', 'targetColor': '#4DDBBB', 'edgeLabel': label, 'isHumanInput': True}
        return e
    nodes = [start(), hi, reply('directReplyAgentflow_0', 'APPROVED'), reply('directReplyAgentflow_1', 'REJECTED')]
    edges = [edge('startAgentflow_0', 'startAgentflow_0-output-startAgentflow', 'humanInputAgentflow_0'),
             human_edge('humanInputAgentflow_0-output-0', 'directReplyAgentflow_0', 'proceed'),
             human_edge('humanInputAgentflow_0-output-1', 'directReplyAgentflow_1', 'reject')]
    return {'nodes': nodes, 'edges': edges, 'viewport': VP}


def flow_execute_flow(target_id):
    ef = node('executeFlowAgentflow_0', 'executeFlowAgentflow', 'Execute Flow',
              {'executeFlowSelectedFlow': target_id, 'executeFlowInput': 'hi', 'executeFlowOverrideConfig': '', 'executeFlowBaseURL': ''})
    nodes = [start(), ef, reply('directReplyAgentflow_0', '<p>EF:{{ executeFlowAgentflow_0 }}</p>')]
    edges = [edge('startAgentflow_0', 'startAgentflow_0-output-startAgentflow', 'executeFlowAgentflow_0'),
             edge('executeFlowAgentflow_0', 'executeFlowAgentflow_0-output-executeFlowAgentflow', 'directReplyAgentflow_0')]
    return {'nodes': nodes, 'edges': edges, 'viewport': VP}


def create_flow(name, flow):
    s, f, _ = call('POST', '/chatflows', {'name': name, 'type': 'AGENTFLOW', 'flowData': sx(flow)})
    return f.get('id') if isinstance(f, dict) else None


def executed(out):
    return [(e['nodeId'], e['status']) for e in out.get('agentFlowExecutedData', [])] if isinstance(out, dict) else []


def predict(fid, question='hi'):
    s, b, _ = call('POST', f'/internal-prediction/{fid}', {'question': question, 'streaming': False})
    return s, b


def main():
    s, b, _ = call('GET', '/ping', internal=False, raw=True)
    check('ping', s == 200, f'status={s}')
    s, b, _ = call('POST', '/auth/login', {'email': EMAIL, 'password': PASSWORD}, internal=False)
    check('login', s == 200, f'status={s}')
    load_templates()

    # ---- 节点注册表 ----
    s, nodes, _ = call('GET', '/nodes')
    names = {n['name'] for n in nodes}
    cats = {}
    for n in nodes:
        cats[n['category']] = cats.get(n['category'], 0) + 1
    v2 = ['agentAgentflow', 'conditionAgentflow', 'conditionAgentAgentflow', 'customFunctionAgentflow', 'directReplyAgentflow',
          'executeFlowAgentflow', 'httpAgentflow', 'humanInputAgentflow', 'iterationAgentflow', 'llmAgentflow', 'loopAgentflow',
          'retrieverAgentflow', 'startAgentflow', 'stickyNoteAgentflow', 'toolAgentflow']
    check('nodes: 全部 15 个 v2 节点存在', all(n in names for n in v2), f'missing={[n for n in v2 if n not in names]}')
    info('nodes: 总数', str(len(nodes)))
    info('nodes: 各类别数量', json.dumps(cats, sort_keys=True))
    removed_cats = ['Agents', 'Chains', 'LLMs', 'Multi Agents', 'Sequential Agents', 'Output Parsers', 'Prompts', 'Engine',
                    'Response Synthesizer', 'Graph', 'Moderation', 'Memory', 'Cache', 'Retrievers']
    present = [c for c in removed_cats if c in cats]
    if NODES_REMOVAL_ENFORCED:
        check('nodes: 已移除类别不再出现', not present, f'still present={present}')
        check('nodes: 无 LlamaIndex 节点', not any('LlamaIndex' in (n.get('tags') or []) for n in nodes))
    else:
        info('nodes: 将被移除的类别(基线中存在)', str(present))
    s, cm, _ = call('GET', '/nodes/category/Chat%20Models')
    check('GET /nodes/category/Chat Models', s == 200 and len(cm) > 0, f'status={s} count={len(cm) if isinstance(cm, list) else cm}')

    # ---- flow CRUD(SDK 依赖 /chatflows)----
    s, f1, _ = call('POST', '/chatflows', {'name': 'smoke-fn', 'type': 'AGENTFLOW', 'flowData': json.dumps(flow_function())})
    check('POST /chatflows 创建 AGENTFLOW', s == 200 and f1.get('type') == 'AGENTFLOW', f'status={s}')
    fid = f1.get('id')
    s, f1u, _ = call('PUT', f'/chatflows/{fid}', {'name': 'smoke-fn-renamed'})
    check('PUT /chatflows/:id 更新', s == 200 and f1u.get('name') == 'smoke-fn-renamed', f'status={s}')
    s, lst, _ = call('GET', '/chatflows?type=AGENTFLOW')
    items = lst['data'] if isinstance(lst, dict) and 'data' in lst else lst
    check('GET /chatflows 列表包含新建 flow', s == 200 and any(x['id'] == fid for x in items), f'status={s}')
    s, nt, _ = call('POST', '/chatflows', {'name': 'smoke-notype', 'flowData': json.dumps(flow_function())})
    detail = f"status={s} type={nt.get('type') if isinstance(nt, dict) else nt}"
    if TYPES_ENFORCED:
        check('不传 type 创建时缺省为 AGENTFLOW', s == 200 and nt.get('type') == 'AGENTFLOW', detail)
    else:
        info('基线:不传 type 创建(上游返回 400,任务 3.4 改为缺省 AGENTFLOW)', detail)
    if TYPES_ENFORCED:
        for t in ('CHATFLOW', 'MULTIAGENT', 'ASSISTANT'):
            s, _, _ = call('POST', '/chatflows', {'name': f'smoke-{t}', 'type': t, 'flowData': json.dumps(flow_function())})
            check(f'创建 type={t} 被拒绝(400)', s == 400, f'status={s}')
    else:
        s, old, _ = call('POST', '/chatflows', {'name': 'smoke-chatflow', 'type': 'CHATFLOW', 'flowData': '{"nodes":[],"edges":[]}'})
        info('基线:创建 type=CHATFLOW', f'status={s}')

    # ---- 执行 ----
    s, out = predict(fid)
    text = json.dumps(out, ensure_ascii=False) if out is not None else ''
    check('prediction: Start→CustomFunction→DirectReply(变量已替换)', s == 200 and isinstance(out, dict) and 'OUT:fn-result-3' in out.get('text', ''), f"status={s} text={out.get('text') if isinstance(out, dict) else out}")
    s, f2, _ = call('POST', '/chatflows', {'name': 'smoke-cond', 'type': 'AGENTFLOW', 'flowData': json.dumps(flow_condition())})
    s, out = predict(f2.get('id'))
    text = json.dumps(out, ensure_ascii=False) if out is not None else ''
    check('prediction: Condition 走 true 分支', s == 200 and isinstance(out, dict) and out.get('text') == 'BRANCH_TRUE', f"status={s} text={out.get('text') if isinstance(out, dict) else out}")

    # ---- 控制流节点(不依赖 LLM)----
    fi = create_flow('smoke-iteration', flow_iteration())
    s, out = predict(fi)
    ex = executed(out)
    check('Iteration: 对数组逐项执行子节点', s == 200 and out.get('text') == 'item-a\nitem-b\nitem-c'
          and sum(1 for n, _ in ex if n == 'customFunctionAgentflow_0') == 3 and ('iterationAgentflow_0', 'FINISHED') in ex,
          f"status={s} text={out.get('text') if isinstance(out, dict) else out!r}")
    fl = create_flow('smoke-loop', flow_loop())
    s, out = predict(fl)
    ex = executed(out)
    check('Loop: 达到 maxLoopCount 后输出 fallbackMessage', s == 200 and out.get('text') == 'LOOP_FALLBACK'
          and sum(1 for n, _ in ex if n == 'customFunctionAgentflow_0') == 2,
          f"status={s} text={out.get('text') if isinstance(out, dict) else out!r} fn_runs={sum(1 for n, _ in ex if n == 'customFunctionAgentflow_0')}")
    fh = create_flow('smoke-hitl', flow_human_input())
    for decision, expected, chat in (('proceed', 'APPROVED', 'smoke-hitl-a'), ('reject', 'REJECTED', 'smoke-hitl-b')):
        s, out, _ = call('POST', f'/internal-prediction/{fh}', {'question': 'go', 'streaming': False, 'chatId': chat})
        ex = executed(out)
        action = out.get('action') if isinstance(out, dict) else None
        check(f'Human Input({decision}): 首次执行在 Human Input 处暂停', s == 200 and ('humanInputAgentflow_0', 'STOPPED') in ex
              and isinstance(action, dict) and action.get('mapping', {}).get('approve') == 'Proceed', f'status={s} exec={ex}')
        s, out, _ = call('POST', f'/internal-prediction/{fh}', {
            'question': decision, 'streaming': False, 'chatId': chat,
            'humanInput': {'type': decision, 'startNodeId': 'humanInputAgentflow_0', 'feedback': 'fine'}})
        check(f'Human Input({decision}): 恢复后走 {expected} 分支', s == 200 and isinstance(out, dict) and out.get('text') == expected,
              f"status={s} text={out.get('text') if isinstance(out, dict) else out!r}")

    s, ex, _ = call('GET', '/executions')
    check('executions: 有执行记录', s == 200 and ex.get('total', 0) >= 2, f"status={s} total={ex.get('total') if isinstance(ex, dict) else ex}")
    if s == 200 and ex.get('data'):
        s2, det, _ = call('GET', f"/executions/{ex['data'][0]['id']}")
        check('executions: 详情可读取', s2 == 200, f'status={s2}')

    # ---- 公开分享与流式 ----
    s, _, _ = call('PUT', f'/chatflows/{fid}', {'isPublic': True})
    s, pub, _ = call('GET', f'/public-chatflows/{fid}', internal=False)
    check('public-chatflows 可匿名读取', s == 200, f'status={s}')
    s, body, ctype = call('POST', f'/prediction/{fid}', {'question': 'hi', 'streaming': True}, internal=False, raw=True)
    check('prediction 流式返回 SSE', s == 200 and 'event-stream' in ctype and 'OUT:fn-result-3' in body, f'status={s} ctype={ctype}')

    fe = create_flow('smoke-execute-flow', flow_execute_flow(fid))
    s, out = predict(fe)
    check('Execute Flow: 调用另一个 v2 flow 并取得结果', s == 200 and isinstance(out, dict) and out.get('text') == 'EF:OUT:fn-result-3',
          f"status={s} text={out.get('text') if isinstance(out, dict) else out!r}(需要服务端 HTTP_SECURITY_CHECK=false,见 baseline.md)")

    # ---- 保留模块:创建与读取 ----
    s, ds, _ = call('POST', '/document-store/store', {'name': 'smoke-store', 'description': 'x'})
    check('document-store 创建', s == 200, f'status={s}')
    s, uh, _ = call('GET', f"/upsert-history/{ds.get('id') if isinstance(ds, dict) else 'x'}")
    check('upsert-history 接口可用', s == 200, f'status={s}')
    s, t, _ = call('POST', '/tools', {'name': 'smoke_tool', 'description': 'd', 'color': '#ffffff', 'schema': '[]', 'func': 'return 1;'})
    check('tools 创建自定义工具', s == 200, f'status={s}')
    s, v, _ = call('POST', '/variables', {'name': 'smoke_var', 'value': '1', 'type': 'static'})
    check('variables 创建', s == 200, f'status={s}')
    s, d, _ = call('POST', '/datasets/set', {'name': 'smoke-dataset', 'description': 'x'})
    if s == 403:
        info('datasets 创建:开源版无 datasets:* 权限(需要 enterprise 许可),无法验证', f'status={s}')
    else:
        check('datasets 创建', s == 200, f'status={s}')
    s, k, _ = call('POST', '/apikey', {'keyName': 'smoke-key', 'permissions': ['agentflows:view']})
    check('apikey 创建', s == 200, f'status={s}')
    s, cr, _ = call('GET', '/credentials')
    check('credentials 列表', s == 200, f'status={s}')
    s, cc, _ = call('GET', '/components-credentials')
    check('components-credentials 列表', s == 200 and len(cc) > 0, f'status={s}')
    s, one, _ = call('GET', '/nodes/agentAgentflow')
    check('SDK: GET /nodes/:name', s == 200, f'status={s}')
    s, lm, _ = call('POST', '/node-load-method/agentAgentflow', {'loadMethod': 'listRuntimeStateKeys', 'name': 'agentAgentflow', 'inputs': {}})
    check('SDK: POST /node-load-method', s == 200, f'status={s}')
    s, flag, _ = call('POST', '/node-config', flow_function()['nodes'][1]['data'])
    check('SDK: POST /node-config', s == 200, f'status={s}')
    s, sch, _ = call('GET', '/settings', internal=False)
    check('settings', s == 200, f'status={s}')

    # ---- 将被删除/迁移的接口 ----
    removed = ['/assistants', '/marketplaces/templates', '/openai-assistants', '/openai-realtime', '/assistants/components/chatmodels']
    for p in removed:
        s, _, ctype = call('GET', p)
        if API_REMOVAL_ENFORCED:
            check(f'GET {p} 已移除(JSON 404)', s == 404 and 'json' in ctype, f'status={s} type={ctype}')
        else:
            info(f'基线:GET {p}', f'status={s}')
    s, _, ctype = call('POST', f'/vector/internal-upsert/{fid}', {})
    if API_REMOVAL_ENFORCED:
        check('POST /vector/internal-upsert 已移除(JSON 404)', s == 404 and 'json' in ctype, f'status={s} type={ctype}')
    else:
        info('基线:POST /vector/internal-upsert', f'status={s}')
    if API_REMOVAL_ENFORCED:
        s, _, ctype = call('GET', '/definitely-not-a-route')
        check('未匹配的 /api 请求返回 JSON 404(不再落到 UI 页面)', s == 404 and 'json' in ctype, f'status={s} type={ctype}')
        for t in ('CHATFLOW', 'MULTIAGENT', 'ASSISTANT'):
            s, _, _ = call('GET', f'/chatflows?type={t}')
            check(f'GET /chatflows?type={t} 被拒绝(400)', s == 400, f'status={s}')
    s, _, _ = call('POST', '/agentflowv2-generator/instruction', {})
    if PHASE != 'baseline':
        check('POST /agentflowv2-generator/instruction 路由存在(非404)', s != 404, f'status={s}(无模型,预期 4xx/5xx)')
    else:
        info('基线:POST /agentflowv2-generator/instruction', f'status={s}')

    fails = [r for r in results if r[0] == 'FAIL']
    print(f"\n== {PHASE}: {sum(1 for r in results if r[0] == 'PASS')} pass, {len(fails)} fail, {sum(1 for r in results if r[0] == 'INFO')} info ==")
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
