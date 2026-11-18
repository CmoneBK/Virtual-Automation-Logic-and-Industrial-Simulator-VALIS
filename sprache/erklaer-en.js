// Erklärmodus auf Englisch: Der Erklärmodus baut seine Sätze auf Deutsch aus
// festen Bausteinen (index.html, _renderRhs, _explainLine). Diese Regeln setzen
// die Bausteine in englische Wortfolge um. Reihenfolge zählt: erst die langen,
// besonderen Sätze, dann die allgemeinen Teile („X aktiv ist" → „X is active").
// Eine Variable ist ein Name wie START_TASTER, SEL_RAW.cv oder S1_RS.
(function () {
  const EN = window.VALIS_EN; if (!EN) return;
  const V = '([A-Za-z0-9_.ÄÖÜäöüß¬]+)';
  const DOM = { setzdominant: 'set-dominant', 'rücksetzdominant': 'reset-dominant' };
  const ROLLE = { 'SET-Eingang': 'SET input', 'RESET-Eingang': 'RESET input', 'Ausgang': 'output' };
  const VGL = { 'gleich': 'equal to', 'ungleich': 'not equal to', 'kleiner als': 'less than', 'größer als': 'greater than', 'kleiner oder gleich': 'less than or equal to', 'größer oder gleich': 'greater than or equal to' };
  const R = [
    // ── Schrittkette (DSL) ──
    [/^Beginn der Schrittkette (\S+)\. Bis END folgen Schritte \(STEP\) mit ihren Aktionen und Übergängen \(TRANS\)\. Es ist immer genau ein Schritt aktiv; /, 'Start of the step sequence $1. Until END follow steps (STEP) with their actions and transitions (TRANS). Exactly one step is always active; '],
    [/ ist der Anfangsschritt\./, ' is the initial step.'],
    [/der erste STEP ist der Anfangsschritt\./, 'the first STEP is the initial step.'],
    [/^Ende der Schrittkette (\S+)\./, 'End of the step sequence $1.'],
    [/ \(Anfangsschritt, aktiv nach dem Start\)/, ' (initial step, active after the start)'],
    [/\. Die Aktionen darunter wirken nur, solange dieser Schritt aktiv ist\./, '. The actions below only take effect while this step is active.'],
    [/^Schritt (\S+)/, 'Step $1'],
    [/^Übergänge aus Schritt (.+?): Ist eine der folgenden Bedingungen erfüllt, wird (.+?) verlassen und der Zielschritt aktiv\./, 'Transitions from step $1: if one of the following conditions is met, $2 is left and the target step becomes active.'],
    [/^Wenn (.+?), wechselt die Kette (?:von (\S+) )?nach (.+)\.$/, (m, b, von, nach) => 'If ' + b + ', the sequence changes ' + (von ? 'from ' + von + ' ' : '') + 'to ' + nach + '.'],
    [/^Verriegelung von (.+?): Die C-Aktionen wirken nur, solange (.+)\. Der Schritt selbst bleibt trotzdem aktiv\./, 'Interlock of $1: the C actions only take effect as long as $2. The step itself still stays active.'],
    [/^Überwachung von (.+?): Wenn (.+), gilt das als Fehler; die Übergänge sind gesperrt und die Kette bleibt stehen\./, 'Supervision of $1: if $2, this counts as a fault; the transitions are blocked and the sequence stops.'],
    [/ \(Hier ist die Variable negiert gebunden\.\)/, ' (Here the variable is bound negated.)'],
    [/, solange (.+?) aktiv ist und die INTERLOCK-Bedingung dieses Schritts erfüllt ist \(C = bedingt\)\./, ' as long as $1 is active and the INTERLOCK condition of this step is met (C = conditional).'],
    [/, solange (.+?) aktiv ist \(N = normal\)\./, ' as long as $1 is active (N = normal).'],
    [/ für einen kurzen Impuls \(ca\. 0,1 s\) beim Eintritt in (.+?) \(P = Puls\)\./, ' for a short pulse (approx. 0.1 s) on entering $1 (P = pulse).'],
    [/ wird eingeschaltet beim Eintritt in (.+?) und bleibt gespeichert, bis eine R-Aktion es zurücksetzt \(S = setzen\)\./, ' is switched on on entering $1 and stays stored until an R action resets it (S = set).'],
    [/ wird beim Eintritt in (.+?) zurückgesetzt \(R = rücksetzen, gewinnt gegen S\)\./, ' is reset on entering $1 (R = reset, wins against S).'],
    [/ – aber erst (\S+) s nach dem Eintritt in (.+?), dann solange der Schritt aktiv bleibt \(D = verzögert\)\./, ' – but only $1 s after entering $2, then as long as the step stays active (D = delayed).'],
    [/ für höchstens (\S+) s ab dem Eintritt in (.+?) \(L = begrenzt\)\./, ' for at most $1 s from entering $2 (L = limited).'],
    [/ bekommt den Wert (.+?), sobald (.+?) aktiv ist( und die INTERLOCK-Bedingung erfüllt ist)?, und behält ihn danach, bis ein anderer Schritt einen neuen Wert setzt\./, (m, w, s, il) => ' gets the value ' + w + ' as soon as ' + s + ' is active' + (il ? ' and the INTERLOCK condition is met' : '') + ', and keeps it afterwards until another step sets a new value.'],
    [/ ist eingeschaltet, sofern /, ' is switched on provided that '],
    [/ ist eingeschaltet/, ' is switched on'], [/ ist ausgeschaltet/, ' is switched off'],
    [/\bder Schritt\b/g, 'the step'], [/\bdiesem Schritt\b/g, 'this step'],
    // ── Regler ──
    [/ ist ein Zweipunktregler \(schaltet nur EIN oder AUS\) für den Istwert /, ' is a two-point controller (switches only ON or OFF) for the actual value '],
    [/Wirkrichtung HEIZEN: (\S+) schaltet ein, wenn (\S+) unter Sollwert minus halbe Schaltdifferenz fällt, und aus, wenn \2 über Sollwert plus halbe Schaltdifferenz steigt/, 'Direction HEATING: $1 switches on when $2 falls below setpoint minus half the switching differential, and off when $2 rises above setpoint plus half the switching differential'],
    [/Wirkrichtung KÜHLEN: (\S+) schaltet ein, wenn (\S+) über Sollwert plus halbe Schaltdifferenz steigt, und aus, wenn \2 unter Sollwert minus halbe Schaltdifferenz fällt/, 'Direction COOLING: $1 switches on when $2 rises above setpoint plus half the switching differential, and off when $2 falls below setpoint minus half the switching differential'],
    [/ \(also ein (unter|über) (\S+), aus (unter|über) (\S+)\)/, (m, a, x, b, y) => ' (so on ' + (a === 'unter' ? 'below ' : 'above ') + x + ', off ' + (b === 'unter' ? 'below ' : 'above ') + y + ')'],
    [/\. Dazwischen behält (\S+) seinen Zustand\./, '. In between, $1 keeps its state.'],
    [/ schaltet ein, sobald (\S+) unter (\S+) fällt, und aus, sobald \1 über (\S+) steigt \(wie beim Heizen oder Füllen\)\./, ' switches on as soon as $1 falls below $2, and off as soon as $1 rises above $3 (as when heating or filling).'],
    [/ schaltet ein, sobald (\S+) über (\S+) steigt, und aus, sobald \1 unter (\S+) fällt \(wie beim Kühlen oder Abpumpen\)\./, ' switches on as soon as $1 rises above $2, and off as soon as $1 falls below $3 (as when cooling or pumping out).'],
    [/Einschaltpunkt (.+?), Ausschaltpunkt (.+?)\. Liegt der Einschaltpunkt unten, schaltet (\S+) beim Unterschreiten ein und beim Überschreiten des Ausschaltpunkts aus; liegt er oben, umgekehrt\./, 'Switch-on point $1, switch-off point $2. If the switch-on point is lower, $3 switches on when falling below it and off when exceeding the switch-off point; if it is higher, the other way round.'],
    [/ Zwischen den beiden Punkten behält (\S+) seinen Zustand\./, ' Between the two points, $1 keeps its state.'],
    [/ ist die Stellgröße \(0 … 100 %\) eines Zustandsreglers\. Sollwert /, ' is the manipulated variable (0 … 100 %) of a state controller. Setpoint '],
    [/ ist die Stellgröße \(0 … 100 %\) eines (P|PI|PD|PID)-Reglers\. Sollwert /, ' is the manipulated variable (0 … 100 %) of a $1 controller. Setpoint '],
    [/, Istwert /g, ', actual value '], [/, Sollwert /g, ', setpoint '], [/, Schaltdifferenz /g, ', switching differential '],
    [/P-Anteil mit KP = /, 'P component with KP = '],
    [/ohne I-Anteil \(TN = 0\)/, 'no I component (TN = 0)'], [/I-Anteil mit Nachstellzeit TN = /, 'I component with reset time TN = '],
    [/ohne D-Anteil \(TV = 0\)/, 'no D component (TV = 0)'], [/D-Anteil mit Vorhaltzeit TV = /, 'D component with derivative time TV = '],
    [/Wirkrichtung KÜHLEN: (\S+) wird größer, wenn der Istwert über dem Sollwert liegt\./, 'Direction COOLING: $1 increases when the actual value is above the setpoint.'],
    [/Wirkrichtung HEIZEN: (\S+) wird größer, wenn der Istwert unter dem Sollwert liegt\./, 'Direction HEATING: $1 increases when the actual value is below the setpoint.'],
    [/ Doppelklick auf den Baustein im Logikplan öffnet das Reglerfenster\./, ' Double-clicking the block in the logic plan opens the controller window.'],
    [/Die Regelabweichung e = (.+?) wird mit KX = (.+?) bewertet, davon werden die Geschwindigkeit des Istwerts \(mal KV = (.+?) s\) und seine Beschleunigung \(mal KA = (.+?) s²\) abgezogen; die Summe verstärkt P = (.+?)\. So bremst der Regler eine schnelle Achse vor dem Ziel ab, ohne dass sie überschwingt\./, 'The control deviation e = $1 is weighted with KX = $2, the speed of the actual value (times KV = $3 s) and its acceleration (times KA = $4 s²) are subtracted; the sum is amplified by P = $5. This way the controller brakes a fast axis before the target without overshooting.'],
    // ── Zuweisungen mit Zahlen ──
    [/ Steht (\S+) auch rechts, zählt dort der Wert aus dem letzten Zyklus\./, ' If $1 also appears on the right, the value from the last cycle counts there.'],
    [/ bekommt fest den Zahlenwert /, ' gets the fixed numeric value '],
    [/ bekommt in jedem Zyklus den Wert: /, ' gets the value in every cycle: '],
    [/; sonst behält (\S+) seinen bisherigen Wert\./, '; otherwise $1 keeps its previous value.'],
    [/ bekommt den Wert /g, ' gets the value '], [/ bekommt /g, ' gets '],
    // ── Kopf des Satzes ──
    [/^⚠️ Keine Zuweisung erkannt\. Reiner Ausdruck: /, '⚠️ No assignment detected. Pure expression: '],
    [/^Der Ausgang (\S+) ist aktiv \(1\), wenn /, 'The output $1 is active (1) if '],
    [/^Der Ausgang (\S+) ist aktiv, wenn /, 'The output $1 is active if '],
    [/^Der Ausgang Q des (SR|RS)-Gliedes Nr\. (\d+) \((\S+)\) wird hier direkt zugewiesen \(ungewöhnlich — Q wird normalerweise nur GELESEN\), wenn /, (m, k, n, d) => 'The output Q of ' + k + ' element no. ' + n + ' (' + (DOM[d] || d) + ') is assigned directly here (unusual — Q is normally only READ) if '],
    [/^Der (SET|RESET)-Eingang (S|R) des (SR|RS)-Gliedes Nr\. (\d+) \((\S+)\) wird aktiviert, wenn /, (m, r, b, k, n, d) => 'The ' + r + ' input ' + b + ' of ' + k + ' element no. ' + n + ' (' + (DOM[d] || d) + ') is activated if '],
    // ── Bedingungen ──
    [/\bder (SET|RESET)-Eingang (S|R) des (SR|RS)-Gliedes Nr\. (\d+)/g, 'the $1 input $2 of $3 element no. $4'],
    [/\bder Ausgang Q des (SR|RS)-Gliedes Nr\. (\d+)/g, 'the output Q of $1 element no. $2'],
    [new RegExp(V + ' seit mindestens (\\S+) ununterbrochen aktiv war', 'g'), '$1 has been active continuously for at least $2'],
    [new RegExp(V + ' aktuell aktiv ist oder vor weniger als (\\S+) zuletzt aktiv war', 'g'), '$1 is currently active or was last active less than $2 ago'],
    [/\bein (\S+)-langer Impuls \(ausgelöst durch ([^)]+)\) gerade läuft/g, 'a $1 pulse (triggered by $2) is currently running'],
    [new RegExp(V + ' bereits (\\S+)-mal aktiv geworden ist \\(Reset durch ([^)]+)\\)', 'g'), '$1 has already become active $2 times (reset by $3)'],
    [/(Schritt \S+|the step) seit mindestens (\S+) s aktiv ist/g, (m, s, t) => s.replace(/^Schritt/, 'step') + ' has been active for at least ' + t + ' s'],
    [/\(Schritt S(\d+) der Schrittkette\) aktiv ist/g, '(step S$1 of the step sequence) is active'],
    [/\((Ausgang|SET-Eingang|RESET-Eingang) des (SR|RS)-Gliedes (\d+)\) aktiv ist/g, (m, r, k, n) => '(' + ROLLE[r] + ' of ' + k + ' element ' + n + ') is active'],
    [/der Wert IMMER wahr ist/g, 'the value is ALWAYS true'], [/der Wert NIE wahr ist/g, 'the value is NEVER true'],
    [/das Gegenteil von \(/g, 'the opposite of ('], [/\) gilt\b/g, ') holds'],
    [/der Baustein (\S+)\(…\) gerade 1 liefert/g, 'the block $1(…) currently delivers 1'],
    [/\bnicht gilt: /g, 'does not hold: '], [/\bgilt: /g, 'holds: '],
    [/\(leerer Ausdruck\)/g, '(empty expression)'],
    [/ (gleich|ungleich|kleiner als|größer als|kleiner oder gleich|größer oder gleich) (\S+?) ist\b/g, (m, o, r) => ' is ' + VGL[o] + ' ' + r],
    [/ ungleich 0 ist\b/g, ' is not 0'],
    [/ nicht aktiv ist\b/g, ' is not active'],
    [/ aktiv ist\b/g, ' is active'],
    // ── Werte ──
    [/\b(?:der |die )?Zählerstand von /g, 'the count of '], [/\b(?:der |die )?abgelaufene Zeit von /g, 'the elapsed time of '], [/\b(?:der |die )?Zielwert von /g, 'the target value of '],
    [/\b(?:der )?Rest von (.+?) geteilt durch /g, 'the remainder of $1 divided by '],
    [/\b(?:der )?Minimum von /g, 'the minimum of '], [/\b(?:der )?Maximum von /g, 'the maximum of '], [/\b(?:der )?Betrag von /g, 'the absolute value of '],
    [/ auf eine ganze Zahl gerundet/g, ' rounded to a whole number'], [/ abgerundet\b/g, ' rounded down'], [/ aufgerundet\b/g, ' rounded up'],
    [/ geteilt durch /g, ' divided by '], [/ mal /g, ' times '],
    [/1 \(wahr\)/g, '1 (true)'], [/0 \(falsch\)/g, '0 (false)'], [/immer \(TRUE\)/g, 'always (TRUE)'], [/nie \(FALSE\)/g, 'never (FALSE)'],
    [/1, wenn /g, '1 if '], [/, falls /g, ' if '], [/; sonst /g, '; otherwise '], [/, sonst /g, ', otherwise '], [/\bsonst /g, 'otherwise '],
    [/, wenn /g, ' if '], [/\bwenn /g, 'if '],
    [/ und /g, ' and '], [/ oder /g, ' or '], [/\bund\b/g, 'and']
  ];
  EN.satz = function (s) {
    if (!s || !EN.an()) return s;
    s = String(s);
    let komm = '';
    const k = s.indexOf('💬 ');
    if (k >= 0) { komm = s.slice(k); s = s.slice(0, k); }
    const ende = s.match(/\s*$/)[0]; s = s.slice(0, s.length - ende.length);
    // CONTROL-Zeile: "KEY ← VAR: Beschreibung."
    const c = /^(\S+ ← [^:]+): (.+?)\.$/.exec(s);
    if (c) s = c[1] + ': ' + EN.t(c[2]).replace(/\.$/, '') + '.';
    else {
      const regeln = x => { for (const [re, ers] of R) x = x.replace(re, ers); return x.replace(/(\d),(\d)/g, '$1.$2'); };
      const DEUTSCH = /[äöüÄÖÜß]|\b(der|die|das|und|oder|nicht|ist|wird|wenn|sonst|bekommt|aktiv|beim|nach|mit|von|des|eines)\b/g;
      const a = regeln(s), ganz = EN.t(s);
      if (ganz !== s) { const b = regeln(ganz); if ((b.match(DEUTSCH) || []).length < (a.match(DEUTSCH) || []).length) s = b; else s = a; }
      else s = a;
    }
    s += ende;
    if (komm) {
      const m = /^💬 (?:Kommentar: )?(.*)$/s.exec(komm);
      komm = (/^💬 Kommentar: /.test(komm) ? '💬 Comment: ' : '💬 ') + EN.t(m ? m[1] : '');
    }
    return s + komm;
  };
})();
