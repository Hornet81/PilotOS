/* ══════════════════════════════════════════════════════════════════════════
   ms-mfa.js — EL modal de verificación de Microsoft. Uno solo.

   Antes había DOS, con el mismo trabajo y distinto código: el bloque
   #ec-state-number de index.html (roster e importación del logbook) y
   loginPaso('numero') de public/js/expense.js (notas de gasto). Los dos
   enseñaban un número grande y un spinner, y los dos daban por hecho que el
   piloto usa number-match. Un tester cuyo método por defecto es el SMS no tenía
   forma de entrar por ninguno de los dos.

   Duplicar la misma pantalla es el fallo de ES_AIRPORTS / ES_IATA, y aquí se
   veía en que el arreglo habría que hacerlo dos veces: por eso esto es UN
   módulo que consumen las dos pantallas, no una copia mejorada.

   ── Lo que decide la vista es el SERVIDOR, no una suposición ────────────────
   `method` llega en /status y sale de mirar qué pantalla ha pintado Microsoft
   (REF-MS-MFA). La app no elige método ni lo adivina: lo enseña.

   ── El color va por CLASE ───────────────────────────────────────────────────
   Nada de `style="color:…"`: un atributo style no sabe de temas y no hay hoja
   que lo corrija sin !important. Las dos paletas se declaran abajo, porque este
   bloque SÍ cambia de fondo según dónde se monte.
   ══════════════════════════════════════════════════════════════════════════ */
(function (root) {
'use strict';

var POLL_MS = 2000;
/* Auto-envío al completar el código. REF/prompt piden "a los 6 dígitos", que es
   el caso normal — pero Microsoft manda TAMBIÉN códigos de 8 según el método, y
   solo hay 3 intentos: mandar a ciegas el prefijo de 6 de un código de 8 quema
   uno de los tres por un error que no ha cometido el piloto. Con esta espera,
   si sigue tecleando se manda el de 8; si ha terminado, sale solo a los 6. */
var AUTO_MS = 600;

var CSS = [
'.msmfa{font-family:"Space Mono",monospace;text-align:center}',
'.msmfa-t{font-family:"Space Grotesk",sans-serif;font-size:16px;font-weight:800;margin-bottom:6px}',
'.msmfa-s{font-size:11.5px;line-height:1.6;margin-bottom:16px}',
'.msmfa-num{font-family:"Space Grotesk",sans-serif;font-size:58px;font-weight:800;letter-spacing:.05em;margin:4px 0 8px}',
'.msmfa-otc{width:100%;max-width:260px;margin:2px auto 4px;display:block;text-align:center;',
'  font-family:"Space Grotesk",sans-serif;font-size:30px;font-weight:800;letter-spacing:.34em;',
'  padding:13px 10px;border-radius:13px;border:1.5px solid;background:transparent}',
'.msmfa-err{font-size:11.5px;line-height:1.5;margin:10px auto 0;max-width:300px;padding:9px 12px;border-radius:10px;border:1px solid}',
'.msmfa-m{display:block;width:100%;text-align:left;padding:13px 14px;margin-bottom:8px;border-radius:12px;',
'  border:1px solid;font-family:"Space Mono",monospace;font-size:12.5px;cursor:pointer;background:transparent}',
'.msmfa-alt{margin-top:14px;background:none;border:none;font-family:"Space Mono",monospace;',
'  font-size:11px;cursor:pointer;text-decoration:underline;padding:6px}',
'.msmfa-x{margin-top:4px;background:none;border:none;font-family:"Space Mono",monospace;font-size:11px;cursor:pointer;padding:6px}',
'.msmfa-tries{font-size:10.5px;margin-top:8px}',
/* El código ya enviado: MISMO tamaño y sitio que el campo, pero sin borde y
   sin cursor — se lee como "esto ya está puesto", no como algo que tocar. */
'.msmfa-otc-off{border-color:transparent!important;opacity:.55;user-select:none}',
/* ── paleta de NOCHE (por defecto) ── */
'.msmfa{color:rgba(248,250,252,.88)}',
'.msmfa-t{color:#F8FAFC}',
'.msmfa-s{color:rgba(248,250,252,.62)}',
'.msmfa-num{color:#22D3EE}',
'.msmfa-otc{color:#F8FAFC;border-color:rgba(34,211,238,.5)}',
'.msmfa-otc:focus{outline:none;border-color:#22D3EE}',
'.msmfa-err{color:#FCA5A5;background:rgba(239,68,68,.12);border-color:rgba(239,68,68,.4)}',
'.msmfa-m{color:rgba(248,250,252,.9);border-color:rgba(148,163,184,.32)}',
'.msmfa-m:hover{border-color:#22D3EE}',
'.msmfa-alt{color:#22D3EE}',
'.msmfa-x{color:rgba(248,250,252,.35)}',
'.msmfa-tries{color:rgba(251,191,36,.9)}',
/* ── paleta de DÍA ──
   El contenedor de gastos y el del roster son CLAROS en modo día, así que
   aquí hay que declarar la segunda paleta entera: un bloque que cambia de
   fondo tiene sus dos paletas escritas, o se queda blanco sobre blanco. */
'html.day .msmfa{color:#0F172A}',
'html.day .msmfa-t{color:#0F172A}',
'html.day .msmfa-s{color:#475569}',
'html.day .msmfa-num{color:#0E7490}',
'html.day .msmfa-otc{color:#0F172A;border-color:rgba(14,116,144,.55)}',
'html.day .msmfa-otc:focus{border-color:#0E7490}',
'html.day .msmfa-err{color:#991B1B;background:#FEF2F2;border-color:#FCA5A5}',
'html.day .msmfa-m{color:#0F172A;border-color:#CBD5E1}',
'html.day .msmfa-m:hover{border-color:#0E7490}',
'html.day .msmfa-alt{color:#0E7490}',
'html.day .msmfa-x{color:#64748B}',
'html.day .msmfa-tries{color:#92400E}'
].join('');

function ponCSS() {
  if (document.getElementById('msmfa-css')) return;
  var st = document.createElement('style');
  st.id = 'msmfa-css';
  st.textContent = CSS;
  document.head.appendChild(st);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
  });
}

