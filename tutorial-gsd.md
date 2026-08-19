# ⚡ Guia Prático do GSD Core 2.0 — Manual Completo e Sem Complicação

O **GSD (Get Shit Done) 2.0** é um sistema avançado de meta-prompting, engenharia de contexto e desenvolvimento guiado por especificações para agentes de IA. Ele transforma metas complexas em software testado e entregue através de fases disciplinadas, isolamento de contexto, inteligência AST em tempo real e commits atômicos.

---

## 🎯 Os 4 Pilares de Inteligência do GSD 2.0

| Pilar | Como Funciona | Benefício |
| :--- | :--- | :--- |
| **1. 🧠 Documentação Viva & AST Nativa** | Análise estática profunda em TypeScript/Node.js indexando símbolos, rotas e dependências. | A documentação (`ARCHITECTURE.md`, `APIS.md`) nunca fica desatualizada e reflete 100% o código real. |
| **2. 💉 Injeção Cirúrgica de Contexto (JIT)** | Injeta apenas contratos e assinaturas dos arquivos vizinhos relevantes para a tarefa. | Economiza até 85% de tokens e impede que a IA perca o contexto ou sofra alucinações. |
| **3. 🛡️ Pre-Flight Guardrails & Self-Healing** | Valida quebras de contratos antes de editar e corrige automaticamente falhas de testes. | Impede que a IA remova exportações essenciais silenciosamente e auto-repara bugs em até 3 tentativas. |
| **4. 🚀 Suíte Enxuta (6+1 Comandos)** | Interface simplificada focada em 6 operações manuais + 1 modo autônomo. | Elimina a confusão de 70 comandos, dando controle total ao usuário com comandos intuitivos. |

---

## 🧭 Interface Unificada (6 Comandos Chave + 1 Piloto Automático)

Você pode interagir com o GSD no nível de automação que preferir:

### 🤖 Modo Piloto Automático (`/gsd:auto`)
```bash
/gsd:auto              # Executa todo o ciclo de ponta a ponta com guardrails e paradas apenas em checkpoints
```

### 🎮 Os 6 Comandos Chave de Controle Manual
| Comando | O que ele faz |
| :--- | :--- |
| **`/gsd:status`** | Diagnostica a posição atual no `STATE.md`, valida o roadmap e indica a próxima ação. |
| **`/gsd:plan`** | Cria o plano de tarefas atômicas (`PLAN.md`) organizado em ondas com critérios de verificação. |
| **`/gsd:exec`** | Executa o plano com paralelização de ondas, JIT context e commits atômicos por tarefa. |
| **`/gsd:review`** | Revisa qualidade de código, segurança e quebras de contratos (`--fix` para auto-correção). |
| **`/gsd:verify`** | Conduz validação conversacional (UAT) e checa conformidade com os requisitos da fase. |
| **`/gsd:ship`** | Prepara o Pull Request, roda testes de integração e finaliza a release. |

> *Dica: Os comandos aceitam tanto `/gsd:comando` quanto `/gsd-comando` ou `$gsd-comando`.*

---

## 🚀 1. Modo: Projeto Novo do Zero (Greenfield)

1. **Inicializar o Projeto:**
   ```bash
   /gsd-new-project
   ```
   *A IA conduz uma entrevista técnica estruturada e gera o `PROJECT.md`, `ROADMAP.md` e `STATE.md`.*

2. **Especificar Contrato Visual (se houver interface gráfica):**
   ```bash
   /gsd-ui-phase
   ```

3. **Ciclo Completo da Fase:**
   * **Discutir:** `/gsd-discuss-phase` *(alinha dependências e arquitetura)*
   * **Planejar:** `/gsd:plan` *(cria o plano em ondas de execução)*
   * **Executar:** `/gsd:exec` *(codifica com guardrails pré-voo e commits rastreáveis)*
   * **Revisar:** `/gsd:review --fix` *(audita o código e auto-corrige eventuais problemas)*
   * **Verificar:** `/gsd:verify` *(testa critérios de aceitação e UAT)*
   * **Entregar:** `/gsd:ship` *(conclui a fase e abre PR)*

