// 共通の皮のページは h1 の大きさと太さを皮に任せる（yorozu-plans D637・D695・Q-906。Q-819 と同じ手順）。
// 前は .app-header h1 を --fs-l（20px）にし、960px 以上でも同じ値を書いていた。
// 皮の後ろ（yorozu-common:end の後。皮を持たないファイルは全体）に、h1 の font-size・font-weight の上書きを戻さない。
// 土台のページ（data-skin="base"）だけに当たる規則は数えない
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const FILES = ['style.css'];
const H1 = /\bh1\b/;

for (const f of FILES) {
  test(`${f}: 皮の後ろに h1 の大きさ・太さの上書きが無い`, () => {
    const css = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    const at = css.indexOf('/* yorozu-common:end */');
    const own = at < 0 ? css : css.slice(at);
    const hits = [...own.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(m => H1.test(m[1]) && /font-(size|weight)\s*:/.test(m[2]) && !/html\[data-skin="base"\]/.test(m[1]))
      .map(m => m[1].trim());
    assert.deepEqual(hits, []);
  });
}
