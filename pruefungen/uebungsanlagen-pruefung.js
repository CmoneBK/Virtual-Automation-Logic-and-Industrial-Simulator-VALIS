const { chromium } = require('playwright');
// Prüfung des Katalogs der Übungsanlagen (uebungsanlagen.js): Für jede der
// 15 Aufgaben wird die Musterlösung geladen und wie von Hand bedient (Taster,
// Not-Halt, Lichtgitter). Alle Bedingungen müssen erfüllt werden. Danach läuft
// dieselbe Bedienung mit der Vorlage: Sie darf die Aufgabe nicht lösen.
// Außerdem: Katalog im Lernzentrum, Suche, 3D-Link.
//
//   node pruefungen/uebungsanlagen-pruefung.js            alle
//   node pruefungen/uebungsanlagen-pruefung.js rolltor    nur eine Anlage
//   node pruefungen/uebungsanlagen-pruefung.js ua-rolltor-2 --ohne-vorlage
//
// Braucht Playwright mit Chromium (require('playwright')). Dauer: einige Minuten.
const http = require('http'), fs = require('fs'), path = require('path');
const WURZEL = path.join(__dirname, '..');
function server() {
  const typen = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const p = path.join(WURZEL, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(WURZEL) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rsp.writeHead(404); rsp.end(); return; }
      rsp.writeHead(200, { 'Content-Type': typen[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(rsp);
    }).listen(0, () => res(srv));
  });
}
let gut = 0, schlecht = 0;
const ok = (n, g, d) => { console.log(`  ${g ? '✓' : '✗'} ${n}${d !== undefined && d !== '' ? '  (' + d + ')' : ''}`); g ? gut++ : schlecht++; };

/* Bedienung je Aufgabe. Schritte:
 *   ['t', NAME, s]   Taster/Not-Halt s Sekunden betätigen (Standard 0,3 s)
 *   ['d', NAME]      betätigen und halten      ['u', NAME]  loslassen
 *   ['w', s]         warten
 *   ['bis', i, s]    warten, bis Bedingung i erfüllt ist (höchstens s Sekunden)
 *   ['wenn', js, s]  warten, bis der Ausdruck über S (spsState) wahr ist
 */
