/* ══════════════════════════════════════════════════════════════════════════
   COMBUSTIBLE DESDE UNA FOTO — el parser de la pantalla «Flight Times and Fuel»

   QUÉ ES ESTO, y qué NO es
   ────────────────────────
   Esto NO es un lector de texto: es un PARSER de UNA pantalla concreta. El
   reconocimiento de caracteres lo hace Tesseract (local, en el navegador, sin
   mandar la foto a ningún sitio y sin ningún modelo de lenguaje detrás); lo que
   vive aquí es lo único que de verdad decide si el número que acaba en el
   logbook es el bueno:

     · DÓNDE mirar   — la columna sale de su CABECERA, no de una coordenada.
     · QUÉ aceptar   — sólo lo que tiene forma de kilos.
     · CUÁNDO CALLARSE — y esto es la mitad del archivo.

   El cuaderno de vuelo lo FIRMA el piloto. Un 6553 mal leído como 6563 no da
   ningún error, cuadra con todo y se queda ahí para siempre — es el avión
   inventado de ARIA con otra cara, y aquí con la firma delante. Así que la
   regla es la de siempre en este proyecto: **un dato inventado presentado como
   bueno es peor que no tener ninguno**. Cuando algo no cuadra no se rellena a
   medias: no se rellena, y se dice por qué.

   EL CHECKSUM ES LO QUE HACE ESTO HONESTO
   ───────────────────────────────────────
   Estas cuatro cifras no son cuatro números sueltos: son la MISMA masa medida
   en cuatro momentos de un vuelo, así que **sólo pueden bajar**.

       OFF BLOCK ≥ despegue ≥ aterrizaje ≥ ON BLOCK

   Un error de lectura rompe esa cadena la mayoría de las veces, y entonces el
   parser lo sabe SIN saber cuál era el número bueno. Es el mismo principio que
   la validación cruzada de `pernoctas-masivo-test`: un invariante no necesita
   conocer la respuesta correcta para cazar una respuesta imposible.

   ⚠ NUNCA UN 0, Y ESTO NO ES UN DETALLE
   ─────────────────────────────────────
   En esa pantalla la columna «Actual Fuel on Board» enseña **0** mientras el
   piloto no la ha rellenado — se ve en la captura del reporte. Un 0 leído de
   ahí y guardado daría un bloque de 6.553 kg en un sector de 1h41. Por eso se
   exigen 3 dígitos como mínimo: un `0` suelto no tiene forma de kilos y no se
   lee NUNCA. Un 0 TECLEADO por el piloto sigue valiendo, que es otra cosa y ya
   estaba resuelto en `ldFuelLee`.

   POR QUÉ NO SE ANCLA POR COORDENADAS
   ───────────────────────────────────
   Un `x > 1200` cableado es el `height:290` de la carta SIGWX y el `top:74px`
   de la ✕ del modo inspección: funciona con LA foto que tienes delante y se
   desvía con la siguiente. La columna se busca por su cabecera («Planned
   Fuel(kg)» · «Actual Fuel on Board(kg)»), que es lo que de verdad la
   identifica, y la banda se mide a partir de ESA caja.

   Medido contra la foto REAL del reporte (VY7365 TNG–BCN, iPad, 1932×2576,
   con reflejos): las cuatro del plan salen exactas —6553 · 6365 · 2100 ·
   1977— con confianzas 87 · 96 · 82 · 96, y los cuatro ceros de la columna
   real salen como «(2)», «2)», «Q» y «”)», o sea que no llegan ni a candidato.

   ══════════════════════════════════════════════════════════════════════════ */
