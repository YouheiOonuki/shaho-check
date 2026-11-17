// 結果の下の年表（規模の条件が下がる階段と印）のテスト: node --test tests/*.test.js（yorozu-plans の QUEUE Q-383）
// 印の節目は「いつから」の文と同じ sizeCoveredFrom から取る。規模で対象にならない人には印を置かない
const test = require('node:test');
const assert = require('node:assert/strict');
const { judge, sizeTimeline, sizeCoveredFrom, sizeThresholdAt } = require('../judge.js');

const base = { weeklyHours: 25, fullTimeHours: 40, daysThreeQuarter: 'no', overTwoMonths: 'yes', student: 'none' };
const T = '2026-11-18';
function tl(a, today) { return sizeTimeline(a, judge(a, today), today); }

test('段は 2026年10月の 51人以上から、節目 4 つで すべて まで', () => {
  const s = tl({ ...base, employer: '51+' }, T).steps;
  assert.deepEqual(s.map((x) => x.from), ['2026-10-01', '2027-10-01', '2029-10-01', '2032-10-01', '2035-10-01']);
  assert.deepEqual(s.map((x) => x.min), [51, 36, 21, 11, null]);
  s.forEach((x) => assert.equal(x.min, sizeThresholdAt(x.from)));   // judge.js の表と同じ
});

// 規模 8 通り × 規模で決まる（週25時間）・規模のほかの条件で対象外（週19時間）
const CASES = [
  ['51+', '2026-10-01'], ['36-50', '2027-10-01'], ['21-35', '2029-10-01'], ['11-20', '2032-10-01'], ['1-10', '2035-10-01'],
  ['public', '2026-10-01'], ['sole', null], ['unknown', null],
];
CASES.forEach(([employer, want]) => {
  test(`${employer}・週25時間 → 印 ${want}`, () => {
    const a = { ...base, employer };
    assert.equal(tl(a, T).mark, want);
    const r = judge(a, T);
    if (r.coveredFrom) assert.equal(tl(a, T).mark, r.coveredFrom);   // 「いつから」の文と同じ節目
  });
  test(`${employer}・週19時間（対象外）→ 印なし`, () => {
    assert.equal(tl({ ...base, employer, weeklyHours: 19 }, T).mark, null);
  });
});

test('昼間の学生・2か月以内は、規模が下がっても印なし', () => {
  assert.equal(tl({ ...base, employer: '21-35', student: 'daytime' }, T).mark, null);
  assert.equal(tl({ ...base, employer: '21-35', overTwoMonths: 'no' }, T).mark, null);
});

test('4分の3基準でいま対象の人は、規模が小さくても いちばん左から', () => {
  assert.equal(tl({ ...base, employer: '1-10', weeklyHours: 32, daysThreeQuarter: 'yes' }, T).mark, '2026-10-01');
  assert.equal(sizeCoveredFrom('1-10'), '2035-10-01');
});

test('今日 2027-09-30: 2027年10月の節目はまだ。36〜50人は対象外で印は 2027年10月', () => {
  const a = { ...base, employer: '36-50' };
  const t = tl(a, '2027-09-30');
  assert.deepEqual(t.steps.slice(1).map((x) => x.passed), [false, false, false, false]);
  assert.equal(judge(a, '2027-09-30').status, 'not');
  assert.equal(t.mark, '2027-10-01');
});

test('今日 2027-10-01: 2027年10月の節目を過ぎた。36〜50人は対象で印は 2027年10月のまま', () => {
  const a = { ...base, employer: '36-50' };
  const t = tl(a, '2027-10-01');
  assert.deepEqual(t.steps.slice(1).map((x) => x.passed), [true, false, false, false]);
  assert.equal(judge(a, '2027-10-01').status, 'covered');
  assert.equal(t.mark, '2027-10-01');
});
