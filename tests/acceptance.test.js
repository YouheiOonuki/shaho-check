// ACCEPTANCE 2.3（子ども・子育て支援金）のうち shaho-check の保険料の目安の 1 行: node --test tests/*.test.js
// 期待値は yorozu-plans の docs/ACCEPTANCE.md 2.3（Fable が一次資料から独立に起こした表、2026-10-01）から写した。
// 出典: こども家庭庁「医療保険制度ごとの年収別試算（令和8年度）」、被用者保険は 標準報酬月額 × 0.23% × 1/2。
// 行 6・7 は 2.3 の表の下の本文（標準報酬月額 30万円 → 345 円、50万円 → 575 円）。seido-keisan の tests/acceptance.test.js と同じ数え方。
// コードに合わせて期待値を変えない。
const test = require('node:test');
const assert = require('node:assert/strict');
const { estimatePremium, RATES } = require('../judge.js');

test('ACCEPTANCE 2.3 支援金率: 0.23% の本人負担分（1/2）', () => {
  assert.equal(Math.round(RATES.kosodate * 1e6), 1150);   // 0.115%
});
[[300000, 345], [500000, 575]].forEach(([wage, yen], i) => {
  test(`ACCEPTANCE 2.3 行 ${6 + i}（標準報酬月額）: ${wage.toLocaleString()} 円 × 0.23% × 1/2 → 子ども・子育て支援金 ${yen} 円`, () => {
    assert.equal(estimatePremium(wage).kosodate, yen);
  });
});
