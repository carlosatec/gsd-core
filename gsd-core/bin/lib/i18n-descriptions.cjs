"use strict";
/**
 * i18n Command Descriptions — English & Portuguese (Brazil) for GSD 2.1 Universal.
 *
 * Maintains universal English command names while providing localized descriptions
 * in the IDE slash-command autocomplete palette.
 */
const CANONICAL_COMMAND_DESCRIPTIONS = {
    status: {
        name: 'status',
        en: 'Check project progress, context drift, and JIT token efficiency',
        'pt-br': 'Verificar progresso do projeto, drift de contexto e economia de tokens JIT',
    },
    plan: {
        name: 'plan',
        en: 'Create detailed phase execution plan with verification loop',
        'pt-br': 'Criar plano de execução detalhado da fase com ciclo de verificação',
    },
    exec: {
        name: 'exec',
        en: 'Execute phase plans with wave-based parallelism and atomic commits',
        'pt-br': 'Executar planos da fase com paralelização em ondas e commits atômicos',
    },
    review: {
        name: 'review',
        en: 'Review changed files for bugs, security and auto-fix with --fix',
        'pt-br': 'Revisar arquivos alterados contra bugs, segurança e auto-corrigir com --fix',
    },
    verify: {
        name: 'verify',
        en: 'Validate built features through conversational UAT and acceptance tests',
        'pt-br': 'Validar funcionalidades através de UAT conversacional e testes de aceitação',
    },
    ship: {
        name: 'ship',
        en: 'Prepare release branch, run review and prepare for PR merge',
        'pt-br': 'Preparar branch de release, executar revisão e preparar para merge',
    },
    auto: {
        name: 'auto',
        en: 'Run end-to-end autonomous phase cycle with pre-flight safety checkpoints',
        'pt-br': 'Executar ciclo autônomo de fases de ponta a ponta com guardrails de segurança',
    },
    migrate: {
        name: 'migrate',
        en: 'Upgrade legacy project to GSD 2.1 Universal architecture',
        'pt-br': 'Modernizar projeto legado para a arquitetura GSD 2.1 Universal',
    },
    help: {
        name: 'help',
        en: 'Display GSD Core 2.1 commands and quick reference guide',
        'pt-br': 'Exibir comandos do GSD Core 2.1 e guia de referência rápida',
    },
};
/**
 * Normalizes input language code to 'en' or 'pt-br'.
 */
function normalizeLanguage(lang) {
    if (!lang)
        return 'en';
    const cleaned = String(lang).trim().toLowerCase();
    if (cleaned === 'pt' || cleaned === 'pt-br' || cleaned === 'pt_br' || cleaned === 'portugues' || cleaned === 'portuguese') {
        return 'pt-br';
    }
    return 'en';
}
/**
 * Resolves the localized description for a canonical command name.
 */
function getCommandDescription(commandName, lang = 'en') {
    const normalizedCmd = commandName
        .toLowerCase()
        .replace(/^[/\\$]/, '')
        .replace(/^gsd[:-]/, '')
        .trim();
    const entry = CANONICAL_COMMAND_DESCRIPTIONS[normalizedCmd];
    if (entry) {
        return entry[lang] || entry.en;
    }
    return '';
}
module.exports = {
    CANONICAL_COMMAND_DESCRIPTIONS,
    normalizeLanguage,
    getCommandDescription,
};
