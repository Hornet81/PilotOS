/* ══════════════════════════════════════════════════════════════════════════════
   ecrews-legs-import.js — Importar HORAS REALES al logbook desde eCrews.
   ------------------------------------------------------------------------------
   Distinto del import de roster: el roster trae la PROGRAMACIÓN; esto trae lo que
   de verdad pasó, tal y como lo publica AIMS en la ventana "Details for Pairing":

     · hora REAL de calzos fuera / calzos dentro   (OUT / IN)
     · bloque por leg, ya calculado por AIMS
     · MATRÍCULA y tipo de avión POR LEG (pueden cambiar a media jornada)
     · legs DHC (el piloto viaja de pasajero) marcadas como posicionamiento

   Lo que eCrews NO da y por tanto aquí no se inventa:
     · OFF/ON de aire (despegue/aterrizaje). Sólo publica calzos. `std`/`sta` del
       logbook se dejan VACÍAS: las pone el piloto.
     · La tripulación. La ventana trae "Crew members on board" y devuelve
       "(No crew found)" incluso en vuelos ya volados. Los nombres siguen a mano.

   UN MES POR IMPORTACIÓN. El backend abre una ventana por pairing (~14 en un mes),
   así que un año serían varios minutos de navegador headless.

   Depende de globales de index.html (ldEntries, ldSaveData, ldGenDeterministicId,
   RST_IATA_ICAO, ldAcDbSet, showToast…). Como todo se ejecuta al pulsar y nada en
   carga, el orden de los <script> no importa.
   ════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var LEGS = [];          // legs devueltas por el backend
  var SEL = {};           // clave de leg → seleccionada (bool)
  var MONTH = '';
  var ERRORES = [];

  function api() { return (typeof lsGet === 'function' ? lsGet('cafi_backend_url', 'https://api.pilotos.aero') : 'https://api.pilotos.aero'); }
  function tok() { return localStorage.getItem('cafi_auth_token'); }
  function toast(m, t) { if (typeof showToast === 'function') showToast(m, t || 'info'); }
  function icao(x) { var u = String(x || '').toUpperCase(); return (window.RST_IATA_ICAO && window.RST_IATA_ICAO[u]) || u; }
  function legKey(l) { return l.date + '|' + l.flightNum + '|' + l.dep + '|' + l.arr; }

  function mesLabel(ym) {
    var M = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
    var p = ym.split('-');
    return M[parseInt(p[1], 10) - 1] + ' ' + p[0];
  }

  // ── ¿esta leg ya está en el logbook? ───────────────────────────────────────
  // Se compara por fecha + ruta (en ICAO, que es como se guarda) y, si lo hay,
  // por número de vuelo. Sin esto, reimportar un mes duplicaría el logbook.
  function yaEsta(l) {
    if (!window.ldEntries) return false;
    var d = icao(l.dep), a = icao(l.arr);
    var num = String(l.flightNum || '').replace(/^VY/, '');
    return ldEntries.some(function (e) {
      if (!e || e.date !== l.date) return false;
      var en = String(e.flight || '').replace(/^VY/, '');
      if (num && en && num === en) return true;
      return icao(e.dep) === d && icao(e.arr) === a;
    });
  }

  // ── Overlay ────────────────────────────────────────────────────────────────
  function ov() {
    var el = document.getElementById('eclg-overlay');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'eclg-overlay';
    el.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(2,6,23,.86);backdrop-filter:blur(6px);display:none;align-items:flex-start;justify-content:center;overflow-y:auto;padding:0';
    el.innerHTML =
      '<div style="width:100%;max-width:520px;min-height:100%;background:#0B1220;border-left:1px solid rgba(148,163,184,.12);border-right:1px solid rgba(148,163,184,.12)">' +
      '<div style="position:sticky;top:0;z-index:2;background:#0B1220;border-bottom:1px solid rgba(148,163,184,.12);padding:16px 16px 12px;display:flex;align-items:flex-start;gap:10px">' +
      '<div style="flex:1">' +
      '<div style="font-family:\'Space Grotesk\',sans-serif;font-size:17px;font-weight:800;color:#E2E8F0">Horas reales de eCrews</div>' +
      '<div id="eclg-sub" style="font-family:\'Space Mono\',monospace;font-size:11px;color:rgba(226,232,240,.5);margin-top:3px">Elige el mes que quieres importar</div>' +
      '</div>' +
      '<button onclick="ldECrewsLegsClose()" style="background:rgba(255,255,255,.08);border:none;border-radius:50%;width:32px;height:32px;color:rgba(248,250,252,.5);font-size:17px;cursor:pointer;flex-shrink:0">✕</button>' +
      '</div>' +
      '<div id="eclg-body" style="padding:14px 16px 28px"></div>' +
      '</div>';
    document.body.appendChild(el);
    return el;
  }
  function body(html) { var b = document.getElementById('eclg-body'); if (b) b.innerHTML = html; }
  function sub(t) { var s = document.getElementById('eclg-sub'); if (s) s.textContent = t; }

  // ── 1) Selector de mes ─────────────────────────────────────────────────────
  window.ldECrewsLegsOpen = function () {
    LEGS = []; SEL = {}; ERRORES = [];
    var o = ov(); o.style.display = 'flex'; document.body.style.overflow = 'hidden';
    sub('Elige el mes que quieres importar');

    var hoy = new Date(), botones = '';
    for (var i = 0; i < 13; i++) {
      var d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - i, 1));
      var ym = d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
      botones += '<button onclick="ldECrewsLegsFetch(\'' + ym + '\')" style="width:100%;padding:13px 15px;margin-bottom:8px;background:rgba(34,211,238,.07);border:1px solid rgba(34,211,238,.22);border-radius:12px;color:#E2E8F0;font-family:\'Space Mono\',monospace;font-size:13px;font-weight:700;cursor:pointer;text-align:left;letter-spacing:.5px">' +
        mesLabel(ym) + (i === 0 ? '<span style="float:right;color:#22D3EE;font-size:10px;letter-spacing:1px">MES ACTUAL</span>' : '') + '</button>';
    }
    body(
      '<div style="background:rgba(34,211,238,.06);border:1px solid rgba(34,211,238,.18);border-radius:12px;padding:12px 14px;margin-bottom:16px">' +
      '<div style="font-family:\'Space Mono\',monospace;font-size:11px;line-height:1.65;color:rgba(226,232,240,.72)">' +
      'Trae de eCrews la <b style="color:#22D3EE">hora real de calzos</b>, el <b style="color:#22D3EE">bloque</b> y la <b style="color:#22D3EE">matrícula</b> de cada vuelo.<br><br>' +
      'Un mes por importación: eCrews hay que abrirlo jornada a jornada y tarda cerca de un minuto.' +
      '</div></div>' + botones
    );
  };

  window.ldECrewsLegsClose = function () {
    var o = document.getElementById('eclg-overlay');
    if (o) o.style.display = 'none';
    document.body.style.overflow = '';
  };

  // ── 2) Descarga ────────────────────────────────────────────────────────────
  window.ldECrewsLegsFetch = function (ym) {
    MONTH = ym;
    sub(mesLabel(ym) + ' · leyendo eCrews');
    body(
      '<div style="text-align:center;padding:50px 20px">' +
      '<div style="font-size:34px;margin-bottom:14px">🛫</div>' +
      '<div style="font-family:\'Space Grotesk\',sans-serif;font-size:15px;font-weight:700;color:#E2E8F0;margin-bottom:8px">Abriendo tu roster en eCrews…</div>' +
      '<div style="font-family:\'Space Mono\',monospace;font-size:11px;color:rgba(226,232,240,.5);line-height:1.7">Hay que entrar en cada jornada para sacar<br>la matrícula y las horas reales.<br><br>Suele tardar <b style="color:#22D3EE">30-60 segundos</b>. No cierres la app.</div>' +
      '</div>'
    );

    fetch(api() + '/api/ecrews/legs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok() },
      body: JSON.stringify({ month: ym })
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, s: r.status, j: j }; }); })
      .then(function (res) {
        if (res.j && res.j.status === 'NEEDS_LOGIN') return necesitaLogin();
        if (!res.ok) return error(res.j && (res.j.error || res.j.detail) || ('HTTP ' + res.s));
        LEGS = (res.j && res.j.legs) || [];
        ERRORES = (res.j && res.j.errores) || [];
        // Por defecto se marca lo que aún no está en el logbook y NO es posicionamiento:
        // una leg DHC es un vuelo como pasajero, no horas del piloto.
        SEL = {};
        LEGS.forEach(function (l) { SEL[legKey(l)] = !yaEsta(l) && !l.isPositioning; });
        render();
      })
      .catch(function (e) { error(e.message); });
  };

  function necesitaLogin() {
    sub('Sesión de eCrews caducada');
    body(
      '<div style="text-align:center;padding:40px 20px">' +
      '<div style="font-size:32px;margin-bottom:12px">🔐</div>' +
      '<div style="font-family:\'Space Grotesk\',sans-serif;font-size:15px;font-weight:700;color:#E2E8F0;margin-bottom:8px">Hay que volver a entrar en eCrews</div>' +
      '<div style="font-family:\'Space Mono\',monospace;font-size:11px;color:rgba(226,232,240,.55);line-height:1.7;margin-bottom:20px">Tendrás que aprobar el acceso en el móvil,<br>igual que al sincronizar el roster.</div>' +
      '<button onclick="ldECrewsLegsClose(); if(typeof ldECrewsSyncOpen===\'function\') ldECrewsSyncOpen();" style="padding:12px 22px;background:rgba(34,211,238,.14);border:1px solid rgba(34,211,238,.45);border-radius:12px;color:#22D3EE;font-family:\'Space Grotesk\',sans-serif;font-size:14px;font-weight:700;cursor:pointer">Conectar con eCrews</button>' +
      '</div>'
    );
  }

  function error(msg) {
    sub('No se pudo leer');
    body(
      '<div style="text-align:center;padding:40px 20px">' +
      '<div style="font-size:32px;margin-bottom:12px">⚠️</div>' +
      '<div style="font-family:\'Space Grotesk\',sans-serif;font-size:15px;font-weight:700;color:#F59E0B;margin-bottom:10px">No se pudo leer eCrews</div>' +
      '<div style="font-family:\'Space Mono\',monospace;font-size:11px;color:rgba(226,232,240,.55);line-height:1.7;word-break:break-word">' + String(msg || '').slice(0, 200) + '</div>' +
      '</div>'
    );
  }

  // ── 3) Revisión ────────────────────────────────────────────────────────────
  window.ldECrewsLegsToggle = function (k) { SEL[k] = !SEL[k]; render(); };

  function render() {
    if (!LEGS.length) {
      sub(mesLabel(MONTH) + ' · sin vuelos');
      body('<div style="text-align:center;padding:44px 20px"><div style="font-size:30px;margin-bottom:12px">📭</div>' +
        '<div style="font-family:\'Space Mono\',monospace;font-size:12px;color:rgba(226,232,240,.55);line-height:1.7">eCrews no devolvió vuelos para ' + mesLabel(MONTH) + '.</div></div>');
      return;
    }

    var dias = {};
    LEGS.forEach(function (l) { (dias[l.date] = dias[l.date] || []).push(l); });
    var fechas = Object.keys(dias).sort();
    var nSel = Object.keys(SEL).filter(function (k) { return SEL[k]; }).length;
    sub(mesLabel(MONTH) + ' · ' + LEGS.length + ' vuelos · ' + nSel + ' seleccionados');

    var h = '';
    if (ERRORES.length) {
      h += '<div style="background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.28);border-radius:11px;padding:10px 13px;margin-bottom:14px;font-family:\'Space Mono\',monospace;font-size:10.5px;color:#F59E0B;line-height:1.6">' +
        '⚠ ' + ERRORES.length + ' jornada' + (ERRORES.length === 1 ? '' : 's') + ' no se pudo leer. Vuelve a intentarlo o mete esos vuelos a mano.</div>';
    }

    fechas.forEach(function (f) {
      var dd = f.slice(8, 10) + '/' + f.slice(5, 7);
      h += '<div style="font-family:\'Space Mono\',monospace;font-size:10px;letter-spacing:1.3px;color:rgba(34,211,238,.55);font-weight:700;margin:16px 0 7px">' + dd + '</div>';
      dias[f].forEach(function (l) {
        var k = legKey(l), dup = yaEsta(l), on = !!SEL[k];
        var bg = dup ? 'rgba(148,163,184,.05)' : (on ? 'rgba(34,211,238,.09)' : 'rgba(148,163,184,.04)');
        var bd = dup ? 'rgba(148,163,184,.14)' : (on ? 'rgba(34,211,238,.4)' : 'rgba(148,163,184,.14)');
        h += '<div onclick="ldECrewsLegsToggle(\'' + k.replace(/'/g, "\\'") + '\')" style="background:' + bg + ';border:1px solid ' + bd + ';border-radius:11px;padding:10px 12px;margin-bottom:7px;cursor:pointer;display:flex;align-items:center;gap:11px">' +
          '<div style="width:19px;height:19px;flex-shrink:0;border-radius:5px;border:1.5px solid ' + (on ? '#22D3EE' : 'rgba(148,163,184,.35)') + ';background:' + (on ? '#22D3EE' : 'transparent') + ';display:flex;align-items:center;justify-content:center;color:#0B1220;font-size:12px;font-weight:900">' + (on ? '✓' : '') + '</div>' +
          '<div style="flex:1;min-width:0">' +
          '<div style="font-family:\'Space Mono\',monospace;font-size:12.5px;color:#E2E8F0;font-weight:700">' +
          l.flightNum + ' <span style="color:rgba(226,232,240,.6)">' + l.dep + '–' + l.arr + '</span>' +
          (l.isPositioning ? ' <span style="background:rgba(245,158,11,.18);color:#F59E0B;font-size:9px;padding:1px 5px;border-radius:4px;letter-spacing:.5px">PASAJERO</span>' : '') +
          (dup ? ' <span style="background:rgba(148,163,184,.16);color:rgba(226,232,240,.6);font-size:9px;padding:1px 5px;border-radius:4px">YA ESTÁ</span>' : '') +
          '</div>' +
          '<div style="font-family:\'Space Mono\',monospace;font-size:10.5px;color:rgba(226,232,240,.48);margin-top:3px">' +
          (l.std_actual || l.std || '--:--') + ' → ' + (l.sta_actual || l.sta || '--:--') + ' z' +
          (l.block ? '  ·  ' + l.block : '') +
          (l.reg ? '  ·  <span style="color:#22D3EE">' + l.reg + '</span>' : '') +
          (l.acType ? ' ' + l.acType : '') +
          '</div></div></div>';
      });
    });

    h += '<button onclick="ldECrewsLegsConfirm()" style="width:100%;margin-top:18px;padding:15px;background:linear-gradient(135deg,rgba(34,211,238,.22),rgba(59,130,246,.16));border:1.5px solid rgba(34,211,238,.5);border-radius:15px;color:#22D3EE;font-family:\'Space Grotesk\',sans-serif;font-size:15px;font-weight:700;cursor:pointer;letter-spacing:.3px">' +
      'Importar ' + nSel + ' vuelo' + (nSel === 1 ? '' : 's') + '</button>' +
      '<div style="font-family:\'Space Mono\',monospace;font-size:10px;color:rgba(226,232,240,.35);text-align:center;margin-top:10px;line-height:1.6">Entran con las horas de calzos reales.<br>El despegue y el aterrizaje los pones tú.</div>';
    body(h);
  }

  // ── 4) Alta en el logbook ──────────────────────────────────────────────────
  window.ldECrewsLegsConfirm = function () {
    var elegidas = LEGS.filter(function (l) { return SEL[legKey(l)]; });
    if (!elegidas.length) { toast('No has seleccionado ningún vuelo', 'info'); return; }

    var rol = (typeof _ldDominantRole === 'function' && _ldDominantRole()) || lsGet('ld_pref_role') || 'FO';
    var libres = Infinity;
    if (typeof isPro === 'function' && !isPro() && typeof ldRealEntryCount === 'function') {
      libres = Math.max(0, (window.PLAN_FREE_LOGBOOK_LIMIT || 25) - ldRealEntryCount());
    }

    var n = 0, tope = false;
    elegidas.forEach(function (l) {
      if (n >= libres) { tope = true; return; }
      var dep = icao(l.dep), arr = icao(l.arr);
      ldEntries.unshift({
        id: ldGenDeterministicId('EC', l.date, dep, arr, l.std || l.std_actual || ''),
        // ★ CONTRATO: sin savedAt de AHORA el vuelo entra en local y NO sale nunca del
        //   dispositivo — ldDeltaPush sólo sube lo que tenga savedAt > último sync.
        savedAt: new Date().toISOString(),
        source: 'ECREWS',
        date: l.date,
        flight: l.flightNum || '',
        dep: dep, arr: arr,
        // Programadas por un lado, REALES por otro. `atd`/`ata` son OUT/IN de calzos:
        // es lo que publica AIMS y de donde sale su propio bloque (comprobado: A0458 →
        // A0652 = 01:54, el mismo Block que imprime eCrews).
        sched_out: l.std || '', sched_in: l.sta || '',
        atd: l.std_actual || null, ata: l.sta_actual || null,
        aobt: l.std_actual || null, aibt: l.sta_actual || null,
        // OFF/ON de aire: eCrews NO las publica. Vacías a propósito — las pone el piloto.
        std: '', sta: '',
        block: l.block || '',
        acType: l.acType || '', reg: l.reg || '',
        role: rol,
        positioning: !!l.isPositioning,
        isPositioning: !!l.isPositioning
      });
      // La matrícula alimenta la base de aviones: la próxima vez que el piloto teclee
      // esa matrícula, el tipo sale solo.
      if (l.reg && l.acType && typeof ldAcDbSet === 'function') { try { ldAcDbSet(l.reg, l.acType); } catch (e) {} }
      n++;
    });

    if (!n) { if (typeof showPlanToast === 'function') showPlanToast('limit'); return; }
    if (typeof ldSaveData === 'function') ldSaveData();
    if (typeof ldRender === 'function') ldRender();
    if (typeof ldStats === 'function') ldStats();
    if (typeof ldBgSync === 'function') ldBgSync({ delay: 3000, force: true });
    window.ldECrewsLegsClose();
    toast('✅ ' + n + ' vuelo' + (n === 1 ? '' : 's') + ' con horas reales' + (tope ? ' (tope del plan gratuito)' : ''), 'success');
  };
})();
