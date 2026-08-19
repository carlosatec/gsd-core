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
| **5. 🔄 Auto-Upgrade & Telemetria JIT** | Assistente `/gsd:migrate` para modernizar projetos legados e rastreamento de tokens poupados em tempo real. | Migra qualquer projeto antigo em segundos e exibe métricas de eficiência no `/gsd:status`. |

---

## 🧭 Interface Unificada (6 Comandos Chave + 1 Piloto Automático + Migração)

Você pode interagir com o GSD no nível de automação que preferir:

### 🤖 Modo Piloto Automático (`/gsd:auto`)
```bash
/gsd:auto              # Executa todo o ciclo de ponta a ponta com guardrails e paradas apenas em checkpoints
```

### 🎮 Os 6 Comandos Chave de Controle Manual
| Comando | O que ele faz |
| :--- | :--- |
| **`/gsd:status`** | Diagnostica a posição no `STATE.md`, exibe métricas de telemetria JIT e indica a próxima ação. |
| **`/gsd:plan`** | Cria o plano de tarefas atômicas (`PLAN.md`) organizado em ondas com critérios de verificação. |
| **`/gsd:exec`** | Executa o plano com paralelização de ondas, JIT context e commits atômicos por tarefa. |
| **`/gsd:review`** | Revisa qualidade de código, segurança e drift documental (`--fix` para auto-correção). |
| **`/gsd:verify`** | Conduz validação conversacional (UAT) e checa conformidade com os requisitos da fase. |
| **`/gsd:ship`** | Prepara o Pull Request, roda testes de integração e finaliza a release. |
| **`/gsd:migrate`** | *(Novo)* Moderniza um projeto legado ou sem AST para o formato GSD 2.1 Universal instantaneamente. |

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
