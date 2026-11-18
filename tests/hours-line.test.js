// 1. の欄の下の、週の労働時間の線のテスト: node --test tests/*.test.js（yorozu-plans の QUEUE Q-526）
// 境目の 20 時間と 4 分の 3 は judge.js の MIN_WEEKLY_HOURS・THREE_QUARTERS の 1 か所に置き、判定と図（hoursLines）が同じ名前を読む。
// 期待値の 20・0.75 は日本年金機構「短時間労働者に対する健康保険・厚生年金保険の適用の拡大」（2026-11-18 に確認）から写した。コードに合わせて変えない
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const J = require('../judge.js');

const T = '2026-11-18';
const base = { fullTimeHours: '40', daysThreeQuarter: 'no', overTwoMonths: 'yes', student: 'none', employer: '51+' };

test('境目の値は原文のとおり（週 20 時間・正社員の 4 分の 3）', () => {
  assert.equal(J.MIN_WEEKLY_HOURS, 20);
  assert.equal(J.THREE_QUARTERS, 0.75);
  assert.equal(J.DEFAULT_FULLTIME, 40);
});

test('刻みは 0.5 と 5。0.5 は index.html の #weekly-hours の step と同じ', () => {
  assert.equal(J.HOURS_STEP, 0.5);
  assert.equal(J.HOURS_BIG_STEP, 5);
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const m = html.match(/<input[^>]*id="weekly-hours"[^>]*>/);
  assert.ok(m, '#weekly-hours が在る');
  assert.equal(Number(m[0].match(/step="([^"]+)"/)[1]), J.HOURS_STEP);
});

// 図の境目の線 ＝ judge の 2 つの数（正社員 40・35・37.5 と、欄が空）
[['40', 40, 30], ['35', 35, 26.25], ['37.5', 37.5, 28.125], ['', 40, 30]].forEach(([ft, max, tq]) => {
  test(`正社員 ${ft || '空'} → 横の端 ${max}・線 20 と ${tq}`, () => {
    assert.deepEqual(J.hoursLines(ft), { max, min: 20, threeQuarter: tq });
  });
});

// 判定が図と同じ線で切り替わる（20 時間の線: 1 刻み手前は対象外、線の上は対象）
test('20 時間の線で、判定が切り替わる', () => {
  const lines = J.hoursLines('40');
  assert.equal(J.judge({ ...base, weeklyHours: lines.min - J.HOURS_STEP }, T).status, 'not');
  assert.equal(J.judge({ ...base, weeklyHours: lines.min }, T).status, 'covered');
});

// 4 分の 3 の線（日数も 4 分の 3 以上・10 人以下の会社: 規模の条件で対象外 → 線の上で規模に関係なく対象）
['40', '35', '37.5'].forEach((ft) => {
  test(`正社員 ${ft}: 4 分の 3 の線で、判定が切り替わる`, () => {
    const lines = J.hoursLines(ft);
    const a = { ...base, fullTimeHours: ft, daysThreeQuarter: 'yes', employer: '1-10' };
    assert.equal(J.judge({ ...a, weeklyHours: lines.threeQuarter - 0.01 }, T).status, 'not');
    assert.equal(J.judge({ ...a, weeklyHours: lines.threeQuarter }, T).status, 'covered');
  });
});