4. **Avançar para a Próxima Fase:**
   ```bash
   /gsd:status
   ```

---

## 🦅 2. Modo: Projeto Existente (Brownfield / Legado)

1. **Onboarding e Mapeamento:**
   ```bash
   /gsd-onboard
   ```
   *A IA escaneia o repositório, gera o grafo de dependências AST em `.planning/intel/` e cria a documentação viva em `.planning/codebase/`.*

2. **Criar uma Fase Específica no Roadmap:**
   ```bash
   /gsd-phase
   ```
   *Exemplo: "Refatorar camada de banco de dados" ou "Adicionar autenticação OAuth2".*

3. **Executar a Fase:**
   ```bash
   /gsd:plan ➔ /gsd:exec ➔ /gsd:review --fix ➔ /gsd:verify ➔ /gsd:ship
   ```

---

## 🧠 3. Consultas Rápidas e Inteligência AST via CLI

O GSD 2.0 disponibiliza comandos diretos no terminal via `gsd-tools`:

* **Atualizar/Sincronizar a Documentação Viva com o Código Real:**
  ```bash
  npx gsd-tools intel graph
  ```
* **Localizar Onde Qualquer Símbolo, Classe ou Interface Está Definida:**
  ```bash
  npx gsd-tools intel symbol AuthService
  ```
* **Consultar Quem Importa ou Depende de um Arquivo:**
  ```bash
  npx gsd-tools intel deps src/services/auth.ts
  ```

---

## 🛡️ 4. Qualidade, Auto-Cura (Self-Healing) e Debug

* **Revisão de Código com Correção Automática:**
  ```bash
  /gsd:review --fix
  ```
* **Gerar Testes Automatizados para a Fase:**
  ```bash
  /gsd-add-tests
  ```
* **Depuração Sistemática de Bugs:**
  ```bash
  /gsd-debug
  ```
  *(Ou `/gsd-debug --diagnose` para isolar a causa-raiz sem modificar o código imediatamente).*
* **Verificação de Segurança e Threat Model:**
  ```bash
  /gsd-secure-phase
  ```

---

## 🛑 5. Gestão, Segurança e Desfazer

* **Desfazer a Última Fase/Commit com Segurança:**
  ```bash
  /gsd-undo
  ```
* **Verificar Saúde da Estrutura de Planejamento:**
  ```bash
  /gsd-health
  ```
* **Executar Tarefa Rápida Pontual (Sem burocracia):**
  ```bash
  /gsd-quick "mensagem da tarefa"
  ```
* **Pausar Trabalho e Salvar Sessão:**
  ```bash
  /gsd-pause-work
  ```
* **Retomar Trabalho Anterior:**
  ```bash
  /gsd-resume-work
  ```

---

## 📁 6. Estrutura do Diretório `.planning/`

Toda a persistência e memória do projeto é mantida em arquivos de texto versionáveis pelo Git:

```
.planning/
├── PROJECT.md          # Visão, requisitos fundamentais e restrições
├── ROADMAP.md          # Roteiro das fases com status e critérios de sucesso
├── STATE.md            # Posição exata e decisões técnicas acumuladas
├── config.json         # Configurações do GSD e flags ativas
├── intel/
│   └── codebase-graph.json   # Grafo completo de símbolos AST, rotas e dependências
├── codebase/
│   ├── ARCHITECTURE.md       # Arquitetura viva gerada pela AST
│   ├── APIS.md               # Contratos de interfaces e tipos exportados
│   └── STACK.md              # Runtimes, frameworks e dependências
└── phases/
    ├── 01-living-docs/
    ├── 02-jit-context/
    ├── 03-preflight-guardrails/
    └── 04-unified-interface/
```

---

> [!TIP]
> **Em caso de dúvida:** Execute `/gsd:status` a qualquer momento. A IA lerá o estado atual e indicará com precisão o próximo passo a ser tomado!
