<div align="center">

# ⚡ GSD Core Nexus

### **Git. Ship. Done. — O Sistema Operacional para Agentes de IA**

[English](README.md) · **Português**

**Um sistema soberano de meta-prompting, engenharia de contexto, análise estática nativa e desenvolvimento orientado a especificações com Segundo Cérebro integrado para Claude Code, Antigravity CLI, DeepSeek Harness, OpenCode, Codex, Copilot, Cursor, Windsurf, Kimi CLI, Qwen Code e muito mais.**

<br/>

[![Versão](https://img.shields.io/badge/version-3.8.1-06b6d4?style=for-the-badge&logo=git&logoColor=white&label=Versão)](.planning/ROADMAP.md)
[![Testes](https://img.shields.io/github/actions/workflow/status/carlosatec/gsd-core/test.yml?branch=next&style=for-the-badge&logo=github&label=Testes&color=34d399)](https://github.com/carlosatec/gsd-core/actions)
[![Licença](https://img.shields.io/badge/licen%C3%A7a-MIT-38bdf8?style=for-the-badge)](LICENSE)
[![Zero Python](https://img.shields.io/badge/zero-python%20%7C%20native%20ts-a855f7?style=for-the-badge&logo=typescript&logoColor=white)](docs/ARCHITECTURE.md)
[![Segundo Cérebro](https://img.shields.io/badge/obsidian-segundo%20c%C3%A9rebro-8b5cf6?style=for-the-badge&logo=obsidian&logoColor=white)](.planning/vault/)
[![GitHub stars](https://img.shields.io/github/stars/carlosatec/gsd-core?style=for-the-badge&logo=github&color=181717)](https://github.com/carlosatec/gsd-core/stargazers)

<br/>

</div>

---

## 🌟 Por que o GSD Core Nexus?

A maioria dos fluxos de trabalho com IA em projetos médios e grandes falha devido a três gargalos críticos:
1. **Context Rot & Desperdício de Tokens:** Conforme a conversa avança, o histórico satura a janela de contexto, degradando a qualidade das respostas, alucinando métodos inexistentes e queimando milhões de tokens desnecessários.
2. **Amnésia de Contexto & Perda de Decisões:** Cada nova sessão reseta a memória da IA. Decisões de arquitetura, erros superados e regras constitucionais são imediatamente esquecidos.
3. **Edições Sem Salvaguarda & Regressões Silenciosas:** Os agentes alteram arquivos sem validação estática prévia, quebrando contratos de tipos, violando regras de negócio e introduzindo bugs em cascata.

**O GSD Core Nexus elimina essas falhas na raiz:**
- 🧠 **Conhecimento Persistente do Projeto:** Preserva o estado do projeto e as decisões entre sessões. O vault Obsidian, os mapas do código e as exportações visuais só são gerados quando solicitados.
- ⚡ **Contexto JIT com Limites:** Recupera trechos relevantes de código e documentação com origem em arquivo e linhas, ranking local e limites explícitos de contexto.
- 🛡️ **Guardiões Cognitivos Soberanos:** Avaliação de risco System One (`SecurityHead`, `ArchitectureHead`, `QualityHead`), invariantes constitucionais `Noul` e checagem de aterramento AST 100% locais, sem dependência de APIs externas.
- 🔄 **Loop de Auto-Cura:** Guardrails pré-voo barram mutações perigosas antes das alterações, enquanto loops automáticos de teste diagnosticam e auto-reparam falhas de execução.

---

## 🔄 O Ciclo Contínuo de 5 Etapas

Cada marco do projeto é dividido em fases testáveis e orquestradas através de um ciclo rigoroso de 5 etapas:

```
    ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
    │ 1. DISCUSS   │ ──> │   2. PLAN    │ ──> │   3. EXEC    │ ──> │  4. REVIEW   │ ──> │   5. SHIP    │
    │   & SPEC     │     │              │     │  (Auto-Cura) │     │   & VERIFY   │     │              │
    └──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
           │                    │                    │                    │                    │
           └────────────────────┴────────────────────┼────────────────────┴────────────────────┘
                                                     ▼
                                      🧠 SEGUNDO CÉREBRO & INTEL AST
                          (Obsidian Vault · Grafo 360° Visual · Memória SSOT)
```

1. **Discuss & Spec (`/gsd:plan`):** Registra requisitos e decisões de implementação antes da execução.
2. **Plan (`/gsd:plan`):** Decompõe a fase em ondas paralelas de tarefas atômicas com orçamentos JIT de tokens calibrados.
3. **Execute (`/gsd:exec`):** Executa as tarefas dos planos com verificações prévias e recuperação automática configurada.
4. **Review & Verify (`/gsd:review --fix` & `/gsd:verify`):** Audita o código em busca de complexidade, dead code e anti-padrões de UI com auto-reparo, seguido por verificação UAT interativa.
5. **Ship (`/gsd:ship`):** Verifica a prontidão da entrega e prepara o fluxo solicitado.

---

## 🚀 Comandos Canônicos

O fluxo principal tem seis comandos, com `auto` para execução autônoma e quatro comandos de suporte:

| Comando | Ação & Superpoder | Principais Flags |
| :--- | :--- | :--- |
| **`/gsd:status`** | Lê o progresso, a atualidade dos artefatos e a telemetria; `--sync` ou `--refresh` atualiza dados derivados explicitamente | `--sync`, `--refresh` |
| **`/gsd:plan`** | Cria ou atualiza um plano de fase com requisitos, ondas e contexto JIT | `[fase]` |
| **`/gsd:exec`** | Executa os planos da fase com verificações prévias e validação | `[fase]` |
| **`/gsd:review`** | Analisa a implementação e identifica problemas acionáveis | `[fase]` |
| **`/gsd:verify`** | Confere requisitos da fase e evidências de validação | `[fase]` |
| **`/gsd:ship`** | Prepara o trabalho concluído para entrega | `[fase]` |
| **`/gsd:auto`** | Executa o fluxo de fase com checkpoints de segurança | `[fase]` |
| **`/gsd:tokens`** | Consulta telemetria de tokens e JIT | opções variam por runtime |
| **`/gsd:graph`** | Gera o grafo canônico e as exportações solicitadas; o vault é opcional | `--vault`, `--canvas`, `--open` |
| **`/gsd:migrate`** | Migra um projeto legado para o layout GSD atual | `--dry-run` |
| **`/gsd:help`** | Exibe orientações dos comandos | — |

---

## 💎 Destaques Tecnológicos do GSD Core Nexus 3.8

### 1. 🧠 Segundo Cérebro do Projeto & Motor de Obsidian Vault
- **Vault opcional (`.planning/vault/`):** O comando explícito `/gsd:graph --vault` exporta decisões, fases, módulos e lições em notas Markdown interligadas.
- **Master Map of Content (`00-Home.md`):** Portal de navegação com visão estruturada dos módulos de produção (`src/`), ferramentas e decisões.
- **Dois Mapas Visuais em Canvas:**
  - `00-Vault.canvas`: Mindmap interativo em 2D dos módulos ativos, decisões e fronteiras do sistema.
  - `01-Roadmap.canvas`: Exportacao visual opcional do roteiro atual do projeto.
- **Memória persistente:** Memórias registradas pelo usuário e decisões arquiteturais permanecem entre sessões.

### 2. 🌐 Grafo Visual 360° de Conhecimento AST (`graph-view.html`)
- **Grafo HTML5 Offline:** Uma exportação solicitada gera a topologia do código em `.planning/intel/graph-view.html`.
- **Conexões Direcionadas de Governança:** Decisões arquiteturais são ligadas aos arquivos de código que elas governam (`governs`); fases são ligadas aos planos correspondentes (`specifies`).
- **Zero Dependências:** Funciona nativamente em qualquer navegador com animações fluidas, visual dark neon e filtros interativos por tipo e relevância.

### 3. 🛡️ Guardião Cognitivo Soberano no System One Engine (JEV + LAYA)
- **Avaliador Multi-Head Local:** Triagem especializada em segurança, arquitetura e qualidade de código com incerteza calculada por Entropia de Shannon ($H(P)$) e re-ranking híbrido RRF (BM25 + PageRank).
- **Gates Pré-Mutação:**
  - `Noul`: Impede alterações que violem regras de integridade do [`CONSTITUTION.md`](CONSTITUTION.md).
  - `Score`: Detecta alucinações de métodos ou incompatibilidades de assinaturas com base na AST real.
  - `Choice`: Audita o cumprimento rigoroso dos requisitos RFC 2119 das especificações da fase.
- **Memória Contínua Claude-Mem (`decisions.jsonl`):** Registro durável de decisões arquiteturais e lições registradas para uso entre sessões.

### 4. ⚡ Injeção Cirúrgica JIT & AST Universal Poliglota
- **Zero Python / TypeScript Nativo:** A análise estática suporta TypeScript, JavaScript, Python, Go, Rust, C#, Java, Swift, Kotlin, PHP, Ruby, Dart, Zig, Astro, Protobuf, SQL, CSS e outros formatos.
- **Mobile 360° Nativo:** A análise AST suporta arquivos de código Swift e Kotlin.
- **Tipagem Semântica de Arestas:** Distingue imports `type_only` e `runtime` no cálculo de blast radius.
- **Detecção Proativa de Código Morto:** Identifica módulos órfãos não referenciados em pastas de produção (`src/`).

### 5. 📚 Recuperação Local por Trechos e Atualidade dos Artefatos
- O índice semântico armazena trechos limitados de código e Markdown com origem, linhas, linguagem e símbolo ou seção.
- Fingerprints de conteúdo detectam edições mesmo quando tamanho e data de modificação não mudam. O grafo AST canônico fica em `.planning/intel/codebase-graph.json`.
- `/gsd:status` informa a atualidade sem gravar arquivos. Mapas, vaults e exportações visuais continuam opcionais.

### 6. 📊 Observabilidade 360° & Telemetria em Tempo Real
- **Governança Granular de Tokens:** Monitoramento contínuo em todos os comandos (`plan`, `exec`, `review`, `verify`), medindo tokens economizados e taxa de compressão real.
- **Modelagem Financeira em $ USD:** Cálculo de custos em tempo real para Claude 3.5 Sonnet, GPT-4o, Gemini 1.5 Pro, DeepSeek V3 e modelos locais.
- **Dashboards ASCII e Web:** Terminal adaptativo em 65 colunas (`/gsd:tokens`) e dashboard SVG/HTML offline (`npm run dashboard`).

### 7. 🔀 Concorrência com Worktrees & Isolamento de Agentes
- **Isolamento Efêmero com Git Worktrees:** Concorrência zero-copy (padrão Worktrunk) com suporte seguro a Directory Junctions no NTFS (Windows).
- **Fachada Modular de State Lock:** Coordenação transacional entre múltiplos processos com verificação de PIDs ativos e recuperação atômica de locks órfãos.

---

## ⚡ Início Rápido

Instale o GSD Core Nexus globalmente ou no seu projeto atual com um único comando:

```bash
npx github:carlosatec/gsd-core
```

O instalador interativo configurará seu runtime, escopo (global ou local) e idioma preferido (`Português (Brasil)` ou `English`, configurável também via `--lang=pt-br`).

### Instale no seu ambiente preferido:

```bash
# Antigravity CLI (Sucessor oficial do Gemini CLI)
npx github:carlosatec/gsd-core --antigravity --global

# Claude Code
npx github:carlosatec/gsd-core --claude --global

# Codex
npx github:carlosatec/gsd-core --codex --global

# OpenCode / Cursor / Windsurf / Copilot / DeepSeek Harness
npx github:carlosatec/gsd-core --all --global
```

Após a instalação, comece a usar os comandos imediatamente:

```bash
/gsd:status       # Le o estado do projeto e a atualidade dos artefatos
/gsd:plan         # Planeja a proxima fase com contexto JIT
/gsd:exec         # Executa planos de fase com verificacoes previas
/gsd:graph --vault # Exporta explicitamente o Segundo Cerebro no Obsidian
```

---

## 📚 Documentação

- **[Tutorial Prático: Dominando o GSD Core Nexus 3.8](docs/pt-BR/tutorials/tutorial-pratico.md)** ([English](docs/tutorials/practical-tutorial.md)) 🔥
- **[Referência de Comandos](docs/COMMANDS.md):** Guia de comandos canônicos, flags e fluxos de trabalho.
- **[Arquitetura do Sistema](docs/ARCHITECTURE.md):** Imersão profunda na arquitetura de componentes, motor AST e injeção JIT.
- **[Catálogo de Funcionalidades](docs/FEATURES.md):** Registro de todas as 170+ capacidades e marcos arquiteturais.
- **[Guia de Configuração](docs/CONFIGURATION.md):** Como configurar perfis de modelo, revisores e tolerâncias de guardrails.
- **[Recuperação e Resolução de Problemas](docs/how-to/recover-and-troubleshoot.md):** Receitas rápidas para resolver locks, drift e exceções.

---

## 🧹 Desinstalação Limpa

O GSD Core Nexus inclui um assistente de remoção não-destrutivo:

```bash
# Desinstalação global no Antigravity
npx github:carlosatec/gsd-core --antigravity --global --uninstall

# Desinstalação global no Claude Code
npx github:carlosatec/gsd-core --claude --global --uninstall

# Desinstalação de todos os runtimes globalmente
npx github:carlosatec/gsd-core --all --global --uninstall
```

- **Removido:** Hooks de runtime, manifestos de skills, ferramentas GSD de CLI e templates de agentes.
- **Preservado:** Seu código-fonte, preferências do desenvolvedor (`USER-PROFILE.md`) e histórico `.planning/`.

---

## 📜 Licença & Créditos

- **Licença:** [MIT License](LICENSE)
- **Baseado em:** Fundação open-source do [GSD Core (`open-gsd/gsd-core`)](https://github.com/open-gsd/gsd-core), expandido com análise AST nativa em TypeScript, Segundo Cérebro Obsidian Vault, Guardiões Cognitivos System One e engenharia de contexto cirúrgica JIT.

<div align="center">

**Agentes de codificação com IA são poderosos. O GSD Core Nexus os torna disciplinados, imunes à amnésia e ultra-eficientes em tokens.**

</div>
