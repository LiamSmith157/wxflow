# Tasks

## 1. 核对事实

- [x] 1.1 对照 `package.json`(根与 `packages/server`)、`docker/docker-compose.yml`、`packages/server/.env.example`、`.nvmrc`,列出 README 要引用的命令、变量、路径、Node/pnpm 版本;验证每一项在仓库中真实存在

## 2. 重写 README

- [x] 2.1 按 design.md 的章节结构重写 `README.md` 为统一简体中文,保留 logo、Flowise 来源声明与 `LICENSE.md` 链接,移除 Flowise 口号和语言切换栏;验证 `grep -n "Build AI Agents\|English |" README.md` 无输出
- [x] 2.2 验证 README 中所有相对链接与图片路径指向存在的文件(`grep -o '](\./[^)]*)\|src="[^"]*"' README.md` 逐项 `ls`),目录内锚点与标题一致
- [x] 2.3 在 README 中按文档命令实际执行一次无副作用的核对(`pnpm --version`、`docker compose -f docker/docker-compose.yml config`),验证文档所述命令与路径可用
- [x] 2.4 验证 `git diff --stat` 只改动 `README.md`(OpenSpec 变更目录除外)

## Workflow follow-up

- 评审通过后归档该变更。