/* ── estado del modal (uno vivo a la vez, como la sesión del backend) ── */
var S = null;

/* Lo que decide si el campo está bloqueado. El SERVIDOR manda (`codeChecking`);
   el flag local es sólo el puente hasta el primer sondeo que lo confirme —sin
   él habría hasta 2 s con el campo abierto justo después de enviar, que es
   exactamente el hueco por el que el piloto metía el segundo código—. La gracia
   local caduca: si el servidor dice que NO está comprobando, se desbloquea. */
var GRACIA_MS = 3500;
function comprobando(v) {
  if (!S) return false;
  if (v && v.codeChecking) return true;
  return !!(S.checkingHasta && Date.now() < S.checkingHasta);
}

/* ── El método con el que este aparato entró la última vez ──────────────────
   Se manda en el siguiente login (`preferMethod`) para que el backend adelante
   la elección cuando Entra vuelva a ofrecer ESE mismo método. Es una pista, no
   una orden: si Microsoft no lo ofrece, no elige nada y se pregunta como
   siempre. Vive en el aparato a propósito —cada móvil tiene su costumbre— y
   las dos puertas (roster y gastos) leen de aquí: dos memorias distintas serían
   el mismo dato contado de dos formas. Y va en try/catch porque localStorage
   revienta en ventana privada. */
