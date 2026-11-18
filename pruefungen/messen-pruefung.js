const { chromium } = require('playwright');
// Prüfung des virtuellen Multimeters und der elektrischen Fehlersuche
// (elektro-messen.js): misst im Steckaufbau und im Auto-Schaltplan, baut
// versteckte Fehler ein und prüft, dass sie auf die Simulation wirken.
//
//   node pruefungen/messen-pruefung.js
//
// Braucht Playwright mit Chromium (require('playwright')).
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

(async () => {
  const srv = await server();
  const browser = await chromium.launch();
  const url = 'http://localhost:' + srv.address().port + '/index.html';
  const fehler = [];
  // ---------- Standard-Steckaufbau (E-Pneu) ----------
  {
    const page = await browser.newPage({ locale: 'de-DE', viewport: { width: 1600, height: 1000 } });
    page.on('pageerror', e => fehler.push(String(e).slice(0, 300)));
    page.on('dialog', d => d.accept());
    await page.goto(url); await page.waitForTimeout(3500);
    await page.evaluate(() => { try { if (typeof closeHub === 'function') closeHub(); } catch (e) {} });
    console.log('Standard-Steckaufbau, E-Pneu: K1 := START AND NOT STOP, H1 := K1');
    const w = ms => page.waitForTimeout(ms);
    await page.evaluate(async () => {
      if (!window.epneuMode) toggleEpneuMode();
      await new Promise(r => setTimeout(r, 300));
      const ta = document.getElementById('code'); ta.value = 'K1 := START AND NOT STOP\nH1 := K1'; ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await w(900);
    const a = await page.evaluate(() => {
      const m = ElMessen.neuAufbauen();
      const t = k => m.elemente.find(e => e.v === k && e.art === 'kontakt' && !e.nc);
      const s = m.elemente.find(e => e.v === 'K1' && e.art === 'last');
      const h = m.elemente.find(e => e.v === 'H1' && e.art === 'last');
      return { art: m.art, kabel: m.kabel.length, start: t('START'), stop: m.elemente.find(e => e.v === 'STOP' && e.art === 'kontakt' && e.nc), spule: s, leuchte: h };
    });
    ok('Modell aus dem Steckaufbau', a.art === 'standard' && a.kabel >= 4 && a.start && a.spule && a.leuchte, a.art + ', ' + a.kabel + ' Kabel');
    const S = a.start, K = a.spule, H = a.leuchte;
    // Anlage aus: keine Spannung
    let r = await page.evaluate(() => ElMessen.messen('__BUS_24V__', null, 'volt'));
    ok('Anlage aus: 0 V an der +24-V-Schiene', r.wert === 0, r.text + ' ' + r.einheit);
    // Widerstand bei ausgeschalteter Anlage
    r = await page.evaluate(([s]) => ElMessen.widerstand(s.a, s.b), [S]);
    ok('Durchgang Schließer START offen: kein Durchgang', r === Infinity, r);
    r = await page.evaluate(([k]) => ElMessen.widerstand(k.a, k.b), [K]);
    ok('Relaisspule K1: 480 Ω', Math.abs(r - 480) < 1, r);
    r = await page.evaluate(([k]) => ElMessen.messen(k.a, '__BUS_0V__', 'ohm'), [K]);
    ok('Spule A1 gegen 0-V-Schiene: Spule liegt dazwischen', r.einheit === 'Ω' && r.text === '480', r.text + ' ' + r.einheit);
    r = await page.evaluate(([s]) => { setTaster('START', true); const x = ElMessen.widerstand(s.a, s.b); setTaster('START', false); return x; }, [S]);
    ok('START von Hand gedrückt: Durchgang', r === 0, r);
    r = await page.evaluate(([s]) => ElMessen.widerstand('__BUS_24V__', s.a), [S]);
    ok('Kabel +24 V → START 13: Durchgang', r === 0, r);
    // Anlage ein
    await page.evaluate(() => { if (!isSimulationActive) toggleSimulation(); }); await w(400);
    r = await page.evaluate(() => ElMessen.messen('__BUS_24V__', null, 'volt'));
    ok('Anlage ein: 24 V an der Schiene', Math.abs(r.wert - 24) < 0.01, r.text + ' ' + r.einheit);
    r = await page.evaluate(([s]) => [ElMessen.spannung(s.a), ElMessen.spannung(s.b)], [S]);
    ok('START nicht gedrückt: 24 V vor dem Kontakt, 0 V dahinter', Math.abs(r[0] - 24) < 0.01 && Math.abs(r[1]) < 0.01, r.join(' / '));
    r = await page.evaluate(([k]) => ElMessen.messen(k.a, k.b, 'ohm'), [K]);
    ok('Ω bei laufender Anlage: Warnung', !!r.warn, r.hinweis);
    await page.evaluate(() => setTaster('START', true)); await w(300);
    r = await page.evaluate(([s, k]) => ({ s: ElMessen.spannung(s.b), k: ElMessen.spannung(k.a), h1: !!spsState.H1, k1: !!spsState.K1 }), [S, K]);
    ok('START gedrückt: 24 V hinter dem Kontakt und an A1, K1 und H1 an', Math.abs(r.s - 24) < 0.01 && Math.abs(r.k - 24) < 0.01 && r.h1 && r.k1, JSON.stringify(r));
    await page.evaluate(() => setTaster('START', false)); await w(200);
    // Fehler: Kabel zur Spule gebrochen
    const kab = await page.evaluate(([k]) => ElMessen.modell().kabel.find(c => c.b === k.a || c.a === k.a).id, [K]);
    await page.evaluate(([id]) => ElMessen.setzen('K:' + id, 'ab'), [kab]);
    await page.evaluate(() => setTaster('START', true)); await w(400);
    r = await page.evaluate(([k]) => ({ a1: ElMessen.spannung(k.a), k1: !!spsState.K1, h1: !!spsState.H1 }), [K]);
    ok('Ader zur Spule gebrochen: A1 ohne Spannung, K1 und H1 bleiben aus', Math.abs(r.a1) < 0.01 && !r.k1 && !r.h1, JSON.stringify(r));
    const kabEnde = await page.evaluate(([id]) => { const c = ElMessen.modell().kabel.find(c => c.id === id); return [c.a, c.b, ElMessen.spannung(c.a), ElMessen.spannung(c.b)]; }, [kab]);
    ok('… am anderen Kabelende liegen 24 V', Math.abs(kabEnde[2] - 24) < 0.01 || Math.abs(kabEnde[3] - 24) < 0.01, kabEnde.join(' '));
    await page.evaluate(() => setTaster('START', false)); await page.evaluate(() => toggleSimulation()); await w(300);
    r = await page.evaluate(([id]) => { const c = ElMessen.modell().kabel.find(c => c.id === id); return ElMessen.widerstand(c.a, c.b); }, [kab]);
    ok('Durchgang über das gebrochene Kabel: OL', r === Infinity, r);
    // Fehlersuche: falscher, dann richtiger Befund
    await page.evaluate(() => ElMessen.fehlersucheStarten());
    r = await page.evaluate(([s]) => { ElMessen.verdacht('E:' + s.id); return ElMessen.befundPruefen(); }, [S]);
    ok('Falsche Meldung zählt als Fehlversuch', r.falsch === 1 && r.offen === 1, JSON.stringify(r));
    r = await page.evaluate(([id]) => { ElMessen.verdacht('K:' + id); const b = ElMessen.befundPruefen(); return { b, g: ElMessen.fehlerGefunden(), bed: _checkCondition({ type: 'el_fehler' }) }; }, [kab]);
    ok('Richtige Meldung: instand gesetzt, alle gefunden, Bedingung erfüllt', r.b.treffer === 1 && r.g && r.bed, JSON.stringify(r));
    r = await page.evaluate(([id]) => { const c = ElMessen.modell().kabel.find(c => c.id === id); return ElMessen.widerstand(c.a, c.b); }, [kab]);
    ok('Nach dem Instandsetzen wieder Durchgang', r === 0, r);
    // Speichern und Laden
    r = await page.evaluate(() => { const st = getFactoryStateObj(); return st.elFehler; });
    ok('Fehler reisen mit dem Anlagenstand', r && r.fehlersuche && Object.keys(r.fehler).length === 1, JSON.stringify(r));
    await page.evaluate(() => { ElMessen.importieren(null); });
    // Verschweißter Kontakt: H1 leuchtet ohne Taster
    await page.evaluate(([s]) => ElMessen.setzen('E:' + s.id, 'klebt'), [S]);
    await page.evaluate(() => toggleSimulation()); await w(400);
    r = await page.evaluate(() => ({ k1: !!spsState.K1, h1: !!spsState.H1, start: !!spsState.START }));
    ok('Kontakt START verschweißt: K1 und H1 an, ohne zu drücken', r.k1 && r.h1 && !r.start, JSON.stringify(r));
    await page.evaluate(() => toggleSimulation()); await w(200);
    r = await page.evaluate(([s]) => ElMessen.widerstand(s.a, s.b), [S]);
    ok('… Durchgang über den offenen Taster (spannungsfrei)', r === 0, r);
    // Spule unterbrochen
    await page.evaluate(([s, k]) => { ElMessen.setzen('E:' + s.id, null); ElMessen.setzen('E:' + k.id, 'offen'); }, [S, K]);
    r = await page.evaluate(([k]) => ElMessen.widerstand(k.a, k.b), [K]);
    ok('Spule unterbrochen: OL statt 480 Ω', r === Infinity, r);
    await page.evaluate(() => toggleSimulation()); await page.evaluate(() => setTaster('START', true)); await w(400);
    r = await page.evaluate(([k]) => ({ a1: ElMessen.spannung(k.a), a2: ElMessen.spannung(k.b), k1: !!spsState.K1 }), [K]);
    ok('… bei laufender Anlage 24 V an A1, 0 V an A2, K1 fällt nicht an', Math.abs(r.a1 - 24) < 0.01 && Math.abs(r.a2) < 0.01 && !r.k1, JSON.stringify(r));
    await page.evaluate(() => { setTaster('START', false); toggleSimulation(); ElMessen.importieren(null); }); await w(300);
    // Oberfläche: Steckaufbau
    await page.evaluate(() => ElMessen.umschalten('steck', true)); await w(800);
    const pos = await page.evaluate(([s]) => { const c = document.querySelector(`#festo-svg [data-festo-socket="${s.a}"]`); const b = c && c.getBoundingClientRect(); return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null; }, [S]);
    ok('Buchse im Steckaufbau sichtbar', !!pos, JSON.stringify(pos));
    await page.evaluate(() => { if (!isSimulationActive) toggleSimulation(); }); await w(300);
    if (pos) { await page.mouse.click(pos.x, pos.y); await w(400); }
    r = await page.evaluate(() => { const b = document.getElementById('elm-mm-steck'); return { lcd: b && b.querySelector('.elm-lcd').textContent, spitze: !!document.querySelector('#festo-svg #elm-spitzen circle'), kabel: (window.FB || {}).cables }; });
    ok('Klick auf die Buchse: rote Spitze, Anzeige 24,0 V', (r.lcd || '').replace(',', '.') === '24.0V' && r.spitze, JSON.stringify(r));
    await page.evaluate(() => toggleSimulation()); await w(200);
    // Fehlersuche-Oberfläche: Buchse anklicken → Kandidaten mit Auswahl
    await page.evaluate(() => { ElMessen.umschalten('steck', false); ElMessen.fehlersucheUmschalten(true); }); await w(300);
    if (pos) { await page.mouse.click(pos.x, pos.y); await w(300); }
    r = await page.evaluate(() => { const b = document.getElementById('elm-fs'); return { da: !!b, sel: b ? b.querySelectorAll('select').length : 0, txt: b ? b.textContent.slice(0, 160) : '' }; });
    ok('Fehlersuche: Buchse zeigt Kontakt und Kabel zur Auswahl', r.da && r.sel >= 2, r.sel + ' · ' + r.txt);
    await page.evaluate(() => ElMessen.fehlersucheUmschalten(false));
    // Oberfläche: Auto-Schaltplan
    await page.evaluate(() => { const w = document.getElementById('circuit-wrapper'); if (w.style.display === 'none') toggleWorkspaceView('circuit-wrapper'); }); await w(800);
    r = await page.evaluate(([s, k]) => {
      ElMessen.neuAufbauen();
      const p = ElMessen.planPunkte();
      const q = p.find(x => x.key === s.a), z = p.find(x => x.key === k.a);
      const t = q && ElMessen.planTreffer(q.x + 1, q.y + 1);
      const t2 = z && ElMessen.planTreffer(z.x, z.y - 8);   // auf der Leitung über der Spule
      return { n: p.length, t: t && t.key, t2: t2 && t2.key, s: s.a, k: k.a };
    }, [S, K]);
    ok('Schaltplan: Anschluss von START liegt auf seiner Buchse', r.t === r.s, JSON.stringify(r));
    ok('Schaltplan: Leitung über der Spule führt zu A1', r.t2 === r.k, JSON.stringify(r));
    await page.evaluate(() => { toggleSimulation(); setTaster('START', true); ElMessen.umschalten('plan', true); }); await w(500);
    const pp = await page.evaluate(([k]) => {
      const p = ElMessen.planPunkte().find(x => x.key === k.a); if (!p) return null;
      const cc = document.getElementById('circuit-content'), m = cc.getScreenCTM();
      return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
    }, [K]);
    if (pp) { await page.mouse.click(pp.x, pp.y); await w(400); }
    r = await page.evaluate(() => { const b = document.getElementById('elm-mm-plan'); return { lcd: b && b.querySelector('.elm-lcd').textContent, name: b && b.querySelector('[data-s="rot"]').textContent }; });
    ok('Klick im Schaltplan auf A1 der Spule: 24,0 V', (r.lcd || '').replace(',', '.') === '24.0V', JSON.stringify(r));
    await page.evaluate(() => { setTaster('START', false); toggleSimulation(); ElMessen.umschalten('plan', false); }); await w(200);
    await page.close();
  }
  // ---------- SPS-Modus, Anschluss-Sicht ----------
  {
    const page = await browser.newPage({ locale: 'de-DE', viewport: { width: 1600, height: 1000 } });
    page.on('pageerror', e => fehler.push('SPS: ' + String(e).slice(0, 300)));
    page.on('dialog', d => d.accept());
    await page.goto(url); await page.waitForTimeout(3500);
    await page.evaluate(() => { try { if (typeof closeHub === 'function') closeHub(); } catch (e) {} });
    console.log('SPS-Modus, Anschluss-Sicht: H1 := START AND NOT STOP');
    const w = ms => page.waitForTimeout(ms);
    await page.evaluate(async () => {
      if (window.epneuMode) toggleEpneuMode();
      await new Promise(r => setTimeout(r, 300));
      const ta = document.getElementById('code'); ta.value = 'H1 := START AND NOT STOP'; ta.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 600));
      if (!window._iecAnschlussView && window._toggleIecAnschlussView) window._toggleIecAnschlussView();
      toggleWorkspaceView('festo-wrapper');
    });
    await w(3500);   // Aufräumen alter Variablen abwarten (baut das Sim-Panel neu auf)
    const a = await page.evaluate(() => { const m = ElMessen.neuAufbauen(); return m && { art: m.art, kabel: m.kabel.map(c => c.id), el: m.elemente.filter(e => e.adr).map(e => ({ id: e.id, v: e.v, a: e.a, b: e.b, sem: e.sem, last: e.last })), start: m.elemente.find(e => e.v === 'START' && e.art === 'kontakt' && !e.nc) }; });
    ok('Modell der Anschluss-Sicht mit SPS-Ein- und Ausgängen', a && a.art === 'anschluss' && a.el.length >= 3, a && (a.art + ', ' + a.kabel.length + ' Kabel, ' + a.el.map(e => e.id).join(' ')));
    if (a && a.art === 'anschluss') {
      const din = a.el.find(e => e.v === 'START'), dout = a.el.find(e => e.v === 'H1');
      await page.evaluate(() => { if (!isSimulationActive) toggleSimulation(); setTaster('START', true); }); await w(400);
      let r = await page.evaluate(([din, dout]) => ({ din: ElMessen.spannung(din.a), dout: ElMessen.spannung(dout.b), h1: !!spsState.H1, stop: ElMessen.spannung(ElMessen.modell().elemente.find(e => e.v === 'STOP' && e.last === 'sps_ein').a) }), [din, dout]);
      ok('START gedrückt: 24 V am Eingang, am Ausgang, H1 an; STOP (Schließer) 0 V in Ruhe', Math.abs(r.din - 24) < 0.01 && Math.abs(r.dout - 24) < 0.01 && r.h1 && Math.abs(r.stop) < 0.01, JSON.stringify(r));
      const kAus = await page.evaluate(([dout]) => ElMessen.modell().kabel.find(c => c.a === dout.b || c.b === dout.b).id, [dout]);
      // (Taster neu drücken: das Aufräumen alter Variablen baut das Sim-Panel kurz nach der Codeänderung neu auf)
      await page.evaluate(([id]) => { ElMessen.setzen('K:' + id, 'ab'); setTaster('START', true); }, [kAus]); await w(400);
      r = await page.evaluate(([dout, id]) => { const c = ElMessen.modell().kabel.find(c => c.id === id); const ziel = c.a === dout.b ? c.b : c.a; return { dout: ElMessen.spannung(dout.b), last: ElMessen.spannung(ziel), h1: !!spsState.H1 }; }, [dout, kAus]);
      ok('Kabel Ausgang → Leuchte gebrochen: 24 V an der SPS-Klemme, 0 V an der Leuchte, H1 aus', Math.abs(r.dout - 24) < 0.01 && Math.abs(r.last) < 0.01 && !r.h1, JSON.stringify(r));
      await page.evaluate(([id]) => ElMessen.setzen('K:' + id, null), [kAus]);
      const kEin = await page.evaluate(([din]) => ElMessen.modell().kabel.find(c => c.a === din.a || c.b === din.a).id, [din]);
      await page.evaluate(([id]) => { ElMessen.setzen('K:' + id, 'ab'); setTaster('START', true); }, [kEin]); await w(400);
      r = await page.evaluate(([din]) => ({ din: ElMessen.spannung(din.a), start: !!spsState.START, h1: !!spsState.H1 }), [din]);
      ok('Signalkabel START → Eingang gebrochen: 0 V am Eingang, START bleibt 0, H1 aus', Math.abs(r.din) < 0.01 && !r.start && !r.h1, JSON.stringify(r));
      await page.evaluate(() => { setTaster('START', false); ElMessen.importieren(null); toggleSimulation(); }); await w(300);
    }
    await page.close();
  }
  // ---------- Freier Aufbau ----------
  {
    const ctx = await browser.newContext({ locale: 'de-DE', viewport: { width: 1600, height: 1000 } });
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem('valisFestoFreeBuild', '1');
        localStorage.setItem('valisFestoFreeBuildData2', JSON.stringify({
          boards: [{ id: 'b1', type: 'taster', idx: 1, prefix: 'T1', x: 0, y: 0, slotVars: { S2: 'START' } }, { id: 'b2', type: 'led', idx: 1, prefix: 'L1', x: 0, y: 0, slotVars: { S1: 'H1' } }],
          cables: [{ id: 'c1', a: 'T1_24V_1', b: 'T1_S2_13' }, { id: 'c2', a: 'T1_S2_14', b: 'L1_S1_24V_a' }], idc: 3, tc: { taster: 1, led: 1 }
        }));
      } catch (e) {}
    });
    const page = await ctx.newPage();
    page.on('pageerror', e => fehler.push('Frei: ' + String(e).slice(0, 300)));
    page.on('dialog', d => d.accept());
    await page.goto(url); await page.waitForTimeout(3500);
    console.log('Freier Aufbau: +24V → START 13, START 14 → Leuchte H1');
    const r0 = await page.evaluate(() => { const m = ElMessen.neuAufbauen(); return m && { art: m.art, k: m.kabel.length, e: m.elemente.length }; });
    ok('Modell aus dem freien Aufbau', r0 && r0.art === 'frei' && r0.k === 2, JSON.stringify(r0));
    let r = await page.evaluate(() => ElMessen.widerstand('T1_S2_13', 'T1_S2_14'));
    ok('Taster offen: kein Durchgang', r === Infinity, r);
    r = await page.evaluate(() => ElMessen.widerstand('T1_S2_14', '__BUS_0V__'));
    ok('Leuchtmelder zwischen Ausgang und 0 V: 2,2 kΩ', Math.abs(r - 2200) < 1, r);
    r = await page.evaluate(async () => { if (!isSimulationActive) toggleSimulation(); spsState.START = true; await new Promise(r => setTimeout(r, 300)); return [ElMessen.spannung('T1_S2_14'), ElMessen.bestromt('H1')]; });
    ok('Taster betätigt: 24 V am Leuchtmelder, bestromt', Math.abs(r[0] - 24) < 0.01 && r[1], r.join(' '));
    await page.evaluate(() => ElMessen.setzen('K:c2', 'ab'));
    r = await page.evaluate(() => [ElMessen.spannung('T1_S2_14'), ElMessen.spannung('L1_S1_24V_a'), ElMessen.bestromt('H1')]);
    ok('Ader gebrochen: 24 V am Taster, 0 V an der Leuchte, nicht bestromt', Math.abs(r[0] - 24) < 0.01 && Math.abs(r[1]) < 0.01 && !r[2], r.join(' '));
    await page.close(); await ctx.close();
  }
  if (fehler.length) { console.log('\nSeitenfehler:\n  ' + fehler.join('\n  ')); schlecht += fehler.length; }
  console.log(`\n${gut} gut, ${schlecht} schlecht`);
  await browser.close(); srv.close();
  process.exit(schlecht ? 1 : 0);
})();