const BEIDE_T = [['d', 'TASTER_LINKS'], ['d', 'TASTER_RECHTS'], ['w', 0.3], ['u', 'TASTER_LINKS'], ['u', 'TASTER_RECHTS']];
const NH_ENTRIEGELN_START_QUITT = (start, bis) => [['u', 'NOT_HALT'], ['w', 0.5], ['t', start], ['w', 1.5], ['t', 'TASTER_QUITTIEREN'], ['w', 0.6], ['t', start], ['bis', bis, 10]];
const SZ = {
  'ua-sortieranlage-1': [['w', 1], ['tw', 'TASTER_START', 'S.MOTOR_BAND'], ['bis', 0, 5], ['bis', 3, 45], ['t', 'TASTER_STOPP'], ['bis', 1, 3],
    ['t', 'TASTER_START'], ['w', 1], ['d', 'NOT_HALT'], ['bis', 2, 3], ['u', 'NOT_HALT']],
  'ua-sortieranlage-2': [['w', 1], ['tw', 'TASTER_START', 'S.MOTOR_BAND'], ['bis', 0, 90], ['bis', 1, 60], ['bis', 2, 30]],
  'ua-sortieranlage-3': [['w', 1], ['tw', 'TASTER_START', 'S.MOTOR_BAND'], ['bis', 0, 120], ['t', 'TASTER_QUITTIEREN'], ['w', 0.6], ['t', 'TASTER_START'], ['bis', 1, 5],
    ['w', 2], ['d', 'NOT_HALT'], ['bis', 2, 3], ['w', 0.5]].concat(NH_ENTRIEGELN_START_QUITT('TASTER_START', 3)),
  'ua-abfuellstation-1': [['w', 1], ['tw', 'TASTER_START', 'S.MOTOR_BAND'], ['bis', 0, 5], ['bis', 3, 60], ['t', 'TASTER_STOPP'], ['bis', 1, 3],
    ['t', 'TASTER_START'], ['w', 1], ['d', 'NOT_HALT'], ['bis', 2, 3], ['u', 'NOT_HALT']],
  'ua-abfuellstation-2': [['w', 1], ['tw', 'TASTER_START', 'S.MOTOR_BAND'], ['bis', 0, 150], ['bis', 1, 60], ['bis', 2, 30]],
  'ua-abfuellstation-3': [['w', 1], ['tw', 'TASTER_START', 'S.MOTOR_BAND'], ['bis', 0, 200], ['t', 'TASTER_QUITTIEREN'], ['w', 0.6], ['t', 'TASTER_START'], ['bis', 1, 5],
    ['w', 3], ['d', 'NOT_HALT'], ['bis', 2, 3], ['w', 0.5]].concat(NH_ENTRIEGELN_START_QUITT('TASTER_START', 3)),
  'ua-praegestation-1': [['bis', 0, 4], ['d', 'TASTER_LINKS'], ['bis', 1, 3], ['d', 'TASTER_RECHTS'], ['bis', 2, 10], ['u', 'TASTER_LINKS'], ['u', 'TASTER_RECHTS'], ['bis', 3, 10]],
  'ua-praegestation-2': [['w', 1]].concat(BEIDE_T, [['bis', 0, 20], ['bis', 3, 3]], BEIDE_T, [['bis', 1, 20], ['bis', 2, 20]]),
  'ua-praegestation-3': [['w', 1], ['d', 'TASTER_LINKS'], ['w', 1], ['d', 'TASTER_RECHTS'], ['bis', 0, 4], ['u', 'TASTER_LINKS'], ['u', 'TASTER_RECHTS'], ['w', 0.6],
    ['d', 'TASTER_LINKS'], ['d', 'TASTER_RECHTS'], ['wenn', 'S.REED_SPANNER_VORN && !S.REED_PRAEGER_HINTEN && !S.REED_PRAEGER_VORN', 10],
    ['u', 'TASTER_LINKS'], ['u', 'TASTER_RECHTS'], ['bis', 2, 3], ['w', 0.3],
    ['d', 'TASTER_LINKS'], ['d', 'TASTER_RECHTS'], ['bis', 1, 10], ['d', 'NOT_HALT'], ['bis', 3, 6], ['u', 'TASTER_LINKS'], ['u', 'TASTER_RECHTS'],
    ['u', 'NOT_HALT'], ['w', 0.5], ['t', 'TASTER_QUITTIEREN'], ['bis', 4, 15]],
  'ua-bohrstation-1': [['bis', 0, 4], ['tw', 'TASTER_START', '!S.REED_SPANNER_HINTEN || S.SPULE_SPANNEN'], ['bis', 1, 30], ['w', 1], ['tw', 'TASTER_START', '!S.REED_SPANNER_HINTEN || S.SPULE_SPANNEN'], ['bis', 2, 30]],
  'ua-bohrstation-2': [['w', 1], ['wenn', 'S.LAMPE_BEREIT', 5], ['tw', 'TASTER_START', '!S.REED_SPANNER_HINTEN || S.SPULE_SPANNEN'], ['bis', 0, 20], ['bis', 2, 20], ['bis', 1, 20], ['wenn', 'S.LAMPE_BEREIT', 10], ['w', 0.5], ['t', 'TASTER_START'], ['bis', 3, 40]],
  'ua-bohrstation-3': [['w', 1], ['wenn', 'S.LAMPE_BEREIT', 5], ['tw', 'TASTER_START', '!S.REED_SPANNER_HINTEN || S.SPULE_SPANNEN'], ['bis', 0, 40], ['d', 'SCHALTER_DAUER'], ['w', 0.3], ['t', 'TASTER_START'], ['bis', 1, 90],
    ['wenn', 'S.SCHRITT_4 && S.REED_SPANNER_VORN && !S.REED_VORSCHUB_HINTEN && !S.REED_VORSCHUB_VORN', 30], ['d', 'NOT_HALT'], ['bis', 2, 10], ['u', 'SCHALTER_DAUER'], ['w', 0.3],
    ['u', 'NOT_HALT'], ['w', 0.5], ['t', 'TASTER_QUITTIEREN'], ['bis', 3, 20]],
  'ua-rolltor-1': [['w', 1], ['d', 'TASTER_AUF'], ['bis', 0, 8], ['u', 'TASTER_AUF'], ['w', 0.3], ['d', 'TASTER_ZU'], ['w', 1.2], ['d', 'TASTER_AUF'], ['bis', 2, 3],
    ['u', 'TASTER_AUF'], ['bis', 1, 8], ['u', 'TASTER_ZU'], ['bis', 3, 3]],
  'ua-rolltor-2': [['w', 1], ['tw', 'TASTER_AUF', 'S.MOTOR_AUF'], ['bis', 0, 8], ['tw', 'TASTER_ZU', 'S.MOTOR_ZU'], ['w', 0.8], ['t', 'TASTER_AUF'], ['bis', 3, 3], ['bis', 1, 8],
    ['t', 'TASTER_AUF'], ['w', 1.2], ['t', 'TASTER_STOPP'], ['bis', 2, 3]],
  'ua-rolltor-3': [['w', 1], ['tw', 'TASTER_AUF', 'S.MOTOR_AUF'], ['bis', 0, 15], ['bis', 1, 2], ['w', 0.8], ['d', 'LICHTGITTER'], ['w', 0.4], ['u', 'LICHTGITTER'],
    ['bis', 2, 10], ['bis', 3, 15]]
};

