// ===========================
// 画面の制御：入力が変わるたびに判定して結果を表示する（ボタン不要）
// 入力内容は保存も送信もしない
// ===========================
(function () {
  'use strict';

  var form = document.getElementById('check-form');
  var el = {
    result: document.getElementById('result'),
    body: document.getElementById('result-body'),
    title: document.getElementById('result-title'),
    reasons: document.getElementById('result-reasons'),
    notesWrap: document.getElementById('result-notes-wrap'),
    notes: document.getElementById('result-notes'),
    premiumWrap: document.getElementById('premium-wrap'),
    pension: document.getElementById('p-pension'),
    health: document.getElementById('p-health'),
    kosodate: document.getElementById('p-kosodate'),
    total: document.getElementById('p-total'),
    grade: document.getElementById('p-grade'),
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

  // 上端の固定バー（screen.js。yorozu-plans の SCREEN.md 1.1・D59）: 判定が出て、結果が画面の外にあるときだけ判定の見出しを出す
  var bar = window.YorozuScreen.fixedBar({ bar: 'fixbar', watch: 'result-title', jump: 'result', text: 'fixbar-text' });

  // --- 結果の下の年表: 規模の条件が下がる階段と、勤務先が対象に入る節目の印（段・節目・印は ShahoJudge.sizeTimeline） ---
  var SVGNS = 'http://www.w3.org/2000/svg';
  var W = 520, L = 110, R = 14, TOP = 22, GAP = 38, AXIS = 196, HGT = 252;
  function months(iso) { var p = iso.split('-'); return Number(p[0]) * 12 + Number(p[1]) - 1; }
  function renderTimeline(t, label) {
    var box = document.getElementById('nenpyo');
    box.textContent = '';
    var steps = t.steps, x0 = months(steps[0].from);
    var x1 = months(steps[steps.length - 1].from) + 6;   // 最後の段（すべて）を短く見せる分
    function sx(iso) { return L + (months(iso) - x0) / (x1 - x0) * (W - L - R); }
    function sy(i) { return TOP + i * GAP; }
    var svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + HGT);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
    function el(name, attrs, text) {
      var e = document.createElementNS(SVGNS, name);
      Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
      if (text !== undefined) e.textContent = text;
      svg.appendChild(e); return e;
    }
    var mi = -1;
    steps.forEach(function (s, i) { if (t.mark && s.from <= t.mark) mi = i; });
    if (t.mark) el('rect', { class: 'nenpyo-fill', x: sx(t.mark).toFixed(1), y: TOP - 14, width: (W - R - sx(t.mark)).toFixed(1), height: AXIS - TOP + 14 });
    el('line', { class: 'nenpyo-axis', x1: L, y1: AXIS, x2: W - R, y2: AXIS });
    // 段の名前（左の列）と、節目の縦の目盛り・年月（過ぎた節目は実線、これからは破線）
    var d = '';
    steps.forEach(function (s, i) {
      el('text', { class: 'nenpyo-num', x: L - 12, y: sy(i) + 7, 'text-anchor': 'end' }, s.min === null ? 'すべて' : s.min + '人以上');
      var x = sx(s.from).toFixed(1);
      d += (i === 0 ? 'M' + x + ' ' + sy(0) : ' H' + x + ' V' + sy(i));
      if (i === 0) return;
      el('line', { class: 'nenpyo-tick' + (s.passed ? ' passed' : ''), x1: x, y1: TOP - 14, x2: x, y2: AXIS + 8 });
      var ym = window.ShahoJudge.formatYm(s.from).split('年');
      var tx = el('text', { class: 'nenpyo-ym', x: x, y: AXIS + 30, 'text-anchor': 'middle' });
      var a = document.createElementNS(SVGNS, 'tspan'); a.setAttribute('x', x); a.textContent = ym[0] + '年'; tx.appendChild(a);
      var b = document.createElementNS(SVGNS, 'tspan'); b.setAttribute('x', x); b.setAttribute('dy', '22'); b.textContent = ym[1]; tx.appendChild(b);
    });
    el('path', { class: 'nenpyo-line', d: d + ' H' + (W - R) });
    if (t.mark) el('circle', { class: 'nenpyo-dot', cx: sx(t.mark).toFixed(1), cy: sy(mi), r: 10 });
    box.appendChild(svg);
  }

  // --- 1. の欄の下の、週の労働時間の線（Q-526）: 横は 0 から正社員の時間まで。境目は 20 時間と正社員の 4 分の 3（ShahoJudge.hoursLines）。
  // 印を引く・← → で欄の値を書き換え、欄の input の道（update）で結果を出し直す。判定は結果の所だけが言う（帯に字も色も付けない）
  var HL = { W: 520, L: 40, R: 40, Y20: 24, Y34: 52, TRACK: 88, YEND: 128, H: 140 };
  var hl = (function () {
    var box = document.getElementById('hours-line');
    var J = window.ShahoJudge;
    var field = form.weeklyHours;
    var svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + HL.W + ' ' + HL.H);
    function mk(parent, name, attrs) {
      var e = document.createElementNS(SVGNS, name);
      Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
      parent.appendChild(e); return e;
    }
    mk(svg, 'line', { class: 'hl-track', x1: HL.L, y1: HL.TRACK, x2: HL.W - HL.R, y2: HL.TRACK });
    var line20 = mk(svg, 'line', { class: 'hl-edge', y1: HL.Y20 + 8, y2: HL.TRACK + 14 });
    var line34 = mk(svg, 'line', { class: 'hl-edge', y1: HL.Y34 + 8, y2: HL.TRACK + 14 });
    var t20 = mk(svg, 'text', { class: 'hl-num', y: HL.Y20, 'text-anchor': 'middle' });
    var t34 = mk(svg, 'text', { class: 'hl-num', y: HL.Y34, 'text-anchor': 'middle' });
    var t0 = mk(svg, 'text', { class: 'hl-num', x: HL.L, y: HL.YEND, 'text-anchor': 'middle' });
    var tMax = mk(svg, 'text', { class: 'hl-num', y: HL.YEND, 'text-anchor': 'middle' });
    t0.textContent = '0';
    var mark = mk(svg, 'g', { class: 'hl-mark', tabindex: '0', role: 'slider', 'aria-label': '契約上の週の労働時間', 'aria-valuemin': '0' });
    var hit = mk(mark, 'rect', { class: 'hl-hit' });
    var dot = mk(mark, 'circle', { class: 'hl-dot', r: 12, cy: HL.TRACK });
    box.appendChild(svg);

    var active = false, dragging = false, frozenMax = null;
    function num(n) { return String(Number(n.toFixed(3))); }
    function curMax() { return frozenMax != null ? frozenMax : J.hoursLines(form.fullTimeHours.value).max; }
    function sx(h, max) { return HL.L + h / max * (HL.W - HL.L - HL.R); }
    function hoursAt(clientX) {
      var p = svg.createSVGPoint(); p.x = clientX; p.y = 0;
      var x = p.matrixTransform(svg.getScreenCTM().inverse()).x;
      var max = curMax(), step = J.HOURS_STEP;
      var h = Math.round((x - HL.L) / (HL.W - HL.L - HL.R) * max / step) * step;
      return Math.min(Math.floor(max / step) * step, Math.max(step, h));   // 0 は「入力してください」になるので、線の上の最小は 1 刻み
    }
    // 端に字が出ないように、字の中心を図の中に寄せる
    function placeText(t, x) {
      var w = 0;
      try { w = t.getComputedTextLength(); } catch (e) { w = 0; }
      var half = w / 2;
      t.setAttribute('x', Math.min(HL.W - half, Math.max(half, x)).toFixed(1));
    }
    function setHours(h) {
      if (field.value !== '' && Number(field.value) === h) return;
      field.value = num(h);
      field.dispatchEvent(new Event('input', { bubbles: true }));   // 欄に打ったときと同じ道（form の input → update）
    }
    function render() {
      var lines = J.hoursLines(form.fullTimeHours.value);
      var max = curMax();
      tMax.textContent = num(max) + ' 時間';
      var x20 = sx(lines.min, max), x34 = sx(lines.threeQuarter, max);
      var show20 = lines.min <= max;
      [line20, t20].forEach(function (e) { e.style.display = show20 ? '' : 'none'; });
      line20.setAttribute('x1', x20.toFixed(1)); line20.setAttribute('x2', x20.toFixed(1));
      line34.setAttribute('x1', x34.toFixed(1)); line34.setAttribute('x2', x34.toFixed(1));
      t20.textContent = num(lines.min) + ' 時間';
      t34.textContent = num(lines.threeQuarter) + ' 時間（4 分の 3）';
      placeText(t20, x20); placeText(t34, x34); placeText(tMax, HL.W - HL.R);
      var v = field.value === '' ? NaN : Number(field.value);
      var has = v > 0;
      mark.style.display = has ? '' : 'none';
      svg.classList.toggle('hl-empty', !has);
      if (!has) return;
      var cx = sx(Math.min(v, max), max);   // 正社員の時間を超える値は右の端に
      // 当たりは画面の上で 44px 以上（図の縮みに合わせて viewBox の単位を広げる）
      var scale = svg.getBoundingClientRect().width / HL.W || 1;
      var s = Math.max(48, 48 / scale);
      hit.setAttribute('x', (cx - s / 2).toFixed(1)); hit.setAttribute('y', (HL.TRACK - s / 2).toFixed(1));
      hit.setAttribute('width', s.toFixed(1)); hit.setAttribute('height', s.toFixed(1));
      dot.setAttribute('cx', cx.toFixed(1));
      mark.setAttribute('aria-valuemax', num(max));
      mark.setAttribute('aria-valuenow', num(v));
      mark.setAttribute('aria-valuetext', num(v) + ' 時間');
    }
    function start() { if (!active) { active = true; frozenMax = curMax(); } }
    function stop() { if (active && !dragging && document.activeElement !== mark) { active = false; frozenMax = null; render(); } }

    mark.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      start(); dragging = true;
      try { mark.setPointerCapture(e.pointerId); } catch (err) { /* 取れなくても動く */ }
      try { mark.focus({ preventScroll: true }); } catch (err) { mark.focus(); }
    });
    mark.addEventListener('pointermove', function (e) { if (dragging) setHours(hoursAt(e.clientX)); });
    function release() { if (!dragging) return; dragging = false; stop(); }
    mark.addEventListener('pointerup', release);
    mark.addEventListener('pointercancel', release);
    mark.addEventListener('focus', start);
    mark.addEventListener('blur', function () { dragging = false; stop(); });
    mark.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      var max = curMax(), step = e.shiftKey ? J.HOURS_BIG_STEP : J.HOURS_STEP;
      var cur = Math.min(Number(field.value), max);   // 欄が正社員の時間を超えていれば、正社員の時間から
      var next = cur + (e.key === 'ArrowRight' ? step : -step);
      next = Math.min(Math.floor(max / J.HOURS_STEP) * J.HOURS_STEP, Math.max(J.HOURS_STEP, next));
      if (next !== cur) setHours(next);
    });
    // 欄が空のときは印を出さず、線の上を押した所の時間が入る
    svg.addEventListener('click', function (e) {
      if (field.value !== '') return;
      setHours(hoursAt(e.clientX));
    });
    window.addEventListener('resize', render);
    return { render: render };
  })();

  function update() {
    hl.render();
    var hours = form.weeklyHours.value;
    var employer = radio('employer');
    // 6（任意）の details の summary に今の状態
    var wage = form.monthlyWage.value;
    window.YorozuScreen.detailsSummary({ 'opt-wage': wage === '' ? '入力なし' : Number(wage).toLocaleString('ja-JP') + '円／月' });
    // 必須の2問（時間と勤務先の規模）に答えるまでは結果を出さない（見出しは「—」）
    if (hours === '' || !employer) {
      el.result.className = 'card result result-card';
      el.title.textContent = '—';
      el.body.hidden = true;
      bar.set('');
      return;
    }

    var answers = {
      weeklyHours: hours,
      fullTimeHours: form.fullTimeHours.value,
      daysThreeQuarter: radio('daysThreeQuarter'),
      overTwoMonths: radio('overTwoMonths'),
      student: radio('student'),
      employer: employer,
      monthlyWage: form.monthlyWage.value,
    };
    var today = todayIso();
    var r = window.ShahoJudge.judge(answers, today);

    el.result.className = 'card result result-card ' + r.status;
    el.title.textContent = r.title;
    renderTimeline(window.ShahoJudge.sizeTimeline(answers, r, today), r.title);
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
      el.grade.textContent = p.hyojunKenpo === p.hyojunPension
        ? yen(p.hyojunKenpo)
        : '健康保険 ' + yen(p.hyojunKenpo) + '・厚生年金 ' + yen(p.hyojunPension);
      el.premiumWrap.hidden = false;
    } else {
      el.premiumWrap.hidden = true;
    }

    el.body.hidden = false;
    bar.set(r.title);
    window.yzUsed?.();
  }

  form.addEventListener('input', update);
  form.addEventListener('change', update);
  // 6 の月の給与は form の外（結果の後ろの details）にあるので、欄にも付ける
  form.monthlyWage.addEventListener('input', update);
  form.monthlyWage.addEventListener('change', update);
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
  var pul = document.getElementById('premium-sources');
  J.PREMIUM_SOURCES.forEach(function (src) {
    var li = document.createElement('li');
    var a = document.createElement('a');
    a.href = src.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.textContent = src.name;
    li.appendChild(a); pul.appendChild(li);
  });
  document.getElementById('stale-warning').hidden = J.daysSinceChecked(todayIso()) < 183;
})();
