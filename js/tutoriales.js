/* ═══════════════════════════════════════════════════════════════════════════
   TUTORIALES EN VÍDEO — Beta (25-nov-2026)

   Dos puertas a los mismos vídeos:
   · «Tutoriales» en el menú del avatar → la hoja con todas las series.
   · Al ENTRAR en Roster, SkyView o Pay Check, un aviso con los vídeos de esa
     sección, con «Ver», «Ahora no» y «No volver a mostrar».

   Los vídeos viven en Supabase Storage, bucket PÚBLICO `tutoriales` (sirve igual a
   beta y producción y no engorda el repo ni el despliegue). Un vídeo nuevo es
   subir el MP4 + su póster y añadir una línea a SERIES. NO van al precacheo del
   Service Worker: son ~110 MB; sin red la hoja lo DICE en vez de girar.

   «No volver a mostrar» va POR UID y por sección (`pilotos_tut_nunca`), y esa
   clave sobrevive al logout (lista `keep` de clearAllUserData): es la decisión
   de UN piloto, como `pilotos_guia_nunca`. «Ahora no» sólo vale esta sesión.

   El aviso NO se pone encima de otra hoja: si al entrar hay algo delante (la
   bienvenida, «Completa tu perfil», el aviso de ARIA, la reja de acceso…), espera
   y lo reintenta; si sigue tapado, lo deja para la próxima entrada.

   Todo el texto va con translate="no" y se escribe ya en su idioma (L): casi
   todo lleva números y el traductor de la app casa frases enteras.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var BASE = 'https://ifmvhderwfkosztyvzzs.supabase.co/storage/v1/object/public/tutoriales/';
  var NUNCA_KEY = 'pilotos_tut_nunca';
  var AHORA_NO = 'pilotos_tut_ahorano';   // sessionStorage

  function EN() { try { return root.pilotosLang === 'en'; } catch (e) { return false; } }
  function L(es, en) { return EN() ? en : es; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* Cada serie con el MISMO degradado que su tarjeta del Home: así se reconoce
     de un vistazo sin leer. `pant` es la pantalla en la que sale su aviso. */
  var SERIES = [
    { k: 'roster', pant: 'roster', nom: 'Roster', g: ['#022A2C', '#03727A', '#00C8A8'], ac: '#2EE6C6',
      ico: '<rect x="16" y="22" width="68" height="62" rx="10"/><path d="M16 40h68M34 14v16M66 14v16"/><circle cx="34" cy="55" r="3.2" class="f"/><circle cx="50" cy="55" r="3.2" class="f"/><circle cx="66" cy="55" r="3.2" class="f"/><circle cx="34" cy="70" r="3.2" class="f"/><circle cx="50" cy="70" r="3.2" class="f"/>',
      eps: [
        { f: 'roster-01', s: 54, t: 'Import your roster', es: 'De eCrews a tu calendario en tres toques.', en: 'From eCrews to your calendar in three taps.' },
        { f: 'roster-02', s: 49, t: 'Read your month at a glance', es: 'Colores del mes, límites FTL, retrasos y fatiga.', en: 'Month colours, FTL limits, delays and fatigue.' },
        { f: 'roster-03', s: 58, t: 'Your roster pays you back', es: 'Cambios de programación, invasiones y forzosos que cobras.', en: 'Schedule changes, day-off intrusions and forced changes you get paid for.' },
        { f: 'roster-04', s: 89, t: 'Your year in numbers', es: 'Las estadísticas: este mes, tu año y vuelo.', en: 'Your statistics: this month, your year and flying.' }
      ] },
    { k: 'skyview', pant: 'skyview', nom: 'SkyView', g: ['#041B3A', '#083D77', '#00C2D1'], ac: '#38D9F0',
      ico: '<circle cx="50" cy="50" r="40"/><circle cx="50" cy="50" r="26"/><circle cx="50" cy="50" r="12"/><path d="M50 50L82 26"/><path d="M50 50L82 26A40 40 0 0 1 89 46Z" class="w"/><circle cx="70" cy="64" r="3.2" class="f"/><circle cx="31" cy="34" r="2.6" class="f"/>',
      eps: [
        { f: 'skyview-01', s: 81, t: 'Your flight, briefed', es: 'METAR, TAF, NOTAM, perfil de ruta y carta SIGWX del vuelo de hoy.', en: 'METAR, TAF, NOTAMs, route profile and SIGWX chart for today’s flight.' },
        { f: 'skyview-02', p: 'skyview-02-v2', tab: 'aria', s: 47, t: 'Meet ARIA, your co-briefer', es: 'El briefing hablado para ir al aeropuerto con las manos en el volante.', en: 'The spoken briefing for the drive, hands on the wheel.' }
      ] },
    { k: 'paycheck', pant: 'pay', nom: 'Pay Check', g: ['#2A1B00', '#6A4300', '#FFB800'], ac: '#FFC53D',
      ico: '<circle cx="50" cy="50" r="40"/><path d="M68 32A24 24 0 1 0 68 68"/><path d="M26 45h34M26 56h30"/>',
      eps: [
        { f: 'paycheck-01', s: 54, t: 'Know your pay', es: 'Acumulado, nómina calculada, auditoría del recibo y gastos.', en: 'Accrued pay, your payslip worked out, the audit and expenses.' },
        { f: 'paycheck-02b', s: 50, t: 'Snap, send, get paid', es: 'Gastos: la foto del ticket, enviar al portal y seguir el pago.', en: 'Expenses: snap the receipt, send it to the portal and track the payment.' }
      ] }
  ];
  function serie(k) { for (var i = 0; i < SERIES.length; i++) if (SERIES[i].k === k || SERIES[i].pant === k) return SERIES[i]; return null; }
  function mins(sr) { var t = 0; sr.eps.forEach(function (e) { t += e.s; }); return Math.max(1, Math.round(t / 60)); }
  function nVid(n) { return n + ' ' + (n === 1 ? L('vídeo', 'video') : L('vídeos', 'videos')); }
  function mmss(s) { return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }

  /* ── «No volver a mostrar», por piloto y por sección ── */
  function duenyo() { var u = ''; try { u = String(localStorage.getItem('pilotOS_last_uid') || ''); } catch (e) {} return u || '_'; }
  function mapa() { var o = null; try { o = JSON.parse(localStorage.getItem(NUNCA_KEY) || '{}'); } catch (e) {} return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {}; }
  function esNunca(k) { var m = mapa()[duenyo()]; return !!(m && m[k]); }
  function ponNunca(k, si) {
    var m = mapa(), d = duenyo(); m[d] = m[d] || {};
    if (si) m[d][k] = 1; else delete m[d][k];
    var ks = Object.keys(m); while (ks.length > 8) delete m[ks.shift()];
    try { localStorage.setItem(NUNCA_KEY, JSON.stringify(m)); } catch (e) {}
    return esNunca(k) === !!si;   // leído de vuelta: en el modo privado de iOS setItem lanza
  }
  function ahoraNo(k) { try { return (sessionStorage.getItem(AHORA_NO) || '').split(',').indexOf(k) >= 0; } catch (e) { return false; } }
  function ponAhoraNo(k) { try { var a = (sessionStorage.getItem(AHORA_NO) || '').split(',').filter(Boolean); if (a.indexOf(k) < 0) a.push(k); sessionStorage.setItem(AHORA_NO, a.join(',')); } catch (e) {} }

  /* ── Estilos ── una sola paleta: las dos capas son oscuras en los dos temas
     (igual que las tarjetas del Home), con su degradado de serie. */
  var CSS = '' +
