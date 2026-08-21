# Task: Deployment Strategy — Research & Design

## Objective
Design a complete, production-ready deployment strategy for this project, deployed initially on a low-cost VPS setup. The output must be grounded in the actual codebase, not generic best practices.

## Phase 1 — Codebase & Service Inspection (mandatory, do not skip)
Do not rely on README/docs alone. Directly inspect:
- **Entry points & processes**: every route/controller/handler file to identify all running processes — web server(s), background workers, cron/scheduled jobs, websocket/long-lived connections, message consumers.
- **Dependency manifests** (`package.json`, `requirements.txt`, `go.mod`, `Gemfile`, etc.): flag any dependency that implies required infrastructure (Redis client, queue client, specific runtime version, native binary requirements).
- **Config & environment files** (`.env`, `.env.example`, config directories): identify every external service dependency — databases, caches, queues, object storage, SMTP, third-party APIs, payment processors, auth providers. Note anything that constrains hosting region, outbound firewall rules, or requires static IPs.
- **Existing infra artifacts**: any `Dockerfile`, `docker-compose.yml`, `Procfile`, existing CI config (`.github/workflows`, `.gitlab-ci.yml`, etc.), or IaC files. Do not propose something that conflicts with what's already assumed.
- **Data layer**: database engine(s), approximate current/expected data size, whether migrations exist and how they're run.
- **Static assets & build output**: how frontend assets are built and served; whether a CDN is warranted or premature.
- **Inter-service coupling**: does anything assume co-location (shared filesystem, localhost calls between services) that would break if split across multiple machines?

## Phase 2 — Decision: Single VPS vs Multi-VPS
Based only on what Phase 1 surfaces (not assumptions), reason explicitly through:
- Resource footprint of each process under expected load
- Failure isolation needs (does a worker crash risk taking down the web server if co-located?)
- Cost delta between one larger VPS vs several small ones
- Operational complexity each option adds given a small/no ops team

State the conclusion with the reasoning that led to it. If evidence is insufficient to decide confidently, say so explicitly and state what additional information would resolve it — do not default to a "safe-sounding" answer to avoid taking a position.

## Phase 3 — Free-Tier Offload (optional, evaluate fit — don't force it)
Evaluate whether parts of the pipeline (CI/CD, build steps, image builds, static hosting, cron-triggered jobs) can run on free providers (e.g., GitHub Actions) without adding fragile cross-service dependencies. Only recommend if it genuinely simplifies or de-risks the setup — not as a default checkbox.

## Phase 4 — Deployment Cycle Deliverable
Produce a detailed, staged deployment flow covering:
1. **Provisioning** — VPS sizing/provider choice with justification, OS setup, firewall/security baseline, user/permissions setup
2. **Environment setup** — runtime install, dependency install strategy, secrets management approach
3. **CI/CD pipeline** — build → test → artifact/image creation → deploy trigger, with exact steps
4. **Release mechanism** — how a deploy actually happens (e.g., pull + restart, blue-green, containers), with zero/minimal-downtime approach
5. **Database migration handling** — when/how migrations run relative to deploy
6. **Monitoring & health checks** — what's watched, how failures are detected
7. **Rollback procedure** — exact steps to revert a bad deploy
8. **Logging & alerting** — minimum viable setup for a small team

Every stage needs concrete commands/tools/config, not abstractions like "set up monitoring."

## Constraints on process
- Reason step by step before stating conclusions; show the reasoning, not just the verdict.
- Do not hedge for the sake of sounding safe, and do not pad the response with reassurance or praise — every sentence should carry information.
- If the codebase contradicts an assumption made earlier in this brief, flag the contradiction rather than silently adjusting.
- Flag any point where proceeding requires a decision only the team can make (budget ceiling, compliance requirement, etc.) rather than guessing.
