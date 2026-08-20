'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const install = require('../bin/install.js');
const {
  detectSystemLanguage,
  buildLanguagePromptText,
  parseLanguageInput,
} = install;

describe('Installer Interactive Language Prompt (Decision D-09)', () => {
  it('should build prompt text containing Portuguese and English options', () => {
    const text = buildLanguagePromptText();
    assert.match(text, /Português \(Brasil\)/);
    assert.match(text, /English/);
  });

  it('should parse 1 as pt-br and 2 as en', () => {
    assert.equal(parseLanguageInput('1'), 'pt-br');
    assert.equal(parseLanguageInput(' 1 '), 'pt-br');
    assert.equal(parseLanguageInput('2'), 'en');
    assert.equal(parseLanguageInput(' 2 '), 'en');
  });

  it('should fallback to default when empty input provided', () => {
    const defaultChoice = detectSystemLanguage() === 'pt-br' ? 'pt-br' : 'en';
    assert.equal(parseLanguageInput(''), defaultChoice);
    assert.equal(parseLanguageInput(null), defaultChoice);
  });
});
