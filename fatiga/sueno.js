/* ══════════════════════════════════════════════════════════════════════════
   FATIGA — el sueño REAL desde Apple Salud, por un Atajo de iPhone (F2)

   Una app web no puede leer Apple Salud. Un Atajo sí: busca las muestras de
   «Análisis de sueño» de los dos últimos días y las manda a nuestro servidor con
   un ENLACE PERSONAL del piloto (fatiga-routes.js). La app las lee de vuelta y
   el modelo (motor.js, `medidos`) usa ese sueño en vez del estimado.

   Aquí: leer y guardar lo recibido (`pilotos_fat_sueno`), pedirlo al servidor
   con dos orígenes (una ruta nueva nace rota en beta si sólo se pregunta al de
   producción), crear/anular el enlace y la hoja que explica cómo montar el
   Atajo. La pantalla (pantalla.js) la abre con FatigaSueno.hoja().

   ATAJO_ICLOUD: el enlace de iCloud del Atajo ya hecho (lo montó el piloto el
   29-oct-2026). Con enlace = un botón «Añadir el atajo» y el piloto pega SU
   enlace en «Obtener contenido de»; los pasos a mano quedan plegados debajo.
   ⚠ El Atajo compartido NO lleva pregunta de importación: el enlace se pega a
   mano. Si alguien se olvida, el del Atajo compartido está anulado (se rehízo):
   el servidor contesta 401 «este enlace ya no vale», nunca a otra cuenta.
   ══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var ATAJO_ICLOUD = 'https://www.icloud.com/shortcuts/a5ee7ab1d17f404dbe77b1f4f877f00d';
  var LS = 'pilotos_fat_sueno';
  var MIN_SYNC = 5 * 60000;

  function en() { return (root.pilotosLang || 'es') === 'en'; }
  function L(es, eng) { return en() ? eng : es; }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function lee() { try { return JSON.parse(localStorage.getItem(LS) || 'null') || null; } catch (e) { return null; } }
  function guarda(o) { try { localStorage.setItem(LS, JSON.stringify(o)); } catch (e) {} }
  function medidos() { var o = lee(); return (o && Array.isArray(o.episodios)) ? o.episodios : []; }
  function firma() { var o = lee(); return o ? (medidos().length + ':' + (o.at || 0)) : '0'; }

  function token() {
    try { if (typeof root.ldAuthHeaders === 'function') return root.ldAuthHeaders(); } catch (e) {}
    try { var t = localStorage.getItem('cafi_auth_token'); return t && t !== 'demo-bypass-token' ? t : null; } catch (e) { return null; }
  }
  function origenes() {
    var o = [];
    try { o.push(location.origin); } catch (e) {}
    try { if (typeof root.ldBackendUrl === 'function') o.push(root.ldBackendUrl()); } catch (e) {}
    return o.filter(function (x, i) { return x && /^https?:/.test(x) && o.indexOf(x) === i; });
  }
  function pide(metodo, ruta) {
    var tk = token();
    if (!tk) return Promise.reject(new Error('sin sesión'));
    var os = origenes(), i = 0;
    function prueba() {
      if (i >= os.length) return Promise.reject(new Error('sin respuesta'));
      var o = os[i++];
      return fetch(o + ruta, { method: metodo, cache: 'no-store', headers: { Authorization: 'Bearer ' + tk } }).then(function (r) {
        if (r.status === 404) throw new Error('404');
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      }).catch(prueba);
    }
    return prueba();
  }

  var _ultSync = 0, _enVuelo = null;
  function sincroniza(forzar) {
    if (_enVuelo) return _enVuelo;
    if (!forzar && Date.now() - _ultSync < MIN_SYNC) return Promise.resolve(false);
    _ultSync = Date.now();
    _enVuelo = pide('GET', '/api/fatiga/sueno').then(function (j) {
      var antes = firma();
      guarda({ episodios: j.episodios || [], at: j.at || null, ult: j.ult || null, enlace: j.enlace || null, leido: Date.now() });
      _enVuelo = null;
      if (firma() !== antes) avisa();
      return true;
    }).catch(function () { _enVuelo = null; return false; });
    return _enVuelo;
  }
  function avisa() { try { root.dispatchEvent(new CustomEvent('pilotos-fatiga-sueno')); } catch (e) {} }

  var HOJA = { url: null, msg: '', ocupado: false };
  function creaEnlace() {
    HOJA.ocupado = true; HOJA.msg = ''; repinta();
    return pide('POST', '/api/fatiga/sueno/enlace').then(function (j) {
      HOJA.url = j.url; HOJA.ocupado = false;
      var o = lee() || {}; o.enlace = { creado: Date.now(), ult: null, url: j.url }; guarda(o);
      repinta();
    }).catch(function (e) {
      HOJA.ocupado = false;
      HOJA.msg = /sesión/.test(e.message) ? L('Entra con tu cuenta para crear el enlace.', 'Sign in to create the link.') : L('No se ha podido crear el enlace. Comprueba la conexión y vuelve a probar.', 'Could not create the link. Check your connection and try again.');
      repinta();
    });
  }
  function desconecta() {
    HOJA.ocupado = true; repinta();
    return Promise.all([pide('DELETE', '/api/fatiga/sueno/enlace'), pide('DELETE', '/api/fatiga/sueno')]).then(function () {
      guarda({ episodios: [], at: null, ult: null, enlace: null, leido: Date.now() });
      HOJA.url = null; HOJA.ocupado = false; HOJA.msg = L('Desconectado. El sueño recibido se ha borrado.', 'Disconnected. The received sleep has been deleted.');
      avisa(); repinta();
    }).catch(function () { HOJA.ocupado = false; HOJA.msg = L('No se ha podido desconectar ahora.', 'Could not disconnect right now.'); repinta(); });
  }
  /* En la PWA de iOS el portapapeles falla a veces: se copia desde un campo de
     texto (execCommand) y, si tampoco, se ofrece Compartir, que trae «Copiar».
     El aviso se escribe en su nodo SIN repintar: repintar borraría la selección. */
  function urlActual() { var o = lee() || {}; return HOJA.url || (o.enlace && o.enlace.url) || null; }
  function dice(t) { HOJA.msg = t; var m = document.querySelector('[data-fsu-msg]'); if (m) m.textContent = t; else repinta(); }
  function selecciona() {
    var el = document.querySelector('[data-fsu-url]');
    if (!el) return false;
    try { el.focus(); el.select(); el.setSelectionRange(0, el.value.length); } catch (e) {}
    var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
    return ok;
  }
  /* Lo copiado se DICE junto al botón: el aviso de abajo (data-fsu-msg) queda
     fuera de la pantalla y «copiado» y «no ha hecho nada» se veían igual. */
  var _tCop = 0;
  function copiado() {
    var b = document.querySelector('[data-fsu-copia]'), bar = document.querySelector('[data-fsu-ok]');
    if (b) { b.textContent = '✓ ' + L('Enlace copiado', 'Link copied'); b.classList.add('fsu-hecho'); }
    if (bar) { bar.textContent = L('✓ Enlace copiado. Pégalo en «Obtener contenido de» del atajo.', '✓ Link copied. Paste it into «Get Contents of» in the shortcut.'); bar.hidden = false; }
    clearTimeout(_tCop);
    _tCop = setTimeout(function () {
      var b2 = document.querySelector('[data-fsu-copia]');
      if (b2) { b2.textContent = L('Copiar el enlace', 'Copy the link'); b2.classList.remove('fsu-hecho'); }
    }, 2500);
  }
  function copia() {
    var u = urlActual(); if (!u) return;
    var bien = function () { copiado(); dice(L('Enlace copiado. Pégalo en la URL del atajo.', 'Link copied. Paste it into the shortcut URL.')); };
    var mal = function () {
      if (selecciona()) return bien();
      dice(L('No se ha podido copiar solo: usa «Compartir» y elige Copiar, o mantén pulsado el enlace.', 'Could not copy automatically: use Share and choose Copy, or press and hold the link.'));
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(u).then(bien, mal); return; }
    } catch (e) {}
    mal();
  }
  function comparte() {
    var u = urlActual(); if (!u) return;
    if (navigator.share) { navigator.share({ text: u }).catch(function () {}); return; }
    copia();
  }
  function comprueba() {
    HOJA.ocupado = true; HOJA.msg = ''; repinta();
    sincroniza(true).then(function (ok) {
      HOJA.ocupado = false;
      HOJA.msg = ok ? '' : L('No se ha podido preguntar al servidor.', 'Could not reach the server.');
      repinta();
    });
  }
  function repinta() { try { if (root.FatigaUI && root.FatigaUI.pintaHoja) root.FatigaUI.pintaHoja(); } catch (e) {} }

  function hace(ms) {
    if (!ms) return '';
    var m = Math.max(0, Math.round((Date.now() - ms) / 60000));
    if (m < 60) return L('hace ' + m + ' min', m + ' min ago');
    var h = Math.round(m / 60);
    if (h < 48) return L('hace ' + h + ' h', h + ' h ago');
    return L('hace ' + Math.round(h / 24) + ' días', Math.round(h / 24) + ' days ago');
  }
  function hhmm(ms) {
    try { var d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); } catch (e) { return ''; }
  }
  function ultimaNoche() {
    var e = medidos(); return e.length ? e[e.length - 1] : null;
  }
  /* Una línea de estado: la usan la tarjeta de Check y la hoja. */
  function estado() {
    var o = lee() || {}, u = ultimaNoche();
    if (u) return { k: 'ok', t: L('Último sueño recibido: ' + hhmm(u.ini) + '–' + hhmm(u.fin), 'Last sleep received: ' + hhmm(u.ini) + '–' + hhmm(u.fin)),
      s: o.at ? L('Enviado por el atajo ' + hace(o.at), 'Sent by the shortcut ' + hace(o.at)) : '' };
    if (o.enlace) return { k: 'espera', t: L('Enlace creado · esperando al atajo', 'Link created · waiting for the shortcut'), s: L('Ejecuta el atajo una vez para comprobarlo.', 'Run the shortcut once to check it.') };
    return { k: 'no', t: L('Sin conectar', 'Not connected'), s: L('El modelo estima tu sueño con tu roster.', 'The model estimates your sleep from your roster.') };
  }

  function pasos() {
    var P = en() ? [
      'Open the <b>Shortcuts</b> app and tap <b>+</b>.',
      'Add <b>Find Health Samples</b>: Type <b>Sleep Analysis</b>, Start Date <b>is in the last 2 days</b>.',
      'Add <b>Repeat with Each</b> over the whole <b>Health Samples</b> (don’t pick a property). Only one repeat.',
      'Inside it, a <b>Text</b> action: insert <b>Repeat Item</b>, tap it, pick <b>Start Date</b> and Date Format <b>ISO 8601</b> (time on). Type <b>|</b>. Again <b>Repeat Item</b> → <b>End Date</b>, ISO 8601. Type <b>|</b>. Again <b>Repeat Item</b> → <b>Value</b>. No spaces.',
      'After <b>End Repeat</b>: <b>Combine Text</b> of the Repeat Results, with <b>New Lines</b>.',
      'Add <b>Get Contents of URL</b>: paste your link, Method <b>POST</b>, Request Body <b>JSON</b>, one Text field named <b>muestras</b> with the Combined Text.',
      'Optional: <b>Show Content</b> (older iOS: <b>Show Result</b>), to see what PilotOS answered.'
    ] : [
      'Abre la app <b>Atajos</b> y pulsa <b>+</b>.',
      'Añade <b>Buscar muestras médicas</b>: Tipo <b>Sueño</b>, Fecha de inicio <b>está entre los últimos 2 días</b>.',
      'Añade <b>Repetir con cada ítem</b> sobre <b>Muestras médicas</b> entera (sin elegir ninguna propiedad). Un solo Repetir.',
      'Dentro, una acción <b>Texto</b>: inserta <b>Ítem repetido</b>, tócalo, elige <b>Fecha de inicio</b> y Formato de fecha <b>ISO 8601</b> (con hora). Escribe <b>|</b>. Otra vez <b>Ítem repetido</b> → <b>Fecha de fin</b>, ISO 8601. Escribe <b>|</b>. Otra vez <b>Ítem repetido</b> → <b>Valor</b>. Sin espacios.',
      'Después de <b>Terminar repetición</b>: <b>Combinar texto</b> con los Resultados de la repetición, con <b>Saltos de línea</b>.',
      'Añade <b>Obtener contenido de URL</b>: pega tu enlace, Método <b>POST</b>, Cuerpo de la solicitud <b>JSON</b>, un campo de Texto llamado <b>muestras</b> con el Texto combinado.',
      'Opcional: <b>Mostrar contenido</b> (en iOS anteriores, <b>Mostrar resultado</b>), para ver qué ha contestado PilotOS.'
    ];
    return '<ol class="fsu-pasos">' + P.map(function (p) { return '<li>' + p + '</li>'; }).join('') + '</ol>';
  }

  function hoja() {
    var es = estado(), o = lee() || {};
    var tieneEnlace = !!(HOJA.url || o.enlace);
    var url = urlActual();
    var urlBlk = url
      ? '<div class="fsu-urlw"><textarea class="fsu-url" data-fsu-url readonly rows="4" onfocus="this.select()">' + esc(url) + '</textarea>' +
        '<button type="button" class="fbtnp" data-fsu-copia onclick="fatSuenoCopia()">' + L('Copiar el enlace', 'Copy the link') + '</button>' +
        '<div class="fsu-ok" data-fsu-ok role="status" aria-live="polite" hidden></div>' +
        '<button type="button" class="fbtnp fbtn-s" data-fsu-comparte onclick="fatSuenoComparte()">' + L('Compartir el enlace', 'Share the link') + '</button>' +
        '<div class="fsub">' + L('Es personal: con él sólo se puede ESCRIBIR tu sueño en PilotOS, nada más. No lo compartas.', 'It is personal: it can only WRITE your sleep into PilotOS, nothing else. Do not share it.') + '</div></div>'
      : '<button type="button" class="fbtnp" data-fsu-crea onclick="fatSuenoEnlace()"' + (HOJA.ocupado ? ' disabled' : '') + '>' +
        (tieneEnlace ? L('Rehacer el enlace (anula el anterior)', 'Make a new link (cancels the old one)') : L('Crear mi enlace', 'Create my link')) + '</button>';
    return '<div class="fov" onclick="if(event.target===this)fatSueno(false)"><div class="fsheet fsu" role="dialog" aria-modal="true" aria-label="' + esc(L('Tu sueño real', 'Your real sleep')) + '">' +
      '<div class="fgrip"></div><div class="flab t-acc">' + L('APPLE SALUD · ATAJO DE IPHONE', 'APPLE HEALTH · IPHONE SHORTCUT') + '</div>' +
      '<div class="fsh-t">' + L('Tu sueño real, no el estimado', 'Your real sleep, not the estimate') + '</div>' +
      '<p class="fsh-p">' + L('Un atajo de iPhone lee lo que durmiste en Apple Salud (del Apple Watch, otro reloj que escriba en Salud, o el horario de sueño del iPhone) y lo manda a PilotOS. Esas noches el modelo deja de suponer y usa tu sueño.', 'An iPhone shortcut reads what you slept from Apple Health (Apple Watch, another watch that writes to Health, or the iPhone sleep schedule) and sends it to PilotOS. For those nights the model stops guessing and uses your sleep.') + '</p>' +
      '<div class="fcard fsu-est fsu-' + es.k + '" data-fsu-estado><div class="ftit2">' + esc(es.t) + '</div>' + (es.s ? '<div class="fsub">' + esc(es.s) + '</div>' : '') + '</div>' +
      '<div class="fsu-h">1 · ' + L('Tu enlace personal', 'Your personal link') + '</div>' + urlBlk +
      '<div class="fsu-h">2 · ' + L('El atajo', 'The shortcut') + '</div>' +
      (ATAJO_ICLOUD
        ? '<a class="fbtnp fsu-a" href="' + esc(ATAJO_ICLOUD) + '" target="_blank" rel="noopener">' + L('Añadir el atajo', 'Add the shortcut') + '</a>' +
          '<p class="fsub2">' + L('Ábrelo, pulsa <b>Añadir atajo</b> y después edítalo: en <b>Obtener contenido de</b> borra el enlace que trae y pega el tuyo (el que acabas de copiar). Sin ese cambio no se guarda nada en tu cuenta.', 'Open it, tap <b>Add Shortcut</b> and then edit it: in <b>Get Contents of</b> delete the link it brings and paste yours (the one you just copied). Without that change nothing is saved to your account.') + '</p>' +
          '<details class="fsu-man"><summary>' + L('Prefiero montarlo a mano', 'I\'d rather build it myself') + '</summary>' + pasos() + '</details>'
        : pasos()) +
      '<div class="fsu-h">3 · ' + L('Que se mande solo', 'Make it run by itself') + '</div>' +
      '<p class="fsub2">' + L('En Atajos → Automatización → Nueva → <b>Alarma</b> «Se detiene» (o <b>Hora del día</b>, por ejemplo 10:00) → <b>Ejecutar inmediatamente</b> → elige tu atajo.', 'In Shortcuts → Automation → New → <b>Alarm</b> «Is Stopped» (or <b>Time of Day</b>, e.g. 10:00) → <b>Run Immediately</b> → pick your shortcut.') + '</p>' +
      '<div class="fsh-tip" data-fsu-msg>' + esc(HOJA.msg || '') + '</div>' +
      '<button type="button" class="fbtnp fbtn-s" data-fsu-comprueba onclick="fatSuenoComprueba()"' + (HOJA.ocupado ? ' disabled' : '') + '>' + L('Comprobar si ha llegado', 'Check if it has arrived') + '</button>' +
      (tieneEnlace || medidos().length ? '<button type="button" class="fbtnp fbtn-s" data-fsu-quita onclick="fatSuenoQuita()"' + (HOJA.ocupado ? ' disabled' : '') + '>' + L('Desconectar y borrar lo recibido', 'Disconnect and delete what was received') + '</button>' : '') +
      '<div class="fsub fiq-pie">' + L('Sólo llega la hora a la que te dormiste y te despertaste. Nada más de Salud. En Android, de momento no se puede: hace falta una app nativa.', 'Only the times you fell asleep and woke up arrive. Nothing else from Health. On Android it is not possible yet: it needs a native app.') + '</div>' +
      '<button type="button" class="fbtnp" onclick="fatSueno(false)">' + L('Cerrar', 'Close') + '</button>' +
      '</div></div>';
  }

  /* ── Historial: lo recibido de los últimos días, en gráfica ─────────────
     Lo abre la casilla «Último sueño» de Hoy (pantalla.js, ST.hist). Una fila
     por día (el día en que te despertaste), de las 18:00 de la víspera a las
     18:00 de ese día, con cada periodo dormido y el total. Un día sin datos se
     DICE («sin datos»): no haber dormido y no haber mandado el atajo no pueden
     verse igual. Hora del aparato, que es la que escribe Salud. */
  var ATAJO_NOMBRE = 'Sueño a Pilotos';
  var HIST_DIAS = 10;
  function diaLocal(ms) { var d = new Date(ms); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function hm(m) { m = Math.max(0, Math.round(m || 0)); return Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0'); }
  function noches(eps, ahora) {
    ahora = ahora || Date.now();
    var hoy = new Date(ahora); hoy.setHours(0, 0, 0, 0);
    var filas = [];
    for (var i = HIST_DIAS - 1; i >= 0; i--) {
      var d0 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - i);
      var ini = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() - 1, 18).getTime();
      var fin = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate(), 18).getTime();
      var key = diaLocal(d0.getTime());
      var de = eps.filter(function (e) { return e && diaLocal(e.fin) === key; });
      var total = de.reduce(function (a, e) { return a + Math.max(0, e.fin - e.ini) / 60000; }, 0);
      filas.push({ fecha: key, d: d0, ini: ini, fin: fin, eps: de, min: Math.round(total) });
    }
    return filas;
  }
  function nombreDia(d) {
    var DS = en() ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    return DS[d.getDay()] + ' ' + d.getDate();
  }
  function grafica(opts) {
    opts = opts || {};
    var o = lee() || {}, eps = medidos(), filas = noches(eps);
    var conDatos = filas.filter(function (f) { return f.min > 0; });
    var media = conDatos.length ? conDatos.reduce(function (a, f) { return a + f.min; }, 0) / conDatos.length : 0;
    var ult = conDatos.length ? conDatos[conDatos.length - 1] : null;
    var hoyKey = diaLocal(Date.now());
    var viejo = !o.at || Date.now() - o.at > 26 * 3600000;
    var res = '<div class="fsuh-res">' +
      '<div class="fcard fsuh-k"><div class="flab">' + L('ÚLTIMA NOCHE', 'LAST NIGHT') + '</div><div class="fmono fbig">' + (ult ? hm(ult.min) : '—') + '</div><div class="fsub">' + (ult ? esc(nombreDia(ult.d)) : L('sin datos', 'no data')) + '</div></div>' +
      '<div class="fcard fsuh-k"><div class="flab">' + L('MEDIA', 'AVERAGE') + '</div><div class="fmono fbig">' + (conDatos.length ? hm(media) : '—') + '</div><div class="fsub">' + L(conDatos.length + ' de ' + HIST_DIAS + ' días', conDatos.length + ' of ' + HIST_DIAS + ' days') + '</div></div>' +
      '</div>';
    var ejes = '<div class="fsuh-eje"><span></span><div class="fsuh-ejel"><i style="left:0">18</i><i style="left:25%">00</i><i style="left:50%">06</i><i style="left:75%">12</i><i style="left:100%">18</i></div><span></span></div>';
    var rows = filas.slice().reverse().map(function (f) {
      var span = f.fin - f.ini;
      var bars = f.eps.map(function (e) {
        var a = Math.max(0, (e.ini - f.ini) / span), b = Math.min(1, (e.fin - f.ini) / span);
        if (b <= a) return '';
        return '<b style="left:' + (a * 100).toFixed(2) + '%;width:' + ((b - a) * 100).toFixed(2) + '%" title="' + esc(hhmm(e.ini) + '–' + hhmm(e.fin)) + '"></b>';
      }).join('');
      var cls = f.min ? (f.min < 360 ? ' fsuh-corto' : '') : ' fsuh-nada';
      return '<div class="fsuh-f' + cls + (f.fecha === hoyKey ? ' fsuh-hoy' : '') + '" data-fsuh-dia="' + f.fecha + '">' +
        '<span class="fsuh-d">' + esc(nombreDia(f.d)) + '</span>' +
        '<div class="fsuh-t"><em></em>' + (bars || '') + '</div>' +
        '<span class="fsuh-m fmono">' + (f.min ? hm(f.min) : L('sin datos', 'no data')) + '</span></div>';
    }).join('');
    var detalle = ult ? '<div class="fsub2">' + L('Última noche: ', 'Last night: ') + ult.eps.map(function (e) { return hhmm(e.ini) + '–' + hhmm(e.fin); }).join(' · ') + '</div>' : '';
    var prevista = opts.prevista ? '<div class="fsh-tip fsuh-prev">' + esc(L('Hoy enseña tu próxima jornada (' + opts.prevista + '): el sueño de antes de ella aún no ha pasado, por eso pone «previsto». Cuando llegue esa noche y el atajo la mande, pondrá «medido».', 'Today shows your next duty (' + opts.prevista + '): the sleep before it has not happened yet, so it says «forecast». Once that night comes and the shortcut sends it, it will say «measured».')) + '</div>' : '';
    var aviso = viejo ? '<div class="fsh-tip fsuh-viejo">' + esc(o.at ? L('El atajo no manda nada desde ' + hace(o.at) + '. Ejecútalo para traer las últimas noches.', 'The shortcut has not sent anything for ' + hace(o.at).replace(' ago', '') + '. Run it to bring the latest nights.') : L('Todavía no ha llegado nada del atajo.', 'Nothing has arrived from the shortcut yet.')) + '</div>' : '';
    return '<div class="fov" onclick="if(event.target===this)fatSuenoHist(false)"><div class="fsheet fsu fsuh" role="dialog" aria-modal="true" aria-label="' + esc(L('Tu sueño medido', 'Your measured sleep')) + '">' +
      '<div class="fgrip"></div><div class="flab t-acc">' + L('APPLE SALUD · ÚLTIMOS ' + HIST_DIAS + ' DÍAS', 'APPLE HEALTH · LAST ' + HIST_DIAS + ' DAYS') + '</div>' +
      '<div class="fsh-t">' + L('Tu sueño medido', 'Your measured sleep') + '</div>' +
      '<div class="fsub">' + esc(o.at ? L('Último envío del atajo ' + hace(o.at), 'Last sent by the shortcut ' + hace(o.at)) : L('El atajo aún no ha mandado nada', 'The shortcut has not sent anything yet')) + '</div>' +
      prevista + aviso + res +
      '<div class="fcard fsuh-g">' + ejes + rows + '</div>' + detalle +
      '<div class="fsh-tip" data-fsu-msg>' + esc(HOJA.msg || '') + '</div>' +
      '<a class="fbtnp fsu-a" data-fsuh-run href="shortcuts://run-shortcut?name=' + encodeURIComponent(ATAJO_NOMBRE) + '">' + L('Ejecutar el atajo «' + ATAJO_NOMBRE + '»', 'Run the «' + ATAJO_NOMBRE + '» shortcut') + '</a>' +
      '<div class="fsub2">' + L('Abre Atajos, manda tus últimas noches y vuelve aquí: se actualiza solo al volver.', 'It opens Shortcuts, sends your latest nights and comes back here: it updates when you return.') + '</div>' +
      '<button type="button" class="fbtnp fbtn-s" data-fsu-comprueba onclick="fatSuenoComprueba()"' + (HOJA.ocupado ? ' disabled' : '') + '>' + (HOJA.ocupado ? L('Comprobando…', 'Checking…') : L('Comprobar si ha llegado', 'Check if it has arrived')) + '</button>' +
      '<button type="button" class="fbtnp fbtn-s" onclick="fatSueno(true)">' + L('Configurar el atajo', 'Set up the shortcut') + '</button>' +
      '<button type="button" class="fbtnp" onclick="fatSuenoHist(false)">' + L('Cerrar', 'Close') + '</button>' +
      '</div></div>';
  }
  /* Al volver de Atajos la app vuelve a primer plano: se pregunta al servidor. */
  try { document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && root.__fatST && (root.__fatST.hist || root.__fatST.sueno)) sincroniza(true).then(repinta); }); } catch (e) {}

  root.fatSuenoEnlace = creaEnlace;
  root.fatSuenoCopia = copia;
  root.fatSuenoComparte = comparte;
  root.fatSuenoComprueba = comprueba;
  root.fatSuenoQuita = desconecta;

  root.FatigaSueno = { lee: lee, medidos: medidos, firma: firma, sincroniza: sincroniza, estado: estado, hoja: hoja, grafica: grafica, noches: noches,
    ATAJO_ICLOUD: ATAJO_ICLOUD, _hoja: HOJA };
})(typeof window !== 'undefined' ? window : this);
