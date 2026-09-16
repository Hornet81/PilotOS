/* ════════ PilotOS · i18n — idioma de la interfaz ════════
   Modelo "gettext": la CLAVE es el propio texto en español tal y como sale en pantalla,
   y cada idioma tiene su diccionario (js/i18n-en.js). El resto del código sigue
   escribiendo en español como siempre: no hay claves que inventar ni que mantener.

   Cómo se aplica:
   · En ESPAÑOL no se hace NADA — ni observador ni recorrido. Coste cero para el piloto
     de siempre, y ningún riesgo de romperle una pantalla.
   · En otro idioma, un MutationObserver mira cada texto que entra en la página (HTML
     estático, innerHTML, textContent, React) y si su texto COMPLETO está en el
     diccionario lo cambia. Nunca se traduce a trozos ni con IA: lo que no está en el
     diccionario se queda en español tal cual.

   Reglas:
   · Coincidencia EXACTA con los espacios normalizados. Un texto con " · " se traduce
     segmento a segmento ("Mañana · en 3h 10m" → "Tomorrow · in 3h 10m").
   · Patrones (regex) para los textos que llevan números u horas.
   · translate="no" en un elemento → no se toca nada dentro (datos del piloto, IA…).
   · Cambiar de idioma RECARGA la app: más fiable que retraducir en caliente pantallas
     que ya se pintaron con el idioma anterior.
   · El código que compare textos del DOM ("if (el.textContent === 'Hoy')") se rompe en
     inglés: comparar valores de JS, no lo que hay pintado. */