async function zustand(page) {
  return page.evaluate(() => {
    const R = window.Uebungsanlagen.rekorder();
    let geloest = false; try { geloest = !!JSON.parse(localStorage.getItem('valisTasksSolved') || '{}')[(0, eval)('activeTask') && (0, eval)('activeTask').id]; } catch (e) {}
    return { ok: R ? R.ok.slice() : [], t: R ? R.t : 0, S: (0, eval)('spsState') || {}, geloest: geloest };
  });
}
async function bedienen(page, schritte, vorlage) {
  const w = s => page.waitForTimeout(s * 1000);
  const setz = (n, b) => page.evaluate(([n, b]) => window.valisBruecke.setzeEingang(n, b), [n, b]);
  for (const s of schritte) {
    if (s[0] === 't') { await setz(s[1], true); await w(s[2] || 0.3); await setz(s[1], false); }
    else if (s[0] === 'tw') {
      // Taster tippen, bis die erwartete Wirkung eintritt (höchstens drei Mal)
      for (let n = 1; n <= 3; n++) {
        await setz(s[1], true); await w(0.3); await setz(s[1], false);
        const frist = Date.now() + 1500; let da = false;
        while (!da && Date.now() < frist) { const S = (await zustand(page)).S; da = new Function('S', 'return ' + s[2])(S); if (!da) await w(0.1); }
        if (da || vorlage) break;
        console.log('      … ' + s[1] + ' ohne Wirkung, noch einmal (' + n + ')');
      }
    }
    else if (s[0] === 'd') await setz(s[1], true);
    else if (s[0] === 'u') await setz(s[1], false);
    else if (s[0] === 'w') await w(s[1]);
    else if (s[0] === 'bis' || s[0] === 'wenn') {
      const frist = Date.now() + 1000 * (vorlage ? Math.min(s[2], 6) : s[2]);
      for (;;) {
        const z = await zustand(page);
        let erfuellt;
        if (s[0] === 'bis') erfuellt = !!z.ok[s[1]];
        else { const S = z.S; erfuellt = new Function('S', 'return ' + s[1])(S); }
        if (erfuellt) break;
        if (Date.now() > frist) { if (!vorlage) console.log('      … Frist abgelaufen bei', JSON.stringify(s)); break; }
        await w(0.1);
      }
    }
  }
  await w(1.5);   // Aufgabenprüfung läuft alle 0,4 s
  return zustand(page);
}

