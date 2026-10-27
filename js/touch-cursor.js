/* ──────────────────────────────────────────────────────────────────────────
   PUNTERO DE TOQUES (herramienta interna de grabación)

   Para qué: iOS no dibuja dónde tocas, así que un vídeo de la app grabado en
   el iPad enseña pantallas que cambian solas — quien lo ve no sabe si se ha
   pulsado un botón o la app ha hecho algo por su cuenta. Marcar cada toque a
   mano en el montaje es inviable para una serie de ocho capítulos, así que lo
   pinta la propia app mientras se graba.

   No es una función del producto: el interruptor sólo lo ve la cuenta del
   autor (ver TC_CUENTAS). Para cualquier otro piloto este fichero no existe:
   no se registra ni un oyente mientras no esté encendido.

   Vive en su propio fichero, fuera del index, por lo mismo: es código que
   algún día se borra entero.
   ────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  /* Las cuentas que pueden ver el ajuste. La de la sesión de trabajo y la real
     del autor, que no son la misma. */
  var TC_CUENTAS = ['info@vuelabox.com', 'alexbalcells2000@yahoo.es'];

  var K_ON    = 'pilotos_tc_on';     // encendido/apagado
  var K_LLAVE = 'pilotos_tc_llave';  // este APARATO puede usarlo (ver tcPuedeVerlo)

  function _ls(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function _lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function tcCorreo() {
    try { return (JSON.parse(localStorage.getItem('cafi_auth_user') || '{}').email || '').toLowerCase(); }
    catch (e) { return ''; }
  }

  /* ★ Por qué la LLAVE y no sólo el correo: los tutoriales se graban con una
     CUENTA DEMO (datos inventados, nada real en pantalla). Si el ajuste se
     atara sólo al correo, al entrar con la demo desaparecería justo cuando
     hace falta. Así que la primera vez se enciende desde la cuenta del autor,
     eso deja la llave puesta EN ESE APARATO, y desde entonces el ajuste sigue
     ahí aunque se entre con otra cuenta. La llave es local: no viaja a la
     nube ni aparece en el iPad de ningún otro piloto. */
  function tcPuedeVerlo() {
    if (_ls(K_LLAVE) === '1') return true;
    return TC_CUENTAS.indexOf(tcCorreo()) >= 0;
  }

  function tcOn() { return _ls(K_ON) === '1'; }

  // ── La capa que dibuja ────────────────────────────────────────────────────
  var capa = null, punto = null, dentro = false;

  function tcCapa() {
    if (capa && capa.isConnected) return capa;
    capa = document.createElement('div');
    capa.id = 'tc-capa';
    /* inset:0 + pointer-events:none: tapa la pantalla entera y NO se come ni un
       toque — si lo hiciera, la app dejaría de responder justo mientras grabas.
       El z-index por encima de todo lo demás (los paneles andan por 9999). */
    capa.setAttribute('style',
      'position:fixed;inset:0;z-index:2147483000;pointer-events:none;overflow:hidden');
    punto = document.createElement('div');
    punto.id = 'tc-punto';
    /* La yema del dedo: 46 px es lo que ocupa un toque real en el iPad. Relleno
       cian de la app, aro blanco para que se vea igual sobre fondo claro y
       oscuro — en modo día un punto cian solo se pierde. */
    punto.setAttribute('style',
      'position:absolute;top:0;left:0;width:46px;height:46px;margin:-23px 0 0 -23px;' +
      'border-radius:50%;background:rgba(34,211,238,.28);' +
      'border:2px solid rgba(255,255,255,.9);' +
      'box-shadow:0 0 0 1px rgba(8,16,40,.35),0 2px 14px rgba(0,0,0,.35);' +
      'opacity:0;transform:scale(.6);' +
      'transition:opacity .12s ease,transform .12s ease;will-change:transform,opacity');
    capa.appendChild(punto);
    document.body.appendChild(capa);
    return capa;
  }

  function tcMueve(x, y) {
    if (!punto) return;
    /* Sin transición en la posición: el punto tiene que ir pegado al dedo. Con
       transición se queda atrás al arrastrar y en el vídeo parece que el scroll
       va solo. */
    punto.style.left = x + 'px';
    punto.style.top  = y + 'px';
  }

  function tcMuestra(v) {
    if (!punto) return;
    punto.style.opacity   = v ? '1' : '0';
    punto.style.transform = v ? 'scale(1)' : 'scale(.6)';
  }

  /* El aro que se expande en cada pulsación. Es lo que distingue "he tocado
     aquí" de "estoy arrastrando el dedo": sin él, un toque seco no se ve. */
  function tcOnda(x, y) {
    if (!capa) return;
    var o = document.createElement('div');
    o.setAttribute('style',
      'position:absolute;left:' + x + 'px;top:' + y + 'px;width:46px;height:46px;' +
      'margin:-23px 0 0 -23px;border-radius:50%;border:2px solid rgba(34,211,238,.85);' +
      'opacity:.85;transform:scale(.5);pointer-events:none;' +
      'transition:transform .45s cubic-bezier(.2,.8,.3,1),opacity .45s ease');
    capa.appendChild(o);
    /* Dos frames antes de animar: en uno solo, Safari funde el estado inicial
       con el final y no se ve nada. */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        o.style.transform = 'scale(2.1)';
        o.style.opacity = '0';
      });
    });
    setTimeout(function () { if (o.parentNode) o.parentNode.removeChild(o); }, 600);
  }

  // ── Oyentes ───────────────────────────────────────────────────────────────
  function enDown(e) {
    if (!tcOn()) return;
    tcCapa(); dentro = true;
    tcMueve(e.clientX, e.clientY); tcMuestra(true); tcOnda(e.clientX, e.clientY);
  }
  function enMove(e) {
    if (!tcOn()) return;
    /* Con ratón se sigue siempre (así se prueba en el ordenador). Con el dedo,
       sólo mientras toca: un punto parado en la última posición sale en el
       vídeo como una mancha fija. */
    if (e.pointerType === 'mouse') { tcCapa(); tcMueve(e.clientX, e.clientY); tcMuestra(true); return; }
    if (!dentro) return;
    tcMueve(e.clientX, e.clientY);
  }
  function enUp() { dentro = false; tcMuestra(false); }

  var puestos = false;
  function tcOyentes(poner) {
    if (poner === puestos) return;
    var m = poner ? 'addEventListener' : 'removeEventListener';
    /* capture + passive: se mira el toque ANTES de que nadie lo pare con un
       stopPropagation, y passive promete que no se va a hacer preventDefault,
       así que el scroll del iPad no se frena por esto. */
    var op = { capture: true, passive: true };
    window[m]('pointerdown',   enDown, op);
    window[m]('pointermove',   enMove, op);
    window[m]('pointerup',     enUp,   op);
    window[m]('pointercancel', enUp,   op);
    puestos = poner;
  }

  // ── Encender / apagar ─────────────────────────────────────────────────────
  function tcSet(on) {
    _lsSet(K_ON, on ? '1' : '0');
    if (on) {
      _lsSet(K_LLAVE, '1');   // deja el aparato preparado para grabar con la cuenta demo
      tcCapa(); tcOyentes(true);
    } else {
      tcOyentes(false); dentro = false; tcMuestra(false);
      if (capa && capa.parentNode) { capa.parentNode.removeChild(capa); capa = null; punto = null; }
    }
    tcPintaAjuste();
  }

  function tcToggle(e) {
    if (e) e.stopPropagation();   // no cerrar Ajustes: se quiere ver el interruptor cambiar
    tcSet(!tcOn());
    if (navigator.vibrate) navigator.vibrate(20);
  }

  // ── El ajuste ─────────────────────────────────────────────────────────────
  function tcPintaAjuste() {
    var it = document.getElementById('tc-gear-item');
    if (!it) return;
    var ver = tcPuedeVerlo();
    it.style.display = ver ? '' : 'none';
    /* El separador de encima también se esconde: si no, a los demás pilotos les
       queda una raya suelta al final del menú y parece un fallo de pintado. */
    var div = document.getElementById('tc-gear-divider');
    if (div) div.style.display = ver ? '' : 'none';
    if (!ver) return;

    var on  = tcOn();
    var sub = document.getElementById('tc-gear-sub');
    var sw  = document.getElementById('tc-switch');
    var kn  = document.getElementById('tc-knob');
    if (sub) sub.textContent = on ? 'Marcando los toques · solo tú lo ves' : 'Marca dónde tocas al grabar';
    if (sw) {
      sw.style.background  = on ? 'rgba(34,211,238,.85)' : 'rgba(148,163,184,.28)';
      sw.style.borderColor = on ? 'rgba(34,211,238,.9)'  : 'rgba(148,163,184,.4)';
    }
    if (kn) kn.style.transform = on ? 'translateX(15px)' : 'translateX(0)';
  }

  /* Se decide cada vez que se abre Ajustes y no una sola vez al arrancar: el
     piloto puede cerrar sesión y entrar con otra cuenta sin recargar la app. */
  function tcEngancha() {
    var orig = window.openGearPanel;
    if (typeof orig !== 'function') return;
    window.openGearPanel = function (e) { var r = orig.apply(this, arguments); tcPintaAjuste(); return r; };
  }

  function tcArranca() {
    tcEngancha();
    tcPintaAjuste();
    /* Si quedó encendido de la sesión anterior, sigue encendido: una grabación
       se corta y se retoma, y tener que volver a Ajustes cada vez sobra. */
    if (tcOn() && tcPuedeVerlo()) { tcCapa(); tcOyentes(true); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tcArranca);
  else tcArranca();

  window.tcToggle = tcToggle;                       // lo llama el onclick del ajuste
  window.TouchCursor = {
    on:   function () { tcSet(true); },
    off:  function () { tcSet(false); },
    esta: tcOn,
    puedeVerlo: tcPuedeVerlo,
    /* Escotilla por si algún día hace falta grabar desde un aparato prestado,
       sin tener que entrar con la cuenta del autor: TouchCursor.llave() */
    llave: function () { _lsSet(K_LLAVE, '1'); tcPintaAjuste(); return true; }
  };
})();
