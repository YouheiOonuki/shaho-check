// ===========================
// 社会保険（厚生年金・健康保険）加入判定ロジック
// 画面から切り離した純粋関数。ブラウザでは window.ShahoJudge、Node では module.exports で使う。
//
// 根拠（一次情報。確認日は CHECKED）:
// - 令和7年年金制度改正法（社会経済の変化を踏まえた年金制度の機能強化のための国民年金法等の一部を改正する等の法律。令和7年6月13日成立）
// - 短時間労働者の賃金要件（月額8.8万円以上）は 2026年（令和8年）10月に撤廃（日本年金機構「適用拡大のご案内」）
// - 企業規模要件（厚生年金の被保険者数）: 51人以上 → 2027年10月 36人以上 → 2029年10月 21人以上 → 2032年10月 11人以上 → 2035年10月 撤廃
//   （厚生労働省「社会保険適用拡大 特設サイト」の判定と同じ区分）
// - 国・地方公共団体に属する事業所は、人数に関係なく対象
// - 残る要件: 週の所定労働時間20時間以上 / 2か月を超える雇用見込み / 学生でない
//   （夜間・定時制・通信制・休学中・卒業後も同じ事業所に勤める予定の人などは学生でも対象。厚生年金保険法施行規則第9条の6）
// - 週の所定労働時間または月の所定労働日数が正社員の4分の3未満の人が「短時間労働者」。両方4分の3以上なら規模に関係なく被保険者
// ===========================
(function (root) {
  'use strict';

  // 一次情報を確認した日と出典（画面の「判定の根拠」にも表示する）
  var CHECKED = '2026-09-23';
  var SOURCES = [
    { name: '日本年金機構「短時間労働者に対する健康保険・厚生年金保険の適用拡大のご案内」', url: 'https://www.nenkin.go.jp/oshirase/topics/2021/0219.html' },
    { name: '日本年金機構「短時間労働者に対する健康保険・厚生年金保険の適用の拡大」', url: 'https://www.nenkin.go.jp/service/kounen/tekiyo/jigyosho/tanjikan.html' },
    { name: '日本年金機構 年金Q&A「学生」とはどのような者を指すのですか', url: 'https://www.nenkin.go.jp/section/faq/kounen/tekiyoukakudai/tanjikan/gakusei02.html' },
    { name: '厚生労働省「社会保険適用拡大 特設サイト」', url: 'https://www.mhlw.go.jp/tekiyoukakudai/' },
    { name: '厚生労働省「年金制度改正法（令和7年法律）」', url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000147284_00017.html' },
  ];

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
   *   employer       '51+' | '36-50' | '21-35' | '11-20' | '1-10' | 'public'（国・地方公共団体） | 'unknown' | 'sole'（個人事業所）
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
      notes.push('卒業後も同じ事業所で働く予定の人、休学中・夜間・定時制・通信制の人、社会人大学院生などは、学生でも対象になります。');
      return { status: 'not', title: '加入の対象外です', reasons: reasons, notes: notes, coveredFrom: null };
    }

    if (today < WAGE_ABOLISHED) {
      notes.push('2026年9月までは「月額賃金8.8万円以上」の条件もあります。この条件は2026年10月になくなります。');
    } else {
      reasons.push('2026年10月から、月の給与額（8.8万円以上）の条件はなくなりました。');
    }

    // 会社の規模
    if (a.employer === 'public') {
      reasons.push('国・地方公共団体に属する事業所は、人数に関係なく対象です。');
      return { status: 'covered', title: '加入の対象です', reasons: reasons, notes: notes, coveredFrom: null };
    }
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

  // 保険料（本人負担・月額）の目安。月の給与を「標準報酬月額」の等級に当てはめ、その等級の額 × 料率 ÷ 2 で出す
  // （協会けんぽ・日本年金機構の保険料額表と同じ計算。seido-keisan の /shienkin/ とも同じ値・同じ端数処理）
  // 料率は毎年春に見直されるので、変わったら更新する（README の保守手順）。PREMIUM_CHECKED は下の値を原文で確かめた日
  var PREMIUM_CHECKED = '2026-09-25';
  var PREMIUM_SOURCES = [
    { name: '協会けんぽ「令和8年3月分（4月納付分）からの健康保険・厚生年金保険の保険料額表」（東京支部。等級と報酬月額の区切りは全国共通）', url: 'https://www.kyoukaikenpo.or.jp/assets/R8_13tokyo.pdf' },
    { name: '協会けんぽ「令和8年度保険料率のお知らせ」（平均保険料率 9.9%）', url: 'https://www.kyoukaikenpo.or.jp/lp/2026hokenryou/' },
    { name: '日本年金機構「保険料額表（令和2年9月分〜）」令和8年度版（厚生年金 1〜32 等級）', url: 'https://www.nenkin.go.jp/service/kounen/hokenryo/ryogaku/ryogakuhyo/20200825.html' },
    { name: '日本年金機構「厚生年金保険の保険料」（標準報酬月額の決め方・報酬に含まれるもの）', url: 'https://www.nenkin.go.jp/service/kounen/hokenryo/hoshu/20150515-01.html' },
  ];

  var RATES = {
    asOf: '2026年4月',
    pension: 18.3,       // 厚生年金保険料率（%、労使の合計。平成29年9月分から）
    health: 9.9,         // 健康保険料率（%、協会けんぽの令和8年度の平均保険料率。都道府県ごとに違う。東京は 9.85%）
    kosodate: 0.23,      // 子ども・子育て支援金率（%、令和8年4月分から）
  };

  // 標準報酬月額の等級表（健康保険 1〜50 等級）: [この報酬月額未満なら, 標準報酬月額]。最後の行は 1,355,000円以上
  // 協会けんぽの保険料額表（令和8年3月分から）の「報酬月額」欄を写したもの（seido-keisan の lib/ikukyu-values.js と同じ）
  var GRADES_KENPO = [
    [63000, 58000], [73000, 68000], [83000, 78000], [93000, 88000], [101000, 98000], [107000, 104000],
    [114000, 110000], [122000, 118000], [130000, 126000], [138000, 134000], [146000, 142000], [155000, 150000],
    [165000, 160000], [175000, 170000], [185000, 180000], [195000, 190000], [210000, 200000], [230000, 220000],
    [250000, 240000], [270000, 260000], [290000, 280000], [310000, 300000], [330000, 320000], [350000, 340000],
    [370000, 360000], [395000, 380000], [425000, 410000], [455000, 440000], [485000, 470000], [515000, 500000],
    [545000, 530000], [575000, 560000], [605000, 590000], [635000, 620000], [665000, 650000], [695000, 680000],
    [730000, 710000], [770000, 750000], [810000, 790000], [855000, 830000], [905000, 880000], [955000, 930000],
    [1005000, 980000], [1055000, 1030000], [1115000, 1090000], [1175000, 1150000], [1235000, 1210000],
    [1295000, 1270000], [1355000, 1330000], [Infinity, 1390000],
  ];
  // 厚生年金（1〜32 等級）は 88,000円（93,000円未満）〜 650,000円（635,000円以上）。間の区切りは健康保険と同じ
  // （日本年金機構の令和8年度版の額表）。上限は 2027年9月に 68万円、2028年9月に 71万円、2029年9月に 75万円へ上がる
  // （令和7年年金制度改正法。厚生労働省）。新しい等級の報酬月額の区切りは未確認なので、ここはまだ 65万円のまま
  var PENSION_MIN = 88000, PENSION_MAX = 650000;

  function gradeKenpo(wage) {
    for (var i = 0; i < GRADES_KENPO.length; i++) if (wage < GRADES_KENPO[i][0]) return GRADES_KENPO[i][1];
    return GRADES_KENPO[GRADES_KENPO.length - 1][1];
  }
  function gradePension(wage) { return Math.min(PENSION_MAX, Math.max(PENSION_MIN, gradeKenpo(wage))); }

  // 標準報酬月額（円）× 料率（%）÷ 2 を銭の整数で。等級の額は 1,000円単位なので、料率を 0.001% 単位の整数にすれば割り切れる
  function halfSen(hyojun, ratePct) { return hyojun * Math.round(ratePct * 1000) / 2 / 1000; }
  // 給与から引くときの本人負担分: 50銭以下切り捨て、50銭を超えたら切り上げ（保険料額表の注①）
  function deductYen(sen) { var y = Math.floor(sen / 100), r = sen - y * 100; return r > 50 ? y + 1 : y; }

  function estimatePremium(monthlyWage) {
    var w = Number(monthlyWage);
    if (!(w > 0)) return null;
    var hk = gradeKenpo(w), hp = gradePension(w);
    var pension = deductYen(halfSen(hp, RATES.pension));
    var health = deductYen(halfSen(hk, RATES.health));
    var kosodate = deductYen(halfSen(hk, RATES.kosodate));
    return { hyojunKenpo: hk, hyojunPension: hp, pension: pension, health: health, kosodate: kosodate, total: pension + health + kosodate };
  }

  // 最終確認日から何日たったか（古い情報の注意を出すため）
  function daysSinceChecked(today) {
    return Math.floor((Date.parse(today) - Date.parse(CHECKED)) / 86400000);
  }

  var api = { judge: judge, estimatePremium: estimatePremium, gradeKenpo: gradeKenpo, gradePension: gradePension, deductYen: deductYen, GRADES_KENPO: GRADES_KENPO, PREMIUM_CHECKED: PREMIUM_CHECKED, PREMIUM_SOURCES: PREMIUM_SOURCES, sizeThresholdAt: sizeThresholdAt, sizeCoveredFrom: sizeCoveredFrom, daysSinceChecked: daysSinceChecked, RATES: RATES, CHECKED: CHECKED, SOURCES: SOURCES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ShahoJudge = api;
})(this);
