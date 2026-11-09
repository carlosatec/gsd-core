const test = require('node:test');
const assert = require('node:assert/strict');
const coreUtils = require('../gsd-core/bin/lib/core-utils.cjs');

test('Phase 36 Wave 5: consolidated summary candidates pairing', async (t) => {
  const { countMatchedSummaries, findUnsummarizedPlans, findOrphanSummaries } = coreUtils;

  await t.test('pairs plans with consolidated phase summaries (e.g. 35-SUMMARY.md)', () => {
    const plans = ['35-01-PLAN.md', '35-02-PLAN.md'];
    const summaries = ['35-SUMMARY.md'];

    assert.equal(countMatchedSummaries(plans, summaries), 2);
    assert.deepEqual(findUnsummarizedPlans(plans, summaries), []);
    assert.deepEqual(findOrphanSummaries(plans, summaries), []);
  });

  await t.test('pairs zero-padded or unpadded phase prefixes accurately', () => {
    // 03-SUMMARY.md matching 03-01-PLAN.md
    assert.equal(countMatchedSummaries(['03-01-PLAN.md'], ['03-SUMMARY.md']), 1);
    assert.equal(countMatchedSummaries(['03-01-PLAN.md'], ['3-SUMMARY.md']), 1);

    // 3-PLAN-01 matching 3-SUMMARY.md or 03-SUMMARY.md
    assert.equal(countMatchedSummaries(['3-PLAN-01.md'], ['3-SUMMARY.md']), 1);
    assert.equal(countMatchedSummaries(['3-PLAN-01.md'], ['03-SUMMARY.md']), 1);
  });

  await t.test('does not pair stray or non-matching summaries', () => {
    const plans = ['35-01-PLAN.md'];
    const strays = ['35-FIX-CR02-SUMMARY.md', '35-GAPCLOSURE-SUMMARY.md', '99-SUMMARY.md'];

    assert.equal(countMatchedSummaries(plans, strays), 0);
    assert.deepEqual(findUnsummarizedPlans(plans, strays), ['35-01-PLAN.md']);
    assert.deepEqual(findOrphanSummaries(plans, strays), strays);
  });

  await t.test('handles sub-phases and letter suffixes (e.g. 03.1-01-PLAN.md)', () => {
    assert.equal(countMatchedSummaries(['03.1-01-PLAN.md'], ['03.1-SUMMARY.md']), 1);
    assert.equal(countMatchedSummaries(['3A-01-PLAN.md'], ['3A-SUMMARY.md']), 1);
  });
});