'#tut-pop,#tut-hoja{position:fixed;inset:0;z-index:9200;display:none;font-family:"Space Grotesk",system-ui,sans-serif;color:#F8FAFC;-webkit-font-smoothing:antialiased}' +
'#tut-pop.on,#tut-hoja.on{display:block}' +
'.tut-velo{position:absolute;inset:0;background:rgba(3,8,20,.72);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);opacity:0;transition:opacity .3s}' +
'.on>.tut-velo{opacity:1}' +
/* hero de serie (aviso y hoja) */
'.tut-hero{position:relative;isolation:isolate;overflow:hidden;border-radius:26px;padding:22px 22px 20px;background:radial-gradient(90% 120% at 100% 0%,color-mix(in srgb,var(--g3) 50%,transparent),transparent 60%),radial-gradient(70% 90% at 0% 100%,rgba(0,0,0,.35),transparent 70%),linear-gradient(135deg,var(--g1) 0%,var(--g2) 58%,var(--g3) 140%);border:1px solid color-mix(in srgb,var(--ac) 38%,transparent);box-shadow:0 30px 70px -30px color-mix(in srgb,var(--g3) 70%,transparent),inset 0 1px 0 rgba(255,255,255,.2)}' +
'.tut-hero::before{content:"";position:absolute;inset:0 0 auto;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.7) 30%,rgba(255,255,255,.7) 60%,transparent);opacity:.55}' +
'.tut-rg{position:absolute;right:-90px;top:50%;width:300px;height:300px;margin-top:-150px;border-radius:50%;z-index:-1;background:repeating-radial-gradient(circle,transparent 0 26px,rgba(255,255,255,.07) 26px 27px);-webkit-mask:radial-gradient(circle,#000 30%,transparent 70%);mask:radial-gradient(circle,#000 30%,transparent 70%)}' +
'.tut-hero svg{position:absolute;right:20px;bottom:18px;width:84px;height:84px;z-index:-1;fill:none;stroke:#fff;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round;opacity:.9;filter:drop-shadow(0 0 16px color-mix(in srgb,var(--ac) 70%,transparent))}' +
'.tut-hero svg .f{fill:#fff;stroke:none}.tut-hero svg .w{fill:color-mix(in srgb,var(--ac) 45%,transparent);stroke:none}' +
'.tut-sh{position:absolute;inset:-20%;z-index:-1;background:linear-gradient(105deg,transparent 42%,rgba(255,255,255,.14) 50%,transparent 58%);transform:translateX(-70%);animation:tutSheen 8s cubic-bezier(.45,0,.2,1) infinite}' +
'@keyframes tutSheen{0%,62%{transform:translateX(-70%)}100%{transform:translateX(70%)}}' +
'.tut-ey{display:flex;flex-wrap:nowrap;white-space:nowrap;align-items:center;gap:8px;font:10.5px "Space Mono",monospace;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.88)}' +
'.tut-ey b{font-weight:400;padding:5px 10px;border-radius:100px;background:rgba(255,255,255,.13);border:1px solid rgba(255,255,255,.24);color:#fff}' +
'.tut-ey i{width:4px;height:4px;border-radius:50%;background:var(--ac);box-shadow:0 0 8px var(--ac)}' +
'.tut-h{margin:14px 0 0;font:700 46px/.86 "Saira Condensed","Space Grotesk",sans-serif;text-transform:uppercase;letter-spacing:-.005em;color:#fff;text-shadow:0 10px 30px rgba(0,0,0,.35);max-width:72%}' +
'.tut-h small{display:block;margin-top:9px;font:400 11px "Space Mono",monospace;letter-spacing:.38em;color:color-mix(in srgb,var(--ac) 55%,#fff)}' +
/* tira de episodios */
'.tut-tira{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;padding:16px 2px 4px;-webkit-overflow-scrolling:touch;scrollbar-width:none}' +
'.tut-tira::-webkit-scrollbar{display:none}' +
'.tut-ep{flex:0 0 132px;display:flex;flex-direction:column;justify-content:flex-start;align-self:flex-start;scroll-snap-align:start;appearance:none;border:0;padding:0;background:none;color:inherit;text-align:left;cursor:pointer;font:inherit}' +
'.tut-ep .pv{position:relative;display:block;width:132px;aspect-ratio:9/16;border-radius:16px;overflow:hidden;background:#000 center/cover no-repeat;border:1px solid color-mix(in srgb,var(--ac) 35%,transparent);box-shadow:0 14px 30px -16px var(--g3);transition:transform .25s cubic-bezier(.2,.8,.2,1)}' +
'.tut-ep:active .pv{transform:scale(.96)}' +
'.tut-ep .pv::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 55%,rgba(0,0,0,.6))}' +
'.tut-ep .pl{position:absolute;left:50%;top:50%;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;z-index:1;display:grid;place-items:center;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.45);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}' +
'.tut-ep .pl svg{width:16px;height:16px;margin-left:3px;fill:#fff}' +
'.tut-ep .du{position:absolute;right:8px;bottom:8px;z-index:1;font:10.5px "Space Mono",monospace;color:#fff}' +
'.tut-ep .nm{position:absolute;left:8px;bottom:8px;z-index:1;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font:700 12px "Saira Condensed",sans-serif;color:#fff;background:linear-gradient(135deg,var(--g2),var(--g3))}' +
'.tut-ep .tt{display:block;margin-top:9px;font:700 16px/1.02 "Saira Condensed","Space Grotesk",sans-serif;text-transform:uppercase;color:#fff}' +
'.tut-ep .ds{display:block;margin-top:4px;font-size:11.5px;line-height:1.35;color:#C3CBE3}' +
/* aviso de sección */
'.tut-caja{position:absolute;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));max-width:480px;margin:0 auto;border-radius:30px;padding:14px;background:linear-gradient(180deg,rgba(10,18,38,.97),rgba(5,10,24,.98));border:1px solid rgba(255,255,255,.1);box-shadow:0 -10px 60px rgba(0,0,0,.5);transform:translateY(40px);opacity:0;transition:transform .45s cubic-bezier(.2,.9,.25,1.05),opacity .3s}' +
'.on .tut-caja{transform:none;opacity:1}' +
'.tut-acc{display:flex;gap:10px;margin-top:14px}' +
'.tut-btn{flex:1;min-height:48px;border-radius:16px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#E2E8F0;font:600 14.5px "Space Grotesk",sans-serif;cursor:pointer}' +
'.tut-btn.go{border:0;color:#fff;background:linear-gradient(135deg,var(--g2),var(--g3));box-shadow:inset 0 1px 0 rgba(255,255,255,.3),0 10px 24px -10px var(--g3);text-shadow:0 1px 2px rgba(0,0,0,.45)}' +
'.tut-nunca{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:44px;margin-top:6px;border:0;background:none;color:#A8B2CC;font:500 13px "Space Grotesk",sans-serif;cursor:pointer}' +
'.tut-nunca .bx{width:18px;height:18px;border-radius:6px;border:1.5px solid #64748B;display:grid;place-items:center}' +
'.tut-nunca.si{color:#E2E8F0}.tut-nunca.si .bx{background:var(--ac);border-color:var(--ac)}' +
'.tut-nunca .bx svg{width:11px;height:11px;stroke:#04101f;stroke-width:3.4;fill:none;opacity:0}.tut-nunca.si .bx svg{opacity:1}' +
/* hoja completa */
'.tut-pan{position:absolute;inset:0;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:calc(18px + env(safe-area-inset-top)) 16px calc(40px + env(safe-area-inset-bottom));background:radial-gradient(ellipse 80% 40% at 50% 0%,rgba(124,58,237,.22),transparent 70%),linear-gradient(160deg,#040d1a,#071832 55%,#0a1e3a);transform:translateY(30px);opacity:0;transition:transform .4s cubic-bezier(.2,.9,.25,1),opacity .3s}' +
'.on .tut-pan{transform:none;opacity:1}' +
'.tut-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;max-width:620px;margin:0 auto 6px}' +
'.tut-tit{font:700 44px/.86 "Saira Condensed","Space Grotesk",sans-serif;text-transform:uppercase;color:#fff}' +
'.tut-tit small{display:block;margin-bottom:10px;font:400 10.5px "Space Mono",monospace;letter-spacing:.32em;color:#AEB6D4}' +
'.tut-tit span{background:linear-gradient(96deg,#A78BFA,#22D3EE 70%,#A5F3FC);-webkit-background-clip:text;background-clip:text;color:transparent}' +
'.tut-x{flex:none;width:44px;height:44px;border-radius:50%;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.07);display:grid;place-items:center;cursor:pointer}' +
'.tut-x svg{width:16px;height:16px;stroke:#E2E8F0;stroke-width:2.4;fill:none;stroke-linecap:round}' +
'.tut-ser{max-width:620px;margin:22px auto 0}' +
'.tut-red{max-width:620px;margin:22px auto 0;padding:14px 16px;border-radius:16px;background:#2A1B07;border:1px solid #7C5A14;color:#FDE68A;font-size:13.5px}' +
/* reproductor */
'.tut-pla{position:absolute;inset:0;z-index:2;display:none;background:#000}' +
'.tut-pla.on{display:flex;flex-direction:column}' +
'.tut-pla video{flex:1;min-height:0;width:100%;background:#000;object-fit:contain}' +
'.tut-pla .bar{display:flex;align-items:center;gap:12px;padding:calc(10px + env(safe-area-inset-top)) 14px 10px;background:linear-gradient(135deg,var(--g1),var(--g2) 70%,var(--g3) 160%)}' +
'.tut-pla .bar b{flex:1;min-width:0;font:700 19px/1.05 "Saira Condensed",sans-serif;text-transform:uppercase;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
'.tut-pla .bar span{display:block;font:400 10px "Space Mono",monospace;letter-spacing:.2em;color:rgba(255,255,255,.8)}' +
'.tut-pla .err{position:absolute;left:16px;right:16px;bottom:calc(30px + env(safe-area-inset-bottom));padding:12px 14px;border-radius:14px;background:#2A1B07;border:1px solid #7C5A14;color:#FDE68A;font-size:13.5px;display:none}' +
'@media (prefers-reduced-motion:reduce){.tut-sh{animation:none;opacity:0}.tut-caja,.tut-pan{transition:none}}';

  function estilos() { if (document.getElementById('tut-css')) return; var s = document.createElement('style'); s.id = 'tut-css'; s.textContent = CSS; document.head.appendChild(s); }
  function vars(sr) { return '--g1:' + sr.g[0] + ';--g2:' + sr.g[1] + ';--g3:' + sr.g[2] + ';--ac:' + sr.ac; }
  var PLAY = '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></svg>';
  var X = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  function heroHtml(sr, num) {
    return '<div class="tut-hero"><div class="tut-sh"></div><div class="tut-rg"></div>' +
      '<svg viewBox="0 0 100 100" aria-hidden="true">' + sr.ico + '</svg>' +
      '<div class="tut-ey">' + (num ? '<b>' + L('Serie ', 'Series ') + num + '</b><i></i>' : '') + '<span>' + nVid(sr.eps.length) + '</span><i></i><span>' + mins(sr) + ' min</span></div>' +
      '<div class="tut-h">' + esc(sr.nom) + '<small>' + L('EN VÍDEO', 'ON VIDEO') + '</small></div></div>';
  }
  function tiraHtml(sr) {
    return '<div class="tut-tira">' + sr.eps.map(function (e, i) {
      return '<button type="button" class="tut-ep" data-tut-ver="' + sr.k + ':' + i + '" aria-label="' + esc(e.t) + '">' +
        '<span class="pv" style="background-image:url(\'' + BASE + (e.p || e.f) + '.jpg\')"><span class="pl">' + PLAY + '</span><span class="nm">' + (i + 1) + '</span><span class="du">' + mmss(e.s) + '</span></span>' +
        '<span class="tt">' + esc(e.t) + '</span><span class="ds">' + esc(EN() ? e.en : e.es) + '</span></button>';
    }).join('') + '</div>';
  }

  /* ── Capas ── */
  function capa(id) {
    var el = document.getElementById(id);
    if (!el) {
      estilos(); el = document.createElement('div'); el.id = id; el.setAttribute('translate', 'no');
      document.body.appendChild(el);
      el.addEventListener('click', clic);
      try { if (root.NAV_CAPAS) root.NAV_CAPAS.push({ id: id, cerrar: function () { cierra(id); } }); } catch (e) {}
    }
    return el;
  }
  function abre(el) { el.style.display = 'block'; void el.offsetWidth; el.classList.add('on'); }
  function cierra(id) {
    var el = document.getElementById(id); if (!el) return;
    var v = el.querySelector('video'); if (v) { try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) {} }
    el.classList.remove('on'); el.style.display = 'none';
  }

  /* El aviso de una sección */
  var popK = null;
  function aviso(k) {
    var sr = serie(k); if (!sr) return;
    var el = capa('tut-pop'); popK = sr.k;
    el.setAttribute('style', vars(sr)); el.dataset.k = sr.k;
    el.innerHTML = '<div class="tut-velo" data-tut="ahorano"></div><div class="tut-caja" role="dialog" aria-label="' + esc(L('Tutoriales de ', 'Tutorials: ') + sr.nom) + '">' +
      heroHtml(sr) + tiraHtml(sr) +
      '<div class="tut-acc"><button type="button" class="tut-btn" data-tut="ahorano">' + L('Ahora no', 'Not now') + '</button>' +
      '<button type="button" class="tut-btn go" data-tut-ver="' + sr.k + ':0">' + L('Ver ahora', 'Watch now') + '</button></div>' +
      '<button type="button" class="tut-nunca" data-tut="nunca"><span class="bx"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg></span>' + L('No volver a mostrar', 'Don’t show again') + '</button></div>';
    abre(el);
  }

  /* La hoja con todas las series (o una) */
  function hoja(soloK) {
    var el = capa('tut-hoja'); delete el.dataset.guia;
    var lista = SERIES.filter(function (s) { return !soloK || s.k === soloK; });
    el.removeAttribute('style');
    el.innerHTML = '<div class="tut-velo"></div><div class="tut-pan">' +
      '<div class="tut-top"><div class="tut-tit"><small>' + L('PILOTOS · TUTORIALES', 'PILOTOS · TUTORIALS') + '</small>' + L('Aprende', 'Learn') + ' <span>' + L('en vídeo', 'on video') + '</span></div>' +
      '<button type="button" class="tut-x" data-tut="cerrar" aria-label="' + L('Cerrar', 'Close') + '">' + X + '</button></div>' +
      (navigator.onLine === false ? '<div class="tut-red">' + L('Sin conexión: los vídeos se ven con internet. Vuelve a abrirlos cuando tengas cobertura.', 'You’re offline: the videos need internet. Open them again when you have coverage.') + '</div>' : '') +
      lista.map(function (sr) { return '<div class="tut-ser" style="' + vars(sr) + '">' + heroHtml(sr, SERIES.indexOf(sr) + 1 < 10 ? '0' + (SERIES.indexOf(sr) + 1) : SERIES.indexOf(sr) + 1) + tiraHtml(sr) + '</div>'; }).join('') +
      '</div><div class="tut-pla"></div>';
    abre(el);
  }

  /* El reproductor: dentro de la hoja, a pantalla completa */
  function ver(k, i) {
    var sr = serie(k); if (!sr) return; var e = sr.eps[i]; if (!e) return;
    cierra('tut-pop');
    var el = document.getElementById('tut-hoja');
    /* Si la hoja no estaba abierta (el aviso de la sección, o un vídeo pedido
       desde fuera), cerrar el reproductor vuelve a la SECCIÓN, no a la lista. */
    if (!el || !el.classList.contains('on')) { hoja(); el = document.getElementById('tut-hoja'); el.dataset.guia = '1'; }
    var pl = el.querySelector('.tut-pla');
    pl.setAttribute('style', vars(sr));
    pl.innerHTML = '<div class="bar"><b>' + esc(e.t) + '<span>' + esc(sr.nom) + ' · ' + (i + 1) + '/' + sr.eps.length + '</span></b>' +
      '<button type="button" class="tut-x" data-tut="volver" aria-label="' + L('Volver', 'Back') + '">' + X + '</button></div>' +
      '<video playsinline controls autoplay preload="auto" poster="' + BASE + (e.p || e.f) + '.jpg" src="' + BASE + e.f + '.mp4"></video>' +
      '<div class="err">' + L('No se ha podido cargar el vídeo. Comprueba la conexión y vuelve a intentarlo.', 'The video couldn’t load. Check your connection and try again.') + '</div>';
    pl.classList.add('on');
    var v = pl.querySelector('video');
    v.addEventListener('error', function () { var er = pl.querySelector('.err'); if (er) er.style.display = 'block'; });
    v.addEventListener('ended', function () { if (sr.eps[i + 1]) ver(k, i + 1); });
    var p = v.play(); if (p && p.catch) p.catch(function () {});   // sin gesto: quedan los controles
  }
  function volver() { var el = document.getElementById('tut-hoja'); if (!el) return; var pl = el.querySelector('.tut-pla'); if (!pl) return; var v = pl.querySelector('video'); if (v) { try { v.pause(); } catch (e) {} } pl.classList.remove('on'); pl.innerHTML = ''; if (el.dataset.guia) { delete el.dataset.guia; cierra('tut-hoja'); } }

  /* La Guía de uso (guide.html, en un iframe) pide la lista para poner su
     botón «▶ Ver en vídeo» en cada sección. Una sola lista y un solo
     reproductor: los de aquí. Una serie nueva aparece sola en la guía. */
  function paraGuia() {
    return SERIES.map(function (sr) {
      /* nom, d y p: la pestaña «Vídeos» de la guía pinta la lista entera con
         sus portadas. Reproducir lo sigue haciendo la app (ver). */
      return { k: sr.k, pant: sr.pant || sr.k, nom: sr.nom, g: sr.g, ac: sr.ac,
        eps: sr.eps.map(function (e) { return { t: e.t, s: e.s, tab: e.tab || '', d: L(e.es, e.en), p: BASE + (e.p || e.f) + '.jpg' }; }) };
    });
  }
  window.addEventListener('message', function (ev) {
    var d = ev.data || {}, fr = document.getElementById('guideFrame');
    if (!fr || ev.source !== fr.contentWindow) return;
    if (d.type === 'pilotos-guide-tuts') {
      try { ev.source.postMessage({ type: 'pilotos-tuts', lang: EN() ? 'en' : 'es', series: paraGuia() }, '*'); } catch (e) {}
    } else if (d.type === 'pilotos-guide-tut' && serie(d.k)) {
      hoja(d.k);
      /* Un vídeo concreto pedido desde la guía: «volver» del reproductor vuelve a
         la GUÍA, no a una lista de la app que el piloto no ha pedido. */
      var hj = document.getElementById('tut-hoja');
      if (hj) { if (typeof d.i === 'number') hj.dataset.guia = '1'; else delete hj.dataset.guia; }
      if (typeof d.i === 'number') ver(d.k, d.i);
    }
  });

  function clic(ev) {
    var b = ev.target.closest('[data-tut-ver],[data-tut]'); if (!b) return;
    if (b.dataset.tutVer) { var p = b.dataset.tutVer.split(':'); ver(p[0], +p[1]); return; }
    var a = b.dataset.tut;
    if (a === 'cerrar') cierra('tut-hoja');
    else if (a === 'volver') volver();
    else if (a === 'ahorano') { if (popK) ponAhoraNo(popK); cierra('tut-pop'); }
    else if (a === 'nunca') {
      var si = !b.classList.contains('si');
      if (popK && ponNunca(popK, si)) {
        b.classList.toggle('si', si);
        if (si) setTimeout(function () { if (b.classList.contains('si')) cierra('tut-pop'); }, 650);
      }
    }
  }

  /* ── El aviso al entrar en una sección ── */
  function conSesion() { try { var t = localStorage.getItem('cafi_auth_token'); return !!t && t !== 'demo-bypass-token'; } catch (e) { return false; } }
  function pantActiva(id) { var s = document.getElementById('scr-' + id); return !!(s && s.classList.contains('active')); }
  /* ¿Hay otra cosa delante? Se pregunta a la PANTALLA: lo que recibe el dedo en
     el centro tiene que ser de la sección o de la barra de abajo. Una lista de
     ids de hojas se quedaría vieja con la siguiente hoja que alguien añada. */
  function despejada(id) {
    var x = innerWidth / 2, y = innerHeight * 0.45, el = document.elementFromPoint(x, y);
    var s = document.getElementById('scr-' + id);
    return !!(el && s && s.contains(el));
  }
  var espera = {};
  function intenta(sr, n) {
    if (!pantActiva(sr.pant) || esNunca(sr.k) || ahoraNo(sr.k) || !conSesion()) return;
    var otra = document.getElementById('tut-pop'); if (otra && otra.classList.contains('on')) return;
    var h = document.getElementById('tut-hoja'); if (h && h.classList.contains('on')) return;
    if (despejada(sr.pant)) { aviso(sr.k); return; }
    if (n < 8) espera[sr.k] = setTimeout(function () { intenta(sr, n + 1); }, 1500);
  }
  function vigila() {
    SERIES.forEach(function (sr) {
      var s = document.getElementById('scr-' + sr.pant); if (!s) return;
      var era = s.classList.contains('active');
      new MutationObserver(function () {
        var es = s.classList.contains('active');
        if (es && !era) { clearTimeout(espera[sr.k]); espera[sr.k] = setTimeout(function () { intenta(sr, 0); }, 1100); }
        if (!es && era) { clearTimeout(espera[sr.k]); if (popK === sr.k) cierra('tut-pop'); }
        era = es;
      }).observe(s, { attributes: true, attributeFilter: ['class'] });
      if (era) espera[sr.k] = setTimeout(function () { intenta(sr, 0); }, 1800);
    });
  }

  root.pilotosTutoriales = { abre: hoja, ver: ver, aviso: aviso, esNunca: esNunca, ponNunca: ponNunca, SERIES: SERIES, BASE: BASE };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', vigila); else vigila();
})(typeof window !== 'undefined' ? window : this);