var MEM = 'pilotos_ms_metodo';
var MEMF = 'pilotos_ms_familia';
function metodoRecordado() {
  try { var v = localStorage.getItem(MEM); return /^[A-Za-z]{3,40}$/.test(v || '') ? v : null; }
  catch (e) { return null; }
}
function recuerdaMetodo(v) {
  if (!v || !/^[A-Za-z]{3,40}$/.test(v)) return;
  try { localStorage.setItem(MEM, v); } catch (e) {}
}
/* La FAMILIA del desafío que Entra mandó SIN preguntar: cuando Entra aplica el
   método configurado del piloto no enseña lista, así que lo que llega es su
   método. Es lo que hace que «según lo que tenga configurado» se APRENDA en vez
   de adivinarse. Se guarda la familia y no el valor exacto porque desde la
   pantalla del código un SMS y un OTP de Authenticator son la misma casilla. */
function familiaRecordada() {
  try { var v = localStorage.getItem(MEMF); return (v === 'code' || v === 'approval') ? v : null; }
  catch (e) { return null; }
}
function recuerdaFamilia(v) {
  if (v !== 'code' && v !== 'approval') return;
  try { localStorage.setItem(MEMF, v); } catch (e) {}
}

function url(cfg, ruta) { return (cfg.base || '') + '/api/ms-auth/' + cfg.target + ruta; }

function pide(cfg, ruta, opts) {
  opts = opts || {};
  var h = { 'Content-Type': 'application/json' };
  if (cfg.token) h.Authorization = 'Bearer ' + cfg.token;
  return fetch(url(cfg, ruta), {
    method: opts.method || 'GET',
    headers: h,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  }).then(function (r) {
    return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; });
  });
}

/* ══ LAS CUATRO VISTAS ═════════════════════════════════════════════════════ */