(function (root) {
'use strict';

/* Una cifra de kilos: 3 a 5 dígitos. El mínimo de 3 es lo que deja fuera el
   `0` de relleno de eCrews, así que no es un rango cosmético. */
var RE_NUM = /^[0-9]{3,5}$/;
var MIN_KG = 100;
var MAX_KG = 99999;

/* Lo que el taxi puede quemar como mucho, de calzos a despegue o al revés. Un
   taxi largo de verdad (LHR, CDG en hora punta) ronda los 400 kg; 900 deja
   sitio de sobra y sigue cazando una lectura que se ha ido un dígito. */
var TAXI_MAX = 900;

/* Confianza mínima de Tesseract para mirar siquiera una cifra. En la foto real
   la PEOR de las cuatro dio 82, así que 60 no recorta nada bueno — y el que de
   verdad decide es el checksum, no este número. */
var CONF_MIN = 60;

/* Las cabeceras de las dos columnas. Van por separado porque Tesseract parte
   «Actual Fuel on Board(kg)» en trozos y no siempre por el mismo sitio: lo que
   aguanta es «Board», que sólo aparece ahí. */
var CAB_PLAN = /^planned$/i;
var CAB_PLAN2 = /^fuel\(?kg\)?$/i;
/* ⚠ Se busca «board» DENTRO del token, no como token entero, y esto lo decidió
   una medición: conduciendo el Tesseract REAL sobre réplicas de la pantalla a
   nueve condiciones distintas, la cola de esta cabecera se pierde en cuanto la
   captura no es el pantallazo del iPad —«Board(k» a 780 px, «Board(kg» con
   JPEG—. Con la comparación entera eso deja la columna REAL sin cabecera, y
   sin cabecera no se mira: 5 de los 9 casos leían el plan de cuatro cifras y
   la real vacía, con el ✓ verde delante. Y la real es la que le importa al
   piloto, porque el plan ya lo tiene en el OFP.

   La palabra sólo aparece en esa cabecera y en ningún sitio más de la pantalla
   —«OFF Block», «ON Block» y «Block Time» son «bloc», no «board»—, así que el
   trozo es tan único como la palabra entera. Lo que NO se rescata es el caso
   en que Tesseract se come la CABEZA («d(kg)», a 6° de giro): ahí no queda
   nada que reconocer y se dice, que es lo que hay abajo. */
var CAB_REAL = /board/i;

/* Las cabeceras se comparan LIMPIAS. Medido contra réplicas de la pantalla:
   Tesseract devuelve «—-Fuel(kg)», «‘Actual», «‘Scheduled» — comillas y rayas
   pegadas al principio de la palabra. Con la comparación a pelo, un guion de
   más deja la columna SIN cabecera, y sin cabecera no se mira: la columna
   entera se pierde sin un solo error. Se quita todo lo que no sea letra,
   dígito o paréntesis; lo de dentro no se toca. */
function _limpiaCab(t) { return String(t == null ? '' : t).replace(/[^A-Za-z0-9()]/g, ''); }

/* Las etiquetas de fila. `Takeoff` y `Landing` son ÚNICAS en la pantalla; «OFF
   Block» y «ON Block» no se usan de ancla porque la palabra «Block» sale TRES
   veces —las dos filas y el «Block Time» del pie—, y elegir la equivocada
   correría el mes entero una fila. */
var FILA_2 = /^takeoff$/i;
var FILA_3 = /^landing$/i;

var CLAVES = ['out', 'off', 'on', 'in'];

/* Una cifra de kilos, con la basura de los BORDES quitada.

   Tesseract pega puntuación a los dígitos en cuanto la captura se aleja un
   poco: medido contra una réplica de la pantalla del reporte a 2560×1440, el
   ON BLOCK del plan salió «4051.» — y comparando el token a pelo eso no es una
   cifra, así que la columna se quedaba en TRES candidatas y se perdía ENTERA,
   con la otra columna leída y un ✓ verde delante. Un punto pegado no cambia el
   número.

   Lo de DENTRO no se toca, y ahí está toda la seguridad: «06:55», «2/0/0»,
   «1.234» y «01h» siguen sin tener forma de kilos. Y el 0 de relleno de eCrews
   sigue fuera — «(2)» se queda en «2» y «0.» en «0», que no llegan a tres
   dígitos.

   ⚠⚠ Y UN SIGNO NO ES BASURA: ES UN OPERADOR. Ésta la metí yo en Beta.932 y la
   cazó el reporte siguiente. La pantalla de eCrews escribe debajo de cada cifra
   real su DIFERENCIA con el plan, en verde y con signo: «+261», «+365», «+419»,
   «+436». Quitando los bordes a lo bruto, esos cuatro deltas se convertían en
   cuatro cifras de kilos perfectamente válidas — la columna real pasaba de 4
   candidatas a OCHO, `recorta` elegía una ventana corrida y el checksum tumbaba
   la columna entera: «el combustible sólo baja, y aquí sube (365 → 5320)».

   `+`, `-`, `−` y `±` se quedan FUERA de la limpieza: un punto pegado no cambia
   el número y un signo sí — dice que eso no es una masa, es una diferencia. */
var RE_BORDES = /^[^0-9+\-−±]*(?=[0-9+\-−±])|[^0-9]+$/g;
var RE_SIGNO = /^[+\-−±]/;
function _kg(t) {
  var s = String(t == null ? '' : t).replace(RE_BORDES, '');
  if (RE_SIGNO.test(s)) return null;
  if (!RE_NUM.test(s)) return null;
  var v = parseInt(s, 10);
  return (v >= MIN_KG && v <= MAX_KG) ? v : null;
}

function caja(w) {
  /* Tesseract da la caja en `bbox` y algunos envoltorios la aplanan. Se aceptan
     las dos formas: leer una propiedad que no existe devolvería undefined
     siempre y el emparejamiento no haría nada, sin un solo error. */
  var b = w.bbox || w;
  return { x0: +b.x0, y0: +b.y0, x1: +b.x1, y1: +b.y1 };
}
function cx(b) { return (b.x0 + b.x1) / 2; }
function cy(b) { return (b.y0 + b.y1) / 2; }

function normaliza(palabras) {
  var out = [];
  for (var i = 0; i < (palabras || []).length; i++) {
    var w = palabras[i];
    if (!w) continue;
    var t = String(w.text == null ? '' : w.text).trim();
    var b = caja(w);
    if (!isFinite(b.x0) || !isFinite(b.y0) || !isFinite(b.x1) || !isFinite(b.y1)) continue;
    out.push({ text: t, conf: (w.confidence == null ? 100 : +w.confidence), bbox: b });
  }
  return out;
}

function busca(pal, re) {
  var r = [];
  for (var i = 0; i < pal.length; i++) if (re.test(_limpiaCab(pal[i].text))) r.push(pal[i]);
  return r;
}

/* ── La banda de una columna ───────────────────────────────────────────────
   Las cifras NO están centradas bajo su cabecera: en la foto real la cabecera
   del plan va de x=1125 a 1332 y los números de 1267 a 1349, o sea que se
   salen por la derecha. Por eso la banda se ENSANCHA a partir de la caja de la
   cabecera en vez de usarla tal cual — con la caja a pelo, el 1349 se quedaría
   fuera y la columna saldría vacía teniendo los cuatro números delante. */
function banda(cajas) {
  var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (var i = 0; i < cajas.length; i++) {
    x0 = Math.min(x0, cajas[i].x0); x1 = Math.max(x1, cajas[i].x1);
    y0 = Math.min(y0, cajas[i].y0); y1 = Math.max(y1, cajas[i].y1);
  }
  /* ⚠ El ensanche tiene un SUELO en función del ALTO de la cabecera, y eso es
     lo que salva el caso en que sólo casa una de las dos palabras. Con el 55 %
     del ancho a secas, una cabecera reducida a «Planned» (porque Tesseract
     devolvió «—-Fuel(kg)») da una banda de 97·2 px y los números, que van
     alineados a la DERECHA y se salen por ese lado, caen FUERA: la columna
     sale vacía teniendo las cuatro cifras delante. Un grupo de cuatro dígitos
     mide del orden de 3 veces el alto del texto, así que 6 altos cubre el
     desplazamiento sin comerse la columna de al lado — y si aun así se
     solapan, `separa` corta por la mitad del hueco. */
  var w = x1 - x0, m = Math.max(w * 0.55, (y1 - y0) * 6);
  return { x0: x0 - m, x1: x1 + m, yCab: y1 };
}

/* Dos bandas ensanchadas pueden solaparse, y un número que cae en las dos se
   asignaría a la primera que mire — que es un número del plan escrito en la
   casilla de la real, sin un solo error. Se cortan por la mitad del hueco. */
function separa(a, b) {
  if (!a || !b) return;
  if (a.x1 > b.x0) { var m = (a.x1 + b.x0) / 2; a.x1 = m; b.x0 = m; }
}

function columnas(pal) {
  var plan = null, real = null;
  var p1 = busca(pal, CAB_PLAN), p2 = busca(pal, CAB_PLAN2), r1 = busca(pal, CAB_REAL);
  var cajasPlan = [];
  if (p1.length) cajasPlan.push(p1[0].bbox);
  /* «Fuel(kg)» sólo vale si está en la MISMA línea que «Planned» y a su
     derecha: la columna real también acaba en «(kg)» y confundirlas juntaría
     las dos bandas en una. */
  for (var i = 0; i < p2.length; i++) {
    if (!p1.length) { cajasPlan.push(p2[i].bbox); continue; }
    var a = p1[0].bbox, b = p2[i].bbox;
    if (Math.abs(cy(a) - cy(b)) < (a.y1 - a.y0) && b.x0 >= a.x0) cajasPlan.push(b);
  }
  if (cajasPlan.length) plan = banda(cajasPlan);
  if (r1.length) real = banda([r1[0].bbox]);
  if (plan && real && cx(plan) > cx(real)) separa(real, plan); else separa(plan, real);
  return { plan: plan, real: real };
}

/* ── Las cifras candidatas de una banda ───────────────────────────────────── */
function cifras(pal, col) {
  var r = [];
  if (!col) return r;
  for (var i = 0; i < pal.length; i++) {
    var w = pal[i];
    var v = _kg(w.text);
    if (v == null) continue;
    if (w.conf < CONF_MIN) continue;
    var c = cx(w.bbox);
    if (c < col.x0 || c > col.x1) continue;
    /* Por encima de la cabecera no hay tabla: ahí vive la barra de estado del
       iPad, con su hora y su porcentaje de batería. */
    if (col.yCab != null && cy(w.bbox) < col.yCab) continue;
    r.push({ valor: v, conf: w.conf, bbox: w.bbox });
  }
  r.sort(function (a, b) { return cy(a.bbox) - cy(b.bbox); });
  return r;
}

/* ── Las CUATRO de la tabla ────────────────────────────────────────────────
   Una tabla tiene FILAS, y el valor de una fila es el que cae EN su renglón.
   Hasta Beta.932 esto se resolvía cogiendo «las cuatro que haya» y, con más de
   cuatro, deslizando una ventana hasta que las dos de en medio quedaran cerca
   de `Takeoff` y `Landing`. Una ventana corrida sigue siendo cuatro cifras
   plausibles, y el reporte del 18-sep enseñó lo que eso da con los deltas
   delante: [11320, 365, 5320, 419], o sea dos cifras de una fila y dos de la
   de al lado.

   `Takeoff` y `Landing` son las dos etiquetas ÚNICAS de la pantalla —«Block»
   sale tres veces y elegir la equivocada correría el mes entero— y las cuatro
   filas están repartidas a intervalos iguales, así que las otras dos se
   extrapolan: yT−s, yT, yL, yL+s. A cada renglón se le asigna su candidata MÁS
   CERCANA: un delta va 43 px por debajo de su cifra en una tabla de 176 px de
   paso, así que pierde contra la que está encima del renglón. Y si dos
   renglones se disputan la misma candidata no se adivina: se devuelve null.

   Sin etiquetas legibles no se ancla nada, y ahí sigue valiendo el criterio de
   antes —exactamente cuatro candidatas— porque una tabla de cuatro no tiene
   dónde equivocarse. Lo que NO se hace es repartir a ojo cinco o más. */
function recorta(cands, pal) {
  var t = busca(pal, FILA_2), l = busca(pal, FILA_3);
  if (t.length && l.length) {
    var yT = cy(t[0].bbox), yL = cy(l[0].bbox), s = yL - yT;
    if (s > 0) {
      var filas = [yT - s, yT, yL, yL + s], tol = s * 0.45, out = [], usados = [];
      for (var i = 0; i < 4; i++) {
        var mejor = null, mejorD = Infinity;
        for (var j = 0; j < cands.length; j++) {
          var d = Math.abs(cy(cands[j].bbox) - filas[i]);
          if (d < mejorD) { mejorD = d; mejor = j; }
        }
        if (mejor == null || mejorD > tol) return null;
        if (usados.indexOf(mejor) !== -1) return null;   // dos filas, una cifra
        usados.push(mejor); out.push(cands[mejor]);
      }
      return out;
    }
  }
  return cands.length === 4 ? cands : null;
}

/* ── El checksum ──────────────────────────────────────────────────────────
   Devuelve null si la columna es físicamente posible, y si no, la frase que
   explica qué paso la rompió. La frase se enseña en pantalla: «no he podido
   leerlo» y «lo he leído y no cuadra» no son lo mismo para el piloto. */
function revisa(v) {
  /* ⚠ Devuelve la razón PARTIDA: una frase fija y los números aparte. El motor
     de traducción de la app sólo cambia un nodo de texto cuyo contenido COMPLETO
     esté en el diccionario, así que una frase con los números cosidos dentro no
     se traduce NUNCA — y el piloto en inglés se encontraba media pantalla en
     castellano. La frase va en `clave` y los números en `datos`, que no hay que
     traducir. */
  for (var i = 0; i < 3; i++) {
    if (v[i] < v[i + 1]) {
      return { clave: 'el combustible sólo baja, y aquí sube',
               datos: '(' + v[i] + ' → ' + v[i + 1] + ')' };
    }
  }
  if (v[0] - v[1] > TAXI_MAX) return { clave: 'ese taxi de salida es imposible', datos: '(' + (v[0] - v[1]) + ' kg)' };
  if (v[2] - v[3] > TAXI_MAX) return { clave: 'ese taxi de entrada es imposible', datos: '(' + (v[2] - v[3]) + ' kg)' };
  if (v[0] <= v[3]) return { clave: 'el vuelo no habría quemado nada', datos: '' };
  return null;
}

/* ── POR QUÉ NO HAY NI UNA CIFRA ───────────────────────────────────────────
   «No veo ninguna cifra debajo de su cabecera» es verdad y no sirve para nada:
   es compatible con CUATRO cosas que se arreglan de formas distintas —que
   Tesseract no leyera ni un número, que los leyera con otra forma («6.553»),
   que los leyera borrosos, o que los leyera PERFECTOS y la banda de la columna
   caiga en otro sitio—. Reportado el 20-sep-2026 con las dos columnas mudas: la
   app tenía delante la respuesta y no la decía, así que ni el piloto ni yo
   podíamos pasar de ahí. Es el 0 mudo de las pernoctas metido en un diagnóstico.

   Esto NO decide nada: sólo cuenta lo que se ha visto para poder decirlo. */
function porQueNada(pal, col) {
  var d = { n: 0, arriba: 0, flojas: 0, raras: 0, ej: '', dx: null, cerca: null };
  for (var i = 0; i < pal.length; i++) {
    var w = pal[i], v = _kg(w.text);
    if (v == null) {
      if (/[0-9]/.test(w.text)) { d.raras++; if (!d.ej) d.ej = w.text; }
      continue;
    }
    if (w.conf < CONF_MIN) { d.flojas++; continue; }
    /* ⚠ Lo que está POR ENCIMA de la cabecera no cuenta como «cifra que podría
       haber usado»: ahí vive la barra de estado del iPad, y en la foto real hay
       una. Contándola, el aviso decía «leo 1 cifra de kilos y ninguna cae en su
       columna — a ? px», que es un diagnóstico peor que el que venía a
       sustituir. Se cuenta aparte. */
    if (col.yCab != null && cy(w.bbox) < col.yCab) { d.arriba++; continue; }
    d.n++;
    var c = cx(w.bbox);
    var dx = c < col.x0 ? col.x0 - c : (c > col.x1 ? c - col.x1 : 0);
    if (d.dx == null || dx < d.dx) { d.dx = Math.round(dx); d.cerca = v; }
  }
  return d;
}

function unaColumna(pal, col, nombre) {
  if (!col) return { motivo: 'sin_cabecera', nombre: nombre };
  var cands = cifras(pal, col);
  if (!cands.length) {
    var d = porQueNada(pal, col);
    d.motivo = 'sin_cifras'; d.nombre = nombre;
    return d;
  }
  var cuatro = recorta(cands, pal);
  /* Faltan cifras y sobran cifras son dos problemas distintos, y el piloto
     puede hacer algo distinto con cada uno: con tres de cuatro lo que falla es
     la lectura de UNA, con seis lo que falla es saber cuáles son las de la
     tabla. Refundirlos en un motivo deja la pantalla diciendo lo mismo a los
     dos, que es medio reporte. */
  if (!cuatro) return { motivo: cands.length < 4 ? 'pocas' : 'sin_filas', nombre: nombre, n: cands.length };
  var v = cuatro.map(function (c) { return c.valor; });
  var mal = revisa(v);
  /* ⚠ El campo NO se llama `valores`: quien llama usa `.valores` como «hay
     lectura buena», así que una rama de FALLO que lo traiga rellena el
     formulario con justo los números que acaba de declarar imposibles. Pasó,
     y lo cazó el banco. Se llama `leidos` porque es diagnóstico, no dato. */
  if (mal) return { motivo: 'no_cuadra', nombre: nombre, detalle: mal, leidos: v };
  var val = {}, cajas = {}, confs = {};
  for (var i = 0; i < 4; i++) { val[CLAVES[i]] = v[i]; cajas[CLAVES[i]] = cuatro[i].bbox; confs[CLAVES[i]] = cuatro[i].conf; }
  return { valores: val, cajas: cajas, confs: confs };
}

/* ── LA PUERTA ────────────────────────────────────────────────────────────
   Pura: entra la lista de palabras que ha devuelto el reconocedor y sale lo
   que se puede escribir en el formulario. Ni DOM, ni red, ni localStorage —
   así el banco la conduce en Node y prueba LA función, no una copia. */
function lee(palabras) {
  var pal = normaliza(palabras);
  var r = { plan: null, real: null, cajas: { plan: null, real: null },
            confs: { plan: null, real: null }, motivos: {}, leidas: 0 };
  /* Lo que SE HA VISTO viaja siempre, se lea la tabla o no. «No encuentro la
     tabla» tiene tres causas que desde el asiento del piloto se ven iguales
     —recortó la foto por encima de la cabecera · la foto es pequeña y
     Tesseract la destroza («Planet» a confianza 11) · no es esta pantalla— y
     medidas las tres, en las TRES se leen entre 45 y 68 palabras y las dos
     etiquetas de fila salen perfectas. O sea que la app tenía delante la
     prueba de que la tabla SÍ está y acusaba al piloto de haberla tapado. Es
     la frase de los reflejos otra vez, un piso más abajo: el diagnóstico
     existía y se tiraba. */
  r.visto = { palabras: pal.length,
              filas: busca(pal, FILA_2).length > 0 && busca(pal, FILA_3).length > 0 };
  if (!pal.length) { r.motivos.global = 'sin_texto'; return r; }
  var cols = columnas(pal);
  if (!cols.plan && !cols.real) { r.motivos.global = 'sin_tabla'; return r; }

  var p = unaColumna(pal, cols.plan, 'plan');
  var q = unaColumna(pal, cols.real, 'real');
  if (!p.motivo) { r.plan = p.valores; r.cajas.plan = p.cajas; r.confs.plan = p.confs; r.leidas += 4; }
  else r.motivos.plan = p;
  if (!q.motivo) { r.real = q.valores; r.cajas.real = q.cajas; r.confs.real = q.confs; r.leidas += 4; }
  else r.motivos.real = q;
  return r;
}

/* Todas las cajas leídas, para poder recortar de la foto EXACTAMENTE lo que se
   ha escrito en el formulario. Enseñar el recorte es lo que convierte «me lo
   ha rellenado» en algo que el piloto puede comprobar sin volver a la foto. */
function envoltura(res, margen) {
  var m = margen == null ? 14 : margen, hay = false;
  var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  ['plan', 'real'].forEach(function (k) {
    var c = res && res.cajas && res.cajas[k]; if (!c) return;
    CLAVES.forEach(function (f) {
      var b = c[f]; if (!b) return; hay = true;
      x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0);
      x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1);
    });
  });
  if (!hay) return null;
  return { x0: x0 - m, y0: y0 - m, x1: x1 + m, y1: y1 + m };
}

var API = {
  lee: lee, envoltura: envoltura,
  CLAVES: CLAVES, RE_NUM: RE_NUM, CONF_MIN: CONF_MIN, TAXI_MAX: TAXI_MAX,
  MIN_KG: MIN_KG, MAX_KG: MAX_KG,
  _columnas: columnas, _revisa: revisa, _kg: _kg, _limpiaCab: _limpiaCab
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
else root.FuelOCR = API;

})(typeof globalThis !== 'undefined' ? globalThis : this);
