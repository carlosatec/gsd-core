<!-- GSD-SESSION-CONTEXT -->
> **GSD Active State**: Phase: Phase 37 (Project Second Brain, Unified Knowledge Graph AST, Obsidian Vault & Quality-First JIT Telemetry) | Status: In Progress (Plan 37-01, 37-02, 37-03 Complete & Verified; Plan 37-04 In Progress)
> **Decisions**: **D-01 [Architecture]:** Analisador AST nativo em TypeScript sem dependência de Python ou compiladores externos.; **D-02 [Docs]:** Documentação viva incremental (`ARCHITECTURE.md`, `APIS.md`) sincronizada com o código.; **D-03 [Context]:** JIT context injection para montar prompts cirúrgicos baseados no grafo de dependências.; **D-04 [Guardrails]:** Pre-flight static verification + self-healing loop automático em caso de falhas de teste.; **D-05 [UX]:** Suíte enxuta de 6 comandos canônicos (`status`, `plan`, `exec`, `review`, `verify`, `ship`) + 1 modo autônomo (`auto`).; **D-06 [Universal AST]:** Cobertura universal de 16+ ecossistemas (DevOps, Docker, Shell, Mobile, Flutter, Dados, SQL, Prisma, Estilos, CSS, SCSS, Backend, Python, Go, Rust, C#, Java, PHP, Ruby, C++).; **D-07 [Migration]:** Assistente de migração não-destrutiva `/gsd:migrate` para modernização automática de projetos legados.; **D-08 [Telemetry]:** Rastreamento automático de economia de tokens persistido em `.planning/intel/telemetry.json`.; ... and 167 more decisions in STATE.md
> **Unified Commands**: /gsd:status, /gsd:plan, /gsd:exec, /gsd:review, /gsd:verify, /gsd:ship, /gsd:auto, /gsd:tokens, /gsd:migrate, /gsd:graph, /gsd:help
<!-- /GSD-SESSION-CONTEXT -->

<!-- GSD Configuration — managed by gsd-core installer -->

# Instructions for GSD

- Use the gsd-core skill when the user asks for GSD or uses a `gsd-*` command.
- Treat `/gsd-...` or `gsd-...` as command invocations and load the matching file from `.github/skills/gsd-*`.
- When a command says to spawn a subagent, prefer a matching custom agent from `.github/agents`.
- Do not apply GSD workflows unless the user explicitly asks for them.
- After completing any `gsd-*` command (or any deliverable it triggers: feature, bug fix, tests, docs, etc.), ALWAYS: (1) offer the user the next step by prompting via `ask_user`; repeat this feedback loop until the user explicitly indicates they are done.

<!-- /GSD Configuration -->
