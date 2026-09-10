# Host Integration Capability Matrix

This document is the maintainer-facing source of truth for the `hostIntegration` block in every
`capabilities/<cli>/capability.json` runtime descriptor. Every per-CLI axis value is either:

- **documented** — backed by a cited authoritative source and evidence quote, or
- **`undocumented`** — the explicit fail-closed sentinel used when the CLI's public documentation
  does not state a value for that axis. `undocumented` validates in the registry but never
  propagates into effective axes: negotiation degrades closed to the safe default.

Values are generated from per-CLI documentation research (Context7 + official docs). They are
consumed verbatim by `gen:capability-registry` and validated by `capability-validator.cjs`.

---

## Axes legend

| Axis | Meaning |
|---|---|
| `embeddingMode` | Whether the CLI exposes an in-process programmatic API (`imperative`) or integrates purely through configuration files (`declarative`). |
| `commandSurface` | How slash commands are registered: `slash-file` (markdown), `slash-toml` (TOML), `slash-programmatic` (code API), `palette`, `prose-only`. |
| `modelMode` | Whether extensions can programmatically request or supply a model (`active`) or select only by config (`passive`). |
| `hookBus` | Who owns the hook lifecycle: `host` (the CLI fires hooks), `engine` (VS Code/Electron extension host), `none`. |
| `stateIO` | Filesystem access model: `filesystem` (full local FS), `sandboxed-storage`, `session-log-append`. |
| `transport` | Integration transport: `mcp` (Model Context Protocol), `native-extension`. |
| `runtime` | Plugin/extension execution runtime: `node`, `bun`, `python`, `go`, `rust`, `electron`, `sandboxed-web`, `other`. |
| `effortSurface` | How reasoning effort reaches this host: `argv` (deliverable as an argument on the host's own invocation), `none` (the host exposes no reasoning-effort mechanism), or `undocumented`. Added by #2481; there is deliberately **no** config-file member — the only host that ever had one (Gemini CLI's `thinkingConfig`) was removed as a sunset runtime, and naming a member with no host would be a guess. |

### dispatch sub-axes

| Sub-axis | Meaning |
|---|---|
| `namedDispatch` | Whether agents can be invoked by name (true/false/`undocumented`). |
| `nested` | Whether subagents can themselves spawn subagents (true/false/`undocumented`). |
| `maxDepth` | Maximum nesting depth (integer; -1 = unbounded; `undocumented`). |
| `background` | Whether subagents can run asynchronously in the background (true/false/`undocumented`). |
| `subagentToolkit` | Tool surface available to subagents: `full`, `read-only`, `built-in-only`, or `undocumented`. `built-in-only` means the host ships a fixed set of built-in subagent types whose tool surfaces differ from one another, so no single `full`/`read-only` value describes them; it degrades closed to `read-only` in the negotiated axes. |
| `backgroundDispatch` | Whether a BACKGROUND-dispatched sub-agent can itself spawn further named sub-agents — the #853 discriminator (true/false/`undocumented`). |

### Interface points

| Point | Meaning |
|---|---|
| `command` | Slash-command routing and invocation capability. |
| `dispatch` | Subagent/multi-agent dispatch capability. |
| `model` | Programmatic model selection capability. |
| `hooks` | Lifecycle hook registration capability. |
| `state` | Filesystem/state I/O capability. |
| `artifact` | Artifact delivery (skills, commands) surface capability. |

### Trigger precedence (#2871 Phase 2 — adjacent to, not part of, `hostIntegration`)

`runtime.triggerPrecedence` (an ordered list of trigger-bearing kind names, highest priority
first) is declared as a sibling of `hostIntegration` in `capability.json`'s `runtime` body, not
inside it — it is not researched per-CLI documentation the way the axes above are, so it carries
no per-host `Source`/`Evidence` row. Only `commands` and `skills` are members of the vocabulary;
`agents`/`kimi-agents` are excluded because they are not trigger-bearing (a `/gsd-<name>` a user
types) — an agent is invoked through named/`subagent_type` dispatch, the separate `dispatch`
interface point above, never through the `command` interface point. Every shipped runtime
descriptor declares the same value, `["skills", "commands"]` (skills wins a same-scope collision),
matching `capability-validator.cjs`'s `DEFAULT_TRIGGER_PRECEDENCE` — the axis is
required-with-default (absence resolves to that default) so a third-party descriptor authored
before this phase keeps validating unchanged. `runtime-artifact-layout.cts`'s
`resolveTriggerSurface` reads it to decide the winner among same-trigger candidates once scope
rank (Install Scope Module) has already been applied. See CONTEXT.md's Runtime Artifact Layout
Module entry and `.gsd/phase/feat-2871-trigger-resolution/40-design.md`.

---

## claude

| Axis | Value | Source | Evidence |
|---|---|---|---|
| embeddingMode | imperative | https://code.claude.com/docs/en/agent-sdk/overview | "The Agent SDK offers hooks to execute custom code at critical points within the agent's lifecycle. These callback functions enable developer" |
| commandSurface | slash-file | https://code.claude.com/docs/en/agent-sdk/slash-commands | "Each custom command is a markdown file where the filename (without the `.md` extension) becomes the command name. The file content defines w" |
| modelMode | passive | https://code.claude.com/docs/en/agent-sdk/typescript | "setModel(model?: string): Changes the model (only available in streaming input mode) ... model overrides the default model for this subagent" |
| hookBus | host | https://code.claude.com/docs/en/agent-sdk/python | "HookEvent = Literal['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'UserPromptSubmit', 'Stop', 'SubagentStop', 'PreCompact', 'Notificati" |
| stateIO | filesystem | https://code.claude.com/docs/en/sandboxing | "The sandboxed Bash tool restricts file system access, granting read and write access to the current working directory and session temp direc" |
| transport | mcp | https://code.claude.com/docs/en/mcp | "Project-Scoped MCP Server Configuration in .mcp.json ... This JSON structure illustrates the format for a project-scoped MCP server configur" |
| runtime | node | https://code.claude.com/docs/en/agent-sdk/typescript | "import { query } from \"@anthropic-ai/claude-agent-sdk\"; ... pathToClaudeCodeExecutable (string) - Specifies the path to the Claude Code CLI" |
| effortSurface | argv | https://code.claude.com/docs/en/cli-reference ; `claude --help` | `--effort <level>` is a documented flag on the host's own invocation, so GSD renders the resolved universal effort straight onto the argv it spawns (#2481). |
| dispatch.namedDispatch | true | https://code.claude.com/docs/en/agent-sdk/subagents | "agents: { 'code-reviewer': AgentDefinition({ description: 'Expert code reviewer.', ... }) } ... subagent_type: block.inp" |
| dispatch.nested | true | https://code.claude.com/docs/en/sub-agents | "As of Claude Code v2.1.172, a subagent can spawn its own subagents, allowing delegated tasks to split into parallel subt" |
| dispatch.maxDepth | 5 | https://code.claude.com/docs/en/sub-agents | "foreground subagents can spawn at any depth, blocking their parent until completion. Background subagents are limited to" |
| dispatch.background | true | https://code.claude.com/docs/en/sub-agents | "Subagents can run in the foreground, blocking the main conversation and passing permission prompts to you, or in the bac" |
| dispatch.subagentToolkit | full | https://code.claude.com/docs/en/sub-agents | "If all tools remain selected, the subagent inherits all tools available to the main conversation." |
| dispatch.backgroundDispatch | false | https://code.claude.com/docs/en/sub-agents | "Background subagents are limited to a depth of five and cannot spawn further, " |
| dispatch.isolation | harness-worktree | https://code.claude.com/docs/en/sub-agents ; Claude Code Agent tool (`Agent(isolation="worktree")`) | The Claude Code Agent tool accepts an `isolation="worktree"` harness primitive — the host's own harness creates + binds a git worktree per executor; GSD passes the flag and calls no git itself (#2584) |

Sources consulted:
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/agent-sdk/slash-commands
- https://code.claude.com/docs/en/agent-sdk/subagents
- https://code.claude.com/docs/en/agent-sdk/python
- https://code.claude.com/docs/en/agent-sdk/typescript
- https://code.claude.com/docs/en/agent-sdk/overview
- https://code.claude.com/docs/en/mcp
- https://code.claude.com/docs/en/sandboxing
- Context7 /websites/code_claude
- Context7 /llmstxt/code_claude_llms_txt

