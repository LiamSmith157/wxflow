<!-- markdownlint-disable MD030 -->

# wxflow

[English](./README.md) | 中文

<h3>以可视化方式构建 AI Agents</h3>

## ⚡ 快速入门

wxflow 从源码运行。在仓库根目录执行:

```bash
pnpm install
pnpm build
pnpm start
```

然后打开 [http://localhost:3000](http://localhost:3000)。

## 🌱 环境变量

可以在 `packages/server` 文件夹中的 `.env` 文件里设置变量(参考 `.env.example`)。`WXFLOW_*` 取代了原来的 `FLOWISE_*`,旧名称仍作为回退读取。完整列表见 [CONTRIBUTING.md](../../CONTRIBUTING.md#-env-variables)。

也可以作为命令行参数传入,例如:

```
wxflow start --PORT=3000 --DEBUG=true
```

## 📄 许可证

本仓库中的源代码在[Apache License Version 2.0 许可证](../../LICENSE.md)下提供。
