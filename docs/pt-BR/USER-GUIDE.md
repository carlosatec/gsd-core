# Guia do Usuário — GSD Core Nexus 3.1

Guia prático e narrativo do GSD Core Nexus 3.1 — oriente-se aqui e siga os links para a documentação especializada.

> **A documentação do GSD Core é organizada segundo o padrão [Diataxis](https://diataxis.fr).**
> Navegue por objetivo: [Tutoriais](README.md#tutoriais) · [Guias Como Fazer](README.md#guias-como-fazer) · [Referência](README.md#referência) · [Explicação](README.md#explicação) · [Índice da Documentação](README.md)

---

## Índice

- [A Superfície Unificada de 10 Comandos](#a-superfície-unificada-de-10-comandos)
- [Visão Geral do Ciclo de Vida do Projeto](#visão-geral-do-ciclo-de-vida-do-projeto)
- [Inteligência de Sessão & Replay Determinístico CLI](#inteligência-de-sessão--replay-determinístico-cli)
- [Grafo de Conhecimento & Obsidian Canvas](#grafo-de-conhecimento--obsidian-canvas)
- [DeepSeek Harness & Suporte Multi-Runtime](#deepseek-harness--suporte-multi-runtime)
- [Diagramas de Fluxo de Trabalho](#diagramas-de-fluxo-de-trabalho)
- [Arquitetura de Validação & Qualidade](#arquitetura-de-validação--qualidade)
- [Contrato de Design e Auditoria de UI](#contrato-de-design-e-auditoria-de-ui)
- [Spiking & Sketching](#spiking--sketching)
- [Backlog & Tópicos de Contexto](#backlog--tópicos-de-contexto)
- [Telemetria de Tokens e Economia de Contexto](#telemetria-de-tokens-e-economia-de-contexto)
- [Exemplos de Uso](#exemplos-de-uso)
- [Solução de Problemas & Recuperação](#solução-de-problemas--recuperação)
- [Estrutura de Arquivos do Projeto](#estrutura-de-arquivos-do-projeto)
- [Recursos Relacionados](#recursos-relacionados)

---

## A Superfície Unificada de 10 Comandos

A partir do GSD Core Nexus 3.1, a interface pública é simplificada e consolidada em **10 Comandos Canônicos Unificados**. Todas as sub-habilidades e fluxos internos são orquestrados de forma transparente sob esses pontos de entrada:

| Comando | Finalidade Principal | Gatilhos & Flags Comuns |
|---|---|---|
| `/gsd-status` | Consciência situacional, progresso e detecção de drift | `--detail`, `--drift` |
| `/gsd-plan` | Pesquisa, contrato de UI e geração de planos em ondas | `[fase]`, `--skip-research`, `--mvp` |
| `/gsd-exec` | Execução paralela em ondas com testes automatizados e commits | `[fase]`, `--wave <N>`, `--tdd` |
| `/gsd-review` | Code review estático e auto-reparo de inconformidades | `--fix`, `--all`, `--depth <N>` |
| `/gsd-verify` | UAT conversacional e validação dos critérios de aceitação | `[fase]`, `--strict` |
| `/gsd-ship` | Conclusão de milestone, abertura de PR, tags e entrega | `--draft`, `--tag <versão>` |
| `/gsd-auto` | Piloto automático ponta a ponta em todas as fases | `--until <fase>`, `--max-iterations <N>` |
| `/gsd-tokens` | Dashboard de telemetria em tempo real, taxa de compressão e economia JIT | `--raw`, `--history` |
| `/gsd-migrate` | Modernização não-destrutiva de projetos legados e greenfield para o GSD Nexus 3.0 | `--dry-run`, `--force` |
| `/gsd-help` | Exibe o catálogo de comandos, flags e ajuda contextual | `[comando]` |

---

## Visão Geral do Ciclo de Vida do Projeto

O fluxo essencial do GSD é: **status → plan → exec → review → verify → ship**, repetido para cada fase.

Consulte [Seu Primeiro Projeto](tutorials/your-first-project.md) para um tutorial passo a passo.

**Flags principais:**

| Flag | Comando | Quando usar |
| ---- | ------- | ----------- |
| `--skip-research` | `/gsd-plan` | Pular pesquisa de ecossistema quando o domínio já é familiar |
| `--mvp` | `/gsd-plan` | Estruturar planos focados em fatias verticais de MVP |
| `--tdd` | `/gsd-exec` | Exigir desenvolvimento orientado a testes em cada tarefa |
| `--fix` | `/gsd-review` | Aplicar reparos automáticos em achados de linter e anti-patterns |
| `--draft` | `/gsd-ship` | Criar Pull Request em modo rascunho (*Draft PR*) |

Para a referência completa com todas as flags, consulte [`docs/pt-BR/COMMANDS.md`](COMMANDS.md).

---

## Inteligência de Sessão & Replay Determinístico CLI

O GSD Core Nexus 3.1 grava automaticamente eventos de execução estruturados em JSONL em `.planning/intel/sessions/`. Toda execução de comando registra chamadas de ferramentas, checagens de guardrails pré-voo, stack traces e diffs reais:

```bash
# Replay da última sessão no terminal
gsd-tools session replay latest

# Filtrar o replay apenas por falhas e mutações de código
gsd-tools session replay latest --errors-only
gsd-tools session replay latest --diffs

# Exportar a linha do tempo da sessão em Markdown
gsd-tools session export latest --md
```

---

## Grafo de Conhecimento & Obsidian Canvas

O GSD Core Nexus gera nativamente artefatos visuais de conhecimento a partir do AST do código (100% offline, zero dependências externas):

- **Obsidian Open Canvas:** `.planning/ROADMAP.canvas` — layout de nós visuais coloridos por fases, decisões e módulos.
- **Índice de Wikilinks & Backlinks:** `.planning/intel/backlinks.json` — índice de ligações bidirecionais com filtro de inline code (`stripInlineCode`) para navegação no Obsidian Vault.
- **Grafo Visual Interativo (HTML):** O comando `/gsd-graph` exporta um visualizador HTML/Canvas 2D autônomo com distribuição em espiral de Fermat, estabilização de física por decaimento térmico $\alpha$ e exportação de snapshot PNG.

---

## DeepSeek Harness & Suporte Multi-Runtime

O GSD 2.9 fornece suporte nativo de 1ª classe para o **DeepSeek Harness** (micro-kernel `@deepseek-ai/dsh`), **Google Antigravity CLI**, **Claude Code**, **OpenCode** e **Codex**, garantindo execução consistente e disciplinada em todas as principais plataformas de IA.

---

## Diagramas de Fluxo de Trabalho

### Ciclo Completo do Projeto

```text
  ┌──────────────────────────────────────────────────────────┐
  │                    ENTRADA / STATUS DO PROJETO           │
  │  /gsd-status  ou  /gsd-plan 1                            │
  │  Contexto -> Requisitos -> Roadmap                       │
  └────────────────────────────┬─────────────────────────────┘
                               │
                ┌──────────────▼─────────────┐
                │      PARA CADA FASE:       │
                │                            │
                │  ┌────────────────────┐    │
                │  │ /gsd-plan <N>      │    │  <- Pesquisa + Contrato UI + Planos + Validação
                │  └──────────┬─────────┘    │
                │             │              │
                │  ┌──────────▼─────────┐    │
                │  │ /gsd-exec <N>      │    │  <- Execução Paralela em Ondas + TDD
                │  └──────────┬─────────┘    │
                │             │              │
                │  ┌──────────▼─────────┐    │
                │  │ /gsd-review --fix  │    │  <- Code Review Estático + Auto-Fix
                │  └──────────┬─────────┘    │
                │             │              │
                │  ┌──────────▼─────────┐    │
                │  │ /gsd-verify <N>    │    │  <- UAT Conversacional e Critérios
                │  └──────────┬─────────┘    │
                │             │              │
                │  ┌──────────▼─────────┐    │
                │  │ /gsd-ship          │    │  <- Fechamento / PR / Tag / Próximo Ciclo
                │  └──────────┬─────────┘    │
                │             │              │
                │     Próxima Fase?──────────┘
                │             │ Não
                └─────────────┼──────────────┘
                               │
               ┌───────────────▼──────────────┐
               │  /gsd-ship ou /gsd-tokens    │
               │  Entrega, PR e Telemetria    │
               └──────────────────────────────┘
```

### Coordenação dos Agentes de Planejamento

```text
  /gsd-plan N
         │
         ├── Pesquisadores de Fase (x4 paralelos)
         │     ├── Pesquisador de Stack
         │     ├── Pesquisador de Features
         │     ├── Pesquisador de Arquitetura
         │     └── Pesquisador de Armadilhas (Pitfalls)
         │           │
         │     ┌──────▼──────┐
         │     │ RESEARCH.md │
         │     └──────┬──────┘
         │            │
         │     ┌──────▼──────┐
         │     │   Planner   │  <- Lê PROJECT.md, REQUIREMENTS.md,
         │     │             │     CONTEXT.md, RESEARCH.md
         │     └──────┬──────┘
         │            │
         │     ┌──────▼───────────┐     ┌────────┐
         │     │   Plan Checker   │────>│ APROV? │
         │     └──────────────────┘     └───┬────┘
         │                                  │
         │                             Sim  │  Não
         │                              │   │   │
         │                              │   └───┘  (loop, até 3x)
         │                              │
         │                        ┌─────▼──────┐
         │                        │ Arquivos   │
         │                        │ *-PLAN.md  │
         │                        └────────────┘
         └── Concluído
```

---

## Arquitetura de Validação & Qualidade

Durante a pesquisa de planejamento, o GSD mapeia a cobertura de testes automatizados para cada requisito da fase antes de qualquer linha de código ser escrita.

- **Saída:** `{fase}-VALIDATION.md` — o contrato de validação da fase.
- **Portão de Verificação:** Planos cujas tarefas não contenham comandos de verificação automatizados são ajustados antes da aprovação de execução.
- **Review com Auto-Reparo:** Executar `/gsd-review --fix` varre arquivos modificados contra a base de anti-patterns e corrige problemas comuns de forma não destrutiva.

---

## Contrato de Design e Auditoria de UI

Aplicações front-end mantêm consistência visual através de contratos de design claros:
- `/gsd-plan [N]` gera e incorpora contratos visuais (`UI-SPEC.md`) em fases de front-end.
- `/gsd-review` executa auditoria visual e de acessibilidade baseada em 6 pilares.

---

## Telemetria de Tokens e Economia de Contexto

O GSD Nexus inclui observabilidade técnica pura sobre a injeção cirúrgica de contexto JIT, economia de tokens e compressão de grafo (sem métricas financeiras ou suposições de custo):

```bash
/gsd-tokens
```

Exibe um painel responsivo em ASCII de 65 colunas contendo:
- **Tokens JIT Utilizados vs Evitados:** Compara o contexto cirúrgico do grafo AST contra o peso monolítico total do repositório.
- **Fator de Redução / Compressão de Grafo:** Taxa em tempo real ($R = \max(1.0, \text{monolithicTokens} / \text{jitTokens})$) demonstrando o ganho de densidade (ex: `10895.2x`).
- **Dimensionamento Dinâmico Model-Aware:** Calibração automática de orçamento de acordo com a janela do modelo ativo (Gemini 24K, Claude/GPT-4o 8K, Locais 2.5K).
- **Distribuição por Comando e Fase:** Barras visuais de progresso por comando e divisão por fase.
- **Subcomandos CLI:** `gsd-tools telemetry get`, `gsd-tools telemetry record` e `gsd-tools telemetry dashboard`.

---

## Exemplos de Uso

### Fluxo de Desenvolvimento Completo

```bash
# 1. Verificar a situação atual e o progresso
/gsd-status

# 2. Planejar a fase 1 (Pesquisa, UI spec e planos em ondas)
/gsd-plan 1

# 3. Executar os planos da fase 1 em ondas paralelas
/gsd-exec 1

# 4. Revisar o código e aplicar auto-reparos em conformidades
/gsd-review --fix

# 5. Validar os recursos construídos com UAT interativo
/gsd-verify 1

# 6. Conferir métricas de telemetria e consumo de tokens
/gsd-tokens

# 7. Finalizar a entrega, gerar tags e abrir o PR
/gsd-ship
```

### Modo Piloto Automático

```bash
# Executar todas as fases do milestone de forma autônoma
/gsd-auto
```

---

## Solução de Problemas & Recuperação

| Problema | Ação Recomendada |
|---|---|
| Perda de contexto após pausa | Execute `/gsd-status` para restaurar o estado situacional |
| Código quebrado ou instável | Execute `/gsd-review --fix` ou desfaça o commit da fase |
| STATE.md fora de sincronia | Execute `gsd-tools state sync` para reconstruir o estado |
| Consumo elevado de tokens | Verifique `/gsd-tokens` e ajuste `model_profile: "budget"` |
| Upgrade de projeto antigo | Execute `/gsd-migrate` para atualizar a estrutura para a v2.5 |

---

## Estrutura de Arquivos do Projeto

```text
.planning/
  PROJECT.md              # Visão e contexto do projeto
  REQUIREMENTS.md         # Requisitos escopados com IDs
  ROADMAP.md              # Divisão em fases e status
  STATE.md                # Decisões, bloqueadores e memória de sessão
  config.json             # Configurações de fluxo e modelos
  MILESTONES.md           # Histórico de milestones concluídos
  phases/
    XX-nome-da-fase/
      XX-YY-PLAN.md       # Planos atômicos de execução
      XX-YY-SUMMARY.md    # Resultados e decisões de execução
      CONTEXT.md          # Preferências de implementação
      RESEARCH.md         # Achados de pesquisa de ecossistema
      VERIFICATION.md     # Resultados da verificação pós-execução
      XX-UI-SPEC.md       # Contrato de design de UI
```

---

## Recursos Relacionados

- [Índice da Documentação](README.md)
- [Arquitetura Unificada](ARCHITECTURE.md)
- [Referência de Comandos](COMMANDS.md)
- [Configuração do Sistema](CONFIGURATION.md)
