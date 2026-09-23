// ===========================
// 画面の制御：入力が変わるたびに判定して結果を表示する（ボタン不要）
// 入力内容は保存も送信もしない
// ===========================
(function () {
  'use strict';

  var form = document.getElementById('check-form');
  var el = {
    result: document.getElementById('result'),
    title: document.getElementById('result-title'),
    reasons: document.getElementById('result-reasons'),
    notesWrap: document.getElementById('result-notes-wrap'),
    notes: document.getElementById('result-notes'),
    premiumWrap: document.getElementById('premium-wrap'),
    pension: document.getElementById('p-pension'),
    health: document.getElementById('p-health'),
    kosodate: document.getElementById('p-kosodate'),
    total: document.getElementById('p-total'),
  };

  // 今日の日付（端末の日付。YYYY-MM-DD）
  function todayIso() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function radio(name) {
    var c = form.querySelector('input[name="' + name + '"]:checked');
    return c ? c.value : '';
  }

  function fillList(ul, items) {
    ul.textContent = '';
    items.forEach(function (t) {
      var li = document.createElement('li');
      li.textContent = t;
      ul.appendChild(li);
    });
  }

  function yen(n) { return n.toLocaleString('ja-JP') + '円'; }

  function update() {
    var hours = form.weeklyHours.value;
    var employer = radio('employer');
    // 必須の2問（時間と勤務先の規模）に答えるまでは結果を出さない
    if (hours === '' || !employer) {
      el.result.hidden = true;
      return;
    }

    var r = window.ShahoJudge.judge({
      weeklyHours: hours,
      fullTimeHours: form.fullTimeHours.value,
      daysThreeQuarter: radio('daysThreeQuarter'),
      overTwoMonths: radio('overTwoMonths'),
      student: radio('student'),
      employer: employer,
    }, todayIso());

    el.result.className = 'card result ' + r.status;
    el.title.textContent = r.title;
    fillList(el.reasons, r.reasons);
    fillList(el.notes, r.notes);
    el.notesWrap.hidden = r.notes.length === 0;

    // 保険料の目安は「対象」または「確認が必要」のときだけ出す
    var p = window.ShahoJudge.estimatePremium(form.monthlyWage.value);
    if (p && r.status !== 'not') {
      el.pension.textContent = yen(p.pension);
      el.health.textContent = yen(p.health);
      el.kosodate.textContent = yen(p.kosodate);
      el.total.textContent = '約 ' + yen(p.total);
      el.premiumWrap.hidden = false;
    } else {
      el.premiumWrap.hidden = true;
    }

    el.result.hidden = false;
  }

  form.addEventListener('input', update);
  form.addEventListener('change', update);
  // Enter キーでフォームが送信（ページ再読み込み）されないようにする
  form.addEventListener('submit', function (e) { e.preventDefault(); });
  update();

  // 判定の根拠：確認日・出典・料率の時点を表示し、確認日から6か月（183日）たったら注意を出す
  var J = window.ShahoJudge;
  var c = J.CHECKED.split('-');
  var checked = document.getElementById('checked-date');
  checked.dateTime = J.CHECKED;
  checked.textContent = c[0] + '年' + Number(c[1]) + '月' + Number(c[2]) + '日';
  document.getElementById('rates-asof').textContent = J.RATES.asOf;
  var ul = document.getElementById('sources');
  J.SOURCES.forEach(function (src) {
    var li = document.createElement('li');
    var a = document.createElement('a');
    a.href = src.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.textContent = src.name;
    li.appendChild(a); ul.appendChild(li);
  });
  document.getElementById('stale-warning').hidden = J.daysSinceChecked(todayIso()) < 183;
})();