(async () => {
  const filter = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const ohneVorlage = process.argv.includes('--ohne-vorlage');
  const srv = await server();
  const browser = await chromium.launch();
  const url = 'http://localhost:' + srv.address().port + '/index.html';
  const fehler = [];
  const neueSeite = async () => {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    page.on('pageerror', e => fehler.push(String(e).slice(0, 300)));
    page.on('dialog', d => d.accept());
    await page.goto(url); await page.waitForTimeout(3500);
    await page.evaluate(() => { try { if (typeof closeHub === 'function') closeHub(); } catch (e) {} });
    return page;
  };

  // ---------- Katalog, Lernzentrum, Suche, 3D-Link ----------
  if (!filter.length) {
    const page = await neueSeite();
    console.log('Katalog im Lernzentrum');
    const k = await page.evaluate(async () => {
      openHub(); await new Promise(r => setTimeout(r, 300));
      hubLaunch('uebungsanlagen'); await new Promise(r => setTimeout(r, 400));
      const p = document.getElementById('hub-panel-uebungsanlagen');
      p.scrollTop = 10000; const gescrollt = p.scrollTop;
      const res = { gescrollt: gescrollt, aktiv: p.classList.contains('active'), karten: p.querySelectorAll('.ua-karte').length, starten: p.querySelectorAll('[data-ua="start"]').length };
      const s = document.getElementById('hub-search'); s.value = 'rolltor'; s.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 500));
      res.suche = document.getElementById('hub-search-results').textContent;
      s.value = ''; s.dispatchEvent(new Event('input', { bubbles: true }));
      const aufg = window.Uebungsanlagen.liste().map(a => [0, 1, 2].map(i => window.Uebungsanlagen.aufgabe(a.id, i)));
      res.ids = [].concat.apply([], aufg).map(t => t.id);
      res.gesperrt = [].concat.apply([], aufg).every(t => t.solution.factory.objects.every(o => o.locked) && t.preset.code !== t.solution.code);
      res.link = window.Uebungsanlagen.link3d('rolltor', 2) || '';
      return res;
    });
    ok('Panel im Lernzentrum aktiv, 5 Anlagen, 15 Starter', k.aktiv && k.karten === 5 && k.starten === 15, k.karten + ' Karten, ' + k.starten + ' Starter');
    ok('Katalog lässt sich scrollen', k.gescrollt > 100, k.gescrollt + ' px');
    ok('Suche „rolltor“ findet die Übungsanlagen', /Übungsanlagen/.test(k.suche) && /Rolltor 3/.test(k.suche));
    ok('15 verschiedene Aufgaben, Hardware gesperrt, Vorlage ≠ Lösung', new Set(k.ids).size === 15 && k.gesperrt);
    ok('3D-Link zum Pneumatik-Raum mit Zustand', /virtuelle-werkstatt-raeume-pneumatik-raum\.html#state=.{40,}/.test(k.link));
    // Start aus dem Katalog: Aufgabe aktiv, SPS-Modus, Vorlage im Editor
    const st = await page.evaluate(async () => {
      openHub(); hubLaunch('uebungsanlagen'); await new Promise(r => setTimeout(r, 300));
      // Katalog ist seit #180 nach Schwierigkeit sortiert: Karte über den Namen suchen
      const karte = Array.from(document.querySelectorAll('#hub-panel-uebungsanlagen .ua-karte')).find(k => /Sortieranlage/.test(k.querySelector('.ua-name').textContent));
      karte.querySelector('[data-ua="start"][data-i="1"]').click();
      await new Promise(r => setTimeout(r, 1200));
      const t = (0, eval)('activeTask');
      return { id: t && t.id, sps: !!window.spsMode || document.body.classList.contains('sps-mode') || (0, eval)('typeof spsMode !== "undefined" && spsMode'), code: document.getElementById('code').value };
    });
    ok('Starten aus dem Katalog lädt die Aufgabe mit Vorlage', st.id === 'ua-sortieranlage-2' && /Ausschieben/.test(st.code), st.id + ', sps=' + st.sps);
    await page.close();
  }

  // ---------- jede Musterlösung durchspielen ----------
  for (const id of Object.keys(SZ)) {
    if (filter.length && !filter.some(f => id.indexOf(f) !== -1)) continue;
    const [, anlage, nr] = id.match(/^ua-(.+)-(\d)$/);
    for (const vorlage of ohneVorlage ? [false] : [false, true]) {
     // Die Simulation läuft in Echtzeit; unter Last im Kopflos-Browser geht selten
     // ein Tastendruck verloren. Eine Musterlösung bekommt deshalb einen zweiten Versuch.
     for (let versuch = 1; versuch <= (vorlage ? 1 : 2); versuch++) {
      const page = await neueSeite();
      await page.evaluate(([a, i]) => window.Uebungsanlagen.starten(a, i), [anlage, +nr - 1]);
      await page.waitForTimeout(1200);
      if (!vorlage) { await page.evaluate(() => window._taskLoadSolution()); await page.waitForTimeout(1200); }
      await page.evaluate(() => { window.valisBruecke.starten(); });
      await page.waitForTimeout(300);
      const labels = await page.evaluate(() => (0, eval)('activeTask').conditions.map(c => c.label));
      const z = await bedienen(page, SZ[id], vorlage);
      const alle = labels.every((l, i) => z.ok[i]);
      if (!vorlage && !(alle && z.geloest)) console.log('      Zustand: ' + Object.keys(z.S).filter(k => z.S[k] === true).join(' '));
      if (!vorlage && versuch === 1 && !(alle && z.geloest)) { console.log(id + ' – erster Versuch nicht vollständig, zweiter Versuch'); await page.close(); continue; }
      if (!vorlage) {
        console.log(id + ' – Musterlösung (' + z.t.toFixed(1) + ' s Simulation)');
        labels.forEach((l, i) => ok(l, !!z.ok[i]));
        ok('Aufgabe als gelöst gemeldet', z.geloest);
      } else {
        ok(id + ' – die Vorlage allein löst die Aufgabe nicht', !alle, labels.filter((l, i) => z.ok[i]).length + '/' + labels.length + ' Bedingungen');
      }
      await page.close();
      break;
     }
    }
  }

  ok('keine Skriptfehler', fehler.length === 0, fehler.slice(0, 3).join(' | '));
  console.log(`\n${gut} gut, ${schlecht} schlecht`);
  await browser.close(); srv.close();
  process.exit(schlecht ? 1 : 0);
})();
