<div align="center">

# GSD Core Nexus

**Git. Ship. Done.**

[English](README.md) · **Português**

**Um sistema leve de meta-prompting, engenharia de contexto, análise estática nativa e desenvolvimento orientado a especificações para Claude Code, DeepSeek Harness, OpenCode, Antigravity CLI, Codex, Copilot, Cursor, Windsurf e muito mais.**

[![version](https://img.shields.io/badge/version-2.8.1-CB3837?style=for-the-badge&logo=git&logoColor=white)](.planning/ROADMAP.md)
[![Tests](https://img.shields.io/github/actions/workflow/status/carlosatec/gsd-core/test.yml?branch=next&style=for-the-badge&logo=github&label=Tests)](https://github.com/carlosatec/gsd-core/actions)
[![GitHub stars](https://img.shields.io/github/stars/carlosatec/gsd-core?style=for-the-badge&logo=github&color=181717)](https://github.com/carlosatec/gsd-core/stargazers)
[![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](LICENSE)

</div>

---

## O que é o GSD Core Nexus

GSD Core Nexus é um framework de engenharia de contexto, análise estática nativa e desenvolvimento orientado a especificações que conduz agentes de codificação com IA (Claude Code, DeepSeek Harness, Codex, Antigravity CLI, Copilot, Cursor e mais) por meio de um ciclo de fases disciplinado. Ele resolve o [context rot](docs/pt-BR/explanation/context-engineering.md) — a degradação de qualidade que se acumula à medida que uma IA preenche sua janela de contexto — executando todo o trabalho pesado de pesquisa, planejamento e execução em subagentes com contexto limpo, mantendo sua sessão principal enxuta.

---

## Como funciona

Cada marco repete o mesmo ciclo de cinco etapas, uma fase por vez:

1. **Discuss & Spec** — capturar decisões de implementação antes de qualquer planejamento (`/gsd:plan --spec`)
2. **Plan** — pesquisar, decompor e verificar se o plano cabe em uma janela de contexto limpa (`/gsd:plan`)
3. **Execute** — executar planos em ondas paralelas com Pre-Flight static guardrails (`/gsd:exec`)
4. **Review & Verify** — revisão profunda de código e UI com auto-fix (`/gsd:review --fix`) e UAT (`/gsd:verify`)
5. **Ship** — release limpa, geração automática de PR, arquivamento de fase e repetição (`/gsd:ship`)

---

## GSD Core Nexus 2.8: DeepSeek Harness, Session Replay, Versionamento Universal & AST 360°

O GSD Core Nexus 2.8 transforma agentes de codificação em uma engenharia autônoma e disciplinada de alta precisão com observabilidade causal completa, integração nativa multi-runtime e automação de release:

- **Suporte de 1ª Classe ao DeepSeek Harness (`@deepseek-ai/dsh` — D-53):** Adaptador declarativo completo com suporte ao micro-kernel Cordis, transporte MCP e resolução de aliases de CLI (`dsh`, `deepseek`, `deepseek-cli`).
- **Log Estruturado de Sessão & Retenção Inteligente (D-54 / D-55):** Gravação append-only em JSON Lines (`.planning/intel/sessions/`) com smart trimming de 32 KB para stack traces e diffs, sanitização automática de segredos por regex, hook transparente no Hub e retenção generosa de 50 sessões / 30 dias delimitada em disco (~25-40 MB gitignored).
- **CLI de Replay Determinístico de Sessão (`gsd-tools session` — D-56):** Reconstrução interativa da linha do tempo com `--summary`, `--errors-only`, `--diffs`, atalho default `latest`, exportação Markdown e alimentação direta de diagnósticos de falha no `anti-pattern-store.cts`.
- **Sistema Unificado de Versionamento & Release (`npm run version:bump` — D-57 / D-58):** Orquestrador atômico em um único comando (`scripts/bump-version.cjs`) com validação SemVer, sincronização em lockstep de todos os 49 manifestos, badges, módulos core e regeneração de pipelines derivados (`npm run version:check`).
- **Superfície Pública Estrita de 10 Comandos (D-41 / D-42):** Menu slash simplificado e limpo contendo exclusivamente os 10 Comandos Canônicos Unificados (`status`, `plan`, `exec`, `review`, `verify`, `ship`, `auto`, `tokens`, `migrate`, `help`) com despacho fail-closed estrito e zero duplicações.
- **Motor AST Universal & Mobile 360° Nativo:** Análise estática nativa cobrindo mais de 35 extensões com suporte completo **Mobile 360°** para iOS (Swift, SwiftUI, XCTest) e Android (Kotlin, Jetpack Compose, Hilt, JUnit 5, Gradle).
- **Grafo de Conhecimento 100% Nativo (Zero Python — D-31):** Fachada Graphify nativa em TypeScript puro (`2.3-native`) construindo e consultando o grafo de dependências AST em memória sem dependência de Python externo.
- **Hook de Contexto de Sessão (Zero Cegueira — D-30):** Injeta e atualiza automaticamente o estado ativo do projeto em `GEMINI.md`, `AGENTS.md` ou regras, fornecendo contexto instantâneo à IA na inicialização.
- **RAG Semântico Okapi BM25 & Tokenizador Poliglota (D-33):** Recuperação semântica de alta precisão com saturação de termos ($k_1=1.5, b=0.75$), divisão inteligente de identificadores (`camelCase`, `PascalCase`, `kebab-case`, `snake_case`) e exclusão de caches mobile.
- **Documentação Viva e Verificada:** Sincronização pós-commit que gera e valida automaticamente `.planning/codebase/ARCHITECTURE.md` e `.planning/codebase/APIS.md` contra o código real sem sobrecarga $O(n^2)$.
- **Grafo Profundo & Âncoras Canônicas:** Módulos ordenados por relevância arquitetural (PageRank), permitindo que a IA se ancore em implementações canônicas de referência.
- **Injeção Cirúrgica de Contexto (JIT):** Elimina prompts monolíticos injetando apenas vizinhos diretos, contratos de tipos e decisões ativas (80% a 90% de economia de tokens).
- **Pre-Flight Guardrails & Verificações de Qualidade (D-34):** Simula diffs em memória e bloqueia quebra de contratos de export, dependências circulares (limite de 1000 nós no DFS), imports fantasmas e truncamento acidental para 0 bytes (`EMPTY_FILE_GUARD`), além de varreduras de complexidade ciclomática e anti-patterns de UI no `/gsd:review`.
- **Memória Durável de Anti-Patterns:** Registra atomicamente lições aprendidas de correções com busca transversal inteligente (`errorQuery`) em `.planning/intel/anti-patterns.json` para evitar reincidência de erros entre sessões.
- **Scaffolding de Testes por Topologia & Poliglota:** Gera esqueletos de teste respeitando a convenção nativa da linguagem (Swift XCTest, Kotlin/Java JUnit 5, Go `_test.go` inline, Rust `#[cfg(test)]`, Dart/Flutter `test/*_test.dart`, Python e Node isolados).
- **Telemetria Pura de Tokens & Dashboard CLI:** Observabilidade em tempo real com economia de contexto, distribuição por comando e picos via `/gsd:tokens` e `/gsd:status`.
- **Blindagem de Concorrência & Segurança (D-35 a D-40):** Universal clock seam (`realClock.sleep` via `Atomics.wait`), confinamento seguro do MCP em `.planning/`, streaming JSON-RPC resiliente a chunks e sincronização de versão nos 49 manifests.

---

## Início rápido

```bash
npx github:carlosatec/gsd-core
```

O instalador interativo solicita seu ambiente de execução (Claude Code, Antigravity CLI, OpenCode, Codex, Copilot, Cursor, Windsurf e mais), o escopo (global ou local) e o idioma das descrições (`Português (Brasil)` ou `English`). Também suporta flags diretas como `--lang=pt-br`. O instalador é necessário para compatibilidade entre runtimes — não copie arquivos diretamente de `agents/` ou `commands/`.

Em outro runtime ou sem Node.js? Consulte [Instalar no seu runtime](docs/pt-BR/how-to/install-on-your-runtime.md).

Após a instalação, verifique o status ou inicie o planejamento:

```bash
/gsd-status       # verificar estado do projeto, documentação viva e telemetria
/gsd-plan         # planejar próxima fase
/gsd-exec         # executar plano da fase
```

É a primeira vez? Consulte o [Tutorial Prático Completo do GSD](TUTORIAL.pt-BR.md) ([English](TUTORIAL.md)) ou siga [Seu primeiro projeto](docs/pt-BR/tutorials/your-first-project.md) para um passo a passo guiado, desde a instalação até a primeira fase entregue. Para um repositório existente, consulte [Integrar uma base de código existente](docs/pt-BR/tutorials/onboarding-an-existing-codebase.md).

---

## Documentação

**Novidades no GSD Core Nexus 2.8** → [Tutorial Prático Completo](TUTORIAL.pt-BR.md) · [Roadmap](.planning/ROADMAP.md)

**Tutoriais** — aprendendo na prática:
- [Tutorial Prático: Dominando o GSD Core Nexus 2.8](TUTORIAL.pt-BR.md) ([English](TUTORIAL.md)) 🔥
- [Seu primeiro projeto](docs/pt-BR/tutorials/your-first-project.md)
- [Integrar uma base de código existente](docs/pt-BR/tutorials/onboarding-an-existing-codebase.md)

**Guias práticos** — receitas orientadas a tarefas:
- [Instalar no seu runtime](docs/pt-BR/how-to/install-on-your-runtime.md)
- [Planejar uma fase](docs/pt-BR/how-to/plan-a-phase.md)
- [Verificar e entregar](docs/pt-BR/how-to/verify-and-ship.md)
- … [ver todos os guias práticos](docs/pt-BR/README.md#how-to-guides)

**Referência** — informações autoritativas:
- [Comandos](docs/pt-BR/COMMANDS.md)
- [Configuração](docs/pt-BR/CONFIGURATION.md)
- [Ferramentas CLI](docs/pt-BR/CLI-TOOLS.md)

**Explicação** — conceitos e decisões de design:
- [Engenharia de contexto](docs/pt-BR/explanation/context-engineering.md)
- [O ciclo de fases](docs/pt-BR/explanation/the-phase-loop.md)
- [Arquitetura](docs/pt-BR/ARCHITECTURE.md)

Índice completo: [docs/pt-BR/README.md](docs/pt-BR/README.md) · [English](docs/README.md).

---

## Por que funciona

A maioria das configurações de codificação com IA falha em escala porque o inchaço de contexto degrada silenciosamente a qualidade da saída, não há memória compartilhada entre sessões e nada verifica se o código realmente funciona. O GSD Core Nexus resolve os três problemas: o trabalho pesado é executado em subagentes com contexto limpo, artefatos estruturados como `STATE.md` e `CONTEXT.md` sobrevivem às fronteiras de sessão, e a etapa de verificação percorre o que foi construído e gera planos de correção antes de uma fase ser declarada concluída. Consulte [docs/pt-BR/explanation/context-engineering.md](docs/pt-BR/explanation/context-engineering.md) para o raciocínio completo.

Problemas? Consulte [docs/pt-BR/how-to/recover-and-troubleshoot.md](docs/pt-BR/how-to/recover-and-troubleshoot.md).

---

## Desinstalação

Para desinstalar o GSD Core Nexus de forma limpa e segura, utilize a flag `--uninstall` acompanhada do escopo desejado (`--global` ou `--local`) e opcionalmente a runtime:

```bash
# Desinstalar do Claude Code globalmente (runtime padrão)
npx github:carlosatec/gsd-core --global --uninstall

# Desinstalar do Antigravity globalmente
npx github:carlosatec/gsd-core --antigravity --global --uninstall

# Desinstalar do Codex globalmente
npx github:carlosatec/gsd-core --codex --global --uninstall

# Desinstalar apenas do projeto local atual
npx github:carlosatec/gsd-core --local --uninstall

# Desinstalar de todas as runtimes globalmente
npx github:carlosatec/gsd-core --all --global --uninstall
```

### O que é removido vs. o que é preservado:

- **Removido:** Pasta de runtime `gsd-core/`, todos os comandos/skills/agentes prefixados com `gsd-*`, hooks gerenciados em `hooks/` e manifestos internos do GSD.
- **Preservado com total segurança:** Seus perfis e preferências de usuário (`USER-PROFILE.md`, `dev-preferences.md`), skills/agentes customizados sem prefixo GSD, configurações customizadas em `settings.json`/`config.toml` e pastas `.planning/` dos seus projetos (seus planos e roadmap continuam intactos).

---

## Origem e Créditos

O GSD Core Nexus é construído sobre a base open-source do [GSD Core (`open-gsd/gsd-core`)](https://github.com/open-gsd/gsd-core), expandindo-o com análise estática AST multi-linguagem nativa, suporte Mobile 360°, RAG semântico Okapi BM25, injeção cirúrgica de contexto JIT e guardrails pré-voo.

---

## Licença

Licença MIT. Consulte [LICENSE](LICENSE) para detalhes.

---

<div align="center">

**Agentes de codificação com IA são poderosos. O GSD Core Nexus os torna confiáveis, disciplinados e eficientes em tokens.**

</div>
