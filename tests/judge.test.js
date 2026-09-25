// 判定ロジックのテスト: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { judge, estimatePremium, sizeThresholdAt, sizeCoveredFrom, deductYen, gradeKenpo, GRADES_KENPO, PREMIUM_SOURCES } = require('../judge.js');
// 1 項目 = 1 テスト。got と want が同じであることを確かめる
function eq(name, got, want) { test(name, () => assert.equal(got, want)); }
const base = { weeklyHours: 25, fullTimeHours: 40, daysThreeQuarter: 'no', overTwoMonths: 'yes', student: 'none', employer: '51+' };
const T = '2026-10-01';

// 規模要件の段階
eq('9月末は51人', sizeThresholdAt('2026-09-30'), 51);
eq('2027/9/30は51人', sizeThresholdAt('2027-09-30'), 51);
eq('2027/10/1は36人', sizeThresholdAt('2027-10-01'), 36);
eq('2029/10/1は21人', sizeThresholdAt('2029-10-01'), 21);
eq('2032/10/1は11人', sizeThresholdAt('2032-10-01'), 11);
eq('2035/10/1は撤廃', sizeThresholdAt('2035-10-01'), null);
eq('36-50人は2027/10から', sizeCoveredFrom('36-50'), '2027-10-01');
eq('1-10人は2035/10から', sizeCoveredFrom('1-10'), '2035-10-01');

// 基本
eq('51人以上・週25h → 対象', judge(base, T).status, 'covered');
eq('週20hちょうど → 対象', judge({ ...base, weeklyHours: 20 }, T).status, 'covered');
eq('週19.5h → 対象外', judge({ ...base, weeklyHours: 19.5 }, T).status, 'not');
eq('2か月以内 → 対象外', judge({ ...base, overTwoMonths: 'no' }, T).status, 'not');
eq('昼間学生 → 対象外', judge({ ...base, student: 'daytime' }, T).status, 'not');
eq('夜間・通信 → 対象', judge({ ...base, student: 'other' }, T).status, 'covered');

// 規模
eq('36-50人 → 今は対象外', judge({ ...base, employer: '36-50' }, T).status, 'not');
eq('36-50人 → 2027/10から', judge({ ...base, employer: '36-50' }, T).coveredFrom, '2027-10-01');
eq('36-50人 → 2027/10時点で対象', judge({ ...base, employer: '36-50' }, '2027-10-01').status, 'covered');
eq('人数わからない → 確認', judge({ ...base, employer: 'unknown' }, T).status, 'check');
eq('個人事業所 → 確認', judge({ ...base, employer: 'sole' }, T).status, 'check');

// 4分の3基準（規模・学生に関係なく加入）
const full = { ...base, weeklyHours: 30, daysThreeQuarter: 'yes' };
eq('4分の3・10人以下 → 対象', judge({ ...full, employer: '1-10' }, T).status, 'covered');
eq('4分の3・昼間学生 → 対象', judge({ ...full, student: 'daytime' }, T).status, 'covered');
eq('週29.5hは4分の3未満・10人以下 → 対象外', judge({ ...full, weeklyHours: 29.5, employer: '1-10' }, T).status, 'not');
eq('正社員35hなら26.25hで4分の3', judge({ ...full, weeklyHours: 26.25, fullTimeHours: 35, employer: '1-10' }, T).status, 'covered');
eq('日数が4分の3未満なら規模で判定', judge({ ...full, daysThreeQuarter: 'no', employer: '1-10' }, T).status, 'not');

// 賃金要件の注記（9月まではあり、10月からはなし）
eq('9月は8.8万円の注記あり', judge(base, '2026-09-30').notes.some(s => s.includes('8.8万円')), true);
eq('10月は撤廃の説明', judge(base, T).reasons.some(s => s.includes('なくなりました')), true);

// 入力不足
eq('時間未入力 → check', judge({ ...base, weeklyHours: '' }, T).status, 'check');

// 国・地方公共団体は人数に関係なく対象（週20時間以上などは必要）
eq('国・地方公共団体 → 対象', judge({ ...base, employer: 'public' }, T).status, 'covered');
eq('国・地方公共団体でも週19hは対象外', judge({ ...base, employer: 'public', weeklyHours: 19 }, T).status, 'not');
eq('国・地方公共団体でも昼間学生は対象外', judge({ ...base, employer: 'public', student: 'daytime' }, T).status, 'not');

