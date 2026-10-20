<!-- markdownlint-disable MD030 -->

# wxflow

English | [中文](./README-ZH.md)

<h3>Build AI Agents, Visually</h3>

## ⚡Quick Start

wxflow is run from source. From the repository root:

```bash
pnpm install
pnpm build
pnpm start
```

Then open [http://localhost:3000](http://localhost:3000).

## 🌱 Env Variables

You can specify variables in the `.env` file inside the `packages/server` folder (see `.env.example`). `WXFLOW_*` names replace the old `FLOWISE_*` ones, which are still read as a fallback. See [CONTRIBUTING.md](../../CONTRIBUTING.md#-env-variables) for the full list.

You can also pass them as flags. For example:

```
wxflow start --PORT=3000 --DEBUG=true
```

## 📖 Tests

We use [Cypress](https://github.com/cypress-io) for our e2e testing. If you want to run the test suite in dev mode please follow this guide:

```sh
cd packages/server
pnpm install
./node_modules/.bin/cypress install
pnpm build
#Only for writing new tests on local dev -> pnpm run cypress:open
pnpm run e2e
```

## 📄 License

Source code in this repository is made available under the [Apache License Version 2.0](../../LICENSE.md).
