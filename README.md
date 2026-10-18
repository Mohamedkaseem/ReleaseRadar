# ReleaseRadar

Evidence before release. Investigate API contract changes, trace downstream service impact through **FalkorDB**, execute relevant checks, and preserve the result with source evidence.

## Graph model at a glance

Services expose endpoints; endpoints return fields; consuming services read those fields and depend on provider services. Workflows use services, tests verify workflows, and teams own services. Source nodes preserve the revision, file, line, and excerpt supporting each declaration. Reports retain immutable graph references and actual verification outcomes.

Essential relationships: `EXPOSES`, `RETURNS`, `CONSUMES`, `CALLS`, `DEPENDS_ON`, `USES`, `VERIFIES`, and `OWNS`. The implementation uses parameterized Cypher traversal and workflow-to-test queries. Full schema and executable query examples: [docs/graph-model.md](docs/graph-model.md).

## Run locally

Requirements: Node.js 22+ (verified with Node 24), npm, and a running Docker daemon.

```sh
npm ci
npm run db:up
npm run build
npm start
```

Open **http://127.0.0.1:4310**. FalkorDB Browser is available at http://127.0.0.1:3007; the database listens on loopback port 6387. The app binds to loopback. Stop the app with Ctrl+C; `npm run db:down` stops the database and retains its named volume.

For development, run `npm run dev` after starting the database. The Vite UI uses http://127.0.0.1:4300 and proxies API requests to port 4310.

## Demonstrate the product

1. Select **Breaking rename**, keep **Run verification** enabled, and click **Investigate release**.
2. Inspect the Checkout finding. The dependency path is `customerId → Orders → Checkout`.
3. Click a source link or graph node to inspect the original source excerpt.
4. Expand Checkout integration's output. Three real loopback HTTP services reproduce the failure.
5. Click **Verify compatible fix**. Identity preserves `customerId` alongside `id`; actual checks pass.
6. Open Investigations to revisit the original failure or export its JSON report.

Recommendations are **Blocked**, **Needs verification**, or **Checks passed within scope**. Passing the selected checks is not a guarantee that an entire release is safe.

## Agent modes

**Guided workflow** is available without model credentials. It deterministically inspects every detected contract change, queries FalkorDB for impact, selects graph-backed checks, and runs verification when enabled. It is explicitly labeled as a guided workflow, not represented as an LLM-driven run.

**Model agent** uses a bounded tool loop against a user-configured OpenAI-compatible chat-completions provider. Copy `.env.example` to `.env` and set:

```dotenv
LLM_BASE_URL=https://your-provider.example/v1
LLM_MODEL=your-tool-capable-model
LLM_API_KEY=your-provider-key
```

The base URL should stop before `/chat/completions`. The provider must support function tools. Never commit `.env`. These values are read only by the backend. Restart the API after changing configuration.

The model chooses among typed tools for changes, impact, evidence, history, test planning, and execution. The application computes the verdict; an early model finish cannot mark uninspected changes as passing. Limits: 20 tool calls, 12 model turns, 180 seconds per investigation phase, 20 seconds per model request, 15 seconds per verification process, 5 seconds per graph query. Model integration is verified with a local mock provider and with live Groq `openai/gpt-oss-120b` runs on October 17, 2026. The breaking release was blocked and the compatible fix passed; the fix run successfully retried a real HTTP 429 response. See `evaluations/results/live-model.json`. Your own provider settings are required.

## Supported scope

- Synthetic, locally authored commerce snapshots with Identity, Orders, and Checkout services.
- Explicit JSON contracts and dependency declarations; no arbitrary repository parsing.
- Removed endpoints, removed response fields, added response fields, and field type changes. New endpoints, request compatibility, and arbitrary schema constraints are outside the supported comparison.
- Source snapshots are bundled directories with content hashes, **not Git commit IDs**.
- Baseline relationships identify existing affected consumers. New candidate dependency topology is not comprehensively analyzed.
- Verification executes only fixed test IDs against the trusted bundled sample. It is a child-process runner, **not a security sandbox for untrusted code**.
- Two simultaneous investigations per local API process. History and evidence are persisted; active work is marked interrupted after an application restart rather than resumed automatically.
- Additive changes fall back to graph-registered smoke checks. Incomplete manifests retain a scope warning even when checks pass.
- No GitHub OAuth, remote repository execution, production deployments, external notifications, or automatic patches.

## Architecture

`src/server/repository.ts` validates manifests and builds immutable graph snapshots. `analyzer.ts` compares contracts and computes report status. `tools.ts` runs bounded graph traversals and verification tools. `agent.ts` orchestrates guided/model execution. `history.ts` persists reports in FalkorDB. The React dashboard streams progress, renders dependencies, and exposes source/test evidence.

See [architecture](docs/architecture.md), [graph model and queries](docs/graph-model.md), [tool contracts](docs/tool-contracts.md), and [implementation status](docs/implementation-status.md).

FalkorDB is essential: dependency traversal, verification selection, snapshot evidence, and history use the database. An unavailable database produces an explicit error; no hardcoded impact graph or substitute report is returned.

## Verify

```sh
npm run build
npm test
npm run test:integration
npm run evaluate
npm run format:check
npm audit
```

Integration tests require the local database. Test and evaluation histories use separate graph names. `evaluations/results/latest.json` records actual guided-mode outcomes across six synthetic scenarios. It is not a benchmark against other products or a retrieval baseline.

`npm run verify:baseline` demonstrates a passing checkout. `npm run verify:breaking` intentionally exits unsuccessfully to demonstrate the real contract failure.

## Data and submission

All example customer data and team ownership are fictional. OpenAI Codex was used to generate and refine the implementation, documentation, and tests; participants should review the architecture and be able to explain every submitted component. No code has been pushed or published by this implementation workflow.

Provider HTTP 429 responses are retried at most three times per model request, respecting Retry-After within the 180-second run budget. Retry waits appear in investigation activity. Exhausted provider retries preserve any already-confirmed blocking test failure.