// 保険料の目安（標準報酬月額の等級で計算。D115）
eq('賃金なし → null', estimatePremium(''), null);
const p = estimatePremium(100000);
eq('10万円 → 等級 98,000円', p.hyojunKenpo, 98000);
eq('10万円: 厚生年金 98,000 × 9.15%', p.pension, 8967);
eq('10万円: 健康保険 98,000 × 4.95%', p.health, 4851);
eq('10万円: 支援金 98,000 × 0.115% = 112.7 → 113', p.kosodate, 113);
eq('10万円: 合計', p.total, 13931);
const low = estimatePremium(50000);
eq('5万円: 健康保険は 1 等級 58,000円', low.hyojunKenpo, 58000);
eq('5万円: 厚生年金は 1 等級 88,000円', low.hyojunPension, 88000);
// 最終確認日からの日数（6か月＝183日で古い情報の注意を出す）
const { daysSinceChecked, CHECKED, SOURCES } = require('../judge.js');
eq('確認日当日は0日', daysSinceChecked(CHECKED), 0);
eq('183日後', daysSinceChecked('2027-03-25'), 183);
eq('出典が5件以上', SOURCES.length >= 5, true);
eq('出典はすべて公式ドメイン', SOURCES.every(s => /^https:\/\/www\.(nenkin|mhlw)\.go\.jp\//.test(s.url)), true);

// D115（2026-09-25）: 目安を「月給 × 料率」から「標準報酬月額の等級 × 料率 ÷ 2」に直した（K77 で固定した額を置き換え）。
// 期待値は次の額表の「折半額」を写したもの（確認日 2026-09-25）:
//   厚生年金 … 日本年金機構「保険料額表」令和8年度版（18.300%）
//   支援金   … 協会けんぽ 令和8年3月分からの保険料額表（東京支部）の子ども・子育て支援金（0.23%）の折半額
//   健康保険 … 全国平均 9.9% の額表は無い（額表は都道府県ごと）ので、等級 × 4.95% を手で計算した値。
//              計算のしかたは東京支部の額表（9.85%）の折半額と全等級で一致することを別のテストで確かめる
// 給与から引く額は、折半額の 50銭以下切り捨て・50銭超切り上げ（額表の注①）
test('保険料の目安は標準報酬月額の等級で計算する', () => {
  const want = {
    // 月給: [健保の等級, 厚年の等級, 厚生年金, 健康保険, 支援金（折半額 → 円）, 合計]
    50000: [58000, 88000, 8052, 2871, 67, 10990],       // 支援金 66.7
    88000: [88000, 88000, 8052, 4356, 101, 12509],      // 101.2
    150000: [150000, 150000, 13725, 7425, 172, 21322],  // 172.5 は切り捨て
    300000: [300000, 300000, 27450, 14850, 345, 42645], // 345.0
    310000: [320000, 320000, 29280, 15840, 368, 45488], // 368.0（seido-keisan /shienkin/ と同じ）
  };
  for (const [w, v] of Object.entries(want)) {
    const r = estimatePremium(Number(w));
    assert.deepEqual([r.hyojunKenpo, r.hyojunPension, r.pension, r.health, r.kosodate, r.total], v, w);
  }
});
test('等級の境目（報酬月額の「以上・未満」）', () => {
  const want = [
    // [月給, 健保の等級, 厚年の等級]
    [1, 58000, 88000], [62999, 58000, 88000], [63000, 68000, 88000],
    [92999, 88000, 88000], [93000, 98000, 98000],          // 厚生年金 1 等級は 93,000円未満
    [309999, 300000, 300000], [310000, 320000, 320000],
    [634999, 620000, 620000], [635000, 650000, 650000],    // 厚生年金 32 等級は 635,000円以上
    [665000, 680000, 650000], [1354999, 1330000, 650000], [1355000, 1390000, 650000], [5000000, 1390000, 650000],
  ];
  for (const [w, k, n] of want) {
    const r = estimatePremium(w);
    assert.deepEqual([r.hyojunKenpo, r.hyojunPension], [k, n], String(w));
  }
  // 上限の等級の額（額表の折半額）: 厚生年金 59,475.00、支援金 1,598.5 → 1,598
  const top = estimatePremium(1355000);
  assert.deepEqual([top.pension, top.kosodate, top.health], [59475, 1598, 68805]);
});
test('50銭以下は切り捨て、50銭を超えたら切り上げ', () => {
  assert.equal(deductYen(17250), 172);
  assert.equal(deductYen(17251), 173);
  assert.equal(deductYen(11270), 113);
  assert.equal(deductYen(6670), 67);
  assert.equal(deductYen(34500), 345);
});
test('等級表は 50 等級で、額表の標準報酬月額と同じ', () => {
  assert.equal(GRADES_KENPO.length, 50);
  // 協会けんぽの額表（東京支部）の「標準報酬月額」欄
  const std = [58, 68, 78, 88, 98, 104, 110, 118, 126, 134, 142, 150, 160, 170, 180, 190, 200, 220, 240, 260, 280, 300, 320, 340, 360,
    380, 410, 440, 470, 500, 530, 560, 590, 620, 650, 680, 710, 750, 790, 830, 880, 930, 980, 1030, 1090, 1150, 1210, 1270, 1330, 1390];
  assert.deepEqual(GRADES_KENPO.map(r => r[1] / 1000), std);
  // 等級の下限（報酬月額 ○円以上）で、その等級になる
  for (let i = 1; i < GRADES_KENPO.length; i++) assert.equal(gradeKenpo(GRADES_KENPO[i - 1][0]), GRADES_KENPO[i][1]);
});
test('計算のしかたは東京支部の額表（健康保険 9.85%）の折半額と一致する', () => {
  // 額表の折半額（銭）: 等級 → 9.85% の折半額。いくつかの等級を写した
  const tokyo = { 58000: 285650, 98000: 482650, 150000: 738750, 320000: 1576000, 650000: 3201250, 1390000: 6845750 };
  for (const [h, sen] of Object.entries(tokyo)) assert.equal(Number(h) * 9850 / 2 / 1000, sen, h);
});
test('出典は協会けんぽ・日本年金機構', () => {
  assert.ok(PREMIUM_SOURCES.length >= 3);
  assert.ok(PREMIUM_SOURCES.every(s => /^https:\/\/www\.(kyoukaikenpo\.or|nenkin\.go)\.jp\//.test(s.url)));
});
test('支援金の行だけがリンクになっている', () => {
  const html = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /<tr><th><a href="\.\.\/seido-keisan\/shienkin\/">子ども・子育て支援金<\/a><\/th><td id="p-kosodate"><\/td><\/tr>/);
  assert.match(html, /<tr><th>厚生年金<\/th><td id="p-pension"><\/td><\/tr>/);
  assert.match(html, /<tr><th>健康保険<\/th><td id="p-health"><\/td><\/tr>/);
});
