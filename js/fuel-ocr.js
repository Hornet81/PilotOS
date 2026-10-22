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
  /* `xd` es el borde DERECHO de la cabecera, que es contra lo que eCrews
     alinea sus cifras: lo usa la segunda lectura para mirar sólo ahí. */
  return { x0: x0 - m, x1: x1 + m, yCab: y1, xd: x1 };
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
  var d = { n: 0, arriba: 0, flojas: 0, raras: 0, ej: '', dx: null, cerca: null, banda: 0 };
  for (var i = 0; i < pal.length; i++) {
    var w = pal[i], v = _kg(w.text);
    /* ⚠⚠ EL EJEMPLO SALE DE LA BANDA, NO DE LA PÁGINA. Reportado el 13-oct-2026:
       el aviso decía «leo cifras que no tienen forma de kilos, como «VY1883/13»»
       —la clave del vuelo, de la cabecera de la página— y con eso no se puede
       seguir. `raras` y `ej` recorrían TODAS las palabras y se quedaban con la
       primera en orden de lectura, que en un pantallazo es siempre la barra de
       estado o el título: medido contra la foto real del reporte anterior, el
       ejemplo era «7:05», el reloj del iPad. O sea que la única prueba que el
       aviso enseña era, por construcción, la menos relacionada con el fallo.

       Medido en el mismo caso con la banda: lo que hay debajo de la cabecera
       del plan es «65 53», «63 65», «21 00», «19 77» — las cuatro cifras
       partidas en dos por el lector. Eso SÍ dice qué ha pasado y qué repetir.
       Es «el diagnóstico existía y se tiraba», un piso más abajo. */
    var enBanda = cx(w.bbox) >= col.x0 && cx(w.bbox) <= col.x1 &&
                  (col.yCab == null || cy(w.bbox) >= col.yCab);
    if (enBanda) d.banda++;
    if (v == null) {
      if (enBanda && /[0-9]/.test(w.text)) { d.raras++; if (!d.ej) d.ej = w.text; }
      continue;
    }
    if (w.conf < CONF_MIN) { if (enBanda) d.flojas++; continue; }
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

/* ═══════════════════════════════════════════════════════════════════════════
   SEGUNDA LECTURA — cuando la primera no llega (21-oct-2026)

   «Compruebe por qué no detecta los datos de combustible», con una FOTO de la
   pantalla del iPad hecha con otro aparato: trama de moiré por toda la imagen,
   un reflejo y una mano. Medido con el Tesseract REAL sobre esa foto:

     · la lectura de la página entera saca 8276, 2100 y 1943 a 95-96 de
       confianza… y el 8545 a 53, por debajo de CONF_MIN → «sólo veo 3 de 4»;
     · la cabecera «Actual Fuel on Board(kg)» no sale NUNCA (la real se queda
       sin cabecera), y «Takeoff» tampoco (no hay filas que anclar);
     · y la columna real, en sus cajas grises, no la lee ninguna pasada — ni
       siquiera en una réplica LIMPIA de la pantalla: la diferencia que eCrews
       escribe debajo de cada cifra se mezcla con ella.

   Lo que SÍ la lee es mirar de cerca: recortar la celda, ampliarla ×3 y leer
   sólo cifras. Así salieron las ocho exactas — 8545 · 8276 · 2100 · 1943 y
   8900 · 8700 · 2800 · 2660 —. Pero también salieron 8780, 8908 y 2666 con
   otros ajustes, a 63-81 de confianza: aquí la confianza NO separa una lectura
   buena de una mala. Lo que las separa es esto:

     · UNANIMIDAD de las lecturas de cerca: dos que coinciden y ninguna en
       contra. Con mayoría a secas la celda del 8700 salía «8780» (dos contra
       uno) y pasaba el checksum;
     · la DIFERENCIA que eCrews escribe debajo de cada real («+424» = real −
       plan): se lee también, y una pareja plan/real que la cumple al kilo
       queda probada por tres números leídos por separado;
     · y si nada de eso cierra, la celda se queda VACÍA y se dice con los
       valores delante — «no coinciden (8780 / 8700)» es un diagnóstico; un
       8780 escrito en el logbook es el avión inventado con la firma detrás.

   El checksum de siempre sigue detrás: cuatro cifras que no bajan no se
   escriben. Medido sobre la foto del reporte a cuatro escalas y sobre una
   réplica con diez grados de trama: ni UN número equivocado escrito — y en
   una de esas réplicas la primera lectura sola SÍ escribía un plan falso, que
   ahora sale como duda.

   CUÁNDO corre: sólo si la primera lectura no llena las DOS columnas y ha
   encontrado al menos una cabecera. Un pantallazo que se lee entero no paga
   nada (es el camino de siempre, intacto), y una foto sin tabla tampoco.

   DÓNDE mira, sin una coordenada cableada: las FILAS salen de una columna ya
   leída entera (sus cuatro cajas) o, si no hay ninguna, de las etiquetas
   Takeoff/Landing; las COLUMNAS, de su cabecera — y si la de la real no se ha
   leído, se busca otra vez en una franja estrecha alrededor de la del plan.
   Sin filas no se lee nada de cerca: repartir cifras a ojo en una tabla de
   cuatro es justo lo que este archivo no hace.
   ═══════════════════════════════════════════════════════════════════════════ */

/* Dos lecturas que COINCIDEN valen más que una sola de mucha confianza: es la
   validación cruzada de `pernoctas-masivo-test` aplicada a una cifra. Por eso
   un valor con dos votos sube al listón (CONF_MIN) aunque cada lectura por
   separado se quedara por debajo — el 8545 a 53 de la foto del reporte lo
   leyeron bien las dos pasadas de página entera. (Eso sólo da las FILAS: los
   números que se escriben los deciden las lecturas de cerca, más abajo.) */
var VOTOS_MIN = 2;

/* Misma celda: los centros caen a menos de ~media caja en las dos direcciones.
   No se compara el texto: dos lecturas DISTINTAS del mismo sitio son justo lo
   que hay que encontrar. */
function _mismaCelda(a, b) {
  var h = Math.max(a.y1 - a.y0, b.y1 - b.y0), w = Math.max(a.x1 - a.x0, b.x1 - b.x0);
  return Math.abs(cy(a) - cy(b)) < h * 0.6 && Math.abs(cx(a) - cx(b)) < w * 0.6;
}

/* El voto de UNA celda. `lect` = [{valor, conf, bbox}]. Devuelve el valor si
   hay mayoría clara de al menos dos; con UNA sola lectura se queda como está
   (su confianza decide, igual que antes); con lecturas que no coinciden,
   `valor:null` y `duda` con los valores vistos. */
function vota(lect) {
  if (!lect || !lect.length) return { valor: null };
  if (lect.length === 1) return { valor: lect[0].valor, conf: lect[0].conf, bbox: lect[0].bbox, votos: 1 };
  var g = {}, orden = [];
  lect.forEach(function (l) { var k = String(l.valor); if (!g[k]) { g[k] = []; orden.push(k); } g[k].push(l); });
  orden.sort(function (a, b) { return g[b].length - g[a].length; });
  var top = g[orden[0]], seg = orden.length > 1 ? g[orden[1]].length : 0;
  if (top.length >= VOTOS_MIN && top.length > seg) {
    var mejor = top[0];
    top.forEach(function (l) { if (l.conf > mejor.conf) mejor = l; });
    return { valor: mejor.valor, conf: Math.max(mejor.conf, CONF_MIN), bbox: mejor.bbox, votos: top.length };
  }
  return { valor: null, duda: orden.map(Number), bbox: top[0].bbox, votos: 0 };
}

/* Funde varias pasadas de la MISMA imagen (mismas coordenadas). Las cifras se
   votan por celda; el resto de palabras se juntan sin repetir. Devuelve la
   lista en el formato del reconocedor, para que `lee` no note la diferencia. */
function funde(listas) {
  var otras = [], celdas = [];
  (listas || []).forEach(function (lista) {
    normaliza(lista).forEach(function (w) {
      var v = _kg(w.text);
      if (v == null) {
        for (var i = 0; i < otras.length; i++) {
          if (otras[i].text === w.text && _mismaCelda(otras[i].bbox, w.bbox)) {
            if (w.conf > otras[i].conf) otras[i] = w;
            return;
          }
        }
        otras.push(w); return;
      }
      var c = null;
      for (var j = 0; j < celdas.length; j++) if (_mismaCelda(celdas[j].bbox, w.bbox)) { c = celdas[j]; break; }
      if (!c) { c = { bbox: w.bbox, lect: [] }; celdas.push(c); }
      c.lect.push({ valor: v, conf: w.conf, bbox: w.bbox });
    });
  });
  var pal = otras.map(function (w) { return { text: w.text, confidence: w.conf, bbox: w.bbox }; });
  var dudas = [];
  celdas.forEach(function (c) {
    var d = vota(c.lect);
    if (d.valor != null) pal.push({ text: String(d.valor), confidence: d.conf, bbox: d.bbox });
    else if (d.duda) dudas.push({ valores: d.duda, bbox: d.bbox });
  });
  return { pal: pal, dudas: dudas };
}

/* Dónde volver a buscar las cabeceras: franjas alrededor de la que SÍ se ha
   leído (la del plan o la de la real; sin ninguna, «Scheduled»), desde un poco
   a su izquierda hasta el borde derecho —las de combustible son las últimas
   columnas—. Sin ninguna, no hay dónde mirar y se devuelve [].

   ⚠ Son DOS franjas y ESTRECHAS, y eso salió de medir. Con ±2,5 altos de
   cabecera la franja se llena de trama y Tesseract no lee ni «Planned»; con
   ±0,6 y ±0,8 sale «Actual Fuel on Board(kg)» entera en la foto del reporte,
   pero cada una falla en una escala distinta de la misma foto. Se prueba la
   primera y, si aún falta una cabecera, la segunda. */
var CAB_ANCLA = /^scheduled$/i;
var FRANJA_ALTOS = [0.6, 0.85];
function franjaCabecera(palabras, W, H) {
  var pal = normaliza(palabras);
  var c = busca(pal, CAB_PLAN).concat(busca(pal, CAB_PLAN2), busca(pal, CAB_REAL));
  if (!c.length) c = busca(pal, CAB_ANCLA);
  if (!c.length) return [];
  var x0 = Infinity, y0 = Infinity, y1 = -Infinity, h = 0;
  c.forEach(function (w) {
    x0 = Math.min(x0, w.bbox.x0); y0 = Math.min(y0, w.bbox.y0); y1 = Math.max(y1, w.bbox.y1);
    h = Math.max(h, w.bbox.y1 - w.bbox.y0);
  });
  /* Una cabecera de más de un 6 % del alto no es una cabecera: es una lectura
     rota que ha juntado media pantalla. Sin un alto creíble no se amplía nada. */
  if (!(h > 0) || h > H * 0.06) return [];
  return FRANJA_ALTOS.map(function (m) {
    return { x0: Math.max(0, x0 - 4 * h), x1: W, y0: Math.max(0, y0 - m * h), y1: Math.min(H, y1 + m * h) };
  });
}

/* La REJILLA de la segunda lectura: las cuatro filas y, para cada columna que
   falta, la zona donde van sus cifras. `cajas` son las de una columna ya leída
   entera (es lo más fiable que hay: cuatro cifras que han pasado el checksum);
   sin ellas, las filas salen de Takeoff/Landing; sin nada, null. */
function rejilla(palabras, cajas, faltan, fuenteK) {
  var pal = normaliza(palabras), filas = null, alto = 0, ancho = 0;
  if (cajas) {
    filas = CLAVES.map(function (f) { return cy(cajas[f]); });
    CLAVES.forEach(function (f) { alto += (cajas[f].y1 - cajas[f].y0) / 4; ancho += (cajas[f].x1 - cajas[f].x0) / 4; });
  } else {
    var t = busca(pal, FILA_2), l = busca(pal, FILA_3);
    if (t.length && l.length) {
      var yT = cy(t[0].bbox), yL = cy(l[0].bbox), s = yL - yT;
      if (s > 0) {
        filas = [yT - s, yT, yL, yL + s];
        alto = ((t[0].bbox.y1 - t[0].bbox.y0) + (l[0].bbox.y1 - l[0].bbox.y0)) / 2;
        ancho = alto * 3.2;              // un grupo de cuatro cifras ≈ 3 altos
      }
    }
  }
  if (!filas || !(alto > 0)) return null;
  var difs = [filas[1] - filas[0], filas[2] - filas[1], filas[3] - filas[2]];
  if (difs.some(function (d) { return !(d > 0); })) return null;
  difs.sort(function (a, b) { return a - b; });
  var paso = difs[1];
  /* Filas a intervalos iguales o no es esta tabla: con un hueco el doble que
     otro, alguna de las cuatro cajas no es de la fila que dice ser. */
  if (difs[2] > difs[0] * 1.6) return null;
  var cols = columnas(pal);
  var g = { filas: filas, paso: paso, alto: alto, k: Math.max(1, Math.min(4, 64 / alto)), cols: {}, celdas: [] };
  /* La columna que da las filas sabe EXACTAMENTE dónde están sus cifras: sus
     cuatro cajas. Su zona sale de ahí, y la de la otra columna empieza donde
     acaba ésta. ⚠ Sin ese corte, con la cabecera de la real sin leer, la banda
     del plan llega hasta la real: el recorte de cada fila tenía DOS cifras, no
     votaba ninguna, y la foto del reporte al 90 % daba «8908» en la fila del
     plan — la real de esa fila leída donde iba el plan. */
  var src = null;
  if (cajas && fuenteK) {
    src = { x0: Math.min.apply(null, CLAVES.map(function (f) { return cajas[f].x0; })) - 0.6 * ancho,
            x1: Math.max.apply(null, CLAVES.map(function (f) { return cajas[f].x1; })) + 0.6 * ancho };
  }
  (faltan || []).forEach(function (k) {
    var b = cols[k]; if (!b) return;
    var x0, x1;
    if (src && k === fuenteK) { x0 = src.x0; x1 = src.x1; }
    else {
      var lim0 = b.x0, lim1 = b.x1;
      if (src) {
        if (cx(b) > (src.x0 + src.x1) / 2) lim0 = Math.max(lim0, src.x1);
        else lim1 = Math.min(lim1, src.x0);
      }
      if (!(lim1 > lim0)) return;
      /* La zona se ESTRECHA a donde ya se ha visto alguna cifra de esa columna
         —en cualquier pasada y con cualquier confianza— si cae en una de sus
         filas. Medido: la banda entera de la cabecera es casi todo trama, y
         leída de cerca la trama se convierte en dígitos (el 2100 desaparecía
         con la banda ancha y salía con la estrecha). */
      var cs = pal.filter(function (w) {
        if (_kg(w.text) == null) return false;
        var x = cx(w.bbox), y = cy(w.bbox);
        return x >= lim0 && x <= lim1 && y >= b.yCab &&
               filas.some(function (f) { return Math.abs(y - f) < paso * 0.5; });
      });
      /* Sin ninguna cifra vista, la zona se pega al borde derecho de la
         cabecera, que es contra lo que van alineadas: con la banda entera, la
         foto del reporte leyó «8780» dos veces seguidas donde ponía 8700. */
      x0 = Math.max(lim0, b.xd - 2.6 * ancho); x1 = Math.min(lim1, b.xd + 0.8 * ancho);
      if (cs.length) {
        x0 = Math.max(lim0, Math.min.apply(null, cs.map(function (w) { return w.bbox.x0; })) - 0.6 * ancho);
        x1 = Math.min(lim1, Math.max.apply(null, cs.map(function (w) { return w.bbox.x1; })) + 0.6 * ancho);
      }
      if (!(x1 > x0)) return;
    }
    g.cols[k] = { x0: x0, x1: x1, banda: b };
    filas.forEach(function (y, i) {
      /* ±0,17 del paso: la cifra entera y NADA de la diferencia que eCrews
         escribe debajo (en la foto, 0,22 del paso más abajo). */
      var y0 = y - paso * 0.17, y1 = y + paso * 0.17;
      if (y0 < b.yCab) return;
      g.celdas.push({ col: k, fila: i, rect: { x0: x0, x1: x1, y0: y0, y1: y1 } });
    });
  });
  return g;
}

/* Cambia las cifras de las columnas releídas por las votadas. Se quitan TODAS
   las cifras de su banda (no sólo las de las celdas): una suelta de la trama
   dejaría cinco candidatas y la columna se perdería por eso. */
function inyecta(palabras, g, decisiones) {
  var out = (palabras || []).filter(function (w) {
    if (_kg(w.text) == null) return true;
    var b = caja(w);
    return !Object.keys(g.cols).some(function (k) {
      var c = g.cols[k].banda;
      return cx(b) >= c.x0 && cx(b) <= c.x1 && cy(b) >= c.yCab;
    });
  });
  (decisiones || []).forEach(function (d) {
    if (d.valor != null) out.push({ text: String(d.valor), confidence: d.conf, bbox: d.bbox });
  });
  return out;
}

/* De varios resultados, el que más columnas ha llenado. Empate → el PRIMERO:
   la primera lectura es la que traen afinados los avisos de la pantalla. */
function elige(lista) {
  var mejor = null, n = -1;
  (lista || []).forEach(function (r) {
    if (!r) return;
    var k = (r.plan ? 1 : 0) + (r.real ? 1 : 0);
    if (k > n) { n = k; mejor = r; }
  });
  return mejor;
}

/* ── La lectura completa, en el navegador ────────────────────────────────
   `worker` es un worker de Tesseract ya creado; `lienzo`, el canvas de la
   foto; `avisa(fase)` opcional, para decir en pantalla que se está repasando.
   Todo va EN SERIE sobre el mismo worker: un worker reconoce una cosa a la
   vez, y dos en paralelo es el cuelgue que ya costó una vuelta. */
var PSM_PAGINA = '6';      // el de siempre (el valor por defecto del worker)
var PSM_DISPERSO = '11';   // texto suelto: lee la franja de las cabeceras
/* Una celda se lee como BLOQUE y no como una línea: en eCrews la diferencia va
   pegada debajo de la cifra real, y medido con la réplica de la pantalla, el
   recorte de la fila se lleva las dos — leído como una sola línea no salía
   NADA. Como bloque salen las dos por separado y la diferencia, con su signo,
   no tiene forma de kilos. */
var PSM_CELDA = '6';
var SOLO_CIFRAS = '0123456789+-';

function _palabras(r) {
  var pal = [];
  ((r && r.data && r.data.blocks) || []).forEach(function (b) { (b.paragraphs || []).forEach(function (p) {
    (p.lines || []).forEach(function (l) { (l.words || []).forEach(function (x) { pal.push(x); }); }); }); });
  return pal;
}
function _reconoce(worker, canvas, psm, lista) {
  /* Los parámetros se ponen SIEMPRE, también en la primera pasada: el worker
     los conserva entre llamadas, y una foto leída después de un repaso se
     quedaría con el modo de una sola línea y sólo cifras. */
  var pon = worker.setParameters ? worker.setParameters({ tessedit_pageseg_mode: psm, tessedit_char_whitelist: lista || '' })
                                 : Promise.resolve();
  return Promise.resolve(pon).then(function () { return worker.recognize(canvas, {}, { blocks: true }); })
    .then(_palabras);
}
/* Un trozo del lienzo, ampliado ×k, en grises y con el contraste estirado
   (percentiles 2–98). A mano y no con `ctx.filter`: Safari ha ido tarde con
   el filtro del canvas, y un filtro que se ignora en el iPad del piloto haría
   que las tres lecturas «distintas» fueran la misma. `suave` añade un
   desenfoque 3×3, que es lo que se come la trama. */
function _zona(lienzo, r, k, suave) {
  var x0 = Math.max(0, Math.floor(r.x0)), y0 = Math.max(0, Math.floor(r.y0));
  var x1 = Math.min(lienzo.width, Math.ceil(r.x1)), y1 = Math.min(lienzo.height, Math.ceil(r.y1));
  var w = Math.max(1, Math.round((x1 - x0) * k)), h = Math.max(1, Math.round((y1 - y0) * k));
  var c = document.createElement('canvas'); c.width = w; c.height = h;
  var g = c.getContext('2d');
  g.imageSmoothingEnabled = true; try { g.imageSmoothingQuality = 'high'; } catch (e) {}
  g.drawImage(lienzo, x0, y0, x1 - x0, y1 - y0, 0, 0, w, h);
  var d = g.getImageData(0, 0, w, h), p = d.data, n = w * h, L = new Float32Array(n), i;
  for (i = 0; i < n; i++) L[i] = 0.299 * p[i * 4] + 0.587 * p[i * 4 + 1] + 0.114 * p[i * 4 + 2];
  if (suave) {
    var M = new Float32Array(n);
    for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++) {
      var s = 0, m = 0;
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        var X = xx + dx, Y = yy + dy;
        if (X >= 0 && X < w && Y >= 0 && Y < h) { s += L[Y * w + X]; m++; }
      }
      M[yy * w + xx] = s / m;
    }
    L = M;
  }
  var hist = new Array(256).fill(0);
  for (i = 0; i < n; i++) hist[Math.max(0, Math.min(255, L[i] | 0))]++;
  var lo = 0, hi = 255, acc = 0;
  for (i = 0; i < 256; i++) { acc += hist[i]; if (acc >= n * 0.02) { lo = i; break; } }
  acc = 0;
  for (i = 255; i >= 0; i--) { acc += hist[i]; if (acc >= n * 0.02) { hi = i; break; } }
  var esc = hi > lo ? 255 / (hi - lo) : 1;
  for (i = 0; i < n; i++) {
    var v = Math.max(0, Math.min(255, (L[i] - lo) * esc));
    p[i * 4] = p[i * 4 + 1] = p[i * 4 + 2] = v; p[i * 4 + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  c._x0 = x0; c._y0 = y0; c._k = k;
  return c;
}
/* Las cajas de un trozo, devueltas a las coordenadas del lienzo entero. */
function _mapea(pal, c) {
  return (pal || []).map(function (w) {
    var b = w.bbox;
    return { text: w.text, confidence: w.confidence,
             bbox: { x0: c._x0 + b.x0 / c._k, y0: c._y0 + b.y0 / c._k, x1: c._x0 + b.x1 / c._k, y1: c._y0 + b.y1 / c._k } };
  });
}

/* Los ajustes de cerca, en orden. Los dos primeros siempre (sin dos lecturas
   no hay voto); el tercero sólo si no han coincidido. Medido sobre la foto del
   reporte: ×3 en grises lee las ocho; ×2 se equivoca en una (87080); con el
   suavizado vuelve a leerlas todas. */
function _ajustes(k) {
  return [{ k: k, suave: false }, { k: Math.max(1, k * 0.67), suave: false }, { k: k, suave: true }];
}

/* La DIFERENCIA que eCrews escribe debajo de cada cifra real: «+424» es
   real − plan, en verde y con signo. Hasta hoy se tiraba a propósito (un
   signo no es una masa, Beta.932); aquí se LEE, porque es la única prueba
   independiente que tiene la tabla: está escrita con otros glifos, en otro
   sitio, y dice cuánto tiene que valer la real si el plan es el que es. */
function _delta(t) {
  /* Los dos puntos se QUEDAN: «+00:02» es la diferencia de una HORA y no puede
     convertirse en 2 kg. */
  var m = /^([+\-−])([0-9]{1,4})$/.exec(String(t == null ? '' : t).replace(/[^0-9:+\-−]/g, ''));
  return m ? (m[1] === '+' ? 1 : -1) * parseInt(m[2], 10) : null;
}

/* ── Las decisiones, puras (el banco las conduce en Node) ──────────────────
   ⚠ Aquí sólo votan las lecturas DE CERCA. Las de página entera no, y salió
   de medir: con la foto del reporte reducida al 90 %, las dos pasadas de
   página entera leyeron «2108» donde pone 2100 — el MISMO error dos veces,
   porque las dos miran los mismos píxeles a la misma escala—, mientras que de
   cerca salió 2100 con los tres ajustes. Dos lecturas que se equivocan igual
   no son dos pruebas.

   La regla es UNANIMIDAD: dos lecturas de cerca que coinciden y ninguna en
   contra. Con mayoría a secas, la celda del 8700 salía «8780» (dos votos
   contra uno) y pasaba el checksum. */
function _uno(lect, v) {
  var mejor = null;
  lect.forEach(function (l) { if (l.valor === v && (!mejor || l.conf > mejor.conf)) mejor = l; });
  return mejor;
}
function _distintos(lect) {
  var out = [];
  lect.forEach(function (l) { if (out.indexOf(l.valor) === -1) out.push(l.valor); });
  return out;
}
function _acepta(l, extra) {
  var r = { valor: l.valor, conf: Math.max(l.conf, CONF_MIN), bbox: l.bbox };
  for (var k in (extra || {})) r[k] = extra[k];
  return r;
}
/* Una celda. `cerca` = lecturas de cerca; `antes` = el valor que ya traía esa
   celda de una columna leída entera (o null). */
function decideCelda(cerca, antes) {
  cerca = cerca || [];
  if (!cerca.length) {
    /* Ninguna lectura nueva: no hay nada que contradiga lo que ya había. Sin
       nada antes, la celda está VACÍA — es el 0 de relleno de eCrews. */
    return antes ? { valor: antes.valor, conf: antes.conf, bbox: antes.bbox } : { valor: null, vacia: true };
  }
  var vs = _distintos(cerca);
  if (vs.length === 1 && cerca.length >= VOTOS_MIN) return _acepta(_uno(cerca, vs[0]));
  if (vs.length === 1 && antes && antes.valor === vs[0]) return _acepta(_uno(cerca, vs[0]));
  if (antes && vs.indexOf(antes.valor) === -1) vs.push(antes.valor);
  return { valor: null, duda: vs, bbox: cerca[0].bbox };
}
/* Una FILA entera: plan, real y las lecturas de la diferencia (`Dl`). La
   diferencia MANDA: se busca la pareja de lecturas —de cerca o la que ya
   había— que la cumple EXACTAMENTE. Que tres números leídos por separado, con
   glifos distintos y en sitios distintos, cuadren al kilo no pasa por
   casualidad; por eso aquí basta con UNA lectura de la diferencia que
   cuadre, aunque otra la haya leído distinto (en la foto del reporte, «+424»
   y «+626»: sólo el 424 cuadra con 8700 − 8276).
   Si la diferencia se ha leído dos veces igual y NINGUNA pareja la cumple, la
   fila se contradice a sí misma y no se escribe ninguna de las dos. Si no se
   ha podido leer, cada celda va por su cuenta. */
function decideFila(P, R, Dl, antesP, antesR) {
  P = P || []; R = R || []; Dl = Dl || [];
  var cp = P.concat(antesP ? [antesP] : []), cr = R.concat(antesR ? [antesR] : []);
  var ds = _distintos(Dl), D = (Dl.length >= VOTOS_MIN && ds.length === 1) ? ds[0] : null;
  if (ds.length && cp.length && cr.length) {
    var parejas = [];
    cp.forEach(function (p) { cr.forEach(function (r) { ds.forEach(function (d) {
      if (r.valor - p.valor !== d) return;
      for (var i = 0; i < parejas.length; i++) if (parejas[i].p === p.valor && parejas[i].r === r.valor) return;
      parejas.push({ p: p.valor, r: r.valor, d: d });
    }); }); });
    /* Dos parejas distintas que cuadran las dos: no se elige a ojo. */
    if (parejas.length === 1) {
      var q = parejas[0];
      return [_acepta(_uno(cp, q.p), { cruzada: true, delta: q.d }),
              _acepta(_uno(cr, q.r), { cruzada: true, delta: q.d })];
    }
  }
  var dp = decideCelda(P, antesP), dr = decideCelda(R, antesR);
  if (D != null && dp.valor != null && dr.valor != null) {
    /* Las dos celdas votadas y la diferencia NO cuadra: una de las tres está
       mal y desde aquí no se sabe cuál. */
    return [{ valor: null, duda: [dp.valor], contra: dr.valor - D, bbox: dp.bbox, delta: D },
            { valor: null, duda: [dr.valor], contra: dp.valor + D, bbox: dr.bbox, delta: D }];
  }
  return [dp, dr];
}

/* Lee UNA zona de cerca con los ajustes. Los dos primeros siempre; el tercero
   sólo si no han coincidido. `lector` convierte un texto en valor (o null). */
function _leeZona(worker, lienzo, rect, k, lector) {
  var lect = [], aj = _ajustes(k), i = 0;
  var paso = function () {
    if (i >= aj.length) return Promise.resolve(lect);
    var a = aj[i++], c = _zona(lienzo, rect, a.k, a.suave);
    return _reconoce(worker, c, PSM_CELDA, SOLO_CIFRAS).then(function (p) {
      /* Una celda es UNA cifra. Con dos en el mismo trozo no se sabe cuál es
         la de la fila: esa lectura no vota. */
      /* Lo que el recorte CORTA no vale: medio «+717» cortado por el borde de
         abajo se leyó «4717» a 91 de confianza — una cifra de kilos perfecta
         que no está en la pantalla. Un trozo que toca el borde es medio glifo. */
      var mg = Math.max(2, c.height * 0.03);
      var ok = _mapea(p.filter(function (w) { return w.bbox.y0 > mg && w.bbox.y1 < c.height - mg; }), c)
        .filter(function (w) { return lector(w.text) != null; });
      if (ok.length === 1) lect.push({ valor: lector(ok[0].text), conf: ok[0].confidence, bbox: ok[0].bbox });
      if (i < 2) return paso();
      if (!lect.length) return lect;               // dos miradas y ni una cifra: vacía (el 0 de relleno)
      if (lect.length >= 2 && _distintos(lect).length === 1) return lect;
      return paso();
    });
  };
  return paso();
}

function leeFoto(worker, lienzo, avisa) {
  var di = function (f, n) { try { if (avisa) avisa(f, n); } catch (e) {} };
  var pasadas = [], res1, res2, F, decisiones = [], g = null;
  return _reconoce(worker, lienzo, PSM_PAGINA).then(function (p1) {
    pasadas.push(p1);
    res1 = lee(p1);
    if (res1.plan && res1.real) return res1;
    /* Sin ninguna cabecera no hay ni columnas que releer ni dónde buscarlas:
       la segunda lectura no puede ganar nada y, medido con una réplica llena
       de trama, una pasada de texto suelto sobre ruido tardó 22 s para decir
       lo mismo. Se queda la primera, con su aviso de siempre. */
    if (res1.motivos.global) return res1;
    di('repaso');
    /* Sin ninguna columna no hay filas: otra pasada de página entera, en modo
       de texto suelto, que en la foto del reporte leyó las cuatro del plan. */
    return (res1.plan || res1.real ? Promise.resolve(null) : _reconoce(worker, lienzo, PSM_DISPERSO)).then(function (p2) {
      if (p2) pasadas.push(p2);
      F = pasadas.length > 1 ? funde(pasadas) : { pal: p1.slice(), dudas: [] };
      var falta = function () { var c = columnas(normaliza(F.pal)); return !c.plan || !c.real; };
      if (!falta()) return;
      return franjaCabecera(F.pal, lienzo.width, lienzo.height).reduce(function (pr, fr) {
        return pr.then(function () {
          if (!falta()) return;
          var c = _zona(lienzo, fr, 2, false);
          return _reconoce(worker, c, PSM_DISPERSO).then(function (p3) {
            /* De la franja sólo se toman las PALABRAS: sus cifras son las de
               la barra de estado y la cabecera del vuelo, no las de la tabla. */
            _mapea(p3, c).forEach(function (w) { if (_kg(w.text) == null) F.pal.push(w); });
          });
        });
      }, Promise.resolve());
    }).then(function () {
      res2 = lee(F.pal);
      if (res2.plan && res2.real) return res2;
      /* La columna que da las FILAS, con lo que ya traía: sus cajas dicen
         dónde está cada fila aunque alguno de sus números resulte dudoso. */
      var fuente = res2.plan ? { k: 'plan', v: res2.plan, c: res2.cajas.plan, f: res2.confs.plan }
                 : res2.real ? { k: 'real', v: res2.real, c: res2.cajas.real, f: res2.confs.real }
                 : res1.plan ? { k: 'plan', v: res1.plan, c: res1.cajas.plan, f: res1.confs.plan }
                 : res1.real ? { k: 'real', v: res1.real, c: res1.cajas.real, f: res1.confs.real } : null;
      g = rejilla(F.pal, fuente ? fuente.c : null, ['plan', 'real'], fuente ? fuente.k : null);
      if (!g || !g.celdas.length) return elige([res1, res2]);
      var antes = function (k, i) {
        if (!fuente || fuente.k !== k) return null;
        var f = CLAVES[i];
        return { valor: fuente.v[f], conf: (fuente.f && fuente.f[f]) || CONF_MIN, bbox: fuente.c[f] };
      };
      var zona = function (k, i) {
        var c = g.celdas.filter(function (x) { return x.col === k && x.fila === i; })[0];
        return c ? c.rect : null;
      };
      /* Fila a fila, y dentro de cada fila plan → real → diferencia, EN SERIE
         sobre el mismo worker. */
      return [0, 1, 2, 3].reduce(function (pr, i) {
        return pr.then(function () {
          di('fila', i + 1);
          var zp = zona('plan', i), zr = zona('real', i), P = [], R = [], Dl = [];
          return (zp ? _leeZona(worker, lienzo, zp, g.k, _kg) : Promise.resolve([])).then(function (l) {
            P = l;
            return zr ? _leeZona(worker, lienzo, zr, g.k, _kg) : [];
          }).then(function (l) {
            R = l;
            /* La diferencia va debajo de la cifra REAL, así que sólo se mira si
               hay una real leída y algo del plan con qué compararla. */
            var hayP = P.length || antes('plan', i), hayR = R.length || antes('real', i);
            if (!hayP || !hayR) return [];
            var base = zr || (fuente && fuente.k === 'real' ? fuente.c[CLAVES[i]] : null);
            if (!base) return [];
            var y = g.filas[i];
            return _leeZona(worker, lienzo, { x0: base.x0, x1: base.x1, y0: y + g.paso * 0.1, y1: y + g.paso * 0.36 }, g.k, _delta);
          }).then(function (l) {
            Dl = l;
            var d = decideFila(P, R, Dl, antes('plan', i), antes('real', i));
            d[0].col = 'plan'; d[1].col = 'real';
            [0, 1].forEach(function (j) {
              d[j].fila = i;
              d[j].lect = (j ? R : P).map(function (x) { return x.valor; });
              d[j].deltas = Dl.map(function (x) { return x.valor; });
              if ((j ? zr : zp) || d[j].valor != null) decisiones.push(d[j]);
            });
          });
        });
      }, Promise.resolve()).then(function () {
        /* La segunda lectura DECIDE las columnas que ha releído: si una celda
           salió dudosa, no se vuelve a la primera lectura de esa columna —
           sería escribir justo el número que acaba de ponerse en duda. */
        return lee(inyecta(F.pal, g, decisiones));
      });
    }).then(function (res) {
      /* Lo que no se ha escrito por DUDA se dice con los valores delante. */
      ['plan', 'real'].forEach(function (k) {
        if (res[k]) return;
        var du = decisiones.filter(function (d) { return d.col === k && d.duda; });
        if (du.length) res.motivos[k] = { motivo: 'dudosa', nombre: k,
          dudas: du.map(function (d) { return { fila: CLAVES[d.fila], valores: d.duda, contra: d.contra == null ? null : d.contra }; }) };
      });
      /* Lo que se ha hecho, para poder diagnosticar un reporte sin la foto. */
      res.repaso = { pasadas: pasadas.length, celdas: decisiones.map(function (d) {
        return { col: d.col, fila: CLAVES[d.fila], valor: d.valor, duda: d.duda || null, cruzada: !!d.cruzada,
                 contra: d.contra == null ? null : d.contra, delta: d.delta == null ? null : d.delta,
                 lect: d.lect, deltas: d.deltas };
      }) };
      return res;
    });
  });
}

var API = {
  lee: lee, envoltura: envoltura, leeFoto: leeFoto,
  funde: funde, vota: vota, rejilla: rejilla, inyecta: inyecta, elige: elige,
  franjaCabecera: franjaCabecera, decideCelda: decideCelda, decideFila: decideFila,
  VOTOS_MIN: VOTOS_MIN, _delta: _delta,
  _zona: _zona, _reconoce: _reconoce, _mapea: _mapea,
  CLAVES: CLAVES, RE_NUM: RE_NUM, CONF_MIN: CONF_MIN, TAXI_MAX: TAXI_MAX,
  MIN_KG: MIN_KG, MAX_KG: MAX_KG,
  _columnas: columnas, _revisa: revisa, _kg: _kg, _limpiaCab: _limpiaCab
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
else root.FuelOCR = API;

})(typeof globalThis !== 'undefined' ? globalThis : this);
