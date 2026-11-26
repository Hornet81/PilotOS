/* Pay Check › Nómina: cada sección con su tono de oro (20-nov-2026, variante B).
   «Ahora es muy plano, todos igual y es difícil encontrar las cosas.»

   Es una PIEL: no cambia ni un campo ni un cálculo. A cada caja con `data-pcs`
   le pone una cabecera (icono en su disco, título, resumen de lo que hay dentro y
   chevron), mete el resto en `.pcs-body` para poder plegarla, y arriba de la
   pestaña una fila de chips para saltar a cada sección.

   - Los colores son todos de la familia dorada (champán, latón, oro, ámbar,
     bronce, cobre) y viven en css/paycheck-secciones.css, con su paleta de día.
   - El título es el MISMO <span> de antes, movido: el traductor ya lo conocía.
     El resumen lleva números y va escrito ya en su idioma (`translate="no"`).
   - Lo plegado se recuerda (`pilotos_pay_pcs_cerr`). Perfil y Cargos nacen
     plegados: se rellenan una vez y ya.
   - Iconos dibujados (<path>), nunca un carácter. */
(function () {
  'use strict';
  var KEY = 'pilotos_pay_pcs_cerr';
  var DEF_CERR = { perfil: true, cargos: true };
  var ICO = {
    perfil: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1.2-3.6 4-5.5 7-5.5s5.8 1.9 7 5.5"/>',
    cargos: '<path d="M12 3l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 15.4 7.2 17.9l.9-5.4L4.2 8.7l5.4-.8z"/>',
    actividad: '<path d="M2 14l9-2 5-8 2 1-3 7 6 1 1 2-7 1-4 5H9l2-5-8 1z"/>',
    dietas: '<path d="M4 20V9l8-5 8 5v11"/><path d="M9 20v-6h6v6"/>',
    formacion: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/>',
    opcionales: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>'
  };
  var CORTO = {
    perfil: ['Perfil', 'Profile'], cargos: ['Cargos', 'Roles'], actividad: ['Actividad', 'Activity'],
    dietas: ['Dietas', 'Per diem'], formacion: ['Formación', 'Training'], opcionales: ['Opcionales', 'Optional']
  };
  function EN() { return (window.pilotosLang || 'es') === 'en'; }
  function L(es, en) { return EN() ? en : es; }
  function svg(k, s) {
    return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICO[k] + '</svg>';
  }
  function leeCerr() {
    try { var o = JSON.parse(localStorage.getItem(KEY) || 'null'); if (o && typeof o === 'object') return o; } catch (e) {}
    var d = {}; for (var k in DEF_CERR) d[k] = DEF_CERR[k]; return d;
  }
  function guardaCerr(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }

  function v(id) { var e = document.getElementById(id); return e ? String(e.value || '').trim() : ''; }
  function n(id) { var x = parseFloat(v(id).replace(',', '.')); return isFinite(x) ? x : 0; }
  function num(x) {
    var r = Math.round(x * 100) / 100;
    var s = String(r); return EN() ? s : s.replace('.', ',');
  }
  function plural(x, uno, varios) { return num(x) + ' ' + (x === 1 ? uno : varios); }

  var RESUMEN = {
    perfil: function () {
      var e = document.getElementById('pc_esp'), esp = '';
      if (e && e.selectedIndex >= 0 && e.value) {
        var t = (e.options[e.selectedIndex].text || '');
        esp = /comand|captain|cpt/i.test(t) ? 'CPT' : /oficial|officer|fo\b/i.test(t) ? 'FO' : t;
      }
      var p = [];
      if (esp) p.push(esp);
      if (v('pc_nivel')) p.push(L('Nivel ', 'Level ') + v('pc_nivel'));
      if (v('pc_irpf')) p.push('IRPF ' + num(n('pc_irpf')) + ' %');
      return p.join(' · ') || L('Sin rellenar', 'Not filled in');
    },
    cargos: function () {
      var w = document.getElementById('pc_cargos_wrap');
      var p = [];
      var tri = n('pc_tri') + n('pc_tre');
      if (tri) p.push(plural(tri, L('sim. impartido', 'sim. given'), L('sim. impartidos', 'sims given')));
      if (n('pc_lsc')) p.push(num(n('pc_lsc')) + ' h LSC');
      if (n('pc_gti')) p.push(plural(n('pc_gti'), L('día GRI', 'GRI day'), L('días GRI', 'GRI days')));
      if (n('pc_formacion')) p.push(plural(n('pc_formacion'), L('sim. alumno', 'trainee sim'), L('sim. alumno', 'trainee sims')));
      var jd = n('pc_jdia') + n('pc_jdia_fest');
      if (jd) p.push(plural(jd, L('día jefe', 'duty mgr day'), L('días jefe', 'duty mgr days')));
      if (p.length) return p.join(' · ');
      return (w && w.style.display !== 'none') ? L('Cargo activo · sin datos', 'Active role · no data') : L('Ninguno activo', 'None active');
    },
    actividad: function () {
      var p = [];
      var lab = document.getElementById('pc_mp_label');
      var mes = lab ? (lab.textContent || '').trim() : '';
      if (mes && /\d/.test(mes)) p.push(mes);
      if (n('pc_hv')) p.push(num(n('pc_hv')) + ' h');
      if (n('pc_imag')) p.push(plural(n('pc_imag'), L('imag.', 'standby'), L('imag.', 'standby')));
      return p.join(' · ') || L('Sin importar', 'Not imported');
    },
    dietas: function () {
      var d = n('pc_dnat') + n('pc_dint'), p = n('pc_dpern_nat') + n('pc_dpern'), r = [];
      if (d) r.push(plural(d, L('dieta', 'per diem'), L('dietas', 'per diems')));
      if (p) r.push(plural(p, L('noche', 'night'), L('noches', 'nights')));
      return r.join(' · ') || L('Sin dietas', 'No per diems');
    },
    formacion: function () {
      var r = [];
      if (n('pc_fonline')) r.push(num(n('pc_fonline')) + ' h e-learning');
      if (n('pc_oficina')) r.push(plural(n('pc_oficina'), L('día oficina', 'office day'), L('días oficina', 'office days')));
      if (n('pc_sparring')) r.push(num(n('pc_sparring')) + ' h sparring');
      return r.join(' · ') || L('Sin actividad', 'No activity');
    },
    opcionales: function (box) {
      var c = 0;
      box.querySelectorAll('.pc-switch input[type=checkbox]').forEach(function (i) { if (i.checked) c++; });
      return c ? plural(c, L('activo', 'active'), L('activos', 'active')) : L('Ninguno activo', 'None active');
    }
  };

  var CAJAS = [];
  function monta() {
    var tab = document.getElementById('pc-tab-nom');
    if (!tab || tab.getAttribute('data-pcs-ok')) return;
    var cajas = tab.querySelectorAll('.card-box[data-pcs]');
    if (!cajas.length) return;
    tab.setAttribute('data-pcs-ok', '1');
    var cerr = leeCerr();
    cajas.forEach(function (box) {
      var k = box.getAttribute('data-pcs');
      var sep = null;
      for (var i = 0; i < box.children.length; i++) { if (box.children[i].classList.contains('pc-sep')) { sep = box.children[i]; break; } }
      var span = sep ? sep.querySelector('span') : null;
      box.classList.add('pcs', 'pcs-' + k);
      var body = document.createElement('div');
      body.className = 'pcs-body';
      body.id = 'pcs-body-' + k;
      while (box.firstChild) body.appendChild(box.firstChild);
      if (sep) sep.remove();
      var head = document.createElement('button');
      head.type = 'button';
      head.className = 'pcs-head';
      head.setAttribute('aria-controls', body.id);
      head.innerHTML = '<span class="pcs-ico">' + svg(k, 19) + '</span>' +
        '<span class="pcs-tx"><span class="pcs-t"></span><span class="pcs-sum" translate="no"></span></span>' +
        '<span class="pcs-chev"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></span>';
      if (span) { span.className = 'pcs-tt'; head.querySelector('.pcs-t').appendChild(span); }
      head.addEventListener('click', function () { abre(box, box.classList.contains('pcs-cerr')); });
      box.appendChild(head);
      box.appendChild(body);
      pon(box, !!cerr[k]);
      CAJAS.push(box);
    });
    // El índice de chips, delante de la primera sección.
    var nav = document.createElement('nav');
    nav.className = 'pcs-nav';
    nav.setAttribute('translate', 'no');
    nav.setAttribute('aria-label', L('Secciones', 'Sections'));
    nav.innerHTML = CAJAS.map(function (b) {
      var k = b.getAttribute('data-pcs');
      return '<button type="button" class="pcs-chip pcs-' + k + '" data-pcs-ir="' + k + '">' + svg(k, 14) + '<span>' + L(CORTO[k][0], CORTO[k][1]) + '</span></button>';
    }).join('');
    nav.addEventListener('click', function (e) {
      var b = e.target.closest('[data-pcs-ir]'); if (!b) return;
      var box = tab.querySelector('.card-box[data-pcs="' + b.getAttribute('data-pcs-ir') + '"]');
      if (!box) return;
      abre(box, true);
      try { box.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (x) { box.scrollIntoView(); }
    });
    CAJAS[0].parentNode.insertBefore(nav, CAJAS[0]);
    tab.addEventListener('input', resume, true);
    tab.addEventListener('change', resume, true);
    tab.addEventListener('click', function () { setTimeout(resume, 0); }, true);
    resume();
  }
  function pon(box, cerrada) {
    box.classList.toggle('pcs-cerr', cerrada);
    var h = box.querySelector('.pcs-head');
    if (h) h.setAttribute('aria-expanded', cerrada ? 'false' : 'true');
  }
  function abre(box, abrir) {
    pon(box, !abrir);
    var o = leeCerr(); o[box.getAttribute('data-pcs')] = !abrir; guardaCerr(o);
  }
  var _t = 0;
  function resume() {
    clearTimeout(_t);
    _t = setTimeout(function () {
      CAJAS.forEach(function (box) {
        var k = box.getAttribute('data-pcs'), s = box.querySelector('.pcs-sum');
        var txt = ''; try { txt = RESUMEN[k](box); } catch (e) {}
        if (s && s.textContent !== txt) s.textContent = txt;
      });
    }, 60);
  }
  window.pcSecciones = { monta: monta, resume: resume, abre: function (k, si) {
    var b = document.querySelector('#pc-tab-nom .card-box[data-pcs="' + k + '"]'); if (b) abre(b, si !== false);
  } };

  function arranca() {
    monta();
    // La importación escribe con `.value` sin eventos: se rehace el resumen al
    // terminar de pintar (pcMarcaImportado) y, con la pestaña delante, cada 2 s.
    setInterval(function () {
      var t = document.getElementById('pc-tab-nom');
      if (t && t.style.display !== 'none' && document.visibilityState === 'visible') resume();
    }, 2000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arranca);
  else arranca();
})();
