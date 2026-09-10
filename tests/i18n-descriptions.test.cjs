/**
 * Tests for i18n Command Descriptions and Localized Autocomplete in GSD 2.1 Universal.
 */

'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const i18n = require('../gsd-core/bin/lib/i18n-descriptions.cjs');
const converters = require('../gsd-core/bin/lib/runtime-artifact-conversion.cjs');

const { normalizeLanguage, getCommandDescription } = i18n;
const { convertClaudeCommandToAntigravitySkill } = converters;

describe('i18n-descriptions', () => {
  test('normalizes language inputs correctly', () => {
    assert.strictEqual(normalizeLanguage('en'), 'en');
    assert.strictEqual(normalizeLanguage('EN'), 'en');
    assert.strictEqual(normalizeLanguage('pt-br'), 'pt-br');
    assert.strictEqual(normalizeLanguage('pt'), 'pt-br');
    assert.strictEqual(normalizeLanguage('PT_BR'), 'pt-br');
    assert.strictEqual(normalizeLanguage('portugues'), 'pt-br');
    assert.strictEqual(normalizeLanguage(null), 'en');
    assert.strictEqual(normalizeLanguage(undefined), 'en');
  });

  test('resolves English descriptions as default', () => {
    assert.strictEqual(
      getCommandDescription('plan', 'en'),
      'Create detailed phase execution plan with verification loop'
    );
    assert.strictEqual(
      getCommandDescription('status', 'en'),
      'Check project progress, context drift, and JIT token efficiency'
    );
    assert.strictEqual(
      getCommandDescription('tokens', 'en'),
      'Real-time token telemetry dashboard, compression ratio, and JIT savings breakdown'
    );
    assert.strictEqual(
      getCommandDescription('migrate', 'en'),
      'Upgrade legacy project to GSD Core Nexus 3.4 architecture'
    );
  });

  test('resolves Portuguese BR descriptions when pt-br is selected', () => {
    assert.strictEqual(
      getCommandDescription('plan', 'pt-br'),
      'Criar plano de execução detalhado da fase com ciclo de verificação'
    );
    assert.strictEqual(
      getCommandDescription('status', 'pt-br'),
      'Verificar progresso do projeto, drift de contexto e economia de tokens JIT'
    );
    assert.strictEqual(
      getCommandDescription('tokens', 'pt-br'),
      'Dashboard de telemetria de tokens em tempo real, taxa de compressão e economia JIT'
    );
    assert.strictEqual(
      getCommandDescription('migrate', 'pt-br'),
      'Modernizar projeto legado para a arquitetura GSD Core Nexus 3.4'
    );
    assert.strictEqual(
      getCommandDescription('review', 'pt-br'),
      'Revisar arquivos alterados contra bugs, segurança e auto-corrigir com --fix'
    );
  });

  test('keeps command name intact in skill frontmatter while localizing description', () => {
    const rawCommand = `---
name: gsd:plan
description: Original generic description
---
<objective>Plan phase</objective>
`;

    // 1. In English
    process.env.GSD_LANG = 'en';
    const enSkill = convertClaudeCommandToAntigravitySkill(rawCommand, 'gsd-plan');
    assert.ok(enSkill.includes('name: gsd-plan'));
    assert.ok(enSkill.includes('description: "Create detailed phase execution plan with verification loop"'));

    // 2. In Portuguese (Brazil)
    process.env.GSD_LANG = 'pt-br';
    const ptSkill = convertClaudeCommandToAntigravitySkill(rawCommand, 'gsd-plan');
    assert.ok(ptSkill.includes('name: gsd-plan')); // Command name is UNCHANGED
    assert.ok(ptSkill.includes('description: "Criar plano de execução detalhado da fase com ciclo de verificação"')); // Description is translated
  });
});
