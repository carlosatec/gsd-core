# 🚀 Tutorial Prático: Dominando o GSD Core Nexus 2.7

> 🌐 **Language / Idioma:** **Português (Brasil)** | [English Version](TUTORIAL.md)  
> **Git. Ship. Done.**  
> O guia definitivo para engenharia de software autônoma, meta-prompting, injeção cirúrgica de contexto, observabilidade causal de sessões e governança de IA com o **GSD Core Nexus 2.7**.

---

## 📖 Índice

1. [O que é o GSD Core Nexus](#1-o-que-é-o-gsd-core-nexus)
2. [Instalação e Configuração](#2-instalação-e-configuração)
3. [Iniciando um Projeto (Greenfield vs. Brownfield)](#3-iniciando-um-projeto)
4. [A Interface Canônica dos 10 Comandos Unificados](#4-a-interface-canônica-dos-10-comandos-unificados)
5. [O Ciclo de Desenvolvimento em 5 Etapas](#5-o-ciclo-de-desenvolvimento-em-5-etapas)
6. [Inteligência de Código: AST Universal 360°, Mobile & Living Docs](#6-inteligência-de-código-ast-universal-360-mobile--living-docs)
7. [Injeção Cirúrgica de Contexto (JIT) & RAG Semântico Okapi BM25](#7-injeção-cirúrgica-de-contexto-jit--rag-semântico-okapi-bm25)
8. [Segurança Pré-Voo: Guardrails, Anti-Patterns & Self-Healing](#8-segurança-pré-voo-guardrails-anti-patterns--self-healing)
9. [Telemetria e Observabilidade de Tokens (`/gsd:tokens`)](#9-telemetria-e-observabilidade-de-tokens-gsdtokens)
10. [Inteligência de Sessão & CLI de Replay Determinístico (`gsd-tools session`)](#10-inteligência-de-sessão--cli-de-replay-determinístico)
11. [Sistema Unificado de Versionamento & Release (`npm run version:bump`)](#11-sistema-unificado-de-versionamento--release)
12. [Exemplo Passo a Passo: Construindo uma Feature do Zero](#12-exemplo-passo-a-passo-construindo-uma-feature-do-zero)
13. [Tabela Resumo de Comandos Rápidos](#-tabela-resumo-de-comandos-rápidos)

---

## 1. O que é o GSD Core Nexus

O **GSD Core Nexus** é um framework de engenharia de contexto, análise estática nativa e desenvolvimento orientado a especificações para agentes de codificação com IA (Claude Code, DeepSeek Harness, Codex, Antigravity CLI, Kimi CLI, Copilot, Cursor e mais). Ele resolve o problema do **Context Rot** (degradação da qualidade da IA à medida que o histórico de conversa se enche de ruídos) através de:

* **Subagentes com Contexto Limpo:** Cada plano de execução roda em uma janela isolada de 200k tokens.
* **Estado Persistente em Arquivo:** O diretório `.planning/` é a única fonte da verdade — todo o progresso, decisões técnicas e planos ficam versionados no Git.
* **Injeção Cirúrgica (JIT):** Em vez de enviar o repositório inteiro para o modelo, o GSD envia apenas os contratos e arquivos relevantes, reduzindo o consumo de tokens em **80% a 90%**.
* **Superfície Pública Estrita:** Sem confusão com dezenas de aliases legados — 10 comandos canônicos claros e objetivos.
* **Inteligência de Sessão & Replay Determinístico:** Toda a execução de comandos é registrada em eventos append-only JSONL com smart trimming e replay interativo no terminal.

---

## 2. Instalação e Configuração

Instale o GSD Core Nexus globalmente ou localmente no seu runtime preferido:

```bash
npx github:carlosatec/gsd-core
```

O instalador interativo guiará você em 3 passos simples:
1. **Seleção de Idioma (i18n):** O instalador detecta o idioma do sistema e recomenda `1) Português (Brasil)` ou `2) English`. Todos os prompts, menus e logs seguintes serão apresentados no idioma escolhido.
2. **Seleção de Runtime:** Detecta ou permite escolher seu ambiente (Antigravity `~/.gemini/config`, DeepSeek Harness `~/.dsh`, Claude Code, OpenCode, Codex, Copilot, Cursor, Windsurf, Kimi CLI, Kilo, etc. — 19 runtimes suportados).
3. **Escopo de Instalação:** Escolha entre **Global** (disponível em todos os projetos) ou **Local** (apenas no projeto atual).

> **Dica — Instalação Direta (One-Liner):** Se preferir rodar sem perguntas no terminal:
> ```bash
> npx github:carlosatec/gsd-core --antigravity --global --lang=pt-br
> ```

### Desinstalação e Limpeza Segura

Para desinstalar o GSD Core Nexus de forma limpa de qualquer ou de todos os runtimes:

```bash
# Desinstalar de todos os runtimes globalmente:
npx github:carlosatec/gsd-core --all --global --uninstall

# Desinstalar de um runtime específico (ex: Antigravity):
npx github:carlosatec/gsd-core --antigravity --global --uninstall

# Desinstalar instalação local de projeto:
npx github:carlosatec/gsd-core --claude --local --uninstall
```

> [!NOTE]
> A desinstalação do GSD é totalmente não-destrutiva: ela remove apenas os arquivos de motor, hooks e manifestos do GSD, preservando seus arquivos de planejamento `.planning/`, configurações customizadas e `USER-PROFILE.md`.

---

## 3. Iniciando um Projeto

### Cenário A: Novo Projeto ou Projeto Existente
```bash
/gsd:status
```
O GSD analisa a árvore git, detecta o estado do repositório e guia a criação do `PROJECT.md`, `ROADMAP.md` e a primeira fase.

### Cenário B: Planejar Imediatamente
```bash
/gsd:plan
```
Gera a especificação e o plano da primeira fase com base no objetivo informado.

### Cenário C: Modernizar Projeto Legado
```bash
/gsd:migrate
```
Atualiza a estrutura e schemas para o padrão GSD Core Nexus 2.7 de forma 100% não-destrutiva.

---

## 4. A Interface Canônica dos 10 Comandos Unificados

No GSD 2.7, a superfície de comandos é estritamente consolidada em **10 comandos canônicos oficiais**, com todos os playbooks operacionais internos carregados sob demanda via contexto de execução:

```text
┌─────────────────────────────────────────────────────────────┐
│                 INTERFACE CANÔNICA GSD 2.7                  │
├────────────┬────────────────────────────────────────────────┤
│ Comando    │ Ação Operacional                               │
├────────────┼────────────────────────────────────────────────┤
│ /gsd:status│ Diagnóstico situacional, progresso e roadmap   │
│ /gsd:plan  │ Criação de plano detalhado com ondas e specs   │
│ /gsd:exec  │ Execução paralela em ondas com subagentes      │
│ /gsd:review│ Revisão estática de código com flag --fix      │
│ /gsd:verify│ Validação conversacional de UAT e Auto-Pass    │
│ /gsd:ship  │ Preparação de branch, PR e merge               │
│ /gsd:auto  │ Piloto automático (discuss → plan → exec loop) │
│ /gsd:tokens│ Painel visual de economia e uso de tokens      │
│ /gsd:migrate│ Modernização de projetos legados e grafo AST   │
│ /gsd:help  │ Guia completo de uso e consulta de comandos    │
└────────────┴────────────────────────────────────────────────┘
```

### 📋 O que cada comando faz em detalhes:

1. **`/gsd:status` — Diagnóstico Situacional e Roadmap:**
   - **O que faz:** Analisa o estado do repositório, verifica a fase ativa no `.planning/STATE.md`, detecta possíveis desvios de contexto (*context drift*) e exibe um resumo da telemetria de tokens.
   - **Quando usar:** No início de qualquer sessão ou quando tiver dúvida sobre qual é o próximo passo a ser executado.

2. **`/gsd:plan [N]` — Planejamento Atômico com AST e Specs:**
   - **O que faz:** Dispara a varredura AST na base de código, calcula a centralidade (PageRank) e o índice BM25 em `.planning/intel/`, alinha decisões técnicas no `SPEC.md` e decompõe a fase em tarefas atômicas distribuídas em ondas paralelas no `PLAN.md`.
   - **Quando usar:** Antes de iniciar o desenvolvimento de qualquer fase nova ou funcionalidade.

3. **`/gsd:exec [N]` — Execução em Ondas com Injeção JIT:**
   - **O que faz:** Executa as tarefas do plano onda por onda. Dispara verificações de pré-voo (*pre-flight guardrails*), injeta cirurgicamente apenas os tipos e dependências necessárias (JIT) e spawna subagentes com contexto limpo de 200k tokens que criam commits atômicos para cada tarefa.
   - **Quando usar:** Logo após aprovar o plano gerado pelo `/gsd:plan`.

4. **`/gsd:review [--fix]` — Auditoria Estática e Autocorreção:**
   - **O que faz:** Analisa todos os arquivos modificados na fase buscando regressões de estilo, complexidade ciclomática excessiva e anti-patterns. Com a flag `--fix`, aplica reparos autônomos de código automaticamente.
   - **Quando usar:** Ao término da execução das tarefas, antes de validar os critérios de aceitação.

5. **`/gsd:verify [N]` — Validação Conversacional de UAT & Auto-Pass:**
   - **O que faz:** Conduz um teste de aceitação conversacional (UAT) com o desenvolvedor, validando os requisitos da fase contra os critérios estabelecidos no `SPEC.md` e executando a suíte de testes automatizados com auto-pass de cobertura.
   - **Quando usar:** Após a conclusão e revisão do código, para atestar que a funcionalidade cumpre todos os requisitos de negócio.

6. **`/gsd:ship` — Entrega, Limpeza e Criação de PR:**
   - **O que faz:** Sanitiza a árvore git, garante que os testes finais passam, filtra commits internos de `.planning/`, faz o push da branch de trabalho e abre o Pull Request pronto para revisão humana e merge.
   - **Quando usar:** Ao finalizar e validar completamente uma fase ou marco do projeto.

7. **`/gsd:auto` — Piloto Automático Ponta a Ponta:**
   - **O que faz:** Modo autônomo que orquestra o ciclo completo sem intervenção manual intermediária: planeja a fase, executa as tarefas com guardrails de autocura, roda a revisão de código e prepara os entregáveis.
   - **Quando usar:** Para tarefas bem especificadas que você deseja que o agente resolva do início ao fim com máxima autonomia.

8. **`/gsd:tokens` — Painel Visual de Economia de Tokens:**
   - **O que faz:** Renderiza um painel ASCII em 65 colunas mostrando métricas em tempo real: total de invocações, taxa de economia de contexto JIT (em média 80-90%), picos de consumo (*bursts*) e distribuição de uso por comando.
   - **Quando usar:** Para monitorar a eficiência de custos e consumo de contexto em projetos de médio e grande porte.

9. **`/gsd:migrate` — Modernização Não-Destrutiva de Projetos:**
   - **O que faz:** Faz backup seguro de versões antigas do GSD, converte schemas e roadmaps legados para o formato moderno de ondas, roda o analisador Universal 360° AST e gera a pasta `.planning/intel/` com o grafo de dependências e documentação viva (`ARCHITECTURE.md` e `APIS.md`).
   - **Quando usar:** Ao trazer para o GSD Nexus 2.7 um projeto que usava versões antigas do GSD ou que estava sem a estrutura `intel/`.

10. **`/gsd:help` — Guia Interativo de Ajuda:**
    - **O que faz:** Lista os 10 comandos canônicos, sintaxes aceitas por cada runtime e flags disponíveis.
    - **Quando usar:** Sempre que precisar consultar parâmetros ou atalhos de sintaxe.

> **Compatibilidade de Sintaxe:** O GSD aceita múltiplos formatos nativos por runtime: `/gsd:plan`, `/gsd-plan`, `$gsd-plan` ou `gsd plan`. Comandos antigos/descontinuados fora dos 10 oficiais são rejeitados de forma segura e orientadora.

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

O GSD Core analisa estaticamente seu repositório sem dependência de compiladores pesados:

* **Mais de 35 Tecnologias & Extensões Nativas:** TypeScript, JavaScript, Python, Go, Rust, C#, Java, PHP, Ruby, C/C++, SQL/DDL, Prisma, GraphQL, CSS/SCSS/LESS, HTML/Vue/Svelte, Dockerfile, Shell Script, YAML.
* **📱 Suporte Nativo Mobile 360°:**
  - **iOS (Swift & SwiftUI):** Parser AST nativo para `.swift`, `.m`, `.mm` extraindo `struct`, `class`, `protocol`, `enum`, `extension`, `func` e componentes SwiftUI (`View`, `body: some View`). Reconhece `Package.swift`, `Podfile`, `Info.plist` e scaffolds `XCTestCase`.
  - **Android (Kotlin & Jetpack Compose):** Detecção automática de `@Composable fun` (como componentes de UI), `sealed class`, `object` (singletons), `@HiltViewModel` (serviços de injeção de dependência) e `suspend fun`. Suporta `build.gradle.kts`, `settings.gradle.kts` e `AndroidManifest.xml`.
  - **Executores Mobile Automáticos:** Detecção inteligente para `swift test`, `xcodebuild test`, `./gradlew test` e `gradle test`.
* **🌐 Grafo de Conhecimento 100% Nativo (Zero Python — D-31):** O motor Graphify foi implementado integralmente em TypeScript puro (`2.3-native`), gerando e consultando `codebase-graph.json` em milissegundos sem requerer interpretador Python externo.
* **Cache Incremental por `mtime`:** Compara timestamps de modificação dos arquivos, reprocessando apenas arquivos alterados e acelerando varreduras em até **85%**.
* **Modo Lite & Otimização Auto-PageRank:** Em repositórios compactos (< 50 arquivos), o GSD utiliza scoring direto de grau, eliminando cálculos iterativos desnecessários.
* **Scaffolding de Testes Poliglota:** Gera esqueletos de teste respeitando as convenções da linguagem (Swift XCTest, Kotlin/Java JUnit 5, Go `_test.go`, Rust `#[cfg(test)]`, Dart `test/*_test.dart`, Python `test_*.py`, Node `.test.cjs`).
* **Documentação Viva (Living Docs):** Gera e valida automaticamente:
  - `.planning/codebase/ARCHITECTURE.md` (topologia de módulos e grafo de dependências)
  - `.planning/codebase/APIS.md` (catálogo de tipos exportados, structs e rotas HTTP)
* **Prevenção de Desvio de Docs:** Validação contínua pós-commit sem recálculo custoso de $O(n^2)$.

---

## 7. Injeção Cirúrgica de Contexto (JIT) & RAG Semântico Okapi BM25

Em vez de saturar a janela de contexto da LLM com centenas de linhas irrelevantes, o motor JIT:

1. **Consulta o Grafo AST Ordenado por PageRank:** Identifica módulos consumidores e dependências diretas ordenados por centralidade arquitetural.
2. **Extrai Assinaturas de Contratos:** Alimenta apenas interfaces, structs e cabeçalhos de função exportados, ocultando corpos de implementação de arquivos vizinhos.
3. **Injeta Âncoras Canônicas de Arquitetura:** Seleciona automaticamente o arquivo de referência mais representativo do projeto para orientar o estilo de codificação.
4. **Motor RAG Semântico Okapi BM25 (D-33):**
   - **Calibragem Matemática:** Parâmetros ($k_1 = 1.5, b = 0.75$) com saturação de frequência de termos e normalização pelo tamanho médio dos documentos (`avgdl`).
   - **Tokenizador de Código Poliglota:** Divide identificadores em `camelCase`, `PascalCase`, `kebab-case` e `snake_case`.
   - **Cobertura Universal:** Indexa mais de 35 formatos de arquivo excluindo caches pesados (`Pods`, `.gradle`, `DerivedData`, `.build`, `node_modules`).
5. **Anexa Decisões Ativas:** Injeta apenas ADRs relevantes de `STATE.md` via parser nativo de decisões.
6. **⚡ Hook Automático de Contexto de Sessão (D-30):** Injeta automaticamente o briefing do projeto (≤ 15 linhas) em `GEMINI.md`, `AGENTS.md` ou regras a cada invocação, eliminando a cegueira de contexto.

**Resultado:** O modelo recebe um bloco compacto `<jit_context>` com 100% de sinal e consumo mínimo de tokens.

---

## 8. Segurança Pré-Voo: Guardrails, Anti-Patterns & Self-Healing

Para garantir que as edições da IA jamais quebrem o repositório:

* **Diffing AST Pré-Voo em Memória:** Simula patches em memória antes da escrita em disco. Se uma edição remove uma função exportada consumida por outro módulo, o patch é bloqueado (`CONTRACT_BREAK`).
* **DFS com Limite de Profundidade (1.000 Nós):** Previne loops infinitos ou estouro de pilha em grafos com dependências circulares.
* **Proteção contra Arquivos Vazios (`EMPTY_FILE_GUARD`):** Intercepta alucinações ou quedas de stream da IA que poderiam zerar arquivos (`UNINTENDED_TRUNCATION`).
* **Guardrails de Qualidade e UI/UX (D-34):**
  - **No `/gsd:plan`:** Executa análise de lacunas (gap analysis) alertando sobre requisitos não mapeados.
  - **No `/gsd:review`:** Alerta sobre complexidade ciclomática (> 15) e varre interfaces procurando cores fixadas sem tokens ou botões sem rótulos de acessibilidade (`aria-label`).
  - **No `/gsd:verify`:** Dispara `autoPassed: true` automaticamente quando a cobertura e asserções dos testes atingem 100%.
* **Autorização de Co-Evolução:** Quando uma função e seus chamadores são modificados no mesmo commit atômico, o pré-voo aprova a mudança sem falsos positivos.
* **Laço de Auto-Cura (Self-Healing):** Se um teste falhar durante a execução, o subagente entra em um laço autônomo de reparo (até 3 tentativas) para diagnosticar e corrigir a falha.
* **Armazenamento de Anti-Patterns entre Sessões:** Toda correção bem-sucedida é gravada em `.planning/intel/anti-patterns.json` com busca indexada (`errorQuery`), impedindo reincidência de erros.

---

## 9. Telemetria e Observabilidade de Tokens (`/gsd:tokens`)

Acompanhe a economia de tokens e uso de contexto em tempo real:

```bash
/gsd:tokens
```

**Saída no Terminal (65 Colunas):**
```text
┌─────────────────────────────────────────────────────────────┐
│ ⚡ GSD Core Nexus Telemetria de Tokens (Observabilidade)     │
├─────────────────────────────────────────────────────────────┤
│ • Total de Invocações:   42     execuções                   │
│ • Tokens Utilizados (JIT): 84.500   tokens                  │
│ • Monolítico Evitado:    820.000    tokens                  │
│ • Tokens Economizados:   735.500    tokens                  │
│ • Eficiência Média:      89.7 % contexto economizado        │
│ • Pico por Invocação:    3.200  tokens                      │
├─────────────────────────────────────────────────────────────┤
│ 🔀 Distribuição por Comando:                                │
│ • exec     [████████░░░░]  60% (50.700 tokens)              │
│ • plan     [███░░░░░░░░░]  20% (16.900 tokens)              │
│ • review   [███░░░░░░░░░]  20% (16.900 tokens)              │
└─────────────────────────────────────────────────────────────┘
```

---

## 10. Inteligência de Sessão & CLI de Replay Determinístico

O GSD 2.6 grava automaticamente eventos append-only de execução para todos os 10 comandos canônicos em `.planning/intel/sessions/session_<timestamp>_<uuid>.jsonl`.

### Recursos Principais:
- **Smart Trimming de 32 KB:** Saídas longas de comandos e stack traces preservam o início (16 KB) e o fim (16 KB) com marcadores informativos `... [truncated N bytes] ...`, eliminando estouro de disco sem perder a causa-raiz de falhas.
- **Sanitização de Segredos:** Chaves de API (`sk-*`, `ghp_*`, Bearer tokens) são automaticamente mascaradas por regex antes da gravação no disco.
- **Ring Buffer (50 sessões / 30 dias):** Retenção generosa de até 50 sessões / 30 dias (~25-40 MB) 100% confinada e ignorada no Git.

### Comandos de Replay (`gsd-tools session`):

```bash
# 1. Reproduzir a última sessão no terminal
node gsd-core/bin/gsd-tools.cjs session replay latest

# 2. Visualizar em modo resumo (1 linha por passo)
node gsd-core/bin/gsd-tools.cjs session replay latest --summary

# 3. Filtrar apenas erros e ferramentas com falha
node gsd-core/bin/gsd-tools.cjs session replay latest --errors-only

# 4. Exibir diffs e patches de arquivos modificados
node gsd-core/bin/gsd-tools.cjs session replay latest --diffs

# 5. Exportar relatório completo da sessão em Markdown
node gsd-core/bin/gsd-tools.cjs session export latest --md

# 6. Listar todas as sessões gravadas ou limpar antigas
node gsd-core/bin/gsd-tools.cjs session list
node gsd-core/bin/gsd-tools.cjs session clean --max 50 --days 30
```

---

## 11. Sistema Unificado de Versionamento & Release

O GSD Core Nexus 2.7 conta com um orquestrador automatizado de release em 1 único comando (`scripts/bump-version.cjs`):

```bash
# 1. Elevar a versão em todos os 49 manifestos, módulos core, lockfiles e badges
npm run version:bump 2.7.0

# 2. Verificar se o repositório está em sincronismo lockstep estrito
npm run version:check

# 3. Pré-visualizar alterações sem gravar no disco (Dry-Run)
node scripts/bump-version.cjs 2.7.0 --dry-run
```

---

## 12. Exemplo Passo a Passo: Construindo uma Feature do Zero

Acompanhe um fluxo completo de desenvolvimento no GSD:

### Passo 1: Verificar o Estado Atual
```bash
/gsd:status
```
> O GSD lê o status do git e o `STATE.md`, exibindo a fase ativa e o próximo passo recomendado.

### Passo 2: Planejar a Fase
```bash
/gsd:plan
```
> O planejador analisa o grafo AST, cria as ondas de tarefas no `PLAN.md` e estabelece os critérios de aceitação.

### Passo 3: Executar as Tarefas
```bash
/gsd:exec
```
> Subagentes executam as ondas em paralelo com contexto JIT. Se um teste falhar, a auto-cura age automaticamente.

### Passo 4: Rodar Revisão de Código com Auto-Fix
```bash
/gsd:review --fix
```
> O GSD revisa os arquivos alterados, detecta problemas de tipagem/estilo e aplica correções automáticas.

### Passo 5: Validar a Entrega (UAT)
```bash
/gsd:verify
```
> O agente percorre os pontos de verificação conversacional e confirma a aprovação da fase.

### Passo 6: Finalizar e Abrir PR
```bash
/gsd:ship
```
> Valida a árvore de trabalho, executa verificações finais, faz push da branch e abre o Pull Request!

---

## 🎯 Tabela Resumo de Comandos Rápidos

| O que você deseja fazer? | Comando recomendado |
|---|---|
| Verificar situação / Próxima ação | `/gsd:status` |
| Planejar a próxima fase | `/gsd:plan` |
| Executar tarefas planejadas | `/gsd:exec` |
| Auditar e reparar código | `/gsd:review --fix` |
| Validar entregáveis (UAT) | `/gsd:verify` |
| Ver painel de economia de tokens | `/gsd:tokens` |
| Replay da última sessão de IA | `node gsd-core/bin/gsd-tools.cjs session replay latest` |
| Exportar post-mortem de sessão | `node gsd-core/bin/gsd-tools.cjs session export latest --md` |
| Elevar versão do ecossistema | `npm run version:bump <version>` |
| Verificar sincronização do repo | `npm run version:check` |
| Desinstalar o GSD com segurança | `npx github:carlosatec/gsd-core --all --global --uninstall` |
| Enviar branch / Abrir PR | `/gsd:ship` |
| Autopilot autônomo | `/gsd:auto` |
| Modernizar projeto legado | `/gsd:migrate` |
| Ver ajuda e lista de comandos | `/gsd:help` |

---

*GSD Core Nexus 2.7 — Desenvolva com precisão cirúrgica, zero context rot, observabilidade causal e máxima eficiência.*
