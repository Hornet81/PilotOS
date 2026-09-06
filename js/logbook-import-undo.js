/* ══════════════════════════════════════════════════════════════════════════════
   logbook-import-undo.js — Deshacer una importación entera de un golpe.
   ------------------------------------------------------------------------------
   Por qué existe: el 10-ago-2026 entraron 1799 vuelos de otro piloto en un
   logbook real (se probó el importador de Pilot Log MCC con el fichero de un
   compañero estando logueado en la cuenta buena). Deshacerlo obligó a
   reconstruir el lote a mano desde el `saved_at` de la base de datos, un mes
   después. Desde Beta.732 cada alta lleva `importBatch {id, at, file}`, y esto
   es lo que convierte aquel día en un botón.

   Borra por el MISMO camino que el borrado masivo del logbook (ldDelMark + cola
   local + ldBgSync), así que:
     · deja lápida → el borrado llega a los demás dispositivos,
     · la auto-curación NO lo vuelve a subir (excluye ids con lápida),
     · y el vuelo cae en la Papelera de 90 días, no se pierde.

   Sólo ve importaciones hechas a partir de Beta.732: lo anterior sólo tiene
   `source:'IMPORT'` y no hay forma de saber a qué tanda pertenecía. Se dice en
   la propia pantalla en vez de aparentar que no hay nada.
   ════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function TH() {
    var day = false;
    try { day = document.documentElement.classList.contains('day'); } catch (e) {}
    return day ? {
      scrim: 'rgba(10,22,48,.50)', solid: '#EFFAFF',
      sheet: 'linear-gradient(180deg,rgba(240,252,255,.99) 0%,rgba(226,246,255,1) 100%)',
      line: 'rgba(13,148,136,.22)', txt: '#0A1628', sub: '#475569', faint: '#64748B',
      acc: '#0E7490', card: 'rgba(15,23,42,.035)', cardLine: 'rgba(15,23,42,.12)',
      warn: '#B45309', warnBg: 'rgba(245,158,11,.12)', warnLine: 'rgba(180,83,9,.32)',
      danger: '#B91C1C', dangerBg: 'rgba(220,38,38,.10)', dangerLine: 'rgba(185,28,28,.40)',
      closeBg: 'rgba(15,23,42,.07)', closeTxt: '#475569'
    } : {
      scrim: 'rgba(2,8,20,.65)', solid: '#08172A',
      sheet: 'linear-gradient(180deg,rgba(8,22,40,.97) 0%,rgba(4,14,28,.99) 100%)',
      line: 'rgba(34,211,238,.2)', txt: 'rgba(248,250,252,.92)', sub: 'rgba(226,232,240,.55)',
      faint: 'rgba(226,232,240,.42)', acc: '#22D3EE', card: 'rgba(148,163,184,.04)',
      cardLine: 'rgba(148,163,184,.14)',
      warn: '#F59E0B', warnBg: 'rgba(245,158,11,.08)', warnLine: 'rgba(245,158,11,.28)',
      danger: '#F87171', dangerBg: 'rgba(239,68,68,.10)', dangerLine: 'rgba(248,113,113,.38)',
      closeBg: 'rgba(255,255,255,.08)', closeTxt: 'rgba(248,250,252,.5)'
    };
  }
  var t = TH();

  function t2m(v) { var m = String(v || '').match(/^(\d+):(\d{2})$/); return m ? (+m[1]) * 60 + (+m[2]) : 0; }
  function hhmm(m) { return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /** Agrupa el logbook por lote de importación. Sólo los que aún tienen vuelos vivos. */
  function lotes() {
    var by = {};
    (window.ldEntries || []).forEach(function (e) {
      var b = e && e.importBatch;
      if (!b || !b.id) return;
      var g = by[b.id] || (by[b.id] = { id: b.id, at: b.at || '', file: b.file || '', n: 0, min: 0, ids: [] });
      g.n++; g.min += t2m(e.block); g.ids.push(e.id);
    });
    return Object.keys(by).map(function (k) { return by[k]; })
      .sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
  }

  function fecha(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return String(iso).slice(0, 10);
    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear() +
      ' · ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  window.ldUndoImportOpen = function () {
    t = TH();
    var vieja = document.getElementById('ldui-overlay');
    if (vieja) vieja.remove();
    var el = document.createElement('div');
    el.id = 'ldui-overlay';
    el.style.cssText = 'position:fixed;inset:0;z-index:9999;background:' + t.scrim + ';-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);display:flex;align-items:flex-start;justify-content:center;overflow-y:auto';
    el.innerHTML =
      '<div style="width:100%;max-width:520px;min-height:100%;background:' + t.sheet + '">' +
      '<div style="position:sticky;top:0;z-index:2;background:' + t.solid + ';border-bottom:1px solid ' + t.line + ';padding:16px;display:flex;align-items:flex-start;gap:10px">' +
      '<div style="flex:1">' +
      '<div style="font-family:\'Space Grotesk\',sans-serif;font-size:17px;font-weight:800;color:' + t.txt + '">Deshacer una importación</div>' +
      '<div id="ldui-sub" style="font-family:\'Space Mono\',monospace;font-size:11px;color:' + t.sub + ';margin-top:3px"></div>' +
      '</div>' +
      '<button onclick="ldUndoImportClose()" style="background:' + t.closeBg + ';border:none;border-radius:50%;width:32px;height:32px;color:' + t.closeTxt + ';font-size:17px;cursor:pointer;flex-shrink:0">✕</button>' +
      '</div><div id="ldui-body" style="padding:14px 16px 28px"></div></div>';
    document.body.appendChild(el);
    document.body.style.overflow = 'hidden';
    render();
  };

  window.ldUndoImportClose = function () {
    var o = document.getElementById('ldui-overlay');
    if (o) o.remove();
    document.body.style.overflow = '';
  };

  function render() {
    var L = lotes();
    var sub = document.getElementById('ldui-sub');
    // "importación" pierde el acento en plural: "importaciones", no "importaciónes".
    if (sub) sub.textContent = L.length
      ? (L.length + (L.length === 1 ? ' importación que puedes deshacer' : ' importaciones que puedes deshacer'))
      : 'Nada que deshacer';

    var h = '';
    if (!L.length) {
      h += '<div style="text-align:center;padding:40px 16px">' +
        '<div style="font-size:30px;margin-bottom:12px">📭</div>' +
        '<div style="font-family:\'Space Grotesk\',sans-serif;font-size:15px;font-weight:700;color:' + t.txt + ';margin-bottom:10px">No hay importaciones que deshacer</div>' +
        '<div style="font-family:\'Space Mono\',monospace;font-size:11px;color:' + t.sub + ';line-height:1.75">Aquí aparecen las importaciones de fichero<br>una vez hechas, para poder revertirlas enteras.</div>' +
        '</div>';
    } else {
      L.forEach(function (g) {
        h += '<div style="background:' + t.card + ';border:1px solid ' + t.cardLine + ';border-radius:13px;padding:13px 14px;margin-bottom:10px">' +
          '<div style="font-family:\'Space Grotesk\',sans-serif;font-size:14px;font-weight:700;color:' + t.txt + ';word-break:break-word">' +
          (g.file ? esc(g.file) : 'Importación sin nombre de fichero') + '</div>' +
          '<div style="font-family:\'Space Mono\',monospace;font-size:11px;color:' + t.faint + ';margin-top:5px">' +
          fecha(g.at) + '</div>' +
          '<div style="font-family:\'Space Mono\',monospace;font-size:12px;color:' + t.acc + ';margin-top:7px;font-weight:700">' +
          g.n + ' vuelo' + (g.n === 1 ? '' : 's') + ' · ' + hhmm(g.min) + '</div>' +
          '<button onclick="ldUndoImportDo(\'' + g.id + '\')" style="margin-top:11px;width:100%;padding:11px;background:' + t.dangerBg + ';border:1.5px solid ' + t.dangerLine + ';border-radius:11px;color:' + t.danger + ';font-family:\'Space Grotesk\',sans-serif;font-size:13px;font-weight:700;cursor:pointer">↩ Deshacer esta importación</button>' +
          '</div>';
      });
    }

    // Lo de antes de Beta.732 no lleva sello: decirlo en vez de aparentar que no existe.
    h += '<div style="background:' + t.warnBg + ';border:1px solid ' + t.warnLine + ';border-radius:11px;padding:11px 13px;margin-top:14px;font-family:\'Space Mono\',monospace;font-size:10.5px;color:' + t.warn + ';line-height:1.7">' +
      'Sólo aparecen las importaciones hechas desde que la app sella cada tanda. Las anteriores no dejaron rastro de a qué importación pertenecían.' +
      '</div>' +
      '<div style="font-family:\'Space Mono\',monospace;font-size:10px;color:' + t.faint + ';text-align:center;margin-top:12px;line-height:1.7">Lo que deshagas va a la Papelera:<br>puedes recuperarlo durante 90 días.</div>';

    var b = document.getElementById('ldui-body');
    if (b) b.innerHTML = h;
  }

  window.ldUndoImportDo = function (batchId) {
    var g = lotes().filter(function (x) { return x.id === batchId; })[0];
    if (!g) return;
    var msg = '¿Deshacer esta importación?\n\n'
      + (g.file ? g.file + '\n' : '')
      + g.n + ' vuelo' + (g.n === 1 ? '' : 's') + ' · ' + hhmm(g.min) + '\n\n'
      + 'Van a la Papelera: puedes recuperarlos durante 90 días.';
    if (!confirm(msg)) return;

    var fuera = {};
    g.ids.forEach(function (id) { fuera[id] = 1; });
    // Mismo camino que el borrado masivo del logbook: quitar en local, marcar la cola de
    // borrados y dejar que el sync empuje las lápidas.
    window.ldEntries = (window.ldEntries || []).filter(function (e) { return !(e && fuera[e.id]); });
    if (typeof ldDelMark === 'function') ldDelMark(g.ids);
    if (typeof ldSaveData === 'function') ldSaveData();
    if (typeof ldRender === 'function') ldRender();
    if (typeof ldStats === 'function') ldStats();
    if (typeof ldUpdatePlanBanners === 'function') ldUpdatePlanBanners();
    try { if (typeof laRenderAnalytics === 'function') laRenderAnalytics(); } catch (e) {}
    try { if (typeof ldRenderCarrera === 'function') ldRenderCarrera(); } catch (e) {}
    if (typeof ldBgSync === 'function') ldBgSync({ delay: 800, force: true });

    if (typeof showToast === 'function') {
      showToast('↩ Importación deshecha · ' + g.n + ' vuelo' + (g.n === 1 ? '' : 's') + ' a la Papelera', 'info');
    }
    render();
  };
})();
