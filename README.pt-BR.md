<div align="center">

# GSD Core Nexus

**Git. Ship. Done.**

[English](README.md) · **Português**

**Um sistema leve de meta-prompting, engenharia de contexto, análise estática nativa e desenvolvimento orientado a especificações para Claude Code, OpenCode, Antigravity CLI, Codex, Copilot, Cursor, Windsurf e muito mais.**

[![version](https://img.shields.io/badge/version-2.3.0-CB3837?style=for-the-badge&logo=git&logoColor=white)](.planning/ROADMAP.md)
[![Tests](https://img.shields.io/github/actions/workflow/status/carlosatec/gsd-core/test.yml?branch=next&style=for-the-badge&logo=github&label=Tests)](https://github.com/carlosatec/gsd-core/actions)
[![Discord](https://img.shields.io/badge/Discord-Join-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/mYgfVNfA2r)
[![GitHub stars](https://img.shields.io/github/stars/carlosatec/gsd-core?style=for-the-badge&logo=github&color=181717)](https://github.com/carlosatec/gsd-core/stargazers)
[![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](LICENSE)

</div>

---

## O que é o GSD Core Nexus

GSD Core Nexus é um framework de engenharia de contexto, análise estática nativa e desenvolvimento orientado a especificações que conduz agentes de codificação com IA (Claude Code, Codex, Antigravity CLI, Copilot, Cursor e mais) por meio de um ciclo de fases disciplinado. Ele resolve o [context rot](docs/pt-BR/explanation/context-engineering.md) — a degradação de qualidade que se acumula à medida que uma IA preenche sua janela de contexto — executando todo o trabalho pesado de pesquisa, planejamento e execução em subagentes com contexto limpo, mantendo sua sessão principal enxuta.

---

## Como funciona

Cada marco repete o mesmo ciclo de cinco etapas, uma fase por vez:

1. **Discuss** — capturar decisões de implementação antes de qualquer planejamento
2. **Plan** — pesquisar, decompor e verificar se o plano cabe em uma janela de contexto limpa
3. **Execute** — executar planos em ondas paralelas; cada executor começa com um contexto limpo de 200k tokens
4. **Verify** — percorrer o que foi construído; diagnosticar e corrigir antes de declarar conclusão
5. **Ship** — criar o PR, arquivar a fase e repetir para a próxima

---

## GSD Core Nexus 2.3: Inteligência Universal, AST 360°, Mobile, RAG BM25 e Telemetria de Tokens

O GSD Core Nexus 2.3 transforma agentes de codificação em uma engenharia autônoma e disciplinada de alta precisão:

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
- **Interface Canônica 6+1 Unificada:** Simplifica os fluxos de trabalho entre múltiplos runtimes em `status`, `plan`, `exec`, `review` (com `--fix`), `verify` (com auto-pass), `ship`, `auto`, `tokens` e `migrate`.

---

## Início rápido

```bash
npx github:carlosatec/gsd-core
```

O instalador interativo solicita seu ambiente de execução (Claude Code, Antigravity CLI, OpenCode, Codex, Copilot, Cursor, Windsurf e mais), o escopo (global ou local) e o idioma das descrições (`Português (Brasil)` ou `English`). Também suporta flags diretas como `--lang=pt-br`. O instalador é necessário para compatibilidade entre runtimes — não copie arquivos diretamente de `agents/` ou `commands/`.

Em outro runtime ou sem Node.js? Consulte [Instalar no seu runtime](docs/pt-BR/how-to/install-on-your-runtime.md).

Após a instalação, inicie um projeto novo ou integre um repositório existente:

```bash
/gsd-new-project   # projeto greenfield
/gsd-onboard       # base de código existente
```

É a primeira vez? Consulte o [Tutorial Prático Completo do GSD](tutorial-gsd.md) ou siga [Seu primeiro projeto](docs/pt-BR/tutorials/your-first-project.md) para um passo a passo guiado, desde a instalação até a primeira fase entregue. Para um repositório existente, consulte [Integrar uma base de código existente](docs/pt-BR/tutorials/onboarding-an-existing-codebase.md).

---

## Documentação

**Novidades no GSD Core 2.3** → [Tutorial Prático Completo](tutorial-gsd.md) · [Roadmap](.planning/ROADMAP.md)

**Tutoriais** — aprendendo na prática:
- [Tutorial Prático: Dominando o GSD Core 2.3](tutorial-gsd.md) 🔥
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

A maioria das configurações de codificação com IA falha em escala porque o inchaço de contexto degrada silenciosamente a qualidade da saída, não há memória compartilhada entre sessões e nada verifica se o código realmente funciona. O GSD Core resolve os três problemas: o trabalho pesado é executado em subagentes com contexto limpo, artefatos estruturados como `STATE.md` e `CONTEXT.md` sobrevivem às fronteiras de sessão, e a etapa de verificação percorre o que foi construído e gera planos de correção antes de uma fase ser declarada concluída. Consulte [docs/pt-BR/explanation/context-engineering.md](docs/pt-BR/explanation/context-engineering.md) para o raciocínio completo.

Problemas? Consulte [docs/pt-BR/how-to/recover-and-troubleshoot.md](docs/pt-BR/how-to/recover-and-troubleshoot.md).

---

## Comunidade

| Projeto | Plataforma |
|---------|----------|
| [gsd-opencode](https://github.com/rokicool/gsd-opencode) | Port original para OpenCode |
| [Discord](https://discord.gg/mYgfVNfA2r) | Suporte da comunidade |

---

## Histórico de estrelas

<a href="https://star-history.com/#carlosatec/gsd-core&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=carlosatec/gsd-core&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=carlosatec/gsd-core&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=carlosatec/gsd-core&type=Date" />
 </picture>
</a>

---

## Licença

Licença MIT. Consulte [LICENSE](LICENSE) para detalhes.

---

<div align="center">

**Agentes de codificação com IA são poderosos. O GSD Core Nexus os torna confiáveis, disciplinados e eficientes em tokens.**

</div>
