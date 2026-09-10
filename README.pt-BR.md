<div align="center">

# GSD Core Nexus

**Git. Ship. Done.**

[English](README.md) · **Português**

**Um sistema leve de meta-prompting, engenharia de contexto, análise estática nativa e desenvolvimento orientado a especificações para Claude Code, DeepSeek Harness, OpenCode, Antigravity CLI, Codex, Copilot, Cursor, Windsurf e muito mais.**

[![version](https://img.shields.io/badge/version-3.4.0-CB3837?style=for-the-badge&logo=git&logoColor=white)](.planning/ROADMAP.md)
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

## Destaques do GSD Core Nexus 3.4

O GSD Core Nexus 3.4 transforma agentes de codificação em uma engenharia autônoma e disciplinada de alta precisão com observabilidade causal completa, integração nativa multi-runtime e automação de release:

1. **AST Universal 360° & Grafo Nativo (Zero Python):** Análise estática nativa em TypeScript puro para 35+ extensões com suporte completo a **Mobile 360°** (iOS/SwiftUI e Android/Kotlin Compose) e PageRank arquitetural.
2. **Injeção Cirúrgica JIT & Fechamento Transitivo de Tipos:** Descoberta profunda de tipos em até 3 graus (BFS 3 hops), eliminando o *context rot* e economizando de **80% a 95% de tokens**.
3. **Superfície Canônica Estrita de 11 Comandos:** Interface consolidada e unificada (`status`, `plan`, `exec`, `review`, `verify`, `ship`, `auto`, `tokens`, `migrate`, `graph`, `help`) consistente e sem duplicidades em todos os runtimes de IA.
4. **Inteligência Causal de Sessão & CLI de Replay Determinístico (`gsd-tools session`):** Log append-only em JSONL com smart trimming de 32 KB, sanitização de segredos, ring buffer (50 sessões / 30 dias) e replay interativo no terminal.
5. **Telemetria Holística de Tokens (Painel de 65 Colunas):** Observabilidade em tempo real com rastreamento transacional (`withFileLockSync`) nas etapas de `plan`, `exec`, `review` e `auto`.
6. **Code Review em Modo Duplo com Auto-Reparo (`--fix`):** Revisão seletiva cirúrgica via JIT versus auditoria estática global de todo o repositório a custo zero (`--full` / `--repo`).
7. **Suporte Nativo ao DeepSeek Harness (`@deepseek-ai/dsh`):** Integração declarativa via micro-kernel Cordis, transporte MCP e resolução transparente de aliases de CLI.

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

É a primeira vez? Consulte o [Tutorial Prático Completo do GSD](docs/pt-BR/tutorials/tutorial-pratico.md) ([English](docs/tutorials/practical-tutorial.md)) ou siga [Seu primeiro projeto](docs/pt-BR/tutorials/your-first-project.md) para um passo a passo guiado, desde a instalação até a primeira fase entregue. Para um repositório existente, consulte [Integrar uma base de código existente](docs/pt-BR/tutorials/onboarding-an-existing-codebase.md).

---

## Documentação

**Novidades no GSD Core Nexus 3.4** → [Tutorial Prático Completo](docs/pt-BR/tutorials/tutorial-pratico.md) · [Roadmap](.planning/ROADMAP.md)

**Tutoriais** — aprendendo na prática:
- [Tutorial Prático: Dominando o GSD Core Nexus 3.4](docs/pt-BR/tutorials/tutorial-pratico.md) ([English](docs/tutorials/practical-tutorial.md)) 🔥
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
- [Ferramentas CLI](docs/pt-BR/reference/CLI-TOOLS.md)

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
