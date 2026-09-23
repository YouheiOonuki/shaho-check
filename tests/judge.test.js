// 判定ロジックのテスト: node tests/judge.test.js
const { judge, estimatePremium, sizeThresholdAt, sizeCoveredFrom } = require('../judge.js');
let fail = 0, n = 0;
function eq(name, got, want) { n++; if (got !== want) { fail++; console.log('FAIL', name, '→', got, '（期待:', want + '）'); } }
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

// 保険料の目安（厚生労働省の試算と同じ料率）
eq('賃金なし → null', estimatePremium(''), null);
const p = estimatePremium(100000);
eq('10万円: 厚生年金 9.15%', p.pension, 9150);
eq('10万円: 健康保険 4.95%', p.health, 4950);
eq('10万円: 子ども・子育て支援金 0.115%', p.kosodate, 115);
eq('10万円: 合計', p.total, 14215);
const low = estimatePremium(50000);
eq('5万円: 厚生年金は下限8.8万で計算', low.pension, Math.round(88000 * 0.0915));
eq('5万円: 健康保険は下限5.8万で計算', low.health, Math.round(58000 * 0.0495));

// 最終確認日からの日数（6か月＝183日で古い情報の注意を出す）
const { daysSinceChecked, CHECKED, SOURCES } = require('../judge.js');
eq('確認日当日は0日', daysSinceChecked(CHECKED), 0);
eq('183日後', daysSinceChecked('2027-03-25'), 183);
eq('出典が5件以上', SOURCES.length >= 5, true);
eq('出典はすべて公式ドメイン', SOURCES.every(s => /^https:\/\/www\.(nenkin|mhlw)\.go\.jp\//.test(s.url)), true);

console.log(fail ? `\n${fail}/${n} failed` : `\n${n}/${n} passed`);
process.exit(fail ? 1 : 0);
