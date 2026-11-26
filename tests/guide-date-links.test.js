// 名前を guide-date.test.js から変えた（2026-11-27）: 共通の本体（root の tools/common/guide-date.test.js）は「ページ → 値 1 つ」で比べるが、shaho-check は「guide に並ぶ外のリンクを持つ側の確認日（CHECKED・PREMIUM_CHECKED）の古いほう」で比べるので、repo だけの型として残す。
// guide の「最終確認日」が、そのページが挙げる出どころの値の確認日（古いほう）と同じか（Q-263、yorozu-plans の QUEUE。otasuke の tests/guide-date.test.js と同じ型）。
// judge.js は確認日を 2 つ持つ（判定の出どころ SOURCES ＝ CHECKED、保険料の出どころ PREMIUM_SOURCES ＝ PREMIUM_CHECKED）。
// 比べる相手はファイルの最古ではなく、guide に並ぶ外のリンク（yorozu-craft.com 以外）を持つ側の確認日の古いほう。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const J = require('../judge.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'guide.html'), 'utf8');
const GROUPS = [[J.SOURCES, J.CHECKED], [J.PREMIUM_SOURCES, J.PREMIUM_CHECKED]];
const links = [...new Set([...html.matchAll(/href="(https?:\/\/[^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&')))]
  .filter((u) => !/^https:\/\/yorozu-craft\.com\//.test(u));

test('guide の外の出どころは、どれも judge.js の出典にある', () => {
  assert.ok(links.length > 0);
  for (const u of links) assert.ok(GROUPS.some(([s]) => s.some((x) => x.url === u)), `${u} が judge.js に無い`);
});

test('guide の最終確認日（2 か所）が、挙げた出どころの確認日の古いほうと同じ', () => {
  const want = GROUPS.filter(([s]) => s.some((x) => links.includes(x.url))).map(([, c]) => c).sort()[0];
  const dates = [...html.matchAll(/最終確認日(?: |<\/dt>\s*<dd>)<time datetime="(\d{4}-\d{2}-\d{2})">([^<]+)<\/time>/g)];
  assert.equal(dates.length, 2, '根拠と確認日の段落と、表の最終確認日');
  for (const [, attr, text] of dates) {
    const [y, m, d] = attr.split('-').map(Number);
    assert.ok(text === attr || text === `${y}年${m}月${d}日`, `datetime と表示が違う: ${text}`);
    assert.equal(attr, want);
  }
});
