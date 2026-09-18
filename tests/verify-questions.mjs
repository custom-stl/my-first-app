// playwright は ローカル（npm i -D playwright）でも グローバルでも つかえるように さがす
let chromium;
try { ({ chromium } = await import('playwright')); }
catch {
  const { execSync } = await import('node:child_process');
  const root = execSync('npm root -g').toString().trim();
  ({ chromium } = await import(`${root}/playwright/index.mjs`));
}
const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: 430, height: 950 } });
const errs = [];
pg.on('pageerror', e => errs.push(String(e)));
await pg.goto('file://' + process.cwd() + '/index.html');

const fails = [];
const stats = { calc: 0, word: 0, read: 0, shift: 0, choice: 0 };

// 出題されている もんだいの「ただしい こたえ」を がめんから どくじに もとめる
async function truth() {
  return await pg.evaluate(() => {
    const hz = document.querySelector('.hz');
    const ask = document.querySelector('#ask').textContent;
    if (hz) {
      const rows = [...hz.querySelectorAll('.hz-row')].map(r => r.textContent.trim());
      const a = Number(rows[0]);
      const op = rows[1][0];
      const b = Number(rows[1].slice(1));
      return { t: 'calc', a, b, op, want: op === '＋' ? a + b : a - b };
    }
    const svg = document.querySelector('.clockwrap svg');
    if (svg) {
      // はりの かくどから とけいを よみとる（かかれた えと こたえが あっているか）
      const gs = [...svg.querySelectorAll('g[transform]')].map(g => Number(g.getAttribute('transform').match(/rotate\(([-\d.]+)/)[1]));
      const [ha, ma] = gs;
      const m = Math.round(ma / 6) % 60;
      let h = Math.floor((ha % 360) / 30); if (h === 0) h = 12;
      const shift = ask.match(/(\d+)ふん(まえ|あと)/);
      return { t: shift ? 'shift' : 'read', h, m, ask, d: shift ? Number(shift[1]) : 0, back: shift ? shift[2] === 'まえ' : false };
    }
    if (document.querySelector('.picks')) {
      const want = document.querySelector('#ask').textContent.match(/「(\d+)じ(?:(\d+)ふん)?/);
      const n = [...document.querySelectorAll('.pick')].map((p, i) => {
        const gs = [...p.querySelectorAll('g[transform]')].map(g => Number(g.getAttribute('transform').match(/rotate\(([-\d.]+)/)[1]));
        const m = Math.round(gs[1] / 6) % 60;
        let h = Math.floor((gs[0] % 360) / 30); if (h === 0) h = 12;
        return { i, h, m };
      });
      return { t: 'choice', want: { h: Number(want[1]), m: Number(want[2] || 0) }, opts: n };
    }
    return { t: 'word', ask, nums: (ask.match(/\d+/g) || []).map(Number) };
  });
}

async function typeNum(v) {
  for (const d of String(v)) await pg.keyboard.press(d);
  await pg.keyboard.press('Enter');
}
async function typeTime(h, m) {
  for (const d of String(h)) await pg.keyboard.press(d);
  await pg.keyboard.press('ArrowRight');
  for (const d of String(m)) await pg.keyboard.press(d);
  await pg.keyboard.press('Enter');
}
const verdict = () => pg.evaluate(() => document.querySelector('.judge')?.classList.contains('ng') ? 'ng' : (document.querySelector('.judge') ? 'ok' : 'none'));

for (const lv of [1, 2, 3]) {
  for (const mode of (process.env.ONLY || 'calc,word,clock').split(',')) {
    for (let set = 0; set < 4; set++) {
      try {
        await pg.click(`.lv[data-lv="${lv}"]`, { timeout: 4000 });
        await pg.click(`.mode[data-mode="${mode}"]`, { timeout: 4000 });
      } catch (e) {
        const st = await pg.evaluate(() => ({
          screen: ['home', 'quiz', 'result'].find((id) => !document.getElementById(id).hidden),
          ask: document.querySelector('#ask')?.textContent,
          judge: document.querySelector('.judge')?.textContent,
        }));
        console.log(`!! lv${lv} ${mode} set${set} で とまった:`, JSON.stringify(st));
        await pg.screenshot({ path: `stuck-lv${lv}-${mode}.png` });
        break;
      }
      for (let q = 0; q < 10; q++) {
        const t = await truth();
        let expectOk = true;
        if (t.t === 'calc') {
          stats.calc++;
          const digits = Math.max(String(t.a).length, String(t.b).length);
          const maxd = { 1: 2, 2: 3, 3: 4 }[lv];
          if (digits !== maxd) fails.push(`lv${lv} calc けたすう ${t.a}${t.op}${t.b}`);
          if (t.want < 0) fails.push(`lv${lv} calc マイナス ${t.a}${t.op}${t.b}`);
          await typeNum(t.want);
        } else if (t.t === 'word') {
          stats.word++;
          const [x, y, z] = t.nums;
          const cands = [x + y, x - y, (x || 0) + (y || 0) + (z || 0)];
          // 1もんに 1かいしか こたえられない。まちがえた ときは はんていに でる せいかいを よみとる
          await typeNum(x + y);
          let got;
          if (await verdict() === 'ok') got = x + y;
          else {
            const shown = await pg.evaluate(() => document.querySelector('.judge .say p b')?.textContent || '');
            got = Number((shown.match(/[0-9]+/) || ['NaN'])[0]);
          }
          if (!cands.includes(got)) fails.push(`lv${lv} word こたえが すうじと あわない: ${t.ask} → ${got}`);
          else if (!(got >= 0)) fails.push(`lv${lv} word こたえが マイナス: ${t.ask} → ${got}`);
          expectOk = false;
        } else if (t.t === 'read') {
          stats.read++;
          await typeTime(t.h, t.m);
        } else if (t.t === 'shift') {
          stats.shift++;
          let tot = ((t.h % 12) * 60 + t.m + (t.back ? -t.d : t.d)) % 720;
          if (tot < 0) tot += 720;
          await typeTime(Math.floor(tot / 60) || 12, tot % 60);
        } else if (t.t === 'choice') {
          stats.choice++;
          const match = t.opts.filter(o => o.h === (t.want.h % 12 || 12) && o.m === t.want.m);
          if (match.length !== 1) fails.push(`lv${lv} choice せいかいが ${match.length}こ: ${JSON.stringify(t)}`);
          await pg.click(`.pick[data-c="${(match[0] || t.opts[0]).i}"]`);
        }
        const v = await verdict();
        if (expectOk && v !== 'ok') fails.push(`lv${lv} ${t.t} まるつけ ミス: ${JSON.stringify(t)}`);
        // じどうおくりを またずに すぐ つぎへ（setTimeout は locked が とけて いるので なにも しない）
        await pg.evaluate(() => document.querySelector('#next')?.click());
      }
      await pg.evaluate(() => document.querySelector('#tohome')?.click());
    }
  }
}
console.log('もんだいすう:', JSON.stringify(stats));
console.log('しっぱい:', fails.length);
fails.slice(0, 12).forEach(f => console.log(' -', f));
console.log('JS errors:', errs.length ? errs.slice(0,5).join(' | ') : 'none');
await b.close();