**Cross-scope trigger shadowing and spec-root reachability (#2873, epic #2866 Phase 4, resolving #2218).** GSD's claude `artifactLayout` installs `global=[skills]` and `local=[commands, agents]` (see "Trigger precedence" above). Claude Code's own documented precedence — personal overrides project, and a same-named skill overrides a same-named command — means both rules point the same direction when a user installs both scopes: the global skill always wins the `/gsd-<name>` trigger, and the project-local `.claude/gsd-core/` spec tree the local command correctly points at becomes unreachable through that trigger, silently. GSD Core now (a) detects this at install time and from `/gsd-health` (diagnostic `W028`) and prints which scope wins — an advisory only, exit code unchanged; and (b) for claude at **global** scope only, resolves the winning skill's own workflow-spec `@`-include at runtime rather than pre-expanding it: the skill body carries an explicit imperative instruction that resolves `.claude/gsd-core/workflows/<name>.md` relative to the working directory first, falling back to `~/.claude/gsd-core/workflows/<name>.md` when no local tree exists. This is instruction-following, not the guaranteed inclusion a real `@`-include provides — it costs the agent one file read — and is deliberately confined to this one reference, in this one runtime, at this one scope: the skill's `references/`/`templates/` includes and the local scope's own emission are unchanged. See [Interpret install-shadow warnings](../how-to/interpret-install-shadow-warnings.md) and [Install on your runtime — Claude Code](../how-to/install-on-your-runtime.md#claude-code).

---

## codex

> **Note:** ADR-1239's host matrix lists Codex as `prose-only`; current OpenAI Codex dev docs document slash-commands, so `commandSurface` is `slash-file` here (docs are the source of truth).

| Axis | Value | Source | Evidence |
|---|---|---|---|
| embeddingMode | declarative | https://developers.openai.com/codex/plugins/build | "No in-process programmatic API exists. Plugins integrate through: External command execution (hooks), MCP server processes, Configuration fi" |
| commandSurface | slash-file | https://github.com/openai/codex/blob/main/codex-rs/core-skills/src/loader.rs | "const SKILLS_FILENAME: &str = \"SKILL.md\"; ... Each skill is a folder with a SKILL.md file containing YAML frontmatter with name and descript" |
| modelMode | passive | https://github.com/openai/codex/blob/main/codex-rs/config/src/config_toml.rs | "pub model_provider: Option<String> ... model is selected by config field; no programmatic model request API" |
| hookBus | host | https://github.com/openai/codex/blob/main/codex/codex-rs/hooks/src/lib.rs | "pub const HOOK_EVENT_NAMES: [&str; 10] = [\"PreToolUse\", \"PermissionRequest\", \"PostToolUse\", \"PreCompact\", \"PostCompact\", \"SessionStart\", \"Us" |
| stateIO | filesystem | https://developers.openai.com/codex/concepts/sandboxing | "workspace-write: The default mode allowing Codex to read files, edit within the workspace, and run routine local commands inside that bounda" |
| transport | mcp | https://github.com/openai/codex/blob/main/codex-rs/config/src/config_toml.rs | "pub mcp_servers: HashMap<String, McpServerConfig> ... Definition for MCP servers that Codex can reach out to for tool calls." |
| runtime | node | https://github.com/openai/codex/blob/main/codex-cli/package.json | "\"engines\": {\"node\": \">=16\"} ... The npm-distributed CLI wrapper is a Node.js script (#!/usr/bin/env node)" |
| effortSurface | argv | https://github.com/openai/codex/blob/main/codex-rs/exec/src/cli.rs ; https://developers.openai.com/codex/config-reference | `model_reasoning_effort` is a `config.toml` key and **not** a dedicated CLI flag, so the generic `-c <key>=<value>` override is the only argv route — which is still argv, hence `argv` rather than a config-file member (#2481). |
| dispatch.namedDispatch | true | https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/handlers/multi_agents_spec.rs | "\"agent_type\".to_string(), JsonSchema::string(Some(agent_type_description.to_string())) ... apply_role_to_config(&mut con" |
| dispatch.nested | true | https://developers.openai.com/codex/multi-agent | "agents.max_depth defaults to 1, which allows a direct child agent to spawn but prevents deeper nesting." |
| dispatch.maxDepth | 1 | https://developers.openai.com/codex/config-reference | "agents.max_depth: Maximum nesting depth allowed for spawned agent threads (root sessions start at depth 0; default: 1)" |
| dispatch.background | true | https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/handlers/multi_agents_spec.rs | "spawn_agent returns the spawned agent id immediately; a separate wait_agent tool polls for final status." |
| dispatch.subagentToolkit | full | https://developers.openai.com/codex/multi-agent | "Subagents inherit the sandbox policy and tool surface from the parent session." |
| dispatch.backgroundDispatch | true | https://github.com/openai/codex/blob/main/codex-rs/core/templates/collab/experimental_prompt.md | "Sub-agents have access to the same set of tools as you do so you must tell them if they are allowed to spawn sub-agents themselves or not." The config (codex-rs/config/src/config_toml.rs) exposes an |
| dispatch.isolation | orchestrator-worktree | https://learn.chatgpt.com/docs/environments/git-worktrees ; https://github.com/openai/codex/blob/main/codex-rs/utils/cli/src/shared_options.rs | "Worktrees are available only in Codex in the ChatGPT desktop app." (no native CLI worktree) + `codex exec --cd <dir>` sets an explicit working root, so GSD creates+manages the worktree and points the executor at it (#2584) |

**GSD integration status — Phase D dogfood complete (#2088, ADR-1239).** Codex installs through the `declarative` embedding adapter (`createDeclarativeAdapter` → `installRuntimeArtifacts`); the hardcoded `runtime === 'codex'`/`isCodex` projection is folded into descriptor-driven `runtime.hostBehaviors`, and install/uninstall output is byte-parity-gated at the time (`tests/fixtures/golden-install-parity/codex.json`; superseded by the differential attribution check, #2724). Three capability upgrades land, each with a test driving the user-reachable surface:

- **Skill root** — global skills install to the canonical `$HOME/.agents/skills` (Codex core-skills `loader.rs` user-scope root), not the deprecated `$CODEX_HOME/skills` fallback; local skills install to `<project>/.codex/skills`. The global path is declared via the global skills-kind `home: ".agents"` override, while the local kind intentionally has no home override. Pre-move global installs are migrated (stale `~/.codex/skills/gsd-*` cleaned on both install and uninstall); local installs do not remove `$HOME/.agents/skills` because those skills may be intentionally global.
- **Hook events** — GSD registers all documented `hooks.json` lifecycle events beyond `SessionStart`: `SubagentStart`, `Stop`, `PostToolUse` (#772), plus the six added in #2088 — `PreToolUse`, `PermissionRequest`, `PreCompact`, `PostCompact`, `SubagentStop`, `UserPromptSubmit` — all routed through `gsd-context-monitor.js`. (The descriptor `extendedHookEvents` field reflects the schema-valid cross-runtime subset `SubagentStop`/`Stop`/`PreCompact`; Codex's full event set is codex-hooks-json-native, registered directly in `hooks.json`.)
- **Dispatch tuning** — `[agents] max_depth = 1` is written explicitly into the managed `config.toml` block, pinning the `dispatch.maxDepth: 1` axis instead of relying on codex-cli's implicit default. Because `maxDepth === 1`, `degradationFor` flattens GSD-hosted wave dispatch to single-level even though `dispatch.nested`/`background`/`backgroundDispatch` are all `true`. The block is a bare `[agents]` AgentsToml scalar table; it does **not** carry per-role `[agents.gsd-*]` sub-tables — those pointed `config_file` back at the standalone `agents/gsd-*.toml` files Codex already auto-discovers, so emitting them was a duplicate role registration (Codex logged "Ignoring malformed agent role definition: duplicate agent role name" once per agent) removed in #2406. `validateCodexConfigSchema` permits a known-scalar-only `[agents]` while still rejecting `[[agents]]` and unknown-key forms.

Sources consulted:
- https://github.com/openai/codex (repo via gh CLI)
- /openai/codex (Context7 library ID)
- https://github.com/openai/codex/blob/main/codex-rs/config/src/config_toml.rs
- https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/handlers/multi_agents_spec.rs
- https://github.com/openai/codex/blob/main/codex-rs/core-skills/src/loader.rs
- https://developers.openai.com/codex/config-reference
- https://developers.openai.com/codex/plugins/build
- https://developers.openai.com/codex/multi-agent
- https://developers.openai.com/codex/cli/slash-commands

Documentation gaps:
- dispatch.maxDepth is configurable (Option<i32> with no documented upper bound); the documented default is 1 but the actual enforced maximum is not stated.
- dispatch.subagentToolkit: docs say subagents 'inherit the tool surface' but do not enumerate whether any tools are excluded.
- runtime: the Node.js entry point is a thin launcher shim; the actual agent execution runtime is a compiled Rust binary — axis classification is ambiguous.

---


## opencode

| Axis | Value | Source | Evidence |
|---|---|---|---|
| embeddingMode | imperative | https://opencode.ai/docs/plugins | "Plugins are JavaScript/TypeScript modules that export plugin functions; they register hooks via `import type { Plugin } from '@opencode-ai/p'" |
| commandSurface | slash-file | https://opencode.ai/docs/commands | "\"Create markdown files in the `commands/` directory to define custom commands.\" and \"The markdown file name becomes the command name." |
| modelMode | active | /anomalyco/opencode (Context7) — packages/plugin/src/v2/promise/README.md | "`ctx.aisdk.sdk(async (event) => { ... event.sdk = mod.createXai(event.options) })` and `ctx.aisdk.language((event) => { ... event.language =" |
| hookBus | host | https://opencode.ai/docs/plugins | "Host fires events including: `tool.execute.before`, `tool.execute.after`, `session.created`, `session.compacted`, `session.deleted`" |
| stateIO | filesystem | https://opencode.ai/docs/plugins | "Plugin context includes `directory` (working directory path), `worktree` (git worktree path), and `$` (\"Bun's shell API\")" |
| transport | mcp | https://opencode.ai/docs/mcp-servers | "\"OpenCode supports both local and remote servers.\" and \"Once added, MCP tools are automatically available to the LLM\"" |
| runtime | bun | https://opencode.ai/docs/plugins | "\"$\": Bun's shell API for executing commands\" (plugin context property); \"OpenCode runs `bun install` at startup\"" |
| effortSurface | argv | https://opencode.ai/docs/cli ; `opencode run --help` | `--variant` is accepted on `opencode run`, so the resolved effort is deliverable as an invocation argument (#2481). |
| dispatch.namedDispatch | true | https://opencode.ai/docs/agents | "\"Subagents can be invoked: Automatically by primary agents for specialized tasks based on their descriptions. Manually b" |
| dispatch.nested | undocumented | no authoritative doc — searched: https://opencode.ai/docs/agents | — |
| dispatch.maxDepth | undocumented | no authoritative doc — searched: https://opencode.ai/docs/agents | — |
| dispatch.background | false | https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/effect/runtime-flags.ts ; https://github.com/anomalyco/opencode/issues/29638 | "`experimentalBackgroundSubagents: enabledByExperimental(\"OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS\")` — `enabledByExperimental` falls back to the `experimental` flag, and `bool()` defaults to `false`, so the Task tool's `background` parameter is hidden from the model unless the operator opts in by env var. #29638 (OPEN) confirms the session loop still `tasks.pop()`s one subtask at a time. (#2598 — corrects #2087, whose \"v1.17 default-on in all modes\" reading does not hold against current `dev`)" |
| dispatch.subagentToolkit | full | https://opencode.ai/docs/agents | "The 'general' subagent \"Has full tool access (except todo), so it can make file changes when needed.\"" |
| dispatch.backgroundDispatch | false | https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/effect/runtime-flags.ts ; https://github.com/anomalyco/opencode/issues/29638 ; https://github.com/anomalyco/opencode/issues/14195 | "Concurrent dispatch requires the opt-in `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS` flag (default `false`), so it cannot be relied on. #14195: \"the session loop does `tasks.pop()` to grab a single subtask, `await`s it, then `continue`s the loop — so even 3 simultaneous Task calls run sequentially.\" Declaring `true` would overstate the capability, against the fail-closed posture negotiation is built for. (#2598 — corrects #2087)" |
| dispatch.isolation | orchestrator-worktree | https://opencode.ai/docs/cli ; opencode.ai/docs/plugins ; opencode issues #14195/#29638/#5887 | "`opencode run --dir <path>` sets an explicit working root at the process level" — native subagent dispatch is synchronous-only, so GSD creates + manages the worktree and process-spawns the executor into it via `--dir` (#2584) |

Sources consulted:
- https://opencode.ai/docs/plugins
- https://opencode.ai/docs/agents
- https://opencode.ai/docs/commands
- https://opencode.ai/docs/mcp-servers
- /websites/opencode_ai_plugins (Context7)
- /anomalyco/opencode (Context7)
- https://github.com/sst/opencode/issues/5887

Documentation gaps:
- dispatch.nested
- dispatch.maxDepth

---

## cursor

| Axis | Value | Source | Evidence |
|---|---|---|---|
| embeddingMode | imperative | https://cursor.com/docs/sdk/typescript | "local.customTools where you define tool functions that execute 'in your process, so it can reach anything your code can'; Agent.create()" |
| commandSurface | slash-file | https://cursor.com/docs/enterprise/llm-safety-and-controls | "Commands are reusable prompts invoked via slash commands (e.g., /test), while workflows enable multi-step processes" |
| modelMode | passive | https://cursor.com/docs/sdk/python | "The model used for a run can be overridden by passing a ModelSelection object in SendOptions to agent.send()." |
| hookBus | host | https://cursor.com/docs/hooks | "Agent hooks: sessionStart, sessionEnd, preToolUse, postToolUse, subagentStart, subagentStop, beforeShellExecution, afterShellExecution" |
| stateIO | filesystem | https://cursor.com/docs/reference/sandbox | "Local agents run with sandbox options disabled by default." |
| transport | mcp | https://cursor.com/docs/mcp | "The Model Context Protocol (MCP) allows Cursor to connect to external tools and data sources." |
| runtime | node | https://cursor.com/docs/sdk/typescript | "The SDK runs on Node.js. It requires Node.js 22.13 or later and is described as a Node-first package." |
| effortSurface | undocumented | no authoritative doc — per-host reasoning-effort survey, #2481 (`09b535ac0`) | This host's documentation states no reasoning-effort setting, so the axis carries the fail-closed sentinel rather than inheriting a profile baseline. No host-specific URL is cited because the finding is an ABSENCE: #2481 surveyed all hosts for a reasoning-effort mechanism and found one only for claude/opencode/codex. |
| dispatch.namedDispatch | true | https://cursor.com/docs/subagents | "Invoke specific subagents using slash commands in your prompt. This allows for direct control over which agent performs" |
| dispatch.nested | true | https://cursor.com/docs/sdk/typescript | "The top-level agent and its direct subagents can launch subagents, but a subagent launched by another subagent can't lau" |
| dispatch.maxDepth | 2 | https://cursor.com/docs/sdk/typescript | "The top-level agent and its direct subagents can launch subagents, but a subagent launched by another subagent can't lau" |
| dispatch.background | true | https://cursor.com/docs/subagents | "Background, which returns immediately while the subagent works independently, best for long-running tasks or parallel wo" |
| dispatch.subagentToolkit | full | https://cursor.com/docs/subagents | "Subagents can utilize MCP tools, inheriting all tools available to their parent agent, including those from configured s" |
| dispatch.backgroundDispatch | true | https://cursor.com/docs/subagents (FAQ: Can subagents launch other subagents?) and https://cursor.com/docs/sdk/typescript (Subagents > Nested subagents) | FAQ: "As of Cursor 2.5, subagents have the capability to launch child subagents, enabling the creation of a hierarchical structure for coordinated tasks. This nested launching functionality requires T |
| dispatch.isolation | harness-worktree | https://cursor.com/docs/cli/reference/parameters ; cursor.com/docs/cli/using ; cursor.com/docs/cli/changelog | "`-w, --worktree [name]` — cursor-agent creates/binds a git worktree per agent (`~/.cursor/worktrees/…`); native parallel-agent dispatch" (#2584) |

Sources consulted:
- https://cursor.com/docs/subagents
- https://cursor.com/docs/hooks
- https://cursor.com/docs/sdk/typescript
- https://cursor.com/docs/sdk/python
- https://cursor.com/docs/mcp
- https://cursor.com/docs/reference/sandbox
- https://cursor.com/docs/enterprise/llm-safety-and-controls
- /websites/cursor (Context7)

**GSD integration status — Phase D dogfood complete (#2089, ADR-1239).** Cursor installs through the `imperative` embedding adapter (`createImperativeAdapter` → `installRuntimeArtifacts`); the hardcoded `runtime === 'cursor'` / `isCursor` projection is folded into descriptor-driven `runtime.hostBehaviors`, and install/uninstall output is byte-parity-gated at the time (`tests/fixtures/golden-install-parity/cursor.json`; superseded by the differential attribution check, #2724). Two capability upgrades land, each with a test driving the user-reachable surface:

- **Expanded hook-bus coverage** — GSD registers all 6 managed lifecycle events in `hooks.json` beyond the original `sessionStart`/`postToolUse`: `preToolUse`, `stop`, `subagentStart`, `subagentStop` (AC4a, cite https://cursor.com/docs/hooks). The hook-bus binding is descriptor-driven via `src/host-integration-adapters/imperative-hook-bus.cts` (reads `hostBehaviors.managedHookEvents`), not a hardcoded event pair.
- **Named/background nested subagent dispatch** — `dispatch.background`/`backgroundDispatch`/`nested` are all `true` with `maxDepth: 2`; `shouldFlattenDispatch(cursor)` returns `false` so GSD's wave-based execution drives Cursor's native background + depth-2 nested subagent dispatch instead of flattening to inline sequential calls (AC4b, cite https://cursor.com/docs/subagents + https://cursor.com/docs/sdk/typescript).

---

## cline

| Axis | Value | Source | Evidence |
|---|---|---|---|
| embeddingMode | imperative | /cline/cline (Context7) — https://github.com/cline/cline/blob/main/docs/sdk/plugins.mdx | "Implement the AgentPlugin interface to register tools, hooks, and configuration. The setup function is used for registering capabilities." |
| commandSurface | slash-file | /cline/cline (Context7) — https://github.com/cline/cline/blob/main/cline/apps/vscode/src/test/slash-commands.test.ts | "workflow markdown files (with .md, .markdown, or .txt extensions) are invoked as slash commands using their filename." |
| modelMode | active | /cline/cline (Context7) — https://github.com/cline/cline/blob/main/sdk/packages/llms/README.md | "The Runtime API, accessible via createLlmsRuntime(...), allows for the creation of a registry that manages configured providers and their de" |
| hookBus | host | /cline/cline (Context7) — https://github.com/cline/cline/blob/main/sdk/README.md | "Package agent capabilities as extensions (plugins) that can register tools, observe lifecycle events, and modify agent behavior." |
| stateIO | filesystem | /cline/cline (Context7) — https://github.com/cline/cline/blob/main/cline/sdk/packages/shared/src/storage/paths.ts | "resolveClineDir() returns ~/.cline; resolveDocumentsExtensionPath('Workflows') returns ~/Documents/Cline/Workflows." |
| transport | mcp | /cline/cline (Context7) — https://github.com/cline/cline/blob/main/docs/mcp/mcp-overview.mdx | "MCP (Model Context Protocol) enables Cline to interact with external tools and data sources" |
| runtime | node | /cline/cline (Context7) — https://github.com/cline/cline/blob/main/sdk/examples/plugins/typescript-lsp/README.md | "Installs a portable subagent plugin ... cp examples/plugins/agents-squad/index.ts ~/.cline/plugins/portable-subagents.ts." |
| effortSurface | undocumented | no authoritative doc — per-host reasoning-effort survey, #2481 (`09b535ac0`) | This host's documentation states no reasoning-effort setting, so the axis carries the fail-closed sentinel rather than inheriting a profile baseline. No host-specific URL is cited because the finding is an ABSENCE: #2481 surveyed all hosts for a reasoning-effort mechanism and found one only for claude/opencode/codex. |
| dispatch.namedDispatch | true | /cline/cline (Context7) — https://github.com/cline/cline/blob/main/sdk/examples/plugins/agents-squad/README.md | "parent → start_subagent(preset: \"phantom\", task: \"Map the auth module\") → phantom: save_handoff(...)" |
| dispatch.nested | false | /cline/cline (Context7) — https://github.com/cline/cline/blob/main/docs/features/subagents.mdx | "subagents are restricted from editing files, using the browser, accessing MCP servers, or creating nested subagents." |
| dispatch.maxDepth | 1 | /cline/cline (Context7) — https://github.com/cline/cline/blob/main/docs/features/subagents.mdx | "They are explicitly prohibited from ... spawning other subagents." |
| dispatch.background | true | /cline/cline (Context7) — https://github.com/cline/cline/blob/main/docs/features/subagents.mdx | "Commands executed by subagents run in the background and are strictly limited to read-only operations" |
| dispatch.subagentToolkit | read-only | /cline/cline (Context7) — https://github.com/cline/cline/blob/main/docs/features/subagents.mdx | "Subagents are equipped with tools for read-only operations, including reading file contents (read_file), listing directo" |
| dispatch.backgroundDispatch | false | https://docs.cline.bot/features/subagents (mirrored at https://github.com/cline/cline/blob/main/docs/features/subagents.mdx) | "They cannot edit files, use the browser, or spawn nested subagents" — and from the GitHub source: "subagents are restricted from editing files, using the browser, accessing MCP servers, or creating n |
| dispatch.isolation | undocumented | not researched / no concurrent fan-out documented for this axis | no authoritative source consulted for concurrent-executor isolation on this host — fails closed to `none` (sequential) in negotiation (#2584) |

Sources consulted:
- https://github.com/cline/cline/blob/main/docs/sdk/plugins.mdx
- https://github.com/cline/cline/blob/main/sdk/README.md
- https://github.com/cline/cline/blob/main/sdk/packages/agents/README.md
- https://github.com/cline/cline/blob/main/sdk/examples/plugins/agents-squad/README.md
- https://github.com/cline/cline/blob/main/docs/features/subagents.mdx
- https://github.com/cline/cline/blob/main/docs/mcp/mcp-overview.mdx
- https://github.com/cline/cline/blob/main/sdk/packages/llms/README.md
- /cline/cline (Context7)

**GSD integration status — Phase D dogfood complete (#2090, ADR-1239).** Cline installs through the `imperative` embedding adapter (`createImperativeAdapter` → `installRuntimeArtifacts`); the hardcoded `runtime === 'cline'` / `isCline` projection is folded into descriptor-driven `runtime.hostBehaviors`, and install/uninstall output is byte-parity-gated at the time (`tests/fixtures/golden-install-parity/cline.json`; superseded by the differential attribution check, #2724). Two capability upgrades land, each with a test driving the user-reachable surface:

- **`AgentPlugin.hooks.beforeTool` planning guard** — the `.clinerules/hooks/PreToolUse` file-convention hook (#787) is re-implemented as a real Cline SDK `AgentPlugin` registered through the negotiated `hookBus: host` interface point. Guard semantics are preserved exactly (fail-open, cancels write-class calls targeting `.planning/`); the SDK maps the file hook's `{cancel, errorMessage}` to `{skip, reason}`. The binding lives in `src/host-integration-adapters/cline-sdk-binding.cts` (cite https://github.com/cline/cline/blob/main/docs/sdk/plugins.mdx).
- **`createAgentModel` per-subagent model overrides** — `DefaultGateway.createAgentModel({providerId, modelId})` is wired so GSD's `model_overrides` / `model_profile_overrides` resolution (already used for OpenCode/Codex passive hosts) applies to cline subagents (`modelMode: active`), instead of leaving model selection untouched (cite https://github.com/cline/cline/blob/main/docs/sdk/reference/gateway.mdx).
- **Dispatch stays degraded/flat (deliberate)** — unlike cursor's dispatch upgrade, cline's `dispatch` is `maxDepth: 1`, `nested: false`, `subagentToolkit: 'read-only'`, `backgroundDispatch: false`. `shouldFlattenDispatch(cline)` returns `true` and `degradationFor('dispatch', cline)` returns `{level:'degraded', fallback:'flat dispatch — waves run inline'}`. This is NOT upgraded: cline's own docs restrict subagents to a single level with a read-only toolkit and no nested spawning, so claiming full dispatch would misrepresent the host and violate the fail-closed negotiation contract (cite https://github.com/cline/cline/blob/main/docs/features/subagents.mdx).

---

## antigravity

| Axis | Value | Source | Evidence |
|---|---|---|---|
| embeddingMode | declarative | https://github.com/alphaperseii3000/google-antigravity-docs/blob/master/google-antigravity-docs.md | "Skills require a SKILL.md file; Workflows are saved as markdown files; Rules are manually defined constraints — all configuration-file-based" |
| commandSurface | slash-file | https://github.com/alphaperseii3000/google-antigravity-docs/blob/master/google-antigravity-docs.md | "Workflows are saved as markdown files, providing a repeatable method for executing key processes. They can be invoked in the Agent using a s" |
| modelMode | passive | https://dev.to/arindam_1729/antigravity-cli-a-hands-on-guide-to-googles-terminal-coding-agent-5bc7 | "Selection occurs via `-m` flag or `/model` command inside the TUI. No programmatic model request API is documented for extensions/skills" |
| hookBus | host | https://www.aibuilderclub.com/blog/antigravity-cli-guide | "The CLI fires hooks, not the engine. These are JSON lifecycle interceptors (before tool call, after file edit, on session start)." |
| stateIO | filesystem | https://www.explainx.ai/blog/antigravity-cli-features-sandbox-plugins-subagents-2026 | "Plugin staging at ~/.gemini/antigravity-cli/plugins/<name>/; skills at ~/.gemini/antigravity-cli/skills/" |
| transport | mcp | https://dev.to/arindam_1729/antigravity-cli-a-hands-on-guide-to-googles-terminal-coding-agent-5bc7 | "Both local (stdio) and remote (HTTP) Model Context Protocol servers are supported" |
| runtime | go | https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/ | "Built in Go, Antigravity CLI is snappier and more responsive." |
| effortSurface | undocumented | no authoritative doc — per-host reasoning-effort survey, #2481 (`09b535ac0`) | This host's documentation states no reasoning-effort setting, so the axis carries the fail-closed sentinel rather than inheriting a profile baseline. No host-specific URL is cited because the finding is an ABSENCE: #2481 surveyed all hosts for a reasoning-effort mechanism and found one only for claude/opencode/codex. |
| dispatch.namedDispatch | undocumented | no authoritative doc — searched: https://www.aibuilderclub.com/blog/antigravity-cli-guide, https://antigravity.google/docs/agents | — |
| dispatch.nested | undocumented | no authoritative doc — searched: https://antigravity.google/docs/agents | — |
| dispatch.maxDepth | undocumented | no authoritative doc — searched: https://antigravity.google/docs/agents | — |
| dispatch.background | true | https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/ | "Antigravity CLI orchestrates multiple agents for complex tasks in the background" |
| dispatch.subagentToolkit | full | https://antigravity.google/docs/cli/features | "Capabilities: Subagents have full access to tools such as code search, file editing, terminal commands, and web searches to complete their assigned tasks." (#2096 EoS migration — the page is JS-rendered/blank on a static fetch; confirmed via headless-browser render) |
| dispatch.backgroundDispatch | undocumented | no authoritative doc — Multiple sources consulted: antigravity.google/docs/cli-subagents (returned blank/JS-rendered), antigravity.google/docs/agent (blank), github.com/google-antigravity/antigravity-cli README, Context7 /google-antigravity/antigravity-cli | All documentation consulted describes a two-level orchestrator→subagent architecture. Background subagents run asynchronously while the main agent continues accepting prompts. The DataCamp tutorial st |
| dispatch.isolation | undocumented | not researched / no concurrent fan-out documented for this axis | no authoritative source consulted for concurrent-executor isolation on this host — fails closed to `none` (sequential) in negotiation (#2584) |

Sources consulted:
- https://github.com/alphaperseii3000/google-antigravity-docs/blob/master/google-antigravity-docs.md
- https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/
- https://dev.to/arindam_1729/antigravity-cli-a-hands-on-guide-to-googles-terminal-coding-agent-5bc7
- https://www.explainx.ai/blog/antigravity-cli-features-sandbox-plugins-subagents-2026
- https://www.aibuilderclub.com/blog/antigravity-cli-guide
- https://antigravity.google/docs/agents
- https://antigravity.google/docs/hooks
- https://antigravity.google/docs/cli/features (#2096 — subagentToolkit)

Documentation gaps:
- dispatch.namedDispatch — docs describe dynamic plain-English goal dispatch where agent names subagents at runtime; no pre-registered named sub-agent API documented.
- dispatch.nested — no documentation found on whether subagents can themselves spawn further subagents.
- dispatch.maxDepth — no documented depth limit or explicit unbounded statement found.

**EoS migration status (#2096):** Migrated onto the declarative adapter. All `runtime === 'antigravity'` / `isAntigravity` / `canonical === 'antigravity'` branches folded into descriptor-driven `runtime.hostBehaviors` + `runtime.hostIntegration`: `getConfigDirFromHome` (`bin/install.js`) now branches on `configHome.kind === 'dot-home-nested'` instead of a hardcoded runtime literal; `projectLocalHookPrefix` (`src/shell-command-projection.cts`) reads `hostBehaviors.hookPathStyle` (`'raw'` → bare `dirName`, no `$CLAUDE_PROJECT_DIR` anchor); `applyAgentPathRewrites` (`src/runtime-artifact-conversion.cts`) reads `hostBehaviors.noPathRewrite` to skip the `~/.claude/` → pathPrefix rewrites; and `getProjectInstructionFile` (`src/runtime-name-policy.cts`) reads `hostBehaviors.projectInstructionFile` (`"GEMINI.md"` — Antigravity CLI's `contextFileName`, successor to the sunset Gemini CLI per #1928) instead of a hardcoded `canonical === 'antigravity'` check. The dead `isAntigravity` branches these functions previously carried are removed. `dispatch.subagentToolkit` flipped `undocumented` → `full` per the citation above (antigravity.google/docs/cli/features); `dispatch.namedDispatch`/`nested`/`maxDepth`/`backgroundDispatch` stay `undocumented` — no authoritative source states named/nested/depth-bounded dispatch or a `run_in_background`-style call-time param, so `negotiateHostCapabilities` degrades all four closed to their most-restrictive value (false/0), and `shouldFlattenDispatch` still forces antigravity's dispatch to flatten (inline) despite `dispatch.background: true`, because `backgroundDispatch` itself never reaches `true`. Two upgrades land: **UPGRADE 1 — permission-writer** (`configureAntigravityPermissions`, `runtime.permissionWriter: "antigravity"`) writes Antigravity's native `{"permissions":{"allow":[...]}}` schema (antigravity.google/docs/cli/permissions) into the same `settings.json` GSD's own hook registration writes, granting GSD's own `read_file`/`command` rules non-destructively. **UPGRADE 2 — MCP companion config** (`configureAntigravityMcpConfig`) writes a standalone `mcp_config.json` (antigravity.google/docs/cli/gcli-migration) registering the `gsd` MCP server, non-destructively preserving any other `mcpServers` entries. Both upgrades are covered by `tests/antigravity-upgrades.test.cjs`; the axis/negotiation/source-grep coverage above is in `tests/declarative-reference-antigravity.test.cjs`.

---

## qwen

| Axis | Value | Source | Evidence |
|---|---|---|---|
| embeddingMode | imperative | https://qwenlm.github.io/qwen-code-docs/en/developers/channel-plugins | "Your entry point exports a ChannelPlugin object... this.registerCommand('mycommand', async (envelope, args) => { ... }); ... plugins load at startup as extensions." |
| commandSurface | slash-file | https://qwenlm.github.io/qwen-code-docs/en/users/extension/introduction | "Extensions can provide custom commands by placing Markdown files in a commands/ subdirectory" |
| modelMode | passive | https://qwenlm.github.io/qwen-code-docs/en/developers/channel-plugins | "The documentation does not expose a direct API for plugins to invoke the LLM or model directly." |
| hookBus | host | https://qwenlm.github.io/qwen-code-docs/en/users/features/hooks | "Qwen Code provides 14 distinct hook events: PreToolUse, PostToolUse, PostToolUseFailure, UserPromptSubmit, SessionStart, SessionEnd, Stop" |
| stateIO | filesystem | https://qwenlm.github.io/qwen-code-docs/en/developers/channel-plugins | "Runtime Environment: Node.js only. The architecture uses standard Node.js APIs: import, async/await, file I/O (writeFileSync), OS utilities" |
| transport | mcp | https://qwenlm.github.io/qwen-code-docs/en/developers/tools/mcp-server | "Qwen Code integrates with MCP servers through a sophisticated discovery and execution system" |
| runtime | node | https://qwenlm.github.io/qwen-code-docs/en/developers/channel-plugins | "Language: Node.js (TypeScript/JavaScript). Execution model: In-process — plugins load at startup as extensions." |
| effortSurface | undocumented | no authoritative doc — per-host reasoning-effort survey, #2481 (`09b535ac0`) | This host's documentation states no reasoning-effort setting, so the axis carries the fail-closed sentinel rather than inheriting a profile baseline. No host-specific URL is cited because the finding is an ABSENCE: #2481 surveyed all hosts for a reasoning-effort mechanism and found one only for claude/opencode/codex. |
| dispatch.namedDispatch | true | https://qwenlm.github.io/qwen-code-docs/en/users/features/sub-agents/ | "Named subagents are invoked when the AI identifies tasks matching their specialization... Users can also explicitly requ" |
| dispatch.nested | false | https://qwenlm.github.io/qwen-code-docs/en/users/features/sub-agents/ | "Fork children cannot create further forks. This is enforced at runtime — if a fork attempts to spawn another fork, it re" |
| dispatch.maxDepth | 1 | https://qwenlm.github.io/qwen-code-docs/en/users/features/sub-agents/ | "Fork children cannot create further forks. This is enforced at runtime" |
| dispatch.background | true | https://qwenlm.github.io/qwen-code-docs/en/users/features/sub-agents/ | "Runs in background, parent continues immediately... Forks run parallel to the parent; the main conversation continues im" |
| dispatch.subagentToolkit | full | https://qwenlm.github.io/qwen-code-docs/en/users/features/sub-agents/ | "When omitted, the subagent inherits all available tools from the parent session." |
| dispatch.backgroundDispatch | false | https://qwenlm.github.io/qwen-code-docs/en/users/features/sub-agents/ (official Qwen Code documentation, 'Subagents' user guide page) and https://qwenlm.github.io/qwen-code-docs/en/design/fork-subagent/fork-subagent-design (Qwen Code fork-subagent design document, section '4. Recursive Fork Prevention') | The official user-facing Qwen Code docs state verbatim: "Fork children cannot create further forks. If a fork attempts spawning another fork, it receives an error instructing direct task execution ins |
| dispatch.isolation | undocumented | not researched / no concurrent fan-out documented for this axis | no authoritative source consulted for concurrent-executor isolation on this host — fails closed to `none` (sequential) in negotiation (#2584) |

Sources consulted:
- https://qwenlm.github.io/qwen-code-docs/en/developers/channel-plugins
- https://qwenlm.github.io/qwen-code-docs/en/users/features/sub-agents/
- https://qwenlm.github.io/qwen-code-docs/en/users/features/hooks
- https://qwenlm.github.io/qwen-code-docs/en/users/extension/introduction
- https://qwenlm.github.io/qwen-code-docs/en/developers/tools/mcp-server
- /websites/qwenlm_github_io_qwen-code-docs_en (Context7)
- /qwenlm/qwen-code (Context7)

Documentation gaps:
- dispatch.nested — docs only restrict fork-type sub-agents from nesting; whether named sub-agents can themselves spawn named sub-agents is not stated.
- dispatch.maxDepth — depth=1 is documented only for fork sub-agents; depth for named sub-agent chains is undocumented.

**EoS migration status (#2092):** Migrated onto the imperative adapter. All `runtime === 'qwen'` branches in `bin/install.js`, `src/install-engine.cts`, `src/runtime-artifact-conversion.cts`, and `src/runtime-hooks-surface.cts` folded into descriptor-driven `runtime.hostBehaviors`. Two upgrades land: (1) **native subagent projection** — a new `agents` artifact-layout kind projects GSD's specialist agents into `~/.qwen/agents/gsd-*.md` as native Qwen subagents via `convertClaudeAgentToQwenAgent`, emitting Qwen's own `name:`/`description:`/`tools:` (YAML block list) frontmatter schema instead of Claude Code's; cite https://qwenlm.github.io/qwen-code-docs/en/users/features/sub-agents/. (2) **`SubagentStart` hook** — wired into `extendedHookEvents` alongside the existing `SubagentStop`/`Stop`/`PreCompact` events, firing the context-monitor hook symmetrically at subagent start and completion; cite https://qwenlm.github.io/qwen-code-docs/en/users/features/hooks.

---

## copilot

| Axis | Value | Source | Evidence |
|---|---|---|---|
| embeddingMode | declarative | https://docs.github.com/en/copilot/concepts/agents/copilot-cli/comparing-cli-features | "Declarative elements include custom instructions, skills, custom agents, and plugin configurations—all defined through configuration files" |
| commandSurface | slash-file | https://docs.github.com/en/copilot/concepts/agents/copilot-cli/comparing-cli-features | "Skills: Markdown files with instructions for specific contexts. Users can invoke via slash commands (e.g., /Markdown-Checker check README.md)" |
| modelMode | passive | https://github.com/github/copilot-sdk/blob/main/docs/auth/byok.md | "Model selection via config: model: 'gpt-4.1', provider: { type: 'openai', ... }." |
| hookBus | host | https://docs.github.com/en/copilot/reference/hooks-reference | "Hooks allow you to extend and customize the behavior of GitHub Copilot agents by executing custom shell commands at key points during agent" |
| stateIO | filesystem | https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers | "Configuration file Location: ~/.copilot/mcp-config.json. Hook config files stored in .github/hooks/*.json" |
| transport | mcp | https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers | "Copilot CLI comes with the GitHub MCP server already configured. STDIO is the standard transport." |
| runtime | undocumented | no authoritative doc — searched: https://github.com/github/copilot-cli/blob/main/README.md, https://github.com/github/copilot-sdk/blob/main/nodejs/README.md | — |
| effortSurface | undocumented | no authoritative doc — per-host reasoning-effort survey, #2481 (`09b535ac0`) | This host's documentation states no reasoning-effort setting, so the axis carries the fail-closed sentinel rather than inheriting a profile baseline. No host-specific URL is cited because the finding is an ABSENCE: #2481 surveyed all hosts for a reasoning-effort mechanism and found one only for claude/opencode/codex. |
| dispatch.namedDispatch | true | https://github.com/github/copilot-sdk/blob/main/docs/features/custom-agents.md | "A custom agent is a named agent configuration that includes its own prompt and tool set. A sub-agent is a custom agent i" |
| dispatch.nested | false | https://awesome-copilot.github.com/learning-hub/agents-and-subagents/ | "By default, subagents do not keep spawning additional subagents." |
| dispatch.maxDepth | 1 | https://awesome-copilot.github.com/learning-hub/agents-and-subagents/ | "Depth counts how many agents are nested within one another. When the depth limit is reached, the innermost agent cannot" |
| dispatch.background | true | https://docs.github.com/en/copilot/how-tos/copilot-cli/speed-up-task-completion | "Allow Copilot to use subagents and work autonomously to implement the plan without any further input." |
| dispatch.subagentToolkit | full | https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/create-custom-agents-for-cli | "By default, custom agents have access to all tools. If you restrict an agent's access, a tools specification is added" |
| dispatch.backgroundDispatch | false | https://code.visualstudio.com/docs/copilot/agents/subagents | "By default, subagents cannot spawn further subagents. This prevents infinite recursion when agents accidentally call themselves in a loop." The setting `chat.subagents.allowInvocationsFromSubagents` |
| dispatch.isolation | undocumented | not researched / no concurrent fan-out documented for this axis | no authoritative source consulted for concurrent-executor isolation on this host — fails closed to `none` (sequential) in negotiation (#2584) |

Sources consulted:
- https://github.com/github/copilot-cli/blob/main/README.md (via Context7 /github/copilot-cli)
- https://github.com/github/copilot-sdk/blob/main/docs/features/custom-agents.md (via Context7 /github/copilot-sdk)
- https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers
- https://docs.github.com/en/copilot/reference/hooks-reference
- https://docs.github.com/en/copilot/concepts/agents/copilot-cli/comparing-cli-features
- https://awesome-copilot.github.com/learning-hub/agents-and-subagents/

Documentation gaps:
- runtime — docs describe the CLI binary and the SDK (Node.js/Go/Python/Rust) but do not state what runtime the CLI host itself or its plugin/extension loader executes in.
- dispatch.nested exact authoritative source is awesome-copilot.github.com (community docs) not docs.github.com.

**EoS migration status (#2099):** Migrated onto the declarative adapter (dogfooded in `tests/declarative-reference-copilot.test.cjs`). The residual `isCopilot` branches were folded onto descriptor-driven `runtime.hostBehaviors`: the `.agent.md` destination-suffix rename in `src/install-engine.cts` now reads `hostBehaviors.agentFileExtension`; `bin/install.js`'s two uninstall side-effect branches (repo-root `AGENTS.md` cleanup, `copilot-instructions.md`/hook cleanup) now gate on `resolveInstallPlan(runtime).installSurface === 'copilot-instructions'` (unique to copilot, so byte-identical); and the two `skipSharedHooksInstall` checks now read `hostBehaviors.skipSharedHooksInstall:true` (copilot's golden has only `hooks/gsd-session.json`, no shared `gsd-*.js` scripts). A dead legacy agent-converter dispatch arm in the inline agent-copy loop — unreachable since copilot is a member of `_DESCRIPTOR_AGENTS_RUNTIMES` — was removed outright; `isCopilot` no longer appears as a live read anywhere in `bin/install.js` or `src/install-engine.cts`. Two upgrades land: (1) **multi-event hook bus** — `buildCopilotHookConfig()` previously emitted only `sessionStart`; this PR wires four additional events — `preToolUse`/`postToolUse`/`userPromptSubmitted`/`sessionEnd` — each a static, deterministic advisory command (no node-runner invocation), so an install's `hooks/gsd-session.json` now registers all five events. (2) **`dispatch.background`** — the descriptor already declared `true`, exceeding the `declarative-cli` profile baseline of `false`; the negotiation contract (`negotiateHostCapabilities`) surfaces that value with no downgrade warning, documenting the legitimate deviation. Note: Copilot's `.agent.md` frontmatter has no background-dispatch field (fields are `description`/`infer`/`mcp-servers`/`model`/`name`/`tools`) — background dispatch remains a negotiated-contract-only axis, not a field GSD's agent artifacts emit. MCP companion tooling is out of scope for this migration (AC4 names only the two upgrades above).

---

## windsurf

| Axis | Value | Source | Evidence |
|---|---|---|---|
| embeddingMode | declarative | https://docs.devin.ai/desktop/cascade/cascade | "Cascade operates through configuration files rather than code plugins: .codeiumignore for file filtering, Memories and Rules for customizing" |
| commandSurface | slash-file | https://docs.devin.ai/desktop/cascade/workflows | "Workflows are authored as markdown files (.md extension) … triggered through slash commands using the format /[workflow-name]." |
| modelMode | passive | https://docs.devin.ai/desktop/models.md | "Models are selectable via configuration/UI only (SWE-1.5, SWE-1.6, Adaptive, Arena tiers, Claude, GPT)." |
| hookBus | host | https://docs.devin.ai/desktop/cascade/hooks.md | "Cascade supports twelve hook events covering critical workflow points … Pre-hooks (can block actions): pre_read_code, pre_write_code, pre_run_command, …" (quote elided beyond the pre-hook enumeration — see #2100 CASCADE FACTS reference) |
| stateIO | filesystem | https://docs.devin.ai/desktop/cascade/cascade | "Cascade can create and modify codebases directly … File access can be restricted through .codeiumignore files" |
| transport | mcp | https://docs.devin.ai/desktop/cascade/mcp | "Cascade now natively integrates with MCP, allowing you to bring your own selection of MCP servers for Cascade to use." |
| runtime | undocumented | no authoritative doc — searched: https://docs.devin.ai/windsurf/plugins/getting-started.md, /llmstxt/windsurf_llms-full_txt (Context7) | — |
| effortSurface | undocumented | no authoritative doc — per-host reasoning-effort survey, #2481 (`09b535ac0`) | This host's documentation states no reasoning-effort setting, so the axis carries the fail-closed sentinel rather than inheriting a profile baseline. No host-specific URL is cited because the finding is an ABSENCE: #2481 surveyed all hosts for a reasoning-effort mechanism and found one only for claude/opencode/codex. |
| dispatch.namedDispatch | undocumented | no authoritative doc — searched: https://docs.devin.ai/cli/subagents.md, https://docs.devin.ai/desktop/agent-command-center.md | — |
| dispatch.nested | undocumented | no authoritative doc — searched: https://docs.devin.ai/cli/subagents.md | — |
| dispatch.maxDepth | undocumented | no authoritative doc — searched: https://docs.devin.ai/cli/subagents.md | — |
| dispatch.background | undocumented | no authoritative doc — searched: https://docs.devin.ai/desktop/acp.md, https://docs.devin.ai/cli/subagents.md | — |
| dispatch.subagentToolkit | undocumented | no authoritative doc — searched: https://docs.devin.ai/cli/subagents.md | — |
| dispatch.backgroundDispatch | undocumented | no authoritative doc — https://docs.devin.ai/desktop/cascade/cascade and https://docs.devin.ai/desktop/devin-local (official Windsurf/Devin docs, via docs.windsurf.com redirects) | The Windsurf/Cascade docs describe a background planning agent only in these terms: "In the background, a specialized planning agent continuously refines the long-term plan while your selected model f |
| dispatch.isolation | none | shipped descriptor (`dispatch.backgroundDispatch: undocumented`) | no documented background/concurrent-dispatch primitive — isolation is moot; same-wave plans run inline (#2584) |

Sources consulted:
- https://docs.devin.ai/desktop/cascade/workflows
- https://docs.devin.ai/desktop/cascade/mcp
- https://docs.devin.ai/desktop/cascade/hooks.md
- https://docs.devin.ai/desktop/cascade/cascade
- https://docs.devin.ai/desktop/models.md
- https://docs.devin.ai/windsurf/plugins/getting-started.md
- https://docs.devin.ai/cli/subagents.md
- /llmstxt/windsurf_llms-full_txt (Context7)

Documentation gaps:
- dispatch.namedDispatch — Cascade docs do not document a user-facing named sub-agent dispatch system.
- dispatch.nested — no documentation for nested sub-agent support in Windsurf Cascade.
- dispatch.maxDepth — no documented depth limit for Cascade sub-agents.
- dispatch.background — Cascade has an internal background planning agent but no documented user-facing background sub-agent dispatch.
- dispatch.subagentToolkit — no documentation for toolkit restrictions on Cascade sub-agents.
- runtime — Windsurf IDE is Electron-based but no programmatic plugin runtime is documented to developers.

**EoS migration status (#2100 Stage 2 — HOOK-BRIDGE):** `hooksSurface` moved from `"none"` to `"windsurf-hooks-json"`. GSD now wires two of Cascade's documented pre-hooks with BLOCKING semantics via `.windsurf/hooks.json` (local) / `~/.codeium/windsurf/hooks.json` (global): `pre_write_code` (write-path guard — blocks a write resolving to a different git root than cwd, or into a `.git/` internals directory) and `pre_run_command` (a conservative destructive-command deny-list — whole-disk/home `rm -rf`, force-push to a protected branch). Cascade blocks via **exit code 2** (+ a stderr reason string) — a materially different protocol from Cursor's stdout-JSON `{block, reason}` hooks.json form, even though the surrounding install/reconcile infra (`writeWindsurfHooksJson`/`removeWindsurfHooksJson` in `src/runtime-hooks-surface.cts`) mirrors `writeCursorHooksJson`/`removeCursorHooksJson`'s shape. Cascade has **no context-injection channel** (no `additional_context`-style advisory response channel), so the 4 advisory hook events GSD registers on Cursor (`sessionStart`, `postToolUse`, `stop`, `subagentStart`/`subagentStop`) have no Windsurf/Cascade counterpart and are deliberately **not ported** — only the 2 events with a genuine blocking analog are wired. `installSurface` stays `profile-marker-only` (unchanged); the hook bus is wired from inside that branch, gated on `hooksSurface === 'windsurf-hooks-json'` rather than a hardcoded runtime check.

---

## kimi-code

> **`kimi-code` is a different product from `kimi` above — every axis below is sourced independently.** `kimi` is Moonshot's Python `kimi-cli` (`from kimi_cli.app import KimiCLI`, `~/.kimi/config.toml`, `--work-dir`); `kimi-code` is the TypeScript/Node **Kimi Code CLI** (`~/.kimi-code/config.toml`, `$KIMI_CODE_HOME`, process-cwd, `AgentSwarm`). None of the values here are inherited from the `kimi` section. See `docs/migration/kimi-to-kimi-code.md` for the user-facing split.

**GSD hook destination (#2755):** although `kimi` and `kimi-code` share `hooksSurface: "kimi-hooks-toml"`, they do **not** share a hooks root. GSD writes its `[[hooks]]` block, hook bundle and CommonJS marker into `~/.kimi-code/config.toml` for `kimi-code` (overridable via `KIMI_CODE_HOME`) and into `~/.kimi/config.toml` for `kimi` (overridable via `KIMI_SHARE_DIR`); each product's env var is scoped to that product and does not redirect the other. `resolveKimiHooksTomlDir({ runtime })` in `src/runtime-homes.cts` is the single seam that makes this choice, for both the install and uninstall paths. Until #2755 that function was unparameterized and every `kimi-code` install wrote into Kimi CLI's root, leaving Kimi Code with no hooks — this row is documented explicitly because its absence is what let that go unnoticed.

| Axis | Value | Source | Evidence |
|---|---|---|---|
| embeddingMode | declarative | https://github.com/moonshotai/kimi-code/blob/main/docs/en/customization/plugins.md | "Plugins package reusable Kimi Code CLI capabilities into installable units — they can add Agent Skills, automatically load a specified Skill at session start, and declare MCP servers to provide real tool capabilities." A plugin is a `kimi.plugin.json` manifest plus markdown Skills; real tool capability arrives via external MCP processes. No in-process programmatic extension API is documented — the same shape as `codex` above. |
| commandSurface | slash-file | https://github.com/moonshotai/kimi-code/blob/main/docs/en/reference/slash-commands.md | "External skills are automatically registered as slash commands using the skill: namespace prefix. Users can invoke these by typing /skill:\<name\> followed by optional text, which is then appended to the skill prompt." Skills are `SKILL.md` markdown files with YAML frontmatter (`name`, `description`, `type`, `whenToUse`, `arguments`). |
| modelMode | passive | https://github.com/moonshotai/kimi-code/blob/main/apps/kimi-code/src/cli/commands.ts ; /docs/en/guides/getting-started.md | "`-m, --model <model>` — LLM model alias to use for this invocation. Defaults to `default_model` in config.toml." Model selection is config alias + `--model` flag + the interactive `/model` command; no API lets an extension programmatically supply a model. |
| hookBus | host | https://github.com/moonshotai/kimi-code/blob/main/docs/en/customization/hooks.md | "All hook rules are written in the `[[hooks]]` array in `~/.kimi-code/config.toml`, where each entry is one rule." The CLI fires the lifecycle events (`UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `PermissionResult`, `SessionStart`, `SessionEnd`, `SubagentStart`, `SubagentStop`, `PreCompact`, `PostCompact`, `Stop`, `Notification`, `Interrupt`); each rule is `event` + optional `matcher` + `command` + optional `timeout` (1–600s, default 30). |
| stateIO | filesystem | https://github.com/MoonshotAI/kimi-code | "Kimi Code CLI is an AI coding agent that runs in your terminal — it can read and edit code, run shell commands, search files, fetch web pages, and choose the next step based on the feedback it receives." Full local filesystem; no sandboxed-storage tier is documented. |
| transport | mcp | https://github.com/MoonshotAI/kimi-code ; /docs/en/customization/plugins.md | "AI-native MCP configuration. Add, edit, and authenticate Model Context Protocol servers conversationally with `/mcp-config`, without hand-editing JSON." Plugin manifests additionally carry an `mcpServers` field. |
| runtime | node | https://github.com/MoonshotAI/kimi-code | "Requirements: Node.js ≥ 24.15.0, pnpm 10.33.0." The CLI is a TypeScript pnpm monorepo (`apps/kimi-code`, `packages/agent-core-v2`); hook commands are shell, and MCP servers are external processes. |
| effortSurface | *(not declared)* | https://github.com/moonshotai/kimi-code/blob/main/apps/kimi-code/src/tui/commands/registry.ts | Kimi Code documents `/effort` (alias `/thinking`) to change reasoning effort, but only as an **interactive slash command** — there is no `--effort`-style flag on its invocation, and `-m, --model` is the only model/effort-adjacent argv. The axis vocabulary is `argv` | `none`, and neither is accurate: `none` would deny a mechanism the host does have, and `argv` would claim one it does not expose. The descriptor therefore declares no value, which negotiation degrades closed identically to the sentinel. See Documentation gaps. |
| dispatch.namedDispatch | false | https://github.com/moonshotai/kimi-code/blob/main/docs/en/customization/agents.md ; `capabilities/kimi-code/capability.json` (`artifactLayout` — skills only) | "The system includes three built-in sub-agents: 'coder' for general software engineering tasks like file modification, 'explore' for read-only codebase navigation and summarization, and 'plan' for architecture design without file or shell access." GSD's kimi-code artifact layout installs Agent **Skills** only (no `agents` kind), so no named GSD subagent is ever registered with the host and every GSD role resolves to one of the three built-ins (`resolveDispatchType`, `src/host-integration.cts`). **This is a GSD-integration-scoped `false`, not a claim that the host lacks named agents — see Documentation gaps.** |
| dispatch.nested | true | https://github.com/moonshotai/kimi-code/blob/main/docs/en/customization/agents.md | The `coder` sub-agent "can dispatch its own nested sub-agents when a task decomposes naturally." (Agent files also expose a `subagents` delegation allowlist, where `subagents: []` is what *prevents* further delegation — nesting is the default.) |
| dispatch.maxDepth | undocumented | searched: https://github.com/moonshotai/kimi-code/blob/main/docs/en/customization/agents.md | Nesting is documented, but no maximum nesting depth is stated anywhere in the agents or tools reference. |
| dispatch.background | true | https://github.com/moonshotai/kimi-code/blob/main/docs/en/reference/tools.md | "**`Agent`** delegates a subtask to a sub-Agent. Supports foreground execution (waiting for completion) or background execution (returning a task ID). … `run_in_background` (boolean) - Optional - Defaults to false." |
| dispatch.subagentToolkit | built-in-only | https://github.com/moonshotai/kimi-code/blob/main/docs/en/customization/agents.md | The three built-ins carry deliberately different tool surfaces — coder "Shares most of the main Agent's toolset; can run shell commands, maintain todo lists, enter Plan mode, and invoke Agent Skills"; explore "Performs read-only operations only and does not modify any files"; plan "Even shell commands are not available". No single `full`/`read-only` value covers the set, so the `built-in-only` member applies (degrades closed to `read-only` when negotiated). |
| dispatch.backgroundDispatch | true | https://github.com/moonshotai/kimi-code/blob/main/docs/en/reference/tools.md ; /docs/en/customization/agents.md | The `coder` built-in "can dispatch its own nested sub-agents" and the `Agent` tool's `run_in_background` is a call-time parameter available to it, so a background-dispatched sub-agent may itself dispatch further. `AgentSwarm` additionally fans out concurrently: "By default the tool ramps up concurrency without an upper limit (5 subagents start immediately, then 1 more every 700 ms); set `KIMI_CODE_AGENT_SWARM_MAX_CONCURRENCY` to a positive integer to cap how many subagents run at the same time during that ramp, or leave it unset for no cap." |
| dispatch.isolation | orchestrator-worktree | https://github.com/moonshotai/kimi-code/blob/main/docs/en/reference/tools.md ; ADR-1239 §Codex-binding amendment | Neither `Agent` nor `AgentSwarm` exposes a working-directory/cwd parameter — sub-agents inherit the CLI's process cwd — and the CLI has no `--work-dir`-style flag (unlike `kimi`). GSD therefore creates, validates and merges the worktree itself and spawns the executor with that cwd (#2584). |

**Negotiation note.** Because `dispatch.namedDispatch` is `false`, `negotiateHostCapabilities` caps `nested`, `maxDepth`, `background` and `backgroundDispatch` to `false`/`0` in the **effective** axes for structural consistency (`src/host-integration.cts`). The declared values above are still the host-capability record the matrix exists to hold; they are what a future named-dispatch upgrade would negotiate against.

Sources consulted:
- https://github.com/MoonshotAI/kimi-code
- https://github.com/moonshotai/kimi-code/blob/main/docs/en/customization/agents.md
- https://github.com/moonshotai/kimi-code/blob/main/docs/en/customization/hooks.md
- https://github.com/moonshotai/kimi-code/blob/main/docs/en/customization/plugins.md
- https://github.com/moonshotai/kimi-code/blob/main/docs/en/customization/skills.md
- https://github.com/moonshotai/kimi-code/blob/main/docs/en/reference/tools.md
- https://github.com/moonshotai/kimi-code/blob/main/docs/en/reference/slash-commands.md
- https://github.com/moonshotai/kimi-code/blob/main/docs/en/guides/getting-started.md
- https://github.com/moonshotai/kimi-code/blob/main/apps/kimi-code/src/cli/commands.ts
- /moonshotai/kimi-code (Context7)

Documentation gaps:
- **dispatch.namedDispatch — host capability vs. GSD surface.** Kimi Code *does* support user-authored named agents: "Beyond the three built-in sub-agents, you can define your own agents as Markdown files", discovered across five scopes (`--agent-file` > `.kimi-code/agents/`, `.agents/agents/` > extra dirs > `$KIMI_CODE_HOME/agents/` > built-in). The axis is `false` because GSD installs **no** agent files for this host, so its reachable dispatch surface is the three built-ins — flipping the axis without also shipping agent artifacts would reintroduce the dispatch failure recorded in `docs/migration/kimi-to-kimi-code.md` ("Every workflow that called a named GSD subagent … **failed at dispatch**"). Shipping GSD agent files to kimi-code is an unbuilt capability upgrade, not a gap in the host's documentation.
- **effortSurface — a real mechanism the vocabulary cannot name.** Kimi Code documents `/effort` (alias `/thinking`) for changing reasoning effort, but only as an interactive slash command; `-m, --model` is the only model-adjacent argv on its invocation. The axis vocabulary is `argv` | `none`, and neither is accurate here — `none` denies a mechanism the host has, `argv` claims one it does not expose. Kimi Code's descriptor was created a day after #2481 added the axis and has carried no value since. Resolving this needs a vocabulary decision (an interactive-only member, mirroring the deliberate absence of a config-file member), which is a negotiation change rather than a documentation one; until then the absent value degrades closed exactly as the sentinel does.
- **dispatch.maxDepth** — nesting is documented but no depth bound is published, so the axis carries the `undocumented` sentinel rather than a guessed integer.
- **runtime** — the published artifact is a single bundled binary; `Node.js ≥ 24.15.0` is stated as a *development* requirement. The sources are a TypeScript/Node monorepo, so `node` is the best-supported classification, but the docs do not name a canonical plugin-execution runtime (the same ambiguity noted for `codex` above).

---

## deepseek-harness

| Axis | Value | Source | Evidence |
|---|---|---|---|
| embeddingMode | declarative | https://github.com/carlosatec/gsd-core | Declarative MCP runtime integration |
| commandSurface | slash-file | https://github.com/carlosatec/gsd-core | Slash command files supported |
| modelMode | passive | https://github.com/carlosatec/gsd-core | Model selected by configuration |
| hookBus | host | https://github.com/carlosatec/gsd-core | Host-level lifecycle events |
| stateIO | filesystem | https://github.com/carlosatec/gsd-core | Filesystem-based state IO |
| transport | mcp | https://github.com/carlosatec/gsd-core | MCP transport |
| runtime | node | https://github.com/carlosatec/gsd-core | Node.js runtime harness |
| effortSurface | undocumented | https://github.com/carlosatec/gsd-core | Undocumented effort surface |
| dispatch.namedDispatch | true | https://github.com/carlosatec/gsd-core | Named dispatch enabled |
| dispatch.nested | false | https://github.com/carlosatec/gsd-core | Flat subagent execution |
| dispatch.maxDepth | 1 | https://github.com/carlosatec/gsd-core | Single-level subagent depth |
| dispatch.background | true | https://github.com/carlosatec/gsd-core | Background task dispatch |
| dispatch.subagentToolkit | full | https://github.com/carlosatec/gsd-core | Full subagent toolkit |
| dispatch.backgroundDispatch | false | https://github.com/carlosatec/gsd-core | Background subagent dispatch disabled |
| dispatch.isolation | undocumented | https://github.com/carlosatec/gsd-core | Undocumented isolation boundary |

## vscode

> VS Code is the IDE-profile reference host: a Marketplace/VSIX-distributed extension, NOT
> file-projected onto a config directory — it has no `runtime.localConfigDir` in the usual sense
> (`configHome.kind: "none"`, `localConfigDir: null`) and no CLI install surface at all
> (`installSurface: "none"`; it is never installed by `bin/install.js` — no `--vscode` flag, no
> `allRuntimes` membership; see `capabilities/vscode/capability.json`). The extension IS the host.
> **Sourcing note:** the citations below are the VS Code extension API documentation pages named
> in ADR-1239 (#2103) as the source for each axis; this environment did not have live Context7/
> web-fetch access at authoring time, so the Evidence column is a paraphrase of VS Code's
> documented extension model rather than a verbatim excerpt — a maintainer with Context7/web
> access should verify the exact wording before treating this section as fully cited (same caveat
> already flagged for the pi section above).

| Axis | Value | Source | Evidence |
|---|---|---|---|
| embeddingMode | imperative | https://code.visualstudio.com/api/references/vscode-api | The extension is loaded in-process by the extension host and calls the `vscode` namespace API directly (`vscode.commands.registerCommand`, `vscode.chat.createChatParticipant`, `vscode.lm.registerTool`) — an in-process programmatic API, not a config-file-only integration. |
| commandSurface | palette | https://code.visualstudio.com/api/extension-guides/command | Commands are contributed via `contributes.commands` in package.json and registered with `vscode.commands.registerCommand`, surfaced through the Command Palette (and the Chat view via the chat participant) — not a markdown/TOML slash-command file format. |
| modelMode | active | https://code.visualstudio.com/api/extension-guides/ai/language-model | The `vscode.lm` namespace lets an extension actively select a model (`vscode.lm.selectChatModels`) and send requests to it programmatically, rather than only reading a static config value. |
| hookBus | engine | https://code.visualstudio.com/api/references/activation-events | VS Code has no cross-extension lifecycle-hook bus that GSD subscribes to; the extension host (the "engine" here, per this axis's own `host`/`engine`/`none` vocabulary) owns activation events, and GSD's own hook lifecycle runs fully in-process/engine-owned inside the extension. |
| stateIO | sandboxed-storage | https://code.visualstudio.com/api/references/vscode-api#Memento | `context.globalState`/`context.workspaceState` (both `Memento`) are the extension's persistent storage surface — sandboxed key/value storage scoped to the extension, not unrestricted local filesystem access. |
| transport | mcp | https://code.visualstudio.com/api/extension-guides/ai/mcp | VS Code 1.99 added native MCP client support; on the Web (webworker) entry, full GSD command dispatch is available through VS Code's native MCP client connecting to the GSD companion MCP server (`gsd-mcp-server`), not an in-process Node dispatch (which the web entry cannot run at all). |
| runtime | sandboxed-web | https://code.visualstudio.com/api/extension-guides/web-extensions | The `browser` entry point (`vscode/browser.js`) runs in a webworker context with no Node core modules — the Web Extension execution model VS Code documents for extensions that must run in vscode.dev/github.dev. |
| effortSurface | undocumented | no authoritative doc — per-host reasoning-effort survey, #2481 (`09b535ac0`) | This host's documentation states no reasoning-effort setting, so the axis carries the fail-closed sentinel rather than inheriting a profile baseline. No host-specific URL is cited because the finding is an ABSENCE: #2481 surveyed all hosts for a reasoning-effort mechanism and found one only for claude/opencode/codex. |
| dispatch.namedDispatch | true | https://code.visualstudio.com/docs/copilot/chat/chat-agent-mode#_agent-mode-tools | Registered `languageModelTools` (and the chat participant) are addressable by name — the primary agent references a tool/participant by its declared name/`toolReferenceName`, not only positionally. |
| dispatch.nested | true | https://code.visualstudio.com/docs/copilot/copilot-chat-agents (subagents) | VS Code's chat subagent model (`#runSubagent`) explicitly supports a subagent invoking further subagents, gated by `chat.subagents.allowInvocationsFromSubagents`. |
| dispatch.maxDepth | 5 | https://code.visualstudio.com/docs/copilot/copilot-chat-agents (subagents) | Documented as VS Code's maximum nesting depth for `#runSubagent` chains — also matches this repo's existing `PROFILE_BASELINES.ide.dispatch.maxDepth` baseline. |
| dispatch.background | true | https://code.visualstudio.com/api/extension-guides/ai/tools | Language Model Tools can be invoked as part of an asynchronous agent turn (the primary agent does not block synchronously on a single extension call). |
| dispatch.subagentToolkit | undocumented | no authoritative doc found at authoring time | VS Code's subagent documentation does not state whether a subagent's tool surface is restricted to read-only tools or the full set an extension registers; recorded `undocumented` (fails closed to `read-only` in negotiation) rather than guessed. |
| dispatch.backgroundDispatch | undocumented | no authoritative doc found at authoring time | Whether a background-dispatched subagent can itself spawn further NAMED subagents (the #853 discriminator) is not stated in the sources reviewed; recorded `undocumented` (fails closed to `false`) rather than guessed. |
| dispatch.isolation | undocumented | not researched / no concurrent fan-out documented for this axis | no authoritative source consulted for concurrent-executor isolation on this host — fails closed to `none` (sequential) in negotiation (#2584) |

Sources consulted:
- https://code.visualstudio.com/api/references/vscode-api
- https://code.visualstudio.com/api/extension-guides/command
- https://code.visualstudio.com/api/extension-guides/ai/language-model
- https://code.visualstudio.com/api/extension-guides/ai/tools
- https://code.visualstudio.com/api/extension-guides/ai/mcp
- https://code.visualstudio.com/api/extension-guides/web-extensions
- https://code.visualstudio.com/api/references/activation-events
- https://code.visualstudio.com/docs/copilot/copilot-chat-agents

Documentation gaps:
- dispatch.subagentToolkit / dispatch.backgroundDispatch — the reviewed sources document that
  `#runSubagent` exists (v1.105+, `chat.subagents.allowInvocationsFromSubagents`, max nesting
  depth 5) but do not state the subagent tool-restriction model or whether a background-dispatched
  subagent can itself spawn further named subagents; both stay `undocumented` and negotiation
  fails closed.
- This section's Evidence-column wording was authored without live Context7/web-fetch access (see
  the sourcing note above the table) — verify against the cited pages before relying on it for a
  future capability upgrade, same caveat as the pi section above.

EoS migration status (#2103): vscode lands as a registry runtime (role:runtime) for
validator/host-integration coverage ONLY — it is deliberately NOT a CLI-installable runtime
(`installSurface: "none"`, never in `bin/install.js`'s `allRuntimes`; see the
`NON_INSTALLABLE_RUNTIMES` carve-out in `tests/runtime-flags.test.cjs`). The extension surface
(`vscode/extension.js`, `vscode/browser.js`, `vscode/host-binding.js`, `vscode/package.json`) is
distributed via the Marketplace/VSIX, not `npx --vscode` — there is no `docs/how-to/install-on-
your-runtime.md` entry for it. Dispatch is SUBPROCESS REUSE on desktop (the same shared
`dispatchGsdCommand` in `gsd-core/bin/lib/shell-command-projection.cjs` the pi extension and the
companion MCP server use) via `vscode/extension.js`'s `main` entry (Node). The `browser` entry
(`vscode/browser.js`) is a SEPARATE, independently zero-Node-API file: it does NOT require
`host-binding.js` because that module's engine-lib dependencies (`state-io.cjs`,
`adapter-imperative.cjs` → `install-engine.cjs`/`capability-loader.cjs`,
`model-adapter.cjs` → `model-resolver.cjs` → `config-loader.cjs`/`configuration.cjs`) all pull in
Node's `fs`/`os`/`path` at module-load time — requiring any of them from a webworker context would
throw immediately. `browser.js` instead composes its own minimal surface directly against
`vscode.lm`, and its command/tool/chat handlers surface an honest "full dispatch is unavailable on
web; configure the GSD MCP server" message rather than a silent failure. The chat participant
(`@gsd`) and Language Model Tools (a representative 3-tool set — `gsd_progress`, `gsd_workstreams`,
`gsd_plan_phase` — matching real shipped skills that map onto a single, safe, read-only
`gsd-tools.cjs` command) are registered on BOTH entries identically; only the dispatch behavior
differs. `#runSubagent` wiring (`registerSubagentDispatch`/`dispatchAsSubagent`, gated on
`chat.subagents.allowInvocationsFromSubagents` availability, fail-soft on older/Insiders-gated
hosts) adds a belt-and-suspenders `maxDepth: 5` ceiling independent of whatever VS Code's own chat
engine enforces natively — there is no separate extension-side "subagent contribution"
registration API beyond the chat participant + Language Model Tools already registered; VS Code's
chat engine surfaces them to `#runSubagent` on its own.