function pinta(v) {
  if (!S) return;
  var m = v.method || '';
  var h = '';

  if (m === 'code' && comprobando(v)) {
    /* ── CÓDIGO EN VUELO ────────────────────────────────────────────────────
       Sin esta vista, al enviar el código el campo se vaciaba y volvía a estar
       editable, así que el piloto —que no tiene forma de saber si llegó—
       tecleaba otro, y otro. Reportado probando con SMS: «se borran y puedes
       continuar poniendo otros códigos hasta que al final arranca». Arrancaba
       porque el PRIMERO ya era bueno.

       Y no es sólo ruido: cada envío puede gastar uno de los TRES intentos.
       Aquí no hay campo que tocar, y lo dice. */
    h = '<div class="msmfa-t">Comprobando el código…</div>' +
        '<div class="msmfa-s">Microsoft lo está verificando. No hace falta que lo escribas otra vez.</div>' +
        '<div class="msmfa-otc msmfa-otc-off" aria-live="polite">' + esc(S.enviado || '······') + '</div>' +
        '<button class="msmfa-x" id="msmfa-x">Cancelar</button>';

  } else if (m === 'code') {
    /* El teléfono enmascarado lo manda Microsoft. Si no lo manda, NO se inventa
       una frase que diga "a tu móvil": puede ser el código de la app
       Authenticator y no un SMS. Se dice lo que se sabe. */
    var dest = v.maskedPhone
      ? 'Código enviado a <b>' + esc(v.maskedPhone) + '</b>'
      : 'Escribe el código de verificación';
    h = '<div class="msmfa-t">Introduce el código</div>' +
        '<div class="msmfa-s">' + dest + '</div>' +
        '<input id="msmfa-otc" class="msmfa-otc" type="text" inputmode="numeric" ' +
          'autocomplete="one-time-code" maxlength="8" pattern="[0-9]*" ' +
          'aria-label="Código de verificación" placeholder="······">' +
        (v.codeError ? '<div class="msmfa-err">' + esc(v.codeError) + '</div>' : '') +
        (v.codeAttemptsLeft != null && v.codeAttemptsLeft < 3
          ? '<div class="msmfa-tries">Te ' + (v.codeAttemptsLeft === 1 ? 'queda 1 intento' : 'quedan ' + v.codeAttemptsLeft + ' intentos') + '</div>'
          : '') +
        '<button class="msmfa-alt" id="msmfa-alt">Usar otro método</button><br>' +
        '<button class="msmfa-x" id="msmfa-x">Cancelar</button>';

  } else if (m === 'number') {
    h = '<div class="msmfa-t">Aprueba en Microsoft Authenticator</div>' +
        '<div class="msmfa-s">Abre tu app de Microsoft (Authenticator u Outlook) y escribe este número</div>' +
        '<div class="msmfa-num">' + esc(v.number || '··') + '</div>' +
        '<div class="msmfa-s">Esperando tu aprobación…</div>' +
        '<button class="msmfa-alt" id="msmfa-alt">Usar otro método</button><br>' +
        '<button class="msmfa-x" id="msmfa-x">Cancelar</button>';

  } else if (m === 'approval') {
    h = '<div class="msmfa-t">Aprueba la verificación</div>' +
        '<div class="msmfa-s">Aprueba la notificación en tu móvil, o responde la llamada de Microsoft.</div>' +
        '<button class="msmfa-alt" id="msmfa-alt">Usar otro método</button><br>' +
        '<button class="msmfa-x" id="msmfa-x">Cancelar</button>';

  } else if (m === 'choice' && v.autoMethod) {
    /* ── ELECCIÓN ADELANTADA ────────────────────────────────────────────────
       «Aún así te pide cómo quieres loguearte» — y cuando la lista trae un solo
       método, o el mismo con el que entraste la última vez, preguntarlo es un
       paso de más delante del que el piloto no puede hacer otra cosa.

       Pero se DICE. Elegir en silencio es lo que rompió el SMS: el código
       empujaba push y el piloto veía «aprueba la notificación» de un método que
       no usa. Aquí se enseña cuál se está usando y «usar otro método» sigue
       delante — un adelanto que no se puede deshacer sería una imposición con
       otro nombre. */
    h = '<div class="msmfa-t">' + esc(v.autoMethodLabel || 'Verificando') + '</div>' +
        '<div class="msmfa-s">Elegido automáticamente. Un momento…</div>' +
        '<button class="msmfa-alt" id="msmfa-alt">Usar otro método</button><br>' +
        '<button class="msmfa-x" id="msmfa-x">Cancelar</button>';

  } else if (m === 'choice') {
    var lista = (v.availableMethods || []).map(function (x) {
      return '<button class="msmfa-m" data-m="' + esc(x.value) + '">' + esc(x.label || x.value) + '</button>';
    }).join('');
    h = '<div class="msmfa-t">¿Cómo quieres verificarte?</div>' +
        '<div class="msmfa-s">Estos son los métodos que tiene tu cuenta de Vueling.</div>' +
        (lista || '<div class="msmfa-s">Microsoft no ha ofrecido ninguno.</div>') +
        '<button class="msmfa-x" id="msmfa-x">Cancelar</button>';

  } else {
    h = '<div class="msmfa-t">Conectando con Microsoft</div>' +
        '<div class="msmfa-s">Un momento…</div>' +
        '<button class="msmfa-x" id="msmfa-x">Cancelar</button>';
  }

  // Repintar el input mientras se teclea lo vaciaría. Solo se repinta si algo cambió.
  var firma = m + '|' + (v.number || '') + '|' + (v.maskedPhone || '') + '|' +
              (v.codeError || '') + '|' + (v.codeAttemptsLeft == null ? '' : v.codeAttemptsLeft) + '|' +
              // El bloqueo ENTRA en la firma: si no, pasar de "escribe" a
              // "comprobando" no repintaría y el campo seguiría abierto.
              (comprobando(v) ? 'chk' : '') + '|' + (v.autoMethod || '') + '|' +
              (v.availableMethods || []).map(function (x) { return x.value; }).join(',');
  if (firma === S.firma) return;
  S.firma = firma;

  S.ultima = v;
  S.host.innerHTML = '<div class="msmfa">' + h + '</div>';
  engancha(v);
}

