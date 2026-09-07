# Referência de Recursos do GSD

Visão em Português dos recursos centrais do GSD.  
Para catálogo completo e detalhamento exaustivo, consulte [FEATURES.md em inglês](../FEATURES.md).

---

## Recursos principais

- **Desenvolvimento orientado por fases** com artefatos de planejamento versionados
- **Engenharia de contexto** para reduzir degradação de qualidade em sessões longas
- **Planejamento em tarefas atômicas** para execução mais previsível
- **Execução em ondas paralelas** com controle por dependências
- **Commits atômicos por tarefa** para rastreabilidade e rollback
- **Verificação pós-execução** com foco em objetivos da fase
- **UAT guiado** via `/gsd-verify-work`
- **Suporte brownfield** com `/gsd-onboard` e `/gsd-map-codebase`
- **Workstreams** para trilhas paralelas sem colisão de estado
- **Backlog, seeds e threads** para memória de médio/longo prazo

## Qualidade e segurança

- **Plan-check** antes de executar
- **Nyquist validation** para mapear requisito -> validação automatizada
- **Detecção de prompt injection** em entradas do usuário
- **Prevenção de path traversal** em caminhos fornecidos
- **Hooks de proteção** para alterações fora de contexto de workflow

## UX de frontend

- **`/gsd-ui-phase`**: contrato visual antes da execução
- **`/gsd-ui-review`**: auditoria visual em 6 pilares
- **UI safety gate** para uso de registries de terceiros

## Operação e manutenção

- **Perfis de modelo** (`quality`, `balanced`, `budget`, `inherit`)
- **Ajuste por toggles** para custo/qualidade/velocidade
- **Diagnóstico forense** com `/gsd-forensics`
- **Relatório de sessão** com `/gsd-pause-work --report`

## Novidades no GSD 3.2

- **Telemetria Holística de Tokens Multi-Comando (D-111 a D-121):** Monitoramento de tokens em `plan`, `exec` e `review` com lock transacional (`withFileLockSync`), deduplicação de `invocationId`, auto-estimador por arquivos físicos e dashboard em 65 colunas.
- **Review em Modo Duplo:** Suporte a `--full` / `--repo` para auditoria estática global de todo o repositório a custo zero de tokens com nós centrais de PageRank, ao lado da revisão seletiva cirúrgica via JIT (80-95% poupados).
- **Roteamento Unificado de CLI:** Execução direta de todos os 10 comandos canônicos via `node gsd-tools.cjs <comando>` (`status`, `plan`, `exec`, `review`, `verify`, `ship`, `auto`, `tokens`).
- **Guardrails Ancorados na Raiz:** Ancoragem de verificações em `path.resolve(root, p)`, imune a variações do diretório de trabalho.
- **Log Estruturado e Replay Determinístico de Sessão:** Replay de execuções com filtros (`--errors-only`, `--diffs`) e retenção segura em disco.
- **Suporte Nativo ao DeepSeek Harness:** Integração micro-kernel Cordis e MCP para modelos DeepSeek.

---

## Atalhos recomendados por cenário

| Cenário | Comandos |
|--------|----------|
| Projeto novo | `/gsd-new-project` -> `/gsd-discuss-phase` -> `/gsd-plan-phase` -> `/gsd-execute-phase` |
| Correção rápida | `/gsd-quick` |
| Código existente | `/gsd-onboard` -> handoffs para `/gsd-map-codebase`, `/gsd-ingest-docs`, `/gsd-new-project` |
| Fechamento de release | `/gsd-audit-milestone` -> `/gsd-complete-milestone` |

---

> [!NOTE]
> Este arquivo é uma versão de referência rápida em Português para facilitar uso diário. Para detalhes de baixo nível, requisitos formais e comportamento completo de cada recurso, use o documento original em inglês.