(function(){
  'use strict';
  var KEY = 'pilotos_lang';
  var LANGS = { es: 'Español', en: 'English' };
  var lang = 'es';
  try { var s = localStorage.getItem(KEY); if (s && LANGS[s]) lang = s; } catch (e) {}
  window.pilotosLang = lang;
  window.PILOTOS_LANGS = LANGS;
  try { document.documentElement.setAttribute('lang', lang); } catch (e) {}

  var DICT = {};   // idioma → { map: Map(textoES → traducción), pats: [[regex, reemplazo|fn]] }
  function bucket(l){ return DICT[l] || (DICT[l] = { map: new Map(), tpl: new Map(), pats: [] }); }
  function norm(s){ return String(s).replace(/\s+/g, ' ').trim(); }

  // PLANTILLAS: una clave con {0}, {1}… vale para cualquier número/hora en ese hueco.
  // 'Hay {0} vuelos' traduce "Hay 12 vuelos". Los números fijos de la clave también se
  // comparan ("Últimos {0} de 3" sólo casa si el último es 3).
  var NUM = /\d+(?:[.,:]\d+)*/g;
  function tplKey(k, seq){
    return k.replace(/\{(\d+)\}|\d+(?:[.,:]\d+)*/g, function(m, i){
      if (seq) seq.push(i != null ? +i : m);
      return '{#}';
    });
  }

  // Los diccionarios se registran con esto (uno por sección: i18n-en.js, i18n-en-logbook.js…)
  window.pilotosI18nAdd = function(l, strings, patterns){
    var b = bucket(l);
    if (strings) Object.keys(strings).forEach(function(k){
      var nk = norm(k);
      if (/\{\d+\}/.test(nk)){
        var seq = [], tk = tplKey(nk, seq);
        (b.tpl.get(tk) || b.tpl.set(tk, []).get(tk)).push({ seq: seq, dst: strings[k] });
      } else b.map.set(nk, strings[k]);
    });
    if (patterns) patterns.forEach(function(p){ b.pats.push(p); });
  };

  function fromTpl(k, b){
    if (!b.tpl.size) return null;
    var nums = [];
    var tk = k.replace(NUM, function(m){ nums.push(m); return '{#}'; });
    if (!nums.length) return null;
    var list = b.tpl.get(tk);
    if (!list) return null;
    for (var x = 0; x < list.length; x++){
      var t = list[x], vals = {}, ok = t.seq.length === nums.length;
      for (var y = 0; ok && y < nums.length; y++){
        if (typeof t.seq[y] === 'number') vals[t.seq[y]] = nums[y];
        else if (t.seq[y] !== nums[y]) ok = false;
      }
      if (ok) return t.dst.replace(/\{(\d+)\}/g, function(m, i){ return vals[i] != null ? vals[i] : m; });
    }
    return null;
  }

  function one(k, b){
    var v = b.map.get(k);
    if (v != null) return v;
    if (k.length > 300) return null;
    v = fromTpl(k, b);
    if (v != null) return v;
    for (var i = 0; i < b.pats.length; i++){
      var p = b.pats[i], m = k.match(p[0]);
      if (m) return (typeof p[1] === 'function') ? p[1](m, T) : k.replace(p[0], p[1]);
    }
    return null;
  }
  // Traduce un texto entero. null = no hay traducción (se deja como está).
  function tr(s){
    if (lang === 'es' || s == null) return null;
    var b = DICT[lang]; if (!b) return null;
    var raw = String(s), k = norm(raw);
    if (!k || k.length > 2000 || !/[A-Za-zÀ-ÿ¿¡]/.test(k)) return null;
    var v = one(k, b);
    // Por segmentos: "Mañana · en 3h" · "AGO 2026 – SEP 2026" (los separadores se conservan)
    if (v == null && (k.indexOf(' · ') > 0 || k.indexOf(' – ') > 0)){
      var changed = false;
      var parts = k.split(/( · | – )/).map(function(p, i){
        if (i % 2) return p;
        var r = one(p, b);
        if (r != null && r !== p){ changed = true; return r; }
        return p;
      });
      if (changed) v = parts.join('');
    }
    if (v == null || v === k) return null;
    // Se conservan los espacios de alrededor: en HTML separan palabras de nodos vecinos.
    return raw.match(/^\s*/)[0] + v + raw.match(/\s*$/)[0];
  }
  function T(s){ var r = tr(s); return r == null ? s : r; }

  // Para el código nuevo: t('Guardar') · t('Quedan {n} vuelos', {n: 3})
  window.t = function(s, vars){
    var out = T(s);
    if (vars) out = String(out).replace(/\{(\w+)\}/g, function(m, n){ return vars[n] != null ? vars[n] : m; });
    return out;
  };
  window.pilotosSetLang = function(l){
    if (!LANGS[l] || l === lang) return;
    try { localStorage.setItem(KEY, l); } catch (e) {}
    try { if (navigator.vibrate) navigator.vibrate(20); } catch (e) {}
    location.reload();
  };

  // Selector ES/EN (login + panel del piloto). El botón activo sale de html[lang], así que
  // no hace falta JS para marcarlo.
  try {
    var st = document.createElement('style');
    st.textContent =
      '.i18n-lang{display:inline-flex;gap:2px;padding:2px;border-radius:9px;flex-shrink:0;' +
        'background:rgba(10,30,58,.8);border:1px solid rgba(34,211,238,.18)}' +
      '.i18n-lang button{border:0;background:transparent;color:rgba(148,198,255,.6);cursor:pointer;' +
        "font:700 10px/1 'Space Mono',monospace;letter-spacing:1px;padding:7px 10px;border-radius:7px;" +
        '-webkit-tap-highlight-color:transparent}' +
      'html[lang="es"] .i18n-lang button[data-lang="es"],html[lang="en"] .i18n-lang button[data-lang="en"]' +
        '{background:rgba(34,211,238,.18);color:#22D3EE}' +
      // En modo día el panel del piloto es CLARO (el login sigue oscuro en los dos modos).
      'html.day #dh-pilot-panel .i18n-lang{background:rgba(15,23,42,.05);border-color:rgba(15,23,42,.14)}' +
      'html.day #dh-pilot-panel .i18n-lang button{color:#64748b}' +
      'html.day[lang="es"] #dh-pilot-panel .i18n-lang button[data-lang="es"],html.day[lang="en"] #dh-pilot-panel .i18n-lang button[data-lang="en"]' +
        '{background:rgba(8,145,178,.14);color:#0e7490}';
    (document.head || document.documentElement).appendChild(st);
  } catch (e) {}

  if (lang === 'es') return;

  var ATTRS = ['placeholder', 'title', 'aria-label'];
  var SKIP_SEL = 'script,style,textarea,noscript,code,pre,[translate="no"],[contenteditable=""],[contenteditable="true"]';
  var SKIP_TAG = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1, CODE: 1, PRE: 1 };

  function doText(n){
    var v = n.nodeValue;
    if (n.__i18nOut === v) return;               // ya es nuestra traducción
    var r = tr(v);
    if (r != null){ n.__i18nOut = r; n.nodeValue = r; }
  }
  function doAttrs(el){
    // Textos cortos y ambiguos ("X" = miércoles, "M" = martes/miércoles…): el HTML trae su
    // traducción en data-i18n-en y no pasan por el diccionario.
    var fijo = el.getAttribute('data-i18n-' + lang);
    if (fijo != null && !el.__i18nFijo){ el.__i18nFijo = 1; el.textContent = fijo; }
    for (var i = 0; i < ATTRS.length; i++){
      var a = ATTRS[i], v = el.getAttribute(a);
      if (!v) continue;
      var mark = '__i18n_' + a;
      if (el[mark] === v) continue;
      var r = tr(v);
      if (r != null){ el[mark] = r; el.setAttribute(a, r); }
    }
  }
  function skipEl(el){
    if (SKIP_TAG[el.nodeName]) return true;
    var tn = el.getAttribute('translate');
    if (tn === 'no') return true;
    var ce = el.getAttribute('contenteditable');
    return ce === '' || ce === 'true';
  }
  var FILTER = { acceptNode: function(n){
    return (n.nodeType === 1 && skipEl(n)) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
  } };
  function walk(root){
    if (!root) return;
    if (root.nodeType === 3){
      var p = root.parentNode;
      if (p && p.nodeType === 1 && !p.closest(SKIP_SEL)) doText(root);
      return;
    }
    if (root.nodeType !== 1 || root.closest(SKIP_SEL)) return;
    doAttrs(root);
    var w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, FILTER);
    var n;
    while ((n = w.nextNode())){ if (n.nodeType === 3) doText(n); else doAttrs(n); }
  }
  window.pilotosI18nApply = function(root){ walk(root || document.body); };

  var mo = new MutationObserver(function(recs){
    for (var i = 0; i < recs.length; i++){
      var r = recs[i];
      if (r.type === 'childList'){
        for (var j = 0; j < r.addedNodes.length; j++){
          var a = r.addedNodes[j];
          if (a.isConnected) walk(a);
        }
      } else if (r.type === 'characterData'){
        var n = r.target, p = n.parentNode;
        if (n.isConnected && p && p.nodeType === 1 && !p.closest(SKIP_SEL)) doText(n);
      } else if (r.type === 'attributes'){
        var el = r.target;
        if (el.isConnected && !el.closest(SKIP_SEL)) doAttrs(el);
      }
    }
  });
  // Se observa desde el <head>: el propio parser del HTML genera los registros, así que el
  // piloto no llega a ver el español de la carga inicial.
  mo.observe(document.documentElement, {
    subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: ATTRS
  });
  document.addEventListener('DOMContentLoaded', function(){ walk(document.body); });

  // Los avisos nativos no pasan por el DOM.
  ['alert', 'confirm', 'prompt'].forEach(function(fn){
    var orig = window[fn];
    if (typeof orig !== 'function') return;
    window[fn] = function(msg){
      var args = Array.prototype.slice.call(arguments);
      if (msg != null) args[0] = T(String(msg));
      return orig.apply(window, args);
    };
  });
})();