function engancha(v) {
  var cfg = S.cfg;
  var x = S.host.querySelector('#msmfa-x');
  if (x) x.onclick = function () { cancela(); };

  var alt = S.host.querySelector('#msmfa-alt');
  if (alt) alt.onclick = function () {
    alt.disabled = true;
    /* Si pide la lista, este aparato deja de tener costumbre: recordar el que
       acaba de rechazar se la volvería a adelantar en el siguiente login. */
    try { localStorage.removeItem(MEM); localStorage.removeItem(MEMF); } catch (e) {}
    pide(cfg, '/method', { method: 'POST', body: { sessionId: S.sid, method: 'choose' } })
      .then(function () { S.firma = null; })
      .catch(function () { alt.disabled = false; });
  };

  Array.prototype.forEach.call(S.host.querySelectorAll('.msmfa-m'), function (b) {
    b.onclick = function () {
      Array.prototype.forEach.call(S.host.querySelectorAll('.msmfa-m'), function (o) { o.disabled = true; });
      pide(cfg, '/method', { method: 'POST', body: { sessionId: S.sid, method: b.getAttribute('data-m') } })
        .then(function () { S.firma = null; });
    };
  });

  var otc = S.host.querySelector('#msmfa-otc');
  if (otc) {
    try { otc.focus(); } catch (e) {}
    otc.oninput = function () {
      var d = otc.value.replace(/\D/g, '').slice(0, 8);
      if (d !== otc.value) otc.value = d;
      if (S.auto) clearTimeout(S.auto);
      if (d.length >= 6) S.auto = setTimeout(function () { manda(d); }, AUTO_MS);
    };
    otc.onkeydown = function (e) {
      if (e.key === 'Enter') {
        if (S.auto) clearTimeout(S.auto);
        manda(otc.value.replace(/\D/g, ''));
      }
    };
  }
}

function manda(code) {
  /* La puerta se cierra ANTES de la petición, no en el `.then`: entre el envío
     y la respuesta hay tiempo de sobra para teclear otro código, y cada envío
     puede gastar uno de los TRES intentos. */
  if (!S || S.enviando || comprobando(S.ultima)) return;
  if (!/^\d{6,8}$/.test(code)) return;
  S.enviando = true;
  S.enviado = code.replace(/\d/g, '•');   // para la vista de "comprobando"
  S.checkingHasta = Date.now() + GRACIA_MS;
  var otc = S.host.querySelector('#msmfa-otc');
  if (otc) otc.disabled = true;
  // Bloquear la PANTALLA ya: esperar al sondeo deja hasta 2 s con el campo
  // abierto, que es justo el hueco por el que entraba el segundo código.
  S.firma = null; pinta(S.ultima || { method: 'code' });
  pide(S.cfg, '/code', { method: 'POST', body: { sessionId: S.sid, code: code } })
    .then(function (r) {
      S.enviando = false;
      if (!r.ok) {
        // No ha salido: se devuelve el campo en vez de dejarlo bloqueado.
        S.checkingHasta = 0; S.firma = null; pinta(S.ultima || { method: 'code' });
        otc = S.host.querySelector('#msmfa-otc');
        /* Error de la VALIDACIÓN del servidor (forma o rate limit), no de
           Microsoft: se enseña aquí mismo y se puede reintentar. El de
           Microsoft llega por /status como codeError. */
        if (otc) { otc.disabled = false; try { otc.focus(); } catch (e) {} }
        var caja = S.host.querySelector('.msmfa-err');
        if (!caja) {
          caja = document.createElement('div');
          caja.className = 'msmfa-err';
          otc && otc.parentNode.insertBefore(caja, otc.nextSibling);
        }
        caja.textContent = r.j.error || 'No se pudo enviar el código.';
        return;
      }
      /* Aceptado a trámite. NO se desbloquea aquí: manda el servidor, que pone
         `codeChecking` mientras Entra resuelve. La gracia local sólo cubre el
         hueco hasta el primer sondeo que lo confirme. */
      S.firma = null;
    })
    .catch(function () {
      S.enviando = false;
      S.checkingHasta = 0; S.firma = null; pinta(S.ultima || { method: 'code' });
    });
}

