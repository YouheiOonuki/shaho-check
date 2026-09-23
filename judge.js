// ===========================
// 社会保険（厚生年金・健康保険）加入判定ロジック
// 画面から切り離した純粋関数。ブラウザでは window.ShahoJudge、Node では module.exports で使う。
//
// 根拠（2026年9月時点で確認した制度）:
// - 短時間労働者の賃金要件（月額8.8万円以上）は 2026年10月1日に撤廃
// - 企業規模要件（厚生年金の被保険者数）は段階的に縮小:
//     現行 51人以上 → 2027年10月 36人以上 → 2029年10月 21人以上 → 2032年10月 11人以上 → 2035年10月 撤廃
// - 残る要件: 週の所定労働時間20時間以上 / 2か月を超える雇用見込み / 学生でない（夜間・通信・定時制は対象）
// - 正社員の所定労働時間・日数の4分の3以上なら、企業規模に関係なく被保険者（4分の3基準）
// ===========================
(function (root) {
  'use strict';

  // 賃金要件の撤廃日
  var WAGE_ABOLISHED = '2026-10-01';

  // 企業規模要件の段階（その日以降、この人数以上の会社が対象）。null は規模要件なし
  var SIZE_STEPS = [
    { from: '2016-10-01', min: 501 },
    { from: '2022-10-01', min: 101 },
    { from: '2024-10-01', min: 51 },
    { from: '2027-10-01', min: 36 },
    { from: '2029-10-01', min: 21 },
    { from: '2032-10-01', min: 11 },
    { from: '2035-10-01', min: null },
  ];

  // 会社規模の選択肢 → その区分の最小人数（「わからない」「個人事業所」は別扱い）
  var SIZE_MIN = { '51+': 51, '36-50': 36, '21-35': 21, '11-20': 11, '1-10': 1 };

  // 指定日時点の企業規模要件（人数の下限。null なら要件なし）
  function sizeThresholdAt(date) {
    var min = SIZE_STEPS[0].min;
    for (var i = 0; i < SIZE_STEPS.length; i++) {
      if (date >= SIZE_STEPS[i].from) min = SIZE_STEPS[i].min;
    }
    return min;
  }

  // その規模区分の会社が企業規模要件を満たすようになる日（すでに満たしていれば null を返さず最初に満たした日）
  function sizeCoveredFrom(sizeKey) {
    var n = SIZE_MIN[sizeKey];
    for (var i = 0; i < SIZE_STEPS.length; i++) {
      var min = SIZE_STEPS[i].min;
      if (min === null || n >= min) return SIZE_STEPS[i].from;
    }
    return null;
  }

  function formatYm(iso) {
    var p = iso.split('-');
    return p[0] + '年' + Number(p[1]) + '月';
  }

  /**
   * 判定する
   * @param {object} a 回答
   *   weeklyHours    週の所定労働時間（契約上の時間）
   *   fullTimeHours  正社員の週の所定労働時間（未入力なら40）
   *   daysThreeQuarter 月の勤務日数が正社員の4分の3以上か 'yes' | 'no' | 'unknown'
   *   overTwoMonths  2か月を超えて働く見込みか 'yes' | 'no'
   *   student        'none' | 'daytime' | 'other'（夜間・通信・定時制・休学中）
   *   employer       '51+' | '36-50' | '21-35' | '11-20' | '1-10' | 'unknown' | 'sole'（個人事業所）
   * @param {string} today 判定日 'YYYY-MM-DD'
   * @returns {{status:'covered'|'not'|'check', title:string, reasons:string[], notes:string[], coveredFrom:string|null}}
   */
  function judge(a, today) {
    var reasons = [];
    var notes = [];
    var hours = Number(a.weeklyHours);
    var fullTime = Number(a.fullTimeHours) || 40;

    if (!(hours > 0)) {
      return { status: 'check', title: '週の労働時間を入力してください', reasons: [], notes: [], coveredFrom: null };
    }

    // 2か月以内の短期雇用は（更新の見込みがなければ）対象外
    if (a.overTwoMonths === 'no') {
      reasons.push('雇用期間が2か月以内の見込みのため、原則として加入の対象外です。');
      notes.push('契約の更新が見込まれる場合（「更新する場合がある」と書かれているなど）は、最初から対象になることがあります。');
      return { status: 'not', title: '加入の対象外の可能性が高いです', reasons: reasons, notes: notes, coveredFrom: null };
    }

    // 4分の3基準：正社員並みに働く人は、会社の規模や学生かどうかに関係なく加入
    var hoursThreeQuarter = hours >= fullTime * 0.75;
    if (hoursThreeQuarter && a.daysThreeQuarter === 'yes') {
      reasons.push('週の労働時間（' + hours + '時間）が正社員（' + fullTime + '時間）の4分の3以上で、勤務日数も4分の3以上です。');
      reasons.push('この場合は会社の規模に関係なく、通常の被保険者として加入します（学生でも同じです）。');
      return { status: 'covered', title: '加入の対象です', reasons: reasons, notes: notes, coveredFrom: null };
    }
    if (hoursThreeQuarter && a.daysThreeQuarter === 'unknown') {
      notes.push('勤務日数も正社員の4分の3以上なら、会社の規模に関係なく加入の対象です。勤務先に確認してください。');
    }

    // ここからは短時間労働者の要件
    if (hours < 20) {
      reasons.push('週の所定労働時間が20時間未満のため、対象外です。');
      notes.push('判定は契約上の時間で行います。実際の労働時間が契約を超える状態が続くと、対象になることがあります。');
      return { status: 'not', title: '加入の対象外です', reasons: reasons, notes: notes, coveredFrom: null };
    }
    reasons.push('週の所定労働時間が20時間以上です。');

    if (a.student === 'daytime') {
      reasons.push('昼間の学生は、短時間労働者としての加入の対象外です。');
      notes.push('卒業後も同じ条件で働き続ける場合や、休学中・夜間・通信制・定時制の場合は対象になります。');
      return { status: 'not', title: '加入の対象外です', reasons: reasons, notes: notes, coveredFrom: null };
    }

    if (today < WAGE_ABOLISHED) {
      notes.push('2026年9月までは「月額賃金8.8万円以上」の条件もあります。この条件は2026年10月1日になくなります。');
    } else {
      reasons.push('2026年10月から、月の給与額（8.8万円以上）の条件はなくなりました。');
    }

    // 会社の規模
    if (a.employer === 'sole') {
      notes.push('個人経営の事業所は、業種や人数によって扱いが異なります。勤務先に確認してください。');
      return { status: 'check', title: '勤務先への確認が必要です', reasons: reasons, notes: notes, coveredFrom: null };
    }
    if (a.employer === 'unknown' || !SIZE_MIN[a.employer]) {
      var th = sizeThresholdAt(today);
      notes.push('いまは、厚生年金に加入している従業員が' + th + '人以上の会社が対象です。人数は勤務先に確認してください。');
      notes.push('人数が足りない会社でも、労使の合意で任意に加入の対象にしている場合があります。');
      return { status: 'check', title: '会社の規模しだいで対象になります', reasons: reasons, notes: notes, coveredFrom: null };
    }

    var from = sizeCoveredFrom(a.employer);
    if (from && from <= today) {
      reasons.push('勤務先の規模が、いまの対象（' + sizeThresholdAt(today) + '人以上）に入っています。');
      return { status: 'covered', title: '加入の対象です', reasons: reasons, notes: notes, coveredFrom: null };
    }
    reasons.push('勤務先の規模が、いまはまだ対象（' + sizeThresholdAt(today) + '人以上）に入っていません。');
    notes.push(formatYm(from) + 'から、この規模の会社も対象になります（同じ働き方を続けている場合）。');
    notes.push('人数が足りない会社でも、労使の合意で任意に加入の対象にしている場合があります。');
    return { status: 'not', title: 'いまは対象外です（' + formatYm(from) + 'から対象）', reasons: reasons, notes: notes, coveredFrom: from };
  }

  // 保険料（本人負担）のざっくりした目安。料率は変わるので「目安」として表示する
  var RATES = {
    pension: 0.0915,   // 厚生年金 18.3% の本人負担分
    health: 0.05,      // 健康保険（協会けんぽの全国平均 約10%）の本人負担分の目安
    care: 0.008,       // 介護保険（40〜64歳、約1.6%）の本人負担分の目安
    pensionFloor: 88000, // 厚生年金の標準報酬月額の下限
    healthFloor: 58000,  // 健康保険の標準報酬月額の下限
  };

  function estimatePremium(monthlyWage, age40to64) {
    var w = Number(monthlyWage);
    if (!(w > 0)) return null;
    var pension = Math.round(Math.max(w, RATES.pensionFloor) * RATES.pension);
    var healthBase = Math.max(w, RATES.healthFloor);
    var health = Math.round(healthBase * RATES.health);
    var care = age40to64 ? Math.round(healthBase * RATES.care) : 0;
    return { pension: pension, health: health, care: care, total: pension + health + care };
  }

  var api = { judge: judge, estimatePremium: estimatePremium, sizeThresholdAt: sizeThresholdAt, sizeCoveredFrom: sizeCoveredFrom, RATES: RATES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ShahoJudge = api;
})(this);
