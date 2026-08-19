# ⚡ Guia Prático do GSD Core 2.1 Universal — Manual Completo e Sem Complicação

O **GSD (Get Shit Done) 2.1 Universal** é um sistema avançado de meta-prompting, engenharia de contexto e desenvolvimento guiado por especificações para agentes de IA. Ele transforma metas complexas em software testado e entregue através de fases disciplinadas, isolamento de contexto, inteligência AST universal (Full-Stack, Mobile, Dados & DevOps) e commits atômicos.

---

## 🎯 Os 5 Pilares de Inteligência do GSD 2.1 Universal

| Pilar | Como Funciona | Benefício |
| :--- | :--- | :--- |
| **1. 🧠 Motor AST Universal 360°** | Análise estática profunda em TypeScript/Node.js para **16+ ecossistemas** (TS/JS, Python, Go, Rust, Flutter, SQL, CSS, Docker, Shell, C#, Java, PHP, Ruby, C++). | A documentação viva (`ARCHITECTURE.md`, `APIS.md`) mapeia toda a topologia de código, dados, estilos e containers. |
| **2. 💉 Injeção Cirúrgica de Contexto (JIT)** | Injeta apenas contratos e assinaturas dos arquivos vizinhos relevantes para a tarefa. | Economiza até 85% de tokens e impede que a IA perca o contexto ou sofra alucinações. |
| **3. 🛡️ Pre-Flight Guardrails & Self-Healing** | Valida quebras de contratos antes de editar e corrige automaticamente falhas de testes. | Impede que a IA remova exportações essenciais silenciosamente e auto-repara bugs em até 3 tentativas. |
| **4. 🚀 Suíte Enxuta (6+1 Comandos)** | Interface simplificada focada em 6 operações manuais + 1 modo autônomo. | Elimina a confusão de 70 comandos legados, oferecendo controle total com comandos intuitivos. |
| **5. 🔄 Auto-Upgrade, i18n & Telemetria JIT** | Assistente `/gsd:migrate`, suporte bilíngue (`EN` / `PT-BR`) nas descrições de autocomplete e métricas de tokens. | Migra qualquer projeto antigo em segundos e adapta o menu da IDE ao seu idioma nativo. |

---

## 📦 Como Instalar & Selecionar o Idioma

Você pode instalar o GSD no seu agente favorito escolhendo o idioma das descrições do menu (`en` ou `pt-br`):

### 1. Instalação com Idioma em Português BR (Recomendado para desenvolvedores no Brasil)
```bash
npx gsd-core --antigravity --global --lang=pt-br
```

### 2. Instalação com Idioma Padrão em Inglês
```bash
npx gsd-core --antigravity --global --lang=en
```

> **Nota Importante:** Os nomes dos comandos permanecem **sempre em inglês** (ex: `gsd-plan`, `gsd-exec`, `gsd-status`), garantindo compatibilidade universal. Apenas as **descrições explicativas** exibidas no autocomplete da IDE são traduzidas.

---

## 🧭 Interface Unificada (6 Comandos Chave + 1 Piloto Automático + Migração)

| Comando (Nome Universal) | Descrição em Português (`--lang=pt-br`) | Descrição em Inglês (`--lang=en`) |
| :--- | :--- | :--- |
| **`/gsd:status`** | Verificar progresso do projeto, drift de contexto e economia de tokens JIT | Check project progress, context drift, and JIT token efficiency |
| **`/gsd:plan`** | Criar plano de execução detalhado da fase com ciclo de verificação | Create detailed phase execution plan with verification loop |
| **`/gsd:exec`** | Executar planos da fase com paralelização em ondas e commits atômicos | Execute phase plans with wave-based parallelism and atomic commits |
| **`/gsd:review`** | Revisar arquivos alterados contra bugs, segurança e auto-corrigir com `--fix` | Review changed files for bugs, security and auto-fix with `--fix` |
| **`/gsd:verify`** | Validar funcionalidades através de UAT conversacional e testes de aceitação | Validate built features through conversational UAT and acceptance tests |
| **`/gsd:ship`** | Preparar branch de release, executar revisão e preparar para merge | Prepare release branch, run review and prepare for PR merge |
| **`/gsd:auto`** | Executar ciclo autônomo de fases de ponta a ponta com guardrails de segurança | Run end-to-end autonomous phase cycle with pre-flight safety checkpoints |
| **`/gsd:migrate`** | Modernizar projeto legado para a arquitetura GSD 2.1 Universal | Upgrade legacy project to GSD 2.1 Universal architecture |

> *Dica: Os comandos aceitam tanto `/gsd:comando` quanto `/gsd-comando` ou `$gsd-comando`.*

---

## 🌐 Ecossistema Multi-Linguagem Suportado Nativo

O motor AST analisa de forma nativa e sem necessidade de compiladores ou runtimes externos:

* **Mobile & Web:** Flutter / Dart (`.dart`), HTML, Vue (`.vue`), Svelte (`.svelte`), TSX, JSX.
* **Estilos & Design Tokens:** CSS, SCSS, SASS, LESS (`--var` custom properties, classes e keyframes).
* **Bancos de Dados & Schemas:** MySQL, PostgreSQL, SQLite (`.sql`), Prisma ORM (`.prisma`).
* **DevOps & Containers:** Docker (`Dockerfile`), Docker Compose (`docker-compose.yml`, `compose.yaml`), Shell/Bash (`.sh`, `.bash`, `.zsh`).
* **Backend & Sistemas:** Python (`.py`), Go (`.go`), Rust (`.rs`), C# / .NET (`.cs`), Java / Kotlin (`.java`, `.kt`), PHP (`.php`), Ruby (`.rb`), C / C++ (`.c`, `.cpp`, `.h`, `.hpp`).
* **Contratos de API:** GraphQL (`.graphql`, `.gql`), OpenAPI / Swagger (`.yaml`, `.json`).

---

## 🚀 1. Modo: Projeto Novo do Zero (Greenfield)

1. **Inicializar o Projeto:**
   ```bash
   /gsd-new-project
   ```
2. **Ciclo Completo da Fase:**
   * **Planejar:** `/gsd:plan` *(cria o plano em ondas de execução)*
   * **Executar:** `/gsd:exec` *(codifica com guardrails e commits rastreáveis)*
   * **Revisar:** `/gsd:review --fix` *(audita o código e auto-corrige desvios)*
   * **Verificar:** `/gsd:verify` *(testa critérios de aceitação e UAT)*
   * **Entregar:** `/gsd:ship` *(conclui a fase e abre PR)*

---

## 🦅 2. Modo: Projeto Existente ou Legado (Brownfield & Upgrade)

1. **Fazer Auto-Upgrade para GSD 2.1 Universal:**
   ```bash
   /gsd:migrate
   ```
   *Varre todo o repositório, detecta todas as linguagens/containers/bancos e gera a pasta `.planning/intel/` e a documentação viva em `.planning/codebase/`.*

2. **Verificar Status e Eficiência:**
   ```bash
   /gsd:status
   ```
   *Exibe o roadmap e o percentual de tokens economizados pela injeção JIT.*

3. **Executar Novas Fases:**
   ```bash
   /gsd:plan ➔ /gsd:exec ➔ /gsd:review --fix ➔ /gsd:verify ➔ /gsd:ship
   ```

---

## 📁 3. Estrutura do Diretório `.planning/`

```
.planning/
├── PROJECT.md          # Visão, requisitos fundamentais e restrições
├── ROADMAP.md          # Roteiro das fases com status e critérios de sucesso
├── STATE.md            # Posição exata e decisões técnicas acumuladas
├── intel/
│   ├── codebase-graph.json   # Grafo universal de símbolos, rotas, tabelas e containers
│   └── telemetry.json        # Métricas de telemetria de economia de tokens JIT
├── codebase/
│   ├── ARCHITECTURE.md       # Arquitetura viva gerada pela AST multi-linguagem
│   ├── APIS.md               # Contratos de interfaces, rotas e tipos exportados
│   └── STACK.md              # Runtimes, frameworks e dependências
└── phases/
    ├── 01-living-docs/
    ├── 02-jit-context/
    ├── 03-preflight-guardrails/
    ├── 04-unified-interface/
    └── 05-multi-language-and-upgrade/
```