function sondea() {
  if (!S) return;
  pide(S.cfg, '/status?sessionId=' + encodeURIComponent(S.sid)).then(function (r) {
    if (!S) return;
    var v = r.j || {};
    /* ⚠️ Aquí NO se puede mirar `v.error`. En una respuesta con status 'ERROR'
       ese campo es EL MENSAJE PARA EL PILOTO ("Código incorrecto 3 veces"), no
       la señal de que la petición haya fallado: mirándolo se salía por este
       return y `onError` no se llamaba NUNCA — el login fallido se quedaba con
       el modal girando para siempre, en las dos pantallas. Lo que distingue una
       petición rota es el código HTTP, y un 404 pasajero se reintenta al
       siguiente tic. Lo cazó ms-mfa-modal-test, no yo. */
    if (!r.ok) return;
    // Con cuál se ha verificado HOY. Se guarda en cuanto se sabe y no al final:
    // un login que se cae DESPUÉS de elegir método ya nos ha dicho cuál usa.
    if (v.usedMethod) recuerdaMetodo(v.usedMethod);
    if (v.usedFamily) recuerdaFamilia(v.usedFamily);
    if (S.cfg.onEstado) { try { S.cfg.onEstado(v); } catch (e) {} }

    /* ── Quién manda sobre el bloqueo del campo ──────────────────────────
       Mientras el servidor diga que está comprobando, se REFRESCA la gracia:
       si no, caducaría a los 3,5 s en mitad de una verificación lenta y el
       campo volvería a abrirse — el fallo otra vez.
       Y en cuanto llega un veredicto NEGATIVO se suelta de golpe: con la
       gracia viva, el "comprobando" taparía el error de Microsoft y el piloto
       no sabría por qué no entra. */
    if (v.codeChecking) S.checkingHasta = Date.now() + GRACIA_MS;
    else if (v.codeError) S.checkingHasta = 0;

    if (v.status === 'ERROR') { var f = S.cfg.onError; para(); if (f) f(v); return; }
    if (v.status === 'COMPLETE' || v.status === 'AUTHENTICATED' || v.status === 'FETCHING') {
      var g = S.cfg.onListo; var cfg = S.cfg;
      if (v.status === 'FETCHING') { if (cfg.onFetching) cfg.onFetching(v); return; }
      para(); if (g) g(v); return;
    }
    pinta(v);
  }).catch(function () {});
}

function cancela() {
  if (!S) return;
  var cfg = S.cfg, sid = S.sid;
  para();
  pide(cfg, '/cancel', { method: 'POST', body: { sessionId: sid } }).catch(function () {});
  if (cfg.onCancelar) cfg.onCancelar();
}

function para() {
  if (!S) return;
  if (S.timer) clearInterval(S.timer);
  if (S.auto) clearTimeout(S.auto);
  S = null;
}

/**
 * Monta el modal sobre `host` y empieza a sondear.
 * cfg: { host, target:'ecrews'|'gastos', sessionId, base, token,
 *        onEstado, onListo, onFetching, onError, onCancelar }
 * `vista` es el primer /status ya conocido (el que devuelve /login), para pintar
 * sin esperar dos segundos a que llegue el primer tic.
 */
function arranca(cfg, vista) {
  ponCSS();
  para();
  S = { cfg: cfg, sid: cfg.sessionId, host: cfg.host, firma: null, timer: null, auto: null, enviando: false };
  if (vista) pinta(vista);
  else pinta({});
  S.timer = setInterval(sondea, POLL_MS);
  return { para: para, cancela: cancela };
}

var API = { arranca: arranca, para: para, cancela: cancela, POLL_MS: POLL_MS, AUTO_MS: AUTO_MS,
  metodoRecordado: metodoRecordado, recuerdaMetodo: recuerdaMetodo,
  familiaRecordada: familiaRecordada, recuerdaFamilia: recuerdaFamilia };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
else root.MsMfa = API;

})(typeof globalThis !== 'undefined' ? globalThis : this);
