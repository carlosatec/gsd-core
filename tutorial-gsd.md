# 🚀 Tutorial Prático: Dominando o GSD Core 2.3

> **Git. Ship. Done.**  
> O guia definitivo para engenharia de software autônoma, meta-prompting, injeção cirúrgica de contexto e governança de IA com o **GSD Core 2.3**.

---

## 📖 Índice

1. [O que é o GSD Core](#1-o-que-é-o-gsd-core)
2. [Instalação e Configuração](#2-instalação-e-configuração)
3. [Iniciando um Projeto (Greenfield vs. Brownfield)](#3-iniciando-um-projeto)
4. [A Interface Canônica 6+1](#4-a-interface-canônica-61)
5. [O Ciclo de Desenvolvimento em 5 Etapas](#5-o-ciclo-de-desenvolvimento-em-5-etapas)
6. [Inteligência de Código: AST Universal 360° & Living Docs](#6-inteligência-de-código-ast-universal-360--living-docs)
7. [Injeção Cirúrgica de Contexto (JIT) & RAG Semântico](#7-injeção-cirúrgica-de-contexto-jit--rag-semântico)
8. [Segurança Pré-Voo: Guardrails, Anti-Patterns & Self-Healing](#8-segurança-pré-voo-guardrails-anti-patterns--self-healing)
9. [Telemetria e Observabilidade de Tokens (`/gsd:tokens`)](#9-telemetria-e-observabilidade-de-tokens-gsdtokens)
10. [Exemplo Passo a Passo: Construindo uma Feature do Zero](#10-exemplo-passo-a-passo-construindo-uma-feature-do-zero)

---

## 1. O que é o GSD Core

O **GSD Core** é um framework de engenharia de contexto e desenvolvimento orientado a especificações. Ele resolve o problema do **Context Rot** (degradação da qualidade da IA à medida que o histórico de conversa se enche de ruídos) através de:

* **Subagentes com Contexto Limpo:** Cada plano de execução roda em uma janela isolada de 200k tokens.
* **Estado Persistente em Arquivo:** O diretório `.planning/` é a única fonte da verdade — todo o progresso, decisões técnicas e planos ficam versionados no Git.
* **Injeção Cirúrgica (JIT):** Em vez de enviar o repositório inteiro para o modelo, o GSD envia apenas os contratos e arquivos relevantes, reduzindo o consumo de tokens em **80% a 90%**.

---

## 2. Instalação e Configuração

Instale o GSD Core globalmente ou localmente no seu runtime preferido:

```bash
npx @opengsd/gsd-core@latest
```

O instalador detectará automaticamente seu ambiente (Claude Code, Antigravity CLI, Gemini CLI, Codex, Copilot, Cursor, Windsurf, OpenCode, Kimi CLI).

---

## 3. Iniciando um Projeto

### Cenário A: Novo Projeto do Zero (Greenfield)
```bash
/gsd-new-project
```
O assistente fará perguntas socráticas para entender o objetivo do software, gerando o `PROJECT.md`, `ROADMAP.md` e a primeira fase.

### Cenário B: Projeto Existente (Brownfield / Onboarding)
```bash
/gsd-onboard
```
O GSD executa o scanner AST 360°, cataloga 17+ linguagens, gera o grafo de dependências e cria a documentação viva em `.planning/codebase/`.

### Cenário C: Modernizar Projeto Legado do GSD 1.x
```bash
/gsd:migrate
```
Atualiza a estrutura para o padrão GSD 2.3 de forma 100% não-destrutiva.

---

## 4. A Interface Canônica 6+1

Para simplificar a experiência, o GSD 2.3 unificou mais de 30 comandos em **6 comandos canônicos + 1 piloto automático**:

```text
┌─────────────────────────────────────────────────────────────┐
│                 INTERFACE CANÔNICA GSD 2.3                  │
├────────────┬────────────────────────────────────────────────┤
│ Comando    │ Ação Operacional                               │
├────────────┼────────────────────────────────────────────────┤
│ /gsd:status│ Diagnóstico situacional, progresso e roadmap   │
│ /gsd:plan  │ Criação de plano detalhado com ondas e gates   │
│ /gsd:exec  │ Execução paralela em ondas com subagentes      │
│ /gsd:review│ Revisão estática de código com flag --fix      │
│ /gsd:verify│ Validação conversacional de UAT e aceitação    │
│ /gsd:ship  │ Preparação de branch, PR e merge               │
│ /gsd:auto  │ Piloto automático (discuss → plan → exec loop) │
│ /gsd:tokens│ Painel visual de economia e uso de tokens      │
└────────────┴────────────────────────────────────────────────┘
```

> **Compatibilidade de Sintaxe:** O GSD aceita múltiplos formatos automaticamente: `/gsd:plan`, `/gsd-plan`, `$gsd-plan` ou `gsd plan`.

---

## 5. O Ciclo de Desenvolvimento em 5 Etapas

Cada fase do roadmap passa rigorosamente por este ciclo:

```
  1. DISCUSS ──────► 2. PLAN ──────► 3. EXECUTE ──────► 4. VERIFY ──────► 5. SHIP
  (Alinhar o quê)   (Como fazer)     (Escrever código)   (Validar UAT)   (Entregar PR)
```

1. **Discuss / Spec (`/gsd:plan` / `discuss`):** Alinha decisões arquiteturais antes de planejar e grava no `STATE.md`. Se você pular esta etapa, o GSD emite um *Soft Warning* não-bloqueante e sintetiza automaticamente o `SPEC.md` a partir do `ROADMAP.md` e decisões ativas.
2. **Plan (`/gsd:plan`):** Decompõe a fase em tarefas atômicas divididas em ondas paralelas (*waves*) no `PLAN.md`.
3. **Execute (`/gsd:exec`):** Executa as tarefas onda por onda com subagentes de contexto limpo.
4. **Verify (`/gsd:verify`):** Testa funcionalidades construídas através de validação conversacional (UAT).
5. **Ship (`/gsd:ship`):** Limpa o git, filtra commits internos de `.planning/` e abre o Pull Request.

---

## 6. Inteligência de Código: AST Universal 360°, Mobile & Living Docs

O GSD Core analisa estaticamente o código sem precisar compilar ou rodar interpretadores pesados:

* **35+ Tecnologias e Extensões Nativas:** TypeScript, JavaScript, Python, Go, Rust, C#, Java, PHP, Ruby, C/C++, SQL/DDL, Prisma, GraphQL, CSS/SCSS/LESS, HTML/Vue/Svelte, Dockerfile, Shell Script, YAML.
* **📱 Mobile 360° Nativo:**
  - **iOS (Swift & SwiftUI):** Analisador AST nativo para arquivos `.swift`, `.m`, `.mm`, extraindo `struct`, `class`, `protocol`, `enum`, `extension`, `func` e componentes SwiftUI (`View`, `body: some View`). Suporte a manifestos `Package.swift`, `Podfile`, `Info.plist` e scaffolds de teste `XCTestCase`.
  - **Android (Kotlin & Jetpack Compose):** Detecção automática de `@Composable fun` (como componentes de UI), `sealed class`, `object` (singletons), `@HiltViewModel` (como serviços de injeção) e `suspend fun`. Suporte a `build.gradle.kts`, `settings.gradle.kts` e `AndroidManifest.xml`.
  - **Runners One-Shot Mobile:** Reconhecimento automático de `swift test`, `xcodebuild test`, `./gradlew test` e `gradle test`.
* **🌐 Grafo de Conhecimento 100% Nativo (Zero Python — D-31):** O motor Graphify foi totalmente reimplementado em TypeScript puro (versão `2.3-native`), gerando o grafo AST e salvando `graph.json` em memória sem depender de `uv pip install graphifyy`.
* **Cache Incremental via `mtime`:** O analisador AST compara o carimbo de data/hora dos arquivos no disco com o grafo pré-existente. Apenas arquivos modificados são re-processados, acelerando a análise em até **85%**.
* **Modo Lite & Otimização de PageRank Automática:** Em repositórios pequenos (< 50 arquivos) ou comandos de checagem rápida, o GSD ativa automaticamente o cálculo direto por grau, eliminando iterações desnecessárias.
* **Scaffolding de Testes Poliglota:** Gera esqueletos de teste respeitando as convenções de cada linguagem (Swift XCTest, Kotlin/Java JUnit 5, Go `_test.go`, Rust `#[cfg(test)]`, Dart `test/*_test.dart`, Python `test_*.py` e Node `.test.cjs`).
* **Living Docs Engine:** Gera e valida automaticamente:
  - `.planning/codebase/ARCHITECTURE.md` (topologia de imports e módulos)
  - `.planning/codebase/APIS.md` (catálogo de interfaces, structs e rotas HTTP)
* **Prevenção de Doc Drift sem Custo $O(n^2)$:** Validação contínua e sincronização pós-commit sem recriação redundante de grafos.

---

## 7. Injeção Cirúrgica de Contexto (JIT) & RAG Semântico Okapi BM25

Em vez de poluir a IA com centenas de linhas irrelevantes, o motor JIT:

1. **Consulta o Grafo AST com Ordenação PageRank:** Descobre quem importa o arquivo alvo e quem ele importa, ordenando os vizinhos por importância arquitetural.
2. **Extrai Contratos & Tipos:** Envia apenas as assinaturas exportadas (`interfaces`, `structs`, `traits`), ignorando o corpo das funções vizinhas.
3. **Injeta Âncora de Arquitetura Canônica:** Seleciona automaticamente o melhor arquivo de referência do projeto (com base em centralidade e densidade de tipos) para que a IA siga o mesmo padrão de código do repositório.
4. **Motor RAG Semântico Okapi BM25 (D-33):**
   - **Algoritmo BM25:** Parâmetros calibrados ($k_1 = 1.5, b = 0.75$) com saturação de frequência de termos e normalização por comprimento médio de documento (`avgdl`).
   - **Code Tokenizer Multilíngue:** Divisão inteligente de identificadores em `camelCase` (`userRepository` → `user`, `repository`), `PascalCase` (`HTMLParser` → `html`, `parser`), `kebab-case` e `snake_case`.
   - **Cobertura Universal:** Indexação de mais de 35 extensões de arquivo com exclusão automática de pastas de build mobile (`Pods`, `.gradle`, `DerivedData`, `.build`, `xcuserdata`).
5. **Adiciona Decisões Ativas:** Injeta apenas as ADRs relevantes do `STATE.md` usando o parser nativo de decisões.
6. **⚡ Hook Automático de Contexto de Sessão (D-30):** Injeta instantaneamente o briefing do projeto (≤ 15 linhas) no `GEMINI.md`, `AGENTS.md` ou `.agents/rules/gsd-session.md` na inicialização de qualquer comando, eliminando a perda de contexto em novas sessões de chat com a IA.

**Resultado:** O modelo recebe um bloco enxuto `<jit_context>` com foco 100% no que importa.

---

## 8. Segurança Pré-Voo: Guardrails, Anti-Patterns & Self-Healing

Para evitar que a IA quebre a aplicação:

* **Validação em Memória (Pre-Flight):** Simula os diffs em memória antes de tocar o disco. Se a IA deletar uma função exportada necessária para outro arquivo, o guardrail bloqueia o patch (`CONTRACT_BREAK`).
* **DFS com Limite de Profundidade (1000 nós):** O algoritmo de detecção de dependência circular possui profundidade máxima configurada, eliminando risco de estouro de pilha (*stack overflow*) em grafos complexos.
* **Empty File Guard (`EMPTY_FILE_GUARD`):** Impede que alucinações ou falhas parciais de streaming de LLMs sobrescrevam arquivos existentes com 0 bytes (`UNINTENDED_TRUNCATION`).
* **Guardrails de Qualidade e UI/UX no Hub (D-34):**
  - **No `/gsd:plan`:** Executa `runGapAnalysis` e alerta sobre requisitos não cobertos.
  - **No `/gsd:review`:** Executa `analyzeSource` para detectar funções com complexidade ciclomática excessiva (> 15) e varre componentes frontend por cores hexadecimais soltas sem design tokens e botões sem acessibilidade (`aria-label`).
  - **No `/gsd:verify`:** Ativa `autoPassed: true` automaticamente quando a cobertura de testes atinge 100%.
* **Suporte à Co-Evolução:** Se a IA alterar a função e o arquivo consumidor no mesmo lote de arquivos, o guardrail autoriza a mudança sem falso positivo.
* **Laço de Self-Healing:** Se um teste falhar durante a execução, o agente tem até 3 tentativas automáticas para depurar e corrigir.
* **Anti-Pattern Store & Busca Transversal:** Toda correção bem-sucedida é memorizada em `.planning/intel/anti-patterns.json` com suporte à busca por termo de erro (`errorQuery`) para que a IA nunca mais repita o mesmo erro em sessões futuras.

---

## 9. Telemetria e Observabilidade de Tokens (`/gsd:tokens`)

Para visualizar em tempo real a economia de contexto e o volume de tokens processados:

```bash
/gsd:tokens
```

**Saída no Terminal (65 Colunas):**
```text
┌─────────────────────────────────────────────────────────────┐
│ ⚡ GSD Token Telemetry (Observability)                       │
├─────────────────────────────────────────────────────────────┤
│ • Total Invocations:     42     executions                  │
│ • Tokens Used (JIT):     84,500     tokens                  │
│ • Monolithic Avoided:    820,000    tokens                  │
│ • Tokens Saved:          735,500    tokens                  │
│ • Average Efficiency:    89.7 % context saved               │
│ • Peak Invocation:       3,200  tokens                      │
├─────────────────────────────────────────────────────────────┤
│ 🔀 Distribution by Command:                                  │
│ • exec     [████████░░░░]  60% (50,700 tokens)              │
│ • plan     [███░░░░░░░░░]  20% (16,900 tokens)              │
│ • review   [███░░░░░░░░░]  20% (16,900 tokens)              │
└─────────────────────────────────────────────────────────────┘
```

---

## 10. Exemplo Passo a Passo: Construindo uma Feature do Zero

Acompanhe um fluxo real de ponta a ponta:

### Passo 1: Verificar a Situação Atual
```bash
/gsd:status
```
> O GSD analisa a árvore git, lê o `STATE.md`, exibe a fase ativa e sugere o próximo passo.

### Passo 2: Planejar a Fase
```bash
/gsd:plan
```
> O agente analisa a AST do projeto, define as waves de tarefas, gera o `PLAN.md` e estabelece os critérios de aceitação.

### Passo 3: Executar as Tarefas
```bash
/gsd:exec
```
> Os subagentes executam os planos em paralelo com injeção cirúrgica JIT. Se houver falha em algum teste, o self-healing corrige automaticamente.

### Passo 4: Fazer Code Review com Auto-Correção
```bash
/gsd:review --fix
```
> O GSD audita os arquivos alterados, detecta inconsistências de estilo ou tipagem e aplica correções autônomas imediatas.

### Passo 5: Validar a Entrega (UAT)
```bash
/gsd:verify
```
> O agente guia você na validação dos critérios de sucesso e registra a aprovação.

### Passo 6: Entregar e Abrir PR
```bash
/gsd:ship
```
> Cria a branch limpa, roda os testes finais, gera o resumo da entrega e abre o Pull Request!

---

## 🎯 Resumo Rápido de Comandos

| O que você quer fazer? | Execute este comando |
|---|---|
| Saber o que fazer agora | `/gsd:status` |
| Planejar a próxima fase | `/gsd:plan` |
| Executar as tarefas planejadas | `/gsd:exec` |
| Auditar e corrigir código | `/gsd:review --fix` |
| Testar e aprovar a entrega | `/gsd:verify` |
| Ver uso e economia de tokens | `/gsd:tokens` |
| Enviar para produção / Abrir PR | `/gsd:ship` |
| Executar tudo no piloto automático | `/gsd:auto` |

---

*GSD Core 2.3 — Desenvolva com precisão cirúrgica, zero context rot e eficiência máxima.*
