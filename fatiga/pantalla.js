/* ══════════════════════════════════════════════════════════════════════════
   FATIGA — la sección (pantalla #scr-fatigue)

   Diseño elegido el 27-oct-2026 sobre el lienzo «PilotOS — Sección de fatiga»:
   verde cristal (glassmorphism) en noche y día, cuatro pestañas —Hoy (el
   instrumento), Reloj (24 h), Semana (perfil de vigilia) y Check (antes de
   firmar)— y un fondo que RESPIRA según el nivel de fatiga: hacia turquesa si
   es baja, ámbar si es moderada y granate si es alta, más deprisa cuanto más
   alta (16 · 12 · 9 s). Sólo se anima la opacidad de una capa: lo compone la
   GPU, y con «reducir movimiento» se queda quieto.

   No calcula fatiga: lee window.pilotosFatiga() (index.html), que es el
   adaptador del roster a js/fatiga.js. Lo que se dibuja (la curva, los sueños,
   el peor aterrizaje) es lo MISMO que decide el nivel.

   Cada dato lleva su «?»: una hoja que explica qué es y qué hacer con ello.
   Textos en el idioma del piloto (L), con translate="no" en el contenedor.
   ══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  function en() { return (root.pilotosLang || 'es') === 'en'; }
  function L(es, eng) { return en() ? eng : es; }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function hm(m) { m = Math.max(0, Math.round(m || 0)); return Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0'); }
  function num(v) { var s = (Math.round(v * 10) / 10).toFixed(1); return en() ? s : s.replace('.', ','); }
  var MIN = 60000, DIA = 86400000;
  /* PVT-B (Basner, Mollicone y Dinges 2011): la versión de 3 minutos validada
     contra el PVT de 10. Luz cada 2–5 s y lapso a partir de 355 ms —los del PVT
     de 10 min (2–10 s, 500 ms) con 3 minutos pierden sensibilidad—. */
  var PVT_ISI = [2000, 5000], PVT_LAPSO = 355;

  var ST = { tab: 'hoy', fecha: null, ay: null, doc: null, intro: null };
  root.__fatST = ST;

  /* ── Datos ─────────────────────────────────────────────────────────────── */
  function res() { try { return root.pilotosFatiga ? root.pilotosFatiga() : null; } catch (e) { return null; } }
  function tz(r) { return (r && r.tz) || 'Europe/Madrid'; }
  function off(ms, r) { try { return root.NGasto.tzOffsetMin(ms, tz(r)); } catch (e) { return 0; } }
  function horaDe(ms, r) { var m = (((ms / MIN + off(ms, r)) % 1440) + 1440) % 1440; return m / 60; }
  function hhmm(ms, r) { var h = horaDe(ms, r), m = Math.round(h * 60) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
  function medianocheLocal(fecha, r) { var t = Date.parse(fecha + 'T00:00:00Z'); return t - off(t, r) * MIN; }
  function fechaMs(ms, r) { var d = new Date(ms + off(ms, r) * MIN); return d.toISOString().slice(0, 10); }
  function nombreDia(fecha, corto) {
    var d = new Date(fecha + 'T12:00:00Z');
    var DS = en() ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] : ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    var MS = en() ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] : ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    var n = DS[d.getUTCDay()];
    if (corto) n = n.slice(0, 3);
    return en() ? n + ' ' + d.getUTCDate() + ' ' + MS[d.getUTCMonth()] : n + ' ' + d.getUTCDate() + ' ' + MS[d.getUTCMonth()];
  }
  function sel(r) {
    if (!r || !r.lista || !r.lista.length) return null;
    if (ST.fecha && r.porFecha[ST.fecha]) return r.porFecha[ST.fecha];
    var ahora = Date.now();
    var sig = r.lista.filter(function (x) { return x.fin >= ahora; })[0] || r.lista[r.lista.length - 1];
    ST.fecha = sig.fecha;
    return sig;
  }
  function ruta(j) {
    var a = (j && j.aterrizajes) || [];
    if (!a.length) return '';
    var r = [a[0].dep || '?'];
    a.forEach(function (x) { r.push(x.arr || '?'); });
    return r.join('–');
  }
  var NIV = { bajo: ['BAJO', 'LOW'], moderado: ['MODERADO', 'MODERATE'], alto: ['ALTO', 'HIGH'] };
  function nivTxt(n, may) { var t = NIV[n] ? L(NIV[n][0], NIV[n][1]) : '—'; return may ? t : t.charAt(0) + t.slice(1).toLowerCase(); }

  function motivos(j, r) {
    return (j.factores || []).map(function (f) {
      var h = function (m) { return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(Math.round(m % 60)).padStart(2, '0'); };
      switch (f.k) {
        case 'firma_wocl': return { k: 'firma', t: L('Firmas a las ' + h(f.h) + ', antes de las 05:00', 'You report at ' + h(f.h) + ', before 05:00') };
        case 'madrugada': return { k: 'firma', t: L('Madrugada: firmas a las ' + h(f.h), 'Early start: you report at ' + h(f.h)) };
        case 'madrugadas_seguidas': return { k: 'firma', t: L(f.n + 'ª madrugada seguida', 'Early start number ' + f.n + ' in a row') };
        case 'tarde': return { k: 'reloj', t: L('Último aterrizaje a las ' + h(f.h), 'Last landing at ' + h(f.h)) };
        case 'wocl': return { k: 'wocl', t: L('Vuelas en tu ventana de bajo rendimiento circadiano (02:00–06:00)', 'You fly in your window of circadian low (02:00–06:00)') };
        case 'poco_sueno': return { k: 'sueno', t: L('Sueño posible antes de firmar: ' + hm(f.min), 'Possible sleep before reporting: ' + hm(f.min)) };
        case 'sectores': return { k: 'sectores', t: L(f.n + ' sectores en la jornada', f.n + ' sectors in the duty') };
        case 'despierto': return { k: 'despierto', t: L('Más de 16 h despierto al último aterrizaje (' + hm(f.min) + ')', 'Over 16 h awake at the last landing (' + hm(f.min) + ')') };
        case 'deuda': return { k: 'deuda', t: L('Deuda de sueño de 3 días: ' + hm(f.min), '3-day sleep debt: ' + hm(f.min)) };
        default: return null;
      }
    }).filter(Boolean);
  }
  function consejo(j) {
    var ks = (j.factores || []).map(function (f) { return f.k; });
    if (ks.indexOf('wocl') >= 0 || ks.indexOf('tarde') >= 0)
      return [L('Siesta por la tarde antes de firmar.', 'Nap in the afternoon before reporting.'), L('Es el último valle natural del día: el sueño entra solo y llegas a la firma con menos horas despierto.', 'It is the last natural dip of the day: sleep comes easily and you report with fewer hours awake.')];
    if (ks.indexOf('firma_wocl') >= 0 || ks.indexOf('madrugada') >= 0)
      return [L('Acuéstate antes la víspera.', 'Go to bed earlier the night before.'), L('Con firma a las ' + hhmmFirma(j) + ', intenta dormir desde las 21:30: antes de esa hora al cuerpo le cuesta.', 'With report at ' + hhmmFirma(j) + ', try to sleep from 21:30: before that your body struggles.')];
    if (ks.indexOf('deuda') >= 0)
      return [L('Prioriza dormir 8 h las próximas noches.', 'Prioritise 8 h of sleep over the next nights.'), L('La deuda se recupera con noches largas seguidas, no con una sola.', 'Debt is recovered with long nights in a row, not a single one.')];
    return [L('Sin medidas especiales.', 'No special measures.'), L('Mantén tu rutina de sueño habitual.', 'Keep your usual sleep routine.')];
  }
  var _rCache = null;
  function hhmmFirma(j) { return hhmm(j.inicio, _rCache); }

  /* ── Ayudas («?») ──────────────────────────────────────────────────────── */
  function AY(k, j) {
    var A = {
      guia: [L('CÓMO LEER ESTA SECCIÓN', 'HOW TO READ THIS SECTION'), L('Tu fatiga, antes de volar', 'Your fatigue, before you fly'),
        L('PilotOS lee tu roster, estima cuándo vas a dormir y calcula lo despierto que estarás en cada momento de cada jornada. Hoy enseña el momento más crítico; Reloj, cómo cae la jornada en tu cuerpo; Semana, la curva de varios días; y Check te deja medir cómo estás de verdad.', 'PilotOS reads your roster, estimates when you will sleep and works out how alert you will be at every moment of each duty. Today shows the most critical moment; Clock, how the duty falls on your body; Week, the curve over several days; and Check lets you measure how you really are.'),
        L('Toca cualquier ? para ver qué significa cada cifra. Es una previsión: cómo te sientes de verdad manda siempre.', 'Tap any ? to see what each number means. It is a forecast: how you actually feel always comes first.')],
      vigilia: [L('LA CIFRA GRANDE', 'THE BIG NUMBER'), L('Vigilia (A), de 2 a 14', 'Alertness (A), from 2 to 14'),
        L('Junta tres cosas: cuánto llevas despierto, tu reloj interno (que baja de noche) y cómo has dormido. Cuanto más alta, más despierto. Por debajo de 7 es la zona roja, donde los estudios ven muchos más microsueños y errores.', 'It combines three things: how long you have been awake, your body clock (it drops at night) and how you slept. The higher, the more alert. Below 7 is the red zone, where studies see far more micro-sleeps and errors.'),
        L('No es una nota contra ti: te dice en qué parte del día tienes que ir con más cuidado.', 'It is not a mark against you: it tells you where in the day you need to be most careful.')],
      colores: [L('LAS TRES ZONAS', 'THE THREE ZONES'), L('Turquesa, ámbar y rojo', 'Teal, amber and red'),
        L('Turquesa (más de 8,5): vigilia normal. Ámbar (de 7 a 8,5): atención, la fatiga empieza a notarse. Rojo (menos de 7): fatiga alta, el rendimiento baja de forma clara. El fondo de la pantalla también respira hacia ese color.', 'Teal (above 8.5): normal alertness. Amber (7 to 8.5): watch out, fatigue is starting to show. Red (below 7): high fatigue, performance drops noticeably. The screen background also breathes towards that colour.'),
        L('En ámbar, prepara bien el briefing de la aproximación. En rojo, reparte la carga con tu compañero y valora reportarlo.', 'In amber, plan your approach briefing well. In red, share the workload with your colleague and consider reporting it.')],
      kss: [L('ESCALA DE SOMNOLENCIA', 'SLEEPINESS SCALE'), L('KSS: el sueño que vas a notar', 'KSS: how sleepy you will feel'),
        L('La escala Karolinska va de 1 (muy despierto) a 9 (luchando contra el sueño). Es la de los estudios de aviación. Aquí es una aproximación desde la previsión; en Check puedes decirnos la tuya.', 'The Karolinska scale goes from 1 (very alert) to 9 (fighting sleep). It is the one used in aviation studies. Here it is an approximation from the forecast; in Check you can tell us your own.'),
        L('A partir de 7 se suelen notar los párpados pesados y las reacciones más lentas.', 'From 7 upwards you usually notice heavy eyelids and slower reactions.')],
      critico: [L('CUÁNDO MÁS IMPORTA', 'WHEN IT MATTERS MOST'), L('El momento más crítico', 'The most critical moment'),
        L('De todos los aterrizajes que operas en la jornada, el que te pilla con la vigilia más baja. El aterrizaje es la fase con más carga de trabajo, por eso es donde más pesa la fatiga. Los posicionales no cuentan.', 'Of all the landings you operate in the duty, the one where your alertness is lowest. Landing is the phase with the highest workload, so that is where fatigue matters most. Positioning sectors do not count.'),
        L('Haz el briefing de esa aproximación pronto, cuando aún estás fresco.', 'Brief that approach early, while you are still fresh.')],
      sueno: [L('ESTIMADO DE TU ROSTER', 'ESTIMATED FROM YOUR ROSTER'), L('Último sueño', 'Last sleep'),
        L('Horas de sueño en tu último descanso antes de firmar, estimadas del hueco entre jornadas (hora de acostarte, de levantarte y de firma). Menos de 6 horas cuenta como sueño corto.', 'Hours of sleep in your last rest before reporting, estimated from the gap between duties (bedtime, wake-up and report time). Below 6 hours counts as short sleep.'),
        L('Si dormiste distinto, díselo a la previsión en Check. Pronto podrás conectar tu reloj para que use tu sueño real.', 'If you slept differently, tell the forecast in Check. Soon you will be able to connect your watch so it uses your real sleep.')],
      despierto: [L('DESDE QUE TE LEVANTAS', 'TIME SINCE WAKING'), L('Horas despierto al aterrizar', 'Hours awake at landing'),
        L('Desde que te despiertas hasta el último aterrizaje de la jornada. A partir de 16 horas despierto, el tiempo de reacción se parece al de haber bebido.', 'From when you wake up to the last landing of the duty. After 16 hours awake, reaction time is like having had a drink.'),
        L('Una siesta antes de firmar baja esta cifra.', 'A nap before reporting cuts this number.')],
      deuda: [L('ACUMULADA', 'ACCUMULATED'), L('Deuda de sueño (3 días)', 'Sleep debt (3 days)'),
        L('Lo que te falta de sueño frente a 8 horas por noche en los tres días antes de firmar. Se acumula: dos noches cortas pesan más que una.', 'How much sleep is missing compared with 8 hours a night in the three days before reporting. It adds up: two short nights weigh more than one.'),
        L('Con 6 h o más de deuda, PilotOS sube el nivel un escalón, porque el modelo solo la subestima.', 'With 6 h or more of debt, PilotOS raises the level one step, because the model alone underestimates it.')],
      wocl: [L('WOCL', 'WOCL'), L('Ventana de bajo rendimiento circadiano', 'Window of circadian low'),
        L('De 02:00 a 06:00 tu cuerpo está en su punto más bajo, hayas dormido lo que hayas dormido. Es la franja con peor rendimiento del día. Se mide con la hora de tu base, que es la que sigue tu cuerpo.', 'From 02:00 to 06:00 your body is at its lowest point, whatever you slept. It is the time of day with the worst performance. It is measured on your base clock, the one your body follows.'),
        L('Si aterrizas en esta ventana, cuenta con reacciones más lentas aunque te notes bien.', 'If you land in this window, expect slower reactions even if you feel fine.')],
      firma: [L('LA HORA DE FIRMA', 'REPORT TIME'), L('Firmar muy pronto', 'Reporting very early'),
        L('Una firma temprana recorta el sueño de la noche: el cuerpo no se duerme antes de las 21:30 aunque te acuestes antes. Varias seguidas acumulan deuda.', 'An early report cuts your night sleep: your body does not fall asleep before 21:30 even if you go to bed earlier. Several in a row build up debt.'),
        L('Acuéstate pronto, deja preparado lo de la mañana y evita pantallas la última hora.', 'Go to bed early, prepare everything for the morning and avoid screens in the last hour.')],
      reloj: [L('FIN DE LA JORNADA', 'END OF THE DUTY'), L('Aterrizar tarde', 'Landing late'),
        L('Un último aterrizaje muy tarde suma horas despierto justo cuando tu reloj interno baja.', 'A very late last landing adds hours awake just as your body clock drops.'),
        L('Si puedes, haz una siesta antes de firmar.', 'If you can, take a nap before reporting.')],
      sectores: [L('CARGA DE TRABAJO', 'WORKLOAD'), L('Muchos sectores', 'Many sectors'),
        L('Cada sector es un despegue, una aproximación y un aterrizaje: con cuatro o más la carga se acumula.', 'Each sector is a take-off, an approach and a landing: with four or more the workload builds up.'),
        L('Aprovecha las escalas para comer y moverte.', 'Use the turnarounds to eat and move.')],
      semana7: [L('DE UN VISTAZO', 'AT A GLANCE'), L('Próximos 7 días', 'Next 7 days'),
        L('Cada casilla es un día pintado según su peor momento. Discontinuo: sin jornada de vuelo.', 'Each square is a day coloured by its worst moment. Dashed: no flight duty.'),
        L('Toca un día para verlo. La pestaña Semana enseña la curva entera.', 'Tap a day to see it. The Week tab shows the full curve.')],
      dial: [L('CÓMO SE LEE', 'HOW TO READ IT'), L('Un reloj de 24 horas de tu cuerpo', 'A 24-hour clock of your body'),
        L('Arriba es medianoche y abajo mediodía, en la hora de tu base. El anillo de fuera es tu día: la jornada en ámbar, el sueño estimado en azul y la ventana baja de 02:00 a 06:00 en violeta. La forma verde del centro es tu vigilia: cuanto más lejos del centro, más despierto.', 'Midnight is at the top and midday at the bottom, on your base time. The outer ring is your day: the duty in amber, estimated sleep in blue and the 02:00–06:00 low window in violet. The green shape in the middle is your alertness: the further from the centre, the more alert.'),
        L('Mira dónde cae el punto rojo (tu aterrizaje crítico): si está dentro de la franja violeta, ése es el momento de ir con más cuidado.', 'Look where the red dot (your critical landing) falls: if it is inside the violet band, that is the moment to be most careful.')],
      curvaSem: [L('CÓMO SE LEE', 'HOW TO READ IT'), L('Tu semana, como un perfil de vuelo', 'Your week, like a flight profile'),
        L('La línea verde es tu vigilia hora a hora durante 7 días. Arriba, despierto; abajo, cansado. Sube y baja cada día con tu reloj interno; las jornadas a malas horas y el sueño corto la empujan hacia abajo. Debajo, las jornadas (ámbar) y el sueño estimado (azul).', 'The green line is your alertness hour by hour over 7 days. Up is alert, down is tired. It rises and falls every day with your body clock; duties at bad hours and short sleep push it down. Below, your duties (amber) and estimated sleep (blue).'),
        L('Busca dónde la línea entra en la franja roja: ésos son los momentos para planificar.', 'Look for where the line goes into the red band: those are the moments to plan for.')],
      deposito: [L('COMO UN INDICADOR DE COMBUSTIBLE', 'LIKE A FUEL GAUGE'), L('Tu depósito de sueño', 'Your sleep tank'),
        L('F es lleno: has dormido 8 horas cada noche de los tres últimos días. Cada hora que te falta lo vacía un poco.', 'F is full: you have slept 8 hours each night of the last three days. Every hour you are short empties it a little.'),
        L('Se rellena con noches largas seguidas, no con una sola mañana de dormir más.', 'It refills with long nights in a row, not with a single lie-in.')],
      vigilar: [L('POR QUÉ ESTÁN AQUÍ', 'WHY THEY ARE HERE'), L('Jornadas a vigilar', 'Duties to watch'),
        L('Las jornadas de esta semana con nivel moderado o alto, primero la peor, con su motivo principal.', 'This week’s duties with a moderate or high level, worst first, with their main reason.'),
        L('Toca una para ver su detalle en Hoy.', 'Tap one to see its detail in Today.')],
      check: [L('PARA QUÉ SIRVE', 'WHAT THIS IS FOR'), L('Tres minutos antes de firmar', 'Three minutes before you report'),
        L('La previsión del roster no sabe cómo has dormido de verdad ni cómo te encuentras. Aquí añades lo que solo sabes tú: el sueño que notas y un test de reflejos.', 'The roster forecast does not know how you actually slept or how you feel. Here you add what only you know: how sleepy you feel and a reaction test.'),
        L('Se guarda en este aparato. Con el tiempo, tus respuestas servirán para ajustar la previsión a ti.', 'It is saved on this device. Over time, your answers will be used to tune the forecast to you.')],
      kssMia: [L('ESCALA KAROLINSKA', 'KAROLINSKA SLEEPINESS SCALE'), L('El sueño que notas ahora', 'How sleepy you feel now'),
        L('1 es muy despierto y 9 es luchando contra el sueño. No hay respuestas buenas: elige la que te describe ahora mismo.', '1 is very alert and 9 is fighting sleep. There are no right answers: choose what describes you right now.'),
        L('A partir de 7 la fatiga afecta claramente al rendimiento. Merece la pena decirlo.', 'From 7 upwards, fatigue affects performance clearly. It is worth saying so.')],
      pvt: [L('TEST DE VIGILANCIA PSICOMOTORA', 'PSYCHOMOTOR VIGILANCE TEST'), L('El test de reflejos', 'The reaction test'),
        L('Durante 3 minutos se enciende una luz en momentos al azar y tocas lo más rápido que puedas. La mediana es tu tiempo típico; tu base, tu mediana habitual (tras 3 tests). Los lapsos son reacciones de 355 ms o más: pequeñas ausencias. Es el test PVT-B, la versión validada de 3 minutos.', 'For 3 minutes a light comes on at random moments and you tap as fast as you can. The median is your typical time; your baseline, your usual median (after 3 tests). Lapses are reactions of 355 ms or more: tiny absences. It is the PVT-B, the validated 3-minute version.'),
        L('Si vas bastante más lento que tu base o tienes 3 lapsos o más, es una señal de fatiga.', 'If you are much slower than your baseline or have 3 or more lapses, that is a sign of fatigue.')],
      relojMu: [L('PRÓXIMAMENTE', 'COMING SOON'), L('El sueño de tu reloj', 'Sleep from your watch'),
        L('Podrás conectar Apple Salud o Google Fit para que PilotOS lea tu sueño real en vez de estimarlo del roster.', 'You will be able to connect Apple Health or Google Fit so PilotOS reads your real sleep instead of estimating it from the roster.'),
        L('Los datos se quedarán en tu dispositivo.', 'The data will stay on your device.')],
      plan: [L('TU PLAN', 'YOUR PLAN'), L('Qué hacer para llegar más despierto', 'What to do to arrive more alert'),
        L('Son medidas para la jornada elegida, con su hora. Las marcadas «Calculado» son sueño —una siesta antes de firmar o un descanso controlado en cabina— y el mismo modelo calcula cuánto sube tu vigilia en el aterrizaje si lo haces. Las marcadas «Recomendación» (cafeína, luz, moverse, comer) no están en el modelo: se dan con su fuente y sin inventar un número.', 'These are measures for the chosen duty, with their time. Those marked «Calculated» are sleep —a nap before reporting or controlled rest in the cockpit— and the same model works out how much your alertness at landing goes up if you do it. Those marked «Guidance» (caffeine, light, moving, eating) are not in the model: they come with their source and without an invented number.'),
        L('El plan no cambia tus límites ni tu deber de reportar: te ayuda a llegar mejor.', 'The plan does not change your limits or your duty to report: it helps you arrive in better shape.')],
      cabina: [L('DESCANSO CONTROLADO', 'CONTROLLED REST'), L('Dormir 20 min en el asiento, en crucero', 'Sleeping 20 min in the seat, in cruise'),
        L('Un piloto duerme mientras el otro vuela, con el procedimiento del operador: avisar al otro piloto y a la tripulación de cabina, hora de despertar fijada y contacto periódico. La app propone 20 minutos (sueño ligero, poca inercia) y que acabe al menos 30 minutos antes del descenso, que es lo que tarda en irse la torpeza del despertar.', 'One pilot sleeps while the other flies, following the operator’s procedure: tell the other pilot and the cabin crew, a set wake-up time and regular contact. The app suggests 20 minutes (light sleep, little inertia), ending at least 30 minutes before the descent, which is how long the grogginess of waking takes to go.'),
        L('Sólo si el manual de operaciones de tu compañía (OM-A) lo permite. Si no lo permite, ignora esta medida.', 'Only if your company’s operations manual (OM-A) allows it. If it does not, ignore this measure.')],
      reportar: [L('REPORTAR LA FATIGA', 'REPORTING FATIGUE'), L('Cómo reportarla', 'How to report it'),
        L('PilotOS no envía nada a la compañía. Si estás fatigado, usa el procedimiento de tu operador: el informe de fatiga del FRMS o avisar a operaciones antes de firmar.', 'PilotOS does not send anything to the company. If you are fatigued, use your operator’s procedure: the FRMS fatigue report or telling operations before reporting.'),
        L('Reportar la fatiga es una herramienta de seguridad, no una confesión. La decisión es del comandante (ORO.FTL.105).', 'Reporting fatigue is a safety tool, not a confession. The decision rests with the commander (ORO.FTL.105).')]
    };
    return A[k] || A.guia;
  }

  /* ── Piezas ────────────────────────────────────────────────────────────── */
  function Q(k) { return '<button type="button" class="fq" aria-label="' + esc(L('¿Qué es esto?', 'What is this?')) + '" onclick="fatAyuda(\'' + k + '\')"><span>?</span></button>'; }
  var ICO = {
    wocl: '<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>',
    reloj: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
    despierto: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
    deuda: '<path d="M4 18h16"/><path d="M6 18V9h3v9M11 18V6h3v12M16 18v-5h3v5"/>',
    sueno: '<path d="M3 12h4l2-3 3 6 2-3h7"/>',
    firma: '<path d="M4 18h16"/><path d="M7 14a5 5 0 0110 0"/><path d="M12 4v3M5 7l2 2M19 7l-2 2"/>',
    sectores: '<path d="M2 16h20"/><path d="M4 16l3-6 5 1 8-4"/>',
    avion: '<path d="M2 16h20"/><path d="M4 16l3-6 5 1 8-4"/><path d="M14 7l2 4"/>'
  };
  function ico(k, cls) { return '<svg class="fic ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICO[k] || ICO.reloj) + '</svg>'; }

  function tabs() {
    var T = [['hoy', L('Hoy', 'Today')], ['plan', 'Plan'], ['reloj', L('Reloj', 'Clock')], ['semana', L('Semana', 'Week')], ['check', 'Check']];
    return '<div class="ftabs" role="tablist">' + T.map(function (t) {
      return '<button type="button" role="tab" aria-selected="' + (ST.tab === t[0]) + '" class="' + (ST.tab === t[0] ? 'on' : '') + '" onclick="fatTab(\'' + t[0] + '\')">' + esc(t[1]) + '</button>';
    }).join('') + '</div>';
  }
  function cabecera(j, r) {
    var i = r.lista.indexOf(j);
    var prev = i > 0, next = i < r.lista.length - 1;
    var ahora = Date.now();
    var eye = j.fin < ahora ? L('JORNADA PASADA', 'PAST DUTY') : (j.inicio <= ahora ? L('EN JORNADA', 'ON DUTY') : L('FATIGA PREVISTA', 'FORECAST FATIGUE'));
    return '<div class="fhead">' +
      '<button type="button" class="fnav" aria-label="' + esc(L('Jornada anterior', 'Previous duty')) + '" onclick="fatMueve(-1)"' + (prev ? '' : ' disabled') + '><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button>' +
      '<div class="fhead-t"><div class="feye">' + eye + Q('guia') + '</div><div class="fday">' + esc(nombreDia(j.fecha)) + '</div><div class="froute">' + esc(ruta(j)) + ' · ' + L('firma', 'report') + ' ' + hhmm(j.inicio, r) + '</div></div>' +
      '<button type="button" class="fnav" aria-label="' + esc(L('Jornada siguiente', 'Next duty')) + '" onclick="fatMueve(1)"' + (next ? '' : ' disabled') + '><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>' +
      '</div>';
  }

  /* ── HOY: el instrumento ───────────────────────────────────────────────── */
  function vistaHoy(j, r) {
    var cx = 195, cy = 200;
    function pt(v, rr) { var a = Math.PI * (1 - (Math.max(2, Math.min(14, v)) - 2) / 12); return [cx + rr * Math.cos(a), cy - rr * Math.sin(a)]; }
    function arc(v1, v2, rr) { var a = pt(v1, rr), b = pt(v2, rr); return 'M' + a[0].toFixed(1) + ' ' + a[1].toFixed(1) + ' A' + rr + ' ' + rr + ' 0 0 1 ' + b[0].toFixed(1) + ' ' + b[1].toFixed(1); }
    var nd = pt(j.A, 146), n0 = pt(j.A, 110), ticks = '', labs = '';
    for (var v = 2; v <= 14; v += 2) {
      var o = pt(v, 150), i = pt(v, 138), t = pt(v, 120);
      ticks += '<line x1="' + i[0].toFixed(1) + '" y1="' + i[1].toFixed(1) + '" x2="' + o[0].toFixed(1) + '" y2="' + o[1].toFixed(1) + '"/>';
      labs += '<text x="' + t[0].toFixed(1) + '" y="' + (t[1] + 18).toFixed(1) + '">' + v + '</text>';
    }
    var lvl = j.nivel;
    var h = '<div class="fcard fgauge">' +
      '<div class="fg-l">' + Q('vigilia') + L('VIGILIA (A)', 'ALERTNESS (A)') + '</div><div class="fg-r">' + L('COLORES', 'COLOURS') + Q('colores') + '</div>' +
      '<svg viewBox="18 0 354 240" role="img" aria-label="' + esc(L('Indicador de vigilia: ', 'Alertness gauge: ') + num(j.A) + L(' sobre 14, nivel ', ' out of 14, level ') + nivTxt(lvl)) + '">' +
        '<path d="' + arc(2, 14, 150) + '" class="s-track" stroke-width="2"/>' +
        '<path d="' + arc(2, 7, 128) + '" class="s-red glow" stroke-width="34"/>' +
        '<path d="' + arc(2, 7, 128) + '" class="s-red" stroke-width="16"/>' +
        '<path d="' + arc(7, 8.5, 128) + '" class="s-amb" stroke-width="16"/>' +
        '<path d="' + arc(8.5, 14, 128) + '" class="s-teal" stroke-width="16"/>' +
        '<g class="s-tick" stroke-width="2">' + ticks + '</g><g class="t-mut" font-size="10" text-anchor="middle">' + labs + '</g>' +
        /* La aguja es un PUNTERO sobre el arco, no un radio desde el centro: desde el
           centro cruzaba la cifra y la pastilla del nivel. */
        '<line x1="' + n0[0].toFixed(1) + '" y1="' + n0[1].toFixed(1) + '" x2="' + nd[0].toFixed(1) + '" y2="' + nd[1].toFixed(1) + '" class="s-needle" stroke-width="4" stroke-linecap="round"/>' +
        '<circle cx="' + n0[0].toFixed(1) + '" cy="' + n0[1].toFixed(1) + '" r="5.5" class="s-hub" stroke-width="3"/>' +
      '</svg>' +
      '<div class="fg-v"><div class="fg-n">' + num(j.A) + '</div><div class="fpill p-' + lvl + '">' + nivTxt(lvl, true) + ' · KSS ≈ ' + Math.round(j.kss) + '</div>' + Q('kss') + '</div>' +
      '</div>';
    var p = j.peor || {};
    var donde = p.dep && p.arr ? L('Aterrizaje ', 'Landing ') + esc(p.dep) + ' → ' + esc(p.arr) : L('Último aterrizaje', 'Last landing');
    h += '<div class="fcard frw">' +
      '<div class="fbadge p-' + lvl + '">' + ico('avion') + '</div>' +
      '<div class="fgrow"><div class="flab">' + L('MOMENTO MÁS CRÍTICO', 'MOST CRITICAL MOMENT') + Q('critico') + '</div><div class="ftit">' + donde + '</div></div>' +
      '<div class="fright"><div class="fmono">' + hhmm(p.ms || j.fin, r) + '</div><div class="fsub">' + L('hora de tu base', 'base time') + '</div></div></div>';
    var bars = [
      ['sueno', L('ÚLTIMO SUEÑO', 'LAST SLEEP'), hm(j.sueno), Math.min(1, j.sueno / 480), j.sueno < 360 ? 'b-amb' : 'b-teal'],
      ['despierto', L('DESPIERTO', 'AWAKE'), hm(j.despierto), Math.min(1, j.despierto / (18 * 60)), j.despierto >= 960 ? 'b-red' : (j.despierto >= 780 ? 'b-amb' : 'b-teal')],
      ['deuda', L('DEUDA 3 DÍAS', '3-DAY DEBT'), hm(j.deuda), Math.min(1, j.deuda / 600), j.deuda >= 360 ? 'b-red' : (j.deuda >= 240 ? 'b-amb' : 'b-teal')]
    ];
    h += '<div class="fgrid3">' + bars.map(function (b) {
      return '<div class="fcard fstat"><div class="flab fsp">' + b[1] + Q(b[0]) + '</div><div class="fmono fbig">' + b[2] + '</div><div class="fbar"><i class="' + b[4] + '" style="width:' + Math.round(b[3] * 100) + '%"></i></div></div>';
    }).join('') + '</div>';
    var ms = motivos(j, r);
    h += '<div class="fcard flist">' + (ms.length ? ms.map(function (m) {
      return '<div class="fli">' + ico(m.k, 'c-' + (m.k === 'wocl' ? 'vio' : (m.k === 'deuda' ? 'red' : 'amb'))) + '<div class="fgrow">' + esc(m.t) + '</div>' + Q(m.k) + '</div>';
    }).join('') : '<div class="fli">' + ico('reloj', 'c-teal') + '<div class="fgrow">' + L('Sin factores destacables en esta jornada.', 'No notable factors in this duty.') + '</div></div>') +
      (j.ajusteDeuda ? '<div class="fli fnote">' + L('El nivel sube un escalón por la deuda de sueño acumulada.', 'The level goes up one step because of accumulated sleep debt.') + Q('deuda') + '</div>' : '') + '</div>';
    // Próximos 7 días
    var m0 = medianocheLocal(j.fecha, r), dias = '';
    var LD = en() ? ['S', 'M', 'T', 'W', 'T', 'F', 'S'] : ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
    for (var d = 0; d < 7; d++) {
      var f = fechaMs(m0 + d * DIA + 12 * 3600000, r), x = r.porFecha[f];
      var wd = new Date(f + 'T12:00:00Z').getUTCDay();
      dias += '<button type="button" class="fday7 ' + (x ? 'p-' + x.nivel : 'p-libre') + (f === j.fecha ? ' cur' : '') + '"' + (x ? ' onclick="fatVe(\'' + f + '\')"' : ' disabled') +
        ' aria-label="' + esc(nombreDia(f) + ': ' + (x ? nivTxt(x.nivel) : L('sin jornada', 'no duty'))) + '"><span>' + LD[wd] + '</span><i></i></button>';
    }
    h += '<div class="fsec"><div class="flab">' + L('PRÓXIMOS 7 DÍAS', 'NEXT 7 DAYS') + Q('semana7') + '</div><div class="f7">' + dias + '</div></div>';
    h += '<p class="fpie">' + L('Previsión a partir de tu roster con un modelo de fatiga de población media. No es un diagnóstico: si te sientes fatigado, repórtalo. La decisión es del comandante (ORO.FTL.105).', 'Forecast from your roster with an average-population fatigue model. Not a diagnosis: if you feel fatigued, report it. The decision rests with the commander (ORO.FTL.105).') + '</p>';
    return h;
  }

  /* ── PLAN: qué hacer para llegar más despierto (public/fatiga/plan.js) ─── */
  var PI = {
    siesta: '<path d="M3 18v-6h18v6M3 15h18M6 12V9h5v3"/><path d="M15 4h4l-4 4h4"/>',
    descanso: '<path d="M7 20v-7a2 2 0 012-2h6a2 2 0 012 2v7M5 20h14M9 11V6a3 3 0 016 0v5"/><path d="M18 3.5a2.5 2.5 0 01-3 3"/>',
    cafeina: '<path d="M4 9h12v5a5 5 0 01-5 5H9a5 5 0 01-5-5z"/><path d="M16 11h1.5a2.5 2.5 0 010 5H16M8 3c0 1.5 1.5 1.5 1.5 3M12 3c0 1.5 1.5 1.5 1.5 3"/>',
    moverse: '<circle cx="13" cy="4.5" r="1.8"/><path d="M10 21l2-6 3 3v3M12 15l-1-5 4 1 2 3M11 10l-3 2v3"/>',
    luz: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    comida: '<path d="M12 3c3 4 5 7 5 10a5 5 0 01-10 0c0-3 2-6 5-10z"/><path d="M10 14a2 2 0 002 2"/>',
    recupera: '<path d="M3 11l9-7 9 7v9H3z"/><path d="M15.5 13a3.5 3.5 0 11-3-3.4 2.6 2.6 0 003 3.4z"/>',
    decirlo: '<path d="M4 5h16v10H9l-5 4z"/><path d="M12 8v3M12 13h.01"/>'
  };
  var PC = { siesta: 'acc', descanso: 'acc', cafeina: 'amb', moverse: 'blue', luz: 'sun', comida: 'teal', recupera: 'vio', decirlo: 'red' };
  function pico(k) { return '<svg class="fic" viewBox="0 0 24 24" aria-hidden="true">' + (PI[k] || PI.luz) + '</svg>'; }
  function planDe(j, r) {
    try { return root.FatigaPlan ? root.FatigaPlan.calcula(j, r, function (ms) { return off(ms, r); }) : []; } catch (e) { return []; }
  }
  function textoMedida(m, j, r) {
    var t = function (ms) { return hhmm(ms, r); };
    switch (m.k) {
      case 'siesta': return {
        tit: L('Siesta de ' + m.dur + ' min antes de firmar', m.dur + '-min nap before reporting'),
        cuando: t(m.ini) + '–' + t(m.fin),
        txt: m.dur >= 60 ? L('Un ciclo de sueño entero: despiertas sin la torpeza de cortar el sueño profundo. Pon la alarma y deja al menos media hora antes de salir.', 'A full sleep cycle: you wake without the grogginess of cutting deep sleep. Set an alarm and leave at least half an hour before setting off.')
          : L('Corta, para no entrar en sueño profundo: te levantas despejado en minutos. Aunque no te duermas del todo, tumbarte con los ojos cerrados ayuda.', 'Short, so you do not reach deep sleep: you get up clear-headed within minutes. Even if you do not fully fall asleep, lying down with your eyes closed helps.'),
        alt: m.alt ? L('Si no puedes tanto: ' + m.alt.dur + ' min a las ' + t(m.alt.ini) + ' → ' + num(m.alt.A) + '.', 'If you cannot manage that long: ' + m.alt.dur + ' min at ' + t(m.alt.ini) + ' → ' + num(m.alt.A) + '.') : ''
      };
      case 'descanso': return {
        tit: L('Descanso controlado de 20 min', '20-min controlled rest'),
        cuando: t(m.ini) + '–' + t(m.fin) + (m.dep && m.arr ? ' · ' + esc(m.dep) + '→' + esc(m.arr) : ''),
        txt: L('En crucero, con el otro piloto a los mandos. Despiértate como tarde a las ' + t(m.fin) + ': hay que acabar antes de las ' + t(m.limite) + ' para que se pase la torpeza antes del descenso. Sólo si el OM-A de tu compañía lo permite.', 'In cruise, with the other pilot flying. Wake up by ' + t(m.fin) + ' at the latest: it has to end before ' + t(m.limite) + ' so the grogginess wears off before the descent. Only if your company’s OM-A allows it.'),
        q: 'cabina'
      };
      case 'cafeina':
        if (!m.bebida) return {
          tit: L('Sin cafeína en esta jornada', 'No caffeine on this duty'),
          cuando: m.corteTe ? L('nada desde las ', 'nothing from ') + t(m.corteTe) : '',
          txt: L('Tu sueño al llegar está demasiado cerca: la cafeína tarda unas 5 h en reducirse a la mitad y te quitaría el descanso que más falta te hace. Usa la luz y moverte.', 'Your sleep after the duty is too close: caffeine takes about 5 h to halve and would take away the rest you need most. Use light and moving instead.')
        };
        var be = m.bebida === 'te' ? L('Un té', 'A tea') : L('Un café', 'A coffee');
        return {
          tit: m.ultimo ? L(be + ' como último momento', be + ' at the latest') : L(be + ' antes del aterrizaje más crítico', be + ' before the most critical landing'),
          cuando: t(m.ini),
          txt: (m.ultimo
            ? L('Lo ideal sería a las ' + t(m.ideal) + ', pero dormirías mal al llegar: más tarde de esta hora, nada de cafeína.', 'Ideally at ' + t(m.ideal) + ', but you would sleep badly afterwards: after this time, no caffeine.')
            : L('Tarda 20–30 min en hacer efecto y te cubre el descenso.', 'It takes 20–30 min to work and covers the descent.')) +
            (m.corte ? ' ' + L('Café, como tarde a las ' + t(m.corte) + '; té, a las ' + t(m.corteTe) + '.', 'Coffee by ' + t(m.corte) + ' at the latest; tea by ' + t(m.corteTe) + '.') : '') +
            (m.firma ? ' ' + L('Con una madrugada, uno también al firmar.', 'With an early start, one at report time too.') : '')
        };
      case 'moverse': return {
        tit: L('Levántate y muévete', 'Get up and move'),
        cuando: m.escalas.length ? m.escalas.map(function (e) { return t(e.ini); }).join(' · ') : '',
        txt: L('En cada escala, unos minutos de pie, caminando o estirando; en crucero, una vez por hora. El efecto dura poco (15–30 min), así que guárdalo para antes del último sector.', 'At every turnaround, a few minutes standing, walking or stretching; in cruise, once an hour. The effect is short (15–30 min), so save it for before the last sector.')
      };
      case 'luz': return {
        tit: L('Luz fuerte en cabina', 'Bright light in the cockpit'),
        cuando: m.noche ? '02:00–06:00' : '',
        txt: m.noche ? L('De noche, sube la luz de cabina: la luz brillante despierta. Al volver a casa, gafas de sol y habitación a oscuras para dormir.', 'At night, turn the cockpit lights up: bright light wakes you up. On the way home, sunglasses and a dark room to sleep.')
          : L('Luz natural o de cabina subida cuando notes el bajón; evita las pantallas brillantes en la hora antes de dormir.', 'Daylight or cockpit lights up when you feel the dip; avoid bright screens in the hour before sleeping.')
      };
      case 'comida': return {
        tit: L('Come ligero y bebe agua', 'Eat light and drink water'),
        cuando: '',
        txt: m.noche ? L('Comida ligera antes de firmar; de madrugada, algo pequeño con proteína y nada pesado ni muy dulce. Agua a sorbos durante todo el vuelo.', 'A light meal before reporting; in the early hours, something small with protein and nothing heavy or very sweet. Sip water throughout the flight.')
          : L('Una comida pesada da sueño a la hora siguiente. Agua a sorbos durante todo el vuelo: la cabina deshidrata.', 'A heavy meal makes you sleepy the following hour. Sip water throughout the flight: the cabin dehydrates.')
      };
      case 'recupera': return {
        tit: L('Al llegar, duerme', 'When you get back, sleep'),
        cuando: t(m.ini) + '–' + t(m.fin),
        txt: m.noche ? L('Tras una noche, duerme al llegar pero no más de unas 5 h, y vuelve a tu horario esa misma noche: es lo que menos desordena el reloj.', 'After a night, sleep when you get back but not more than about 5 h, and return to your normal schedule that same night: it disturbs your body clock least.')
          : L('Es el sueño que el modelo cuenta para tu siguiente jornada: si lo recortas, la siguiente sale peor de lo que ves aquí.', 'This is the sleep the model counts for your next duty: if you cut it short, the next one will be worse than shown here.')
      };
      case 'decirlo': return {
        tit: L('Dilo en el briefing', 'Say it at the briefing'),
        cuando: t(j.inicio),
        txt: L('Cuéntaselo al otro piloto y repartid el trabajo del último sector. Si no te encuentras apto, se reporta: es una herramienta de seguridad, no una confesión.', 'Tell the other pilot and share the workload of the last sector. If you do not feel fit, report it: it is a safety tool, not a confession.'),
        q: 'reportar'
      };
    }
    return { tit: '', cuando: '', txt: '' };
  }
  function vistaPlan(j, r) {
    var ms = planDe(j, r);
    var calc = ms.filter(function (m) { return m.tipo === 'calc'; });
    var conPlan = j.A;
    if (calc.length && r.prueba) {
      var f = r.prueba(calc.map(function (m) { return { ini: m.ini, fin: m.fin }; }));
      conPlan = Math.min.apply(null, (j.aterrizajes || []).map(function (x) { var e = f(x.ms); return e ? e.A : j.A; }));
    }
    var nivP = conPlan < 7 ? 'alto' : conPlan < 8.5 ? 'moderado' : 'bajo';
    function X(a) { return 6 + (Math.max(2, Math.min(14, a)) - 2) / 12 * 288; }
    /* La HERO: dónde estás y dónde llegas con el plan, sobre la misma escala. */
    var h = '<div class="fcard fplan-hero p-' + nivP + '">' +
      '<div class="fsp"><div class="flab">' + L('TU PLAN PARA ESTA JORNADA', 'YOUR PLAN FOR THIS DUTY') + Q('plan') + '</div></div>' +
      (calc.length ? '<div class="fph-n"><div><div class="fsub">' + L('Sin plan', 'No plan') + '</div><div class="fmono fph-a">' + num(j.A) + '</div><div class="fpill p-' + j.nivel + '">' + nivTxt(j.nivel, true) + '</div></div>' +
      '<svg class="fph-ar" viewBox="0 0 40 24" aria-hidden="true"><path d="M2 12h32M26 4l8 8-8 8"/></svg>' +
      '<div><div class="fsub">' + (calc.length ? L('Con siesta y descanso', 'With nap and rest') : L('Con el plan', 'With the plan')) + '</div><div class="fmono fph-a fph-b">' + num(conPlan) + '</div><div class="fpill p-' + nivP + '">' + nivTxt(nivP, true) + '</div></div></div>'
        : '<div class="fph-n"><div><div class="fsub">' + L('Vigilia en el aterrizaje más crítico', 'Alertness at the most critical landing') + '</div><div class="fmono fph-a fph-b">' + num(j.A) + '</div><div class="fpill p-' + j.nivel + '">' + nivTxt(j.nivel, true) + '</div></div></div>') +
      '<svg class="fph-bar" viewBox="0 0 300 30" role="img" aria-label="' + esc(L('Vigilia en el aterrizaje: ', 'Alertness at landing: ') + num(j.A) + ' → ' + num(conPlan)) + '">' +
        '<rect x="6" y="11" width="' + (X(7) - 6).toFixed(1) + '" height="8" rx="4" class="f-red"/><rect x="' + X(7).toFixed(1) + '" y="11" width="' + (X(8.5) - X(7)).toFixed(1) + '" height="8" class="f-amb"/><rect x="' + X(8.5).toFixed(1) + '" y="11" width="' + (294 - X(8.5)).toFixed(1) + '" height="8" rx="4" class="f-teal"/>' +
        (conPlan > j.A + 0.05 ? '<line x1="' + X(j.A).toFixed(1) + '" y1="15" x2="' + X(conPlan).toFixed(1) + '" y2="15" class="s-needle fph-go" stroke-width="3" stroke-dasharray="3 4"/>' : '') +
        '<circle cx="' + X(j.A).toFixed(1) + '" cy="15" r="7" class="s-hub" stroke-width="3"/>' +
        '<circle cx="' + X(conPlan).toFixed(1) + '" cy="15" r="8" class="f-needle fph-dot"/>' +
      '</svg>' +
      '<div class="fsub2">' + (calc.length ? L('Vigilia en el aterrizaje más crítico, calculada con el modelo. Lo demás del plan no se suma a la cifra: ayuda, pero el modelo no lo mide.', 'Alertness at the most critical landing, calculated with the model. The rest of the plan is not added to the figure: it helps, but the model does not measure it.')
        : (j.nivel === 'bajo' ? L('Jornada sin riesgo previsto: mantén tu rutina de sueño.', 'No forecast risk: keep your sleep routine.') : L('No hay hueco para una siesta ni un crucero largo: las medidas de abajo ayudan aunque el modelo no las mida.', 'No room for a nap or a long cruise: the measures below help even though the model does not measure them.'))) + '</div></div>';
    /* La LÍNEA del día: vigilia sin y con plan, la jornada y las medidas. */
    var sig = ms.filter(function (m) { return m.k === 'recupera'; })[0];
    var t0 = Math.min(j.inicio - 3 * 3600000, (calc[0] && calc[0].ini - 1800000) || Infinity);
    var t1 = Math.max(j.fin + 3600000, sig ? Math.min(sig.ini + 1800000, j.fin + 6 * 3600000) : 0);
    var W = 330, XL = 18;
    function TX(ms2) { return XL + (ms2 - t0) / (t1 - t0) * (W - XL - 8); }
    function TY(a) { return 14 + (14 - Math.max(2, Math.min(14, a))) / 12 * 86; }
    function curva(fn) {
      var d = '', prev = false;
      for (var tt = t0; tt <= t1; tt += 15 * MIN) { var e = fn(tt); if (!e || e.dormido) { prev = false; continue; } d += (prev ? 'L' : 'M') + TX(tt).toFixed(1) + ' ' + TY(e.A).toFixed(1); prev = true; }
      return d;
    }
    var sinP = r.en ? curva(r.en) : '', conP = '';
    if (calc.length && r.prueba) conP = curva(r.prueba(calc.map(function (m) { return { ini: m.ini, fin: m.fin }; })));
    var marks = '', ticks = '';
    for (var hh = Math.ceil(t0 / 3600000) * 3600000; hh <= t1; hh += 3600000) {
      var hl = Math.round(horaDe(hh, r)) % 24;
      if (hl % 3 === 0) ticks += '<line x1="' + TX(hh).toFixed(1) + '" y1="104" x2="' + TX(hh).toFixed(1) + '" y2="108"/><text x="' + TX(hh).toFixed(1) + '" y="120">' + String(hl).padStart(2, '0') + '</text>';
    }
    var duty = '<rect x="' + TX(j.inicio).toFixed(1) + '" y="104" width="' + Math.max(2, TX(j.fin) - TX(j.inicio)).toFixed(1) + '" height="4" rx="2" class="f-amb"/>';
    var pins = ms.filter(function (m) { return m.ini && m.k !== 'recupera'; }).map(function (m) {
      var x = TX(m.ini), w2 = m.fin ? Math.max(4, TX(m.fin) - x) : 0;
      return (w2 ? '<rect x="' + x.toFixed(1) + '" y="12" width="' + w2.toFixed(1) + '" height="90" rx="4" class="fpl-band c-' + PC[m.k] + '"/>' : '') +
        '<g class="fpl-pin c-' + PC[m.k] + '" transform="translate(' + (x + w2 / 2 - 9).toFixed(1) + ' 0)"><circle cx="9" cy="9" r="9"/><g transform="translate(3.6 3.6) scale(.45)">' + PI[m.k] + '</g></g>';
    }).join('');
    var pk = j.peor ? '<circle cx="' + TX(j.peor.ms).toFixed(1) + '" cy="' + TY(j.A).toFixed(1) + '" r="5" class="f-red"/>' : '';
    h += '<div class="fcard fplan-tl"><div class="fsp"><div class="flab">' + L('TU DÍA', 'YOUR DAY') + '</div><div class="fleg-mini"><span><i class="k-dash"></i>' + L('sin plan', 'no plan') + '</span>' + (conP ? '<span><i class="k-acc"></i>' + L('con plan', 'with plan') + '</span>' : '') + '</div></div>' +
      '<svg viewBox="0 0 ' + W + ' 126" role="img" aria-label="' + esc(L('Línea del día con las medidas del plan', 'Day line with the plan measures')) + '">' +
        '<rect x="' + XL + '" y="' + TY(7).toFixed(1) + '" width="' + (W - XL - 8) + '" height="' + (TY(2) - TY(7)).toFixed(1) + '" class="f-red" opacity=".09"/>' +
        '<rect x="' + XL + '" y="' + TY(8.5).toFixed(1) + '" width="' + (W - XL - 8) + '" height="' + (TY(7) - TY(8.5)).toFixed(1) + '" class="f-amb" opacity=".09"/>' +
        pins + (sinP ? '<path d="' + sinP + '" class="s-mut" fill="none" stroke-width="1.8" stroke-dasharray="4 4"/>' : '') +
        (conP ? '<path d="' + conP + '" class="s-acc" fill="none" stroke-width="2.6" stroke-linejoin="round"/>' : '') + pk + duty +
        '<g class="s-tick t-mut" font-size="9.5" text-anchor="middle" stroke-width="1">' + ticks + '</g>' +
      '</svg></div>';
    /* Las MEDIDAS, una tarjeta cada una, con su hora y su efecto. */
    h += ms.map(function (m) {
      var tx = textoMedida(m, j, r);
      var ef = m.tipo === 'calc'
        ? '<span class="fef fef-c">' + L('Calculado', 'Calculated') + ' · ' + num(m.antes) + ' → ' + num(m.despues) + '</span>'
        : '<span class="fef">' + L('Recomendación', 'Guidance') + '</span>';
      return '<div class="fcard fmed c-' + PC[m.k] + '"><div class="fmed-ic">' + pico(m.k) + '</div><div class="fgrow">' +
        '<div class="fmed-h"><div class="ftit2">' + esc(tx.tit) + '</div>' + (tx.q ? Q(tx.q) : '') + '</div>' +
        (tx.cuando ? '<div class="fmono fmed-t">' + esc(tx.cuando) + '</div>' : '') +
        '<div class="fsub2">' + esc(tx.txt) + '</div>' + (tx.alt ? '<div class="fsub2 fmed-alt">' + esc(tx.alt) + '</div>' : '') +
        '<div class="fmed-f">' + ef + '</div></div></div>';
    }).join('');
    h += '<p class="fpie">' + L('Las medidas no cambian tus límites ni tu deber de reportar. La cafeína, la luz y moverse ayudan durante poco tiempo y no sustituyen al sueño. Fuentes en «Cómo funciona».', 'The measures do not change your limits or your duty to report. Caffeine, light and moving help for a short time and do not replace sleep. Sources in «How it works».') + '</p>';
    return h;
  }

  /* ── RELOJ 24 h ────────────────────────────────────────────────────────── */
  function vistaReloj(j, r) {
    var C = 195, CY = 215;
    function ang(h) { return 2 * Math.PI * h / 24 - Math.PI / 2; }
    function P(h, rr) { var a = ang(h); return [C + rr * Math.cos(a), CY + rr * Math.sin(a)]; }
    function arc(h1, h2, rr) {
      var d = ((h2 - h1) % 24 + 24) % 24; if (d < 0.05) return '';
      var a = P(h1, rr), b = P(h1 + d, rr);
      return 'M' + a[0].toFixed(1) + ' ' + a[1].toFixed(1) + ' A' + rr + ' ' + rr + ' 0 ' + (d > 12 ? 1 : 0) + ' 1 ' + b[0].toFixed(1) + ' ' + b[1].toFixed(1);
    }
    var w0 = j.inicio - 8 * 3600000, w1 = w0 + DIA;
    var duty = arc(horaDe(j.inicio, r), horaDe(j.fin, r), 140);
    var sl = (r.suenos || []).filter(function (e) { return e.fin > w0 && e.ini < w1; }).map(function (e) {
      return '<path d="' + arc(horaDe(Math.max(e.ini, w0), r), horaDe(Math.min(e.fin, w1), r), 128) + '" class="s-blue" stroke-width="12" stroke-linecap="round"' + (e.ini >= j.fin ? ' stroke-dasharray="4 5" opacity=".5"' : '') + '/>';
    }).join('');
    var curva = '';
    if (r.serie) {
      var pts = r.serie(w0, w1, 20);
      /* Sólo DESPIERTO: durmiendo no hay vigilia que leer, y el salto al dormirse
         y al despertar dibujaba picos que no dicen nada. */
      var prev = false;
      curva = pts.map(function (x) {
        if (x.dormido) { prev = false; return ''; }
        var rr = 58 + (Math.max(2, Math.min(14, x.A)) - 2) / 12 * 54;
        var q = P(horaDe(x.ms, r), rr), c = (prev ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1);
        prev = true; return c;
      }).join(' ').trim();
    }
    var p = j.peor || { ms: j.fin }, pp = P(horaDe(p.ms, r), 140);
    var hp = horaDe(p.ms, r), enWocl = hp >= 2 && hp < 6;
    var ws = P(2, 140), we = P(6, 140);
    var labs = [[0, '00'], [6, '06'], [12, '12'], [18, '18']].map(function (x) { var q = P(x[0], 160); return '<text x="' + q[0].toFixed(1) + '" y="' + (q[1] + 4).toFixed(1) + '">' + x[1] + '</text>'; }).join('');
    var cons = consejo(j);
    var leyenda = [['amb', L('Jornada ', 'Duty ') + hhmm(j.inicio, r) + '–' + hhmm(j.fin, r), 'dial'], ['blue', L('Sueño estimado', 'Estimated sleep'), 'sueno'], ['vio', L('Ventana baja 02–06', 'Low window 02–06'), 'wocl'], ['acc', L('Tu vigilia', 'Your alertness'), 'vigilia']];
    return '<div class="fcard fdialc"><svg viewBox="18 10 354 420" role="img" aria-label="' + esc(L('Reloj de 24 horas de la jornada', '24-hour clock of the duty')) + '">' +
        '<circle cx="' + C + '" cy="' + CY + '" r="150" class="s-ring0" stroke-width="1"/>' +
        '<circle cx="' + C + '" cy="' + CY + '" r="128" class="s-ring" stroke-width="12"/><circle cx="' + C + '" cy="' + CY + '" r="140" class="s-ring" stroke-width="10"/>' +
        '<path d="M' + ws[0].toFixed(1) + ' ' + ws[1].toFixed(1) + ' A140 140 0 0 1 ' + we[0].toFixed(1) + ' ' + we[1].toFixed(1) + '" class="s-vio" stroke-width="26" opacity=".28"/>' +
        (duty ? '<path d="' + duty + '" class="s-amb" stroke-width="10" stroke-linecap="round"/>' : '') + sl +
        (curva ? '<path d="' + curva + '" class="s-acc f-accA" stroke-width="2"/>' : '') +
        '<g class="t-mut" font-size="11" text-anchor="middle">' + labs + '</g>' +
        '<line x1="' + C + '" y1="' + CY + '" x2="' + pp[0].toFixed(1) + '" y2="' + pp[1].toFixed(1) + '" class="s-red" stroke-width="2" stroke-dasharray="3 4"/>' +
        '<circle cx="' + pp[0].toFixed(1) + '" cy="' + pp[1].toFixed(1) + '" r="9" class="s-hubR" stroke-width="3"/>' +
      '</svg>' +
      '<div class="fdial-c"><div class="flab">' + (p.dep ? L('ATERRIZAS', 'YOU LAND') : L('ÚLTIMO ATERRIZAJE', 'LAST LANDING')) + Q('critico') + '</div><div class="fmono fdial-n">' + hhmm(p.ms, r) + '</div><div class="fdial-s t-' + j.nivel + '">' + (enWocl ? L('en el valle de tu cuerpo', 'in your body’s low point') : nivTxt(j.nivel) + ' · KSS ≈ ' + Math.round(j.kss)) + '</div><div class="fsub">' + L('hora de tu base', 'base time') + '</div></div>' +
      '<button type="button" class="fq fq-abs" aria-label="' + esc(L('¿Qué es esto?', 'What is this?')) + '" onclick="fatAyuda(\'dial\')"><span>?</span></button>' +
      '</div>' +
      '<div class="fcard fleg">' + leyenda.map(function (x) { return '<div class="fleg-i"><i class="k-' + x[0] + '"></i><span class="fgrow">' + esc(x[1]) + '</span>' + Q(x[2]) + '</div>'; }).join('') + '</div>' +
      '<div class="fcard ftip">' + ico('wocl', 'c-blue') + '<div><b>' + esc(cons[0]) + '</b> ' + esc(cons[1]) + '</div></div>';
  }

  /* ── SEMANA ────────────────────────────────────────────────────────────── */
  function vistaSemana(j, r) {
    var d0 = new Date(j.fecha + 'T12:00:00Z'), wd = (d0.getUTCDay() + 6) % 7;
    var lunes = new Date(d0.getTime() - wd * DIA).toISOString().slice(0, 10);
    var w0 = medianocheLocal(lunes, r), w1 = w0 + 7 * DIA, H = 7 * 24;
    function X(ms) { return 30 + 330 * (ms - w0) / (w1 - w0); }
    function Y(A) { return 20 + (14 - Math.max(2, Math.min(14, A))) / 12 * 150; }
    var pts = r.serie ? r.serie(w0, w1, 60) : [];
    var prevW = false;
    var line = pts.map(function (x) {
      if (x.dormido) { prevW = false; return ''; }
      var c = (prevW ? 'L' : 'M') + X(x.ms).toFixed(1) + ' ' + Y(x.A).toFixed(1); prevW = true; return c;
    }).join(' ').trim();
    var semana = r.lista.filter(function (x) { return x.inicio < w1 && x.fin > w0; });
    var peor = semana.reduce(function (m, x) { return !m || x.A < m.A ? x : m; }, null);
    var duty = semana.map(function (x) { var a = Math.max(X(x.inicio), 30), b = Math.min(X(x.fin), 360); return '<rect x="' + a.toFixed(1) + '" y="200" width="' + Math.max(2, b - a).toFixed(1) + '" height="8" rx="2" class="f-amb"/>'; }).join('');
    var sleep = (r.suenos || []).filter(function (e) { return e.fin > w0 && e.ini < w1; }).map(function (e) { var a = Math.max(X(e.ini), 30), b = Math.min(X(e.fin), 360); return '<rect x="' + a.toFixed(1) + '" y="214" width="' + Math.max(2, b - a).toFixed(1) + '" height="6" rx="2" class="f-blue" opacity=".8"/>'; }).join('');
    var grid = '', letras = '';
    var LD = en() ? ['M', 'T', 'W', 'T', 'F', 'S', 'S'] : ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
    for (var d = 0; d < 7; d++) {
      if (d) grid += '<line x1="' + (30 + 330 * d / 7).toFixed(1) + '" y1="14" x2="' + (30 + 330 * d / 7).toFixed(1) + '" y2="226"/>';
      var fd = fechaMs(w0 + d * DIA + 12 * 3600000, r);
      letras += '<text x="' + (30 + 330 * (d + .5) / 7).toFixed(1) + '" y="246"' + (fd === j.fecha ? ' class="t-tx" font-weight="700"' : '') + '>' + LD[d] + '</text>';
    }
    var mk = '';
    if (peor && peor.peor) {
      var px = X(peor.peor.ms), py = Y(peor.A), lx = Math.max(64, Math.min(326, px));
      mk = '<circle cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="12" class="f-' + (peor.nivel === 'alto' ? 'red' : peor.nivel === 'moderado' ? 'amb' : 'teal') + '" opacity=".22"/>' +
        '<circle cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="6" class="f-' + (peor.nivel === 'alto' ? 'red' : peor.nivel === 'moderado' ? 'amb' : 'teal') + '"/>' +
        '<rect x="' + (lx - 38).toFixed(1) + '" y="' + Math.min(180, py + 10).toFixed(1) + '" width="76" height="18" rx="6" class="f-pbg-' + peor.nivel + '"/>' +
        '<text x="' + lx.toFixed(1) + '" y="' + (Math.min(180, py + 10) + 13).toFixed(1) + '" text-anchor="middle" font-size="10.5" font-weight="700" class="t-p-' + peor.nivel + '">A ' + num(peor.A) + ' · ' + hhmm(peor.peor.ms, r) + '</text>';
    }
    var lleno = Math.max(0, Math.min(1, 1 - j.deuda / (24 * 60)));
    var vig = semana.filter(function (x) { return x.nivel !== 'bajo'; }).sort(function (a, b) { return a.A - b.A; });
    var rango = nombreDia(lunes, true) + ' – ' + nombreDia(fechaMs(w0 + 6 * DIA + 12 * 3600000, r), true);
    return '<div class="fsubh"><span>' + esc(rango) + '</span><span class="fsub">' + semana.length + L(' jornadas', ' duties') + '</span></div>' +
      '<div class="fcard fweek"><svg viewBox="12 0 366 256" role="img" aria-label="' + esc(L('Curva de vigilia de la semana', 'Week alertness curve')) + '">' +
        '<rect x="30" y="' + Y(7).toFixed(1) + '" width="330" height="' + (Y(2) - Y(7)).toFixed(1) + '" class="f-red" opacity=".10"/>' +
        '<rect x="30" y="' + Y(8.5).toFixed(1) + '" width="330" height="' + (Y(7) - Y(8.5)).toFixed(1) + '" class="f-amb" opacity=".10"/>' +
        '<g class="s-grid" stroke-width="1">' + grid + '</g>' +
        (line ? '<path d="' + line + '" class="s-acc" fill="none" stroke-width="2.4" stroke-linejoin="round"/>' : '') + mk + duty + sleep +
        '<g class="t-mut" font-size="11" text-anchor="middle">' + letras + '</g>' +
        '<g class="t-mut" font-size="9.5" text-anchor="start"><text x="33" y="' + (Y(14) + 9).toFixed(1) + '">' + L('alerta', 'alert') + '</text><text x="33" y="' + (Y(2) - 4).toFixed(1) + '">' + L('fatiga', 'tired') + '</text></g>' +
      '</svg>' +
      '<div class="fleg-row"><span><i class="k-amb"></i>' + L('Jornada', 'Duty') + '</span><span><i class="k-blue"></i>' + L('Sueño', 'Sleep') + '</span><span><i class="k-red"></i>' + L('Fatiga alta', 'High fatigue') + '</span><span class="fgrow"></span>' + Q('curvaSem') + '</div></div>' +
      '<div class="fcard"><div class="fsp"><div class="flab">' + L('DEPÓSITO DE SUEÑO', 'SLEEP TANK') + Q('deposito') + '</div><div class="fmono t-amb">' + (j.deuda ? '−' + hm(j.deuda) : L('lleno', 'full')) + '</div></div>' +
        '<div class="ftank"><i style="width:' + Math.round(lleno * 100) + '%"></i><b style="left:25%"></b><b style="left:50%"></b><b style="left:75%"></b></div>' +
        '<div class="ftank-l"><span>E</span><span>¼</span><span>½</span><span>¾</span><span>F</span></div>' +
        '<div class="fsub2">' + L('Antes de la jornada del ', 'Before the duty on ') + esc(nombreDia(j.fecha)) + '.</div></div>' +
      '<div class="fcard flist"><div class="flab fpad">' + L('JORNADAS A VIGILAR', 'DUTIES TO WATCH') + Q('vigilar') + '</div>' +
        (vig.length ? vig.map(function (x) {
          var m = motivos(x, r)[0];
          return '<button type="button" class="fli fbtn" onclick="fatVe(\'' + x.fecha + '\',\'hoy\')"><i class="fdot f-' + (x.nivel === 'alto' ? 'red' : 'amb') + '"></i><div class="fgrow"><div class="ftit2">' + esc(nombreDia(x.fecha, true) + ' · ' + ruta(x)) + '</div><div class="fsub">' + esc(m ? m.t : '') + '</div></div><span class="fmono t-p-' + x.nivel + '">' + nivTxt(x.nivel, true) + '</span></button>';
        }).join('') : '<div class="fli">' + L('Ninguna jornada con fatiga moderada o alta esta semana.', 'No duty with moderate or high fatigue this week.') + '</div>') +
      '</div>';
  }

  /* ── CHECK antes de firmar (KSS + test de reflejos) ────────────────────── */
  var CK = 'pilotos_fat_check';
  function ckLee() { try { return JSON.parse(localStorage.getItem(CK) || '{}') || {}; } catch (e) { return {}; } }
  function ckGuarda(o) { try { localStorage.setItem(CK, JSON.stringify(o)); } catch (e) {} }
  function mediana(a) { if (!a.length) return null; var b = a.slice().sort(function (x, y) { return x - y; }), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; }
  function base() {
    var o = ckLee(), meds = [];
    Object.keys(o).forEach(function (k) { if (o[k] && o[k].pvt && o[k].pvt.med) meds.push(o[k].pvt.med); });
    return meds.length >= 3 ? Math.round(mediana(meds)) : null;
  }
  var KL = [['Extremadamente despierto', 'Extremely alert'], ['Muy despierto', 'Very alert'], ['Despierto', 'Alert'], ['Bastante despierto', 'Rather alert'], ['Ni despierto ni con sueño', 'Neither alert nor sleepy'], ['Algún signo de sueño', 'Some signs of sleepiness'], ['Con sueño, sin esfuerzo para seguir', 'Sleepy, no effort to stay awake'], ['Con sueño, cuesta seguir despierto', 'Sleepy, some effort to stay awake'], ['Mucho sueño, luchando contra él', 'Very sleepy, fighting sleep']];
  function vistaCheck(j, r) {
    var o = ckLee()[j.fecha] || {};
    var k = o.kss, pv = o.pvt, b = base();
    var kb = '';
    for (var n = 1; n <= 9; n++) {
      var z = n <= 4 ? 'bajo' : (n <= 6 ? 'moderado' : 'alto');
      kb += '<button type="button" class="fk k-' + z + (k === n ? ' on' : '') + '" aria-pressed="' + (k === n) + '" aria-label="' + esc(n + ', ' + L(KL[n - 1][0], KL[n - 1][1])) + '" onclick="fatKss(' + n + ')">' + n + '</button>';
    }
    var h = '<div class="fcard"><div class="fsp"><div class="ftit2">' + L('¿Cómo de despierto estás?', 'How alert are you?') + '</div><div class="flab">' + L('escala KSS', 'KSS scale') + Q('kssMia') + '</div></div>' +
      '<div class="fkss">' + kb + '</div>' +
      '<div class="fsp fsub"><span>' + L('Muy despierto', 'Very alert') + '</span><b class="t-' + (k ? (k <= 4 ? 'bajo' : k <= 6 ? 'moderado' : 'alto') : 'mut') + '">' + (k ? k + ' · ' + esc(L(KL[k - 1][0], KL[k - 1][1])) : L('Toca un número', 'Tap a number')) + '</b><span>' + L('Luchando', 'Fighting it') + '</span></div></div>';
    // PVT
    var barras = '';
    if (pv && pv.rt && pv.rt.length) {
      var w = 326 / pv.rt.length;
      barras = '<svg viewBox="0 0 326 70" class="fpvt-g" role="img" aria-label="' + esc(L('Tiempos de reacción', 'Reaction times')) + '">' +
        (b ? '<line x1="0" x2="326" y1="' + (62 - Math.min(60, b / 10)).toFixed(1) + '" y2="' + (62 - Math.min(60, b / 10)).toFixed(1) + '" class="s-teal" stroke-width="1" stroke-dasharray="3 4"/>' : '') +
        pv.rt.map(function (t, i) { var hgt = Math.min(60, t / 10); return '<rect x="' + (i * w + 1).toFixed(1) + '" y="' + (62 - hgt).toFixed(1) + '" width="' + Math.max(2, w - 2).toFixed(1) + '" height="' + hgt.toFixed(1) + '" rx="2" class="' + (t >= PVT_LAPSO ? 'f-red' : 'f-acc') + '"/>'; }).join('') +
        '<line x1="0" x2="326" y1="62" y2="62" class="s-grid"/></svg>';
    }
    h += '<div class="fcard" id="fat-pvt"><div class="fsp"><div><div class="ftit2">' + L('Test de reflejos · 3 min', 'Reaction test · 3 min') + Q('pvt') + '</div><div class="fsub">' + L('Toca en cuanto se encienda la luz', 'Tap as soon as the light comes on') + '</div></div><i class="fluz"></i></div>' +
      (barras || '<div class="fsub2">' + L('Aún no has hecho el test de esta jornada.', 'You have not done the test for this duty yet.') + '</div>') +
      (pv ? '<div class="fgrid3 fpvt-n"><div><div class="flab">' + L('MEDIANA', 'MEDIAN') + '</div><div class="fmono">' + pv.med + ' ms</div></div><div><div class="flab">' + L('TU BASE', 'YOUR BASELINE') + '</div><div class="fmono t-teal">' + (b ? b + ' ms' : '—') + '</div></div><div><div class="flab">' + L('LAPSOS', 'LAPSES') + '</div><div class="fmono ' + (pv.lap >= 3 ? 't-red' : '') + '">' + pv.lap + '</div></div></div>' : '') +
      (b ? '' : '<div class="fsub2">' + L('Tu base sale después de 3 tests. Hazlos un día descansado.', 'Your baseline appears after 3 tests. Do them on a rested day.') + '</div>') +
      '<button type="button" class="fbtnp" onclick="fatPvt()">' + (pv ? L('Repetir el test', 'Repeat the test') : L('Empezar el test', 'Start the test')) + '</button></div>';
    h += '<div class="fcard frw">' + ico('sueno', 'c-blue') + '<div class="fgrow"><div class="ftit2">' + L('Sueño de tu reloj', 'Sleep from your watch') + '</div><div class="fsub">' + L('Apple Salud · Google Fit — próximamente', 'Apple Health · Google Fit — coming soon') + '</div></div>' + Q('relojMu') + '</div>';
    // Veredicto
    var malPvt = pv && (pv.lap >= 3 || (b && pv.med - b > 40));
    var tuAlto = (k && k >= 7) || malPvt;
    var v;
    if (!k && !pv) v = ['n', L('Responde para compararlo con la previsión', 'Answer to compare it with the forecast'), L('La previsión para esta jornada es ', 'The forecast for this duty is ') + nivTxt(j.nivel).toLowerCase() + '.'];
    else if (tuAlto && j.nivel === 'alto') v = ['r', L('Previsión y tú coincidís: fatiga alta', 'Forecast and you agree: high fatigue'), L('Reparte la carga de la aproximación con tu compañero y valora reportarlo antes de firmar.', 'Share the approach workload with your colleague and consider reporting it before you sign on.')];
    else if (tuAlto) v = ['r', L('Notas más fatiga de la prevista', 'You feel more fatigued than forecast'), L('Fíate de cómo estás tú, no de la previsión. Valora reportarlo antes de firmar.', 'Trust how you feel, not the forecast. Consider reporting it before you sign on.')];
    else if (j.nivel === 'alto') v = ['a', L('Te notas bien, pero la previsión es alta', 'You feel fine, but the forecast is high'), L('La fatiga suele llegar más tarde en la jornada: vigila el momento más crítico.', 'Fatigue often arrives later in the duty: watch the most critical moment.')];
    else v = ['g', L('Te notas bien', 'You feel fine'), L('Coincide con la previsión. Buen vuelo.', 'It matches the forecast. Have a good flight.')];
    h += '<div class="fcard fver v-' + v[0] + '"><div class="fsp"><div class="ftit2">' + esc(v[1]) + '</div>' + Q('check') + '</div><div class="fsub2">' + esc(v[2]) + '</div>' +
      (v[0] === 'r' ? '<button type="button" class="fbtnp fbtn-r" onclick="fatAyuda(\'reportar\')">' + L('Cómo reportar la fatiga', 'How to report fatigue') + '</button>' : '') + '</div>';
    h += '<p class="fpie">' + L('Se guarda sólo en este aparato. Orientativo: la decisión es del comandante (ORO.FTL.105).', 'Saved only on this device. Guidance only: the decision rests with the commander (ORO.FTL.105).') + '</p>';
    return h;
  }

  /* ── Test de reflejos (PVT-B, 3 min) ───────────────────────────────────── */
  var PV = null;
  root.fatPvt = function () {
    var r = res(), j = sel(r); if (!j) return;
    var box = document.getElementById('fat-pvt'); if (!box) return;
    PV = { fecha: j.fecha, fin: Date.now() + 180000, rt: [], falsos: 0, on: 0, t: null };
    box.innerHTML = '<div class="fsp"><div class="ftit2">' + L('Test de reflejos', 'Reaction test') + '</div><div class="fmono" id="fat-pvt-t">3:00</div></div>' +
      '<button type="button" class="fpvt-zona" id="fat-pvt-z" aria-label="' + esc(L('Toca cuando se encienda la luz', 'Tap when the light comes on')) + '"><i class="fluz big" id="fat-pvt-l"></i><span id="fat-pvt-m">' + L('Espera a que se encienda…', 'Wait for the light…') + '</span></button>' +
      '<button type="button" class="fbtnp fbtn-s" onclick="fatPvtPara()">' + L('Parar', 'Stop') + '</button>';
    var z = document.getElementById('fat-pvt-z');
    z.addEventListener('pointerdown', pvtToque);
    pvtSiguiente();
    PV.reloj = setInterval(function () {
      var s = Math.max(0, Math.ceil((PV.fin - Date.now()) / 1000)), el = document.getElementById('fat-pvt-t');
      if (el) el.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
      if (s <= 0) pvtAcaba(true);
    }, 250);
  };
  function pvtSiguiente() {
    if (!PV) return;
    clearTimeout(PV.t);
    PV.on = 0;
    var l = document.getElementById('fat-pvt-l'); if (l) l.classList.remove('lit');
    PV.t = setTimeout(function () {
      if (!PV) return;
      PV.on = performance.now();
      var l2 = document.getElementById('fat-pvt-l'); if (l2) l2.classList.add('lit');
      var m = document.getElementById('fat-pvt-m'); if (m) m.textContent = L('¡Ahora!', 'Now!');
    }, PVT_ISI[0] + Math.random() * (PVT_ISI[1] - PVT_ISI[0]));
  }
  function pvtToque(e) {
    if (!PV) return;
    e.preventDefault();
    var m = document.getElementById('fat-pvt-m');
    if (!PV.on) { PV.falsos++; if (m) m.textContent = L('Demasiado pronto — espera a la luz', 'Too early — wait for the light'); pvtSiguiente(); return; }
    var rt = Math.round(performance.now() - PV.on);
    /* Por debajo de 100 ms nadie reacciona a la luz: se adelantó. Cuenta como
       salida en falso, como en el PVT estándar. */
    if (rt < 100) { PV.falsos++; PV.on = 0; if (m) m.textContent = L('Demasiado pronto — espera a la luz', 'Too early — wait for the light'); pvtSiguiente(); return; }
    PV.rt.push(rt);
    if (m) m.textContent = rt + ' ms';
    pvtSiguiente();
  }
  function pvtAcaba(guardar) {
    if (!PV) return;
    clearInterval(PV.reloj); clearTimeout(PV.t);
    var p = PV; PV = null;
    if (guardar && p.rt.length >= 5) {
      var o = ckLee(); o[p.fecha] = o[p.fecha] || {};
      o[p.fecha].pvt = { med: Math.round(mediana(p.rt)), lap: p.rt.filter(function (x) { return x >= PVT_LAPSO; }).length, n: p.rt.length, falsos: p.falsos, rt: p.rt.slice(0, 120), at: Date.now() };
      ckGuarda(o);
    }
    render();
  }
  root.fatPvtPara = function () { pvtAcaba(false); };
  root.fatKss = function (n) {
    var r = res(), j = sel(r); if (!j) return;
    var o = ckLee(); o[j.fecha] = o[j.fecha] || {};
    o[j.fecha].kss = o[j.fecha].kss === n ? null : n; o[j.fecha].at = Date.now();
    ckGuarda(o); render();
  };

  /* ── Hoja de ayuda ─────────────────────────────────────────────────────── */
  function hoja() {
    if (!ST.ay) return '';
    var a = AY(ST.ay);
    return '<div class="fov" onclick="if(event.target===this)fatAyuda(null)"><div class="fsheet" role="dialog" aria-modal="true" aria-label="' + esc(a[1]) + '">' +
      '<div class="fgrip"></div><div class="frow2"><div class="fqbig">?</div><div><div class="flab t-acc">' + esc(a[0]) + '</div><div class="fsh-t">' + esc(a[1]) + '</div></div></div>' +
      '<p class="fsh-p">' + esc(a[2]) + '</p>' +
      '<div class="fsh-tip"><div class="flab">' + L('QUÉ SIGNIFICA PARA TI', 'WHAT IT MEANS FOR YOU') + '</div><div>' + esc(a[3]) + '</div></div>' +
      (ST.ay === 'guia' ? '<button type="button" class="fbtnp fbtn-s" onclick="fatDoc(\'' + (en() ? 'en' : 'es') + '\')">' + L('Leer cómo funciona y cómo se calcula', 'Read how it works and how it is calculated') + '</button>' : '') +
      '<button type="button" class="fbtnp" onclick="fatAyuda(null)">' + L('Entendido', 'Got it') + '</button></div></div>';
  }


  /* ── Tus datos de sueño: el cuestionario de la primera entrada ──────────
     (public/fatiga/perfil.js). Sale UNA vez por piloto al entrar en Fatiga, y
     después desde «Tus datos de sueño». Viene marcado con lo que el modelo
     supone hoy: quien no toca nada calcula igual que antes, y lo dice. */
  var IQ = [
    { k: 'coche', t: ['¿Cuánto tardas de casa a tu base?', 'How long from home to your base?'] },
    { k: 'prep', t: ['¿Y en arreglarte y salir de casa?', 'And to get ready and leave home?'] },
    { k: 'hotel', t: ['Fuera de base, ¿cuánto del hotel al aeropuerto?', 'Away from base, how long from the hotel to the airport?'] },
    { k: 'acostar', t: ['Un día libre, ¿a qué hora te duermes?', 'On a day off, when do you fall asleep?'] },
    { k: 'levantar', t: ['¿Y a qué hora te despiertas sin despertador?', 'And when do you wake up without an alarm?'] },
    { k: 'sdw', t: ['La noche antes de una jornada de mañana, ¿cuánto duermes?', 'The night before an early duty, how long do you sleep?'] }
  ];
  function hhmmMin(m) { m = ((Math.round(m) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
  function opcTxt(k, v) {
    if (k === 'coche' || k === 'prep' || k === 'hotel') return v + ' min';
    if (k === 'sdw') return hm(v);
    return hhmmMin(v);
  }
  /* Lo que sale del bloque MCTQ (perfil.js), en una línea: cronotipo, lo que
     necesitas dormir y cuánto recuperas en un día libre. */
  function introResultado(r) {
    var FP = root.FatigaPerfil, m = FP.mctq(r), c = FP.cronotipo(r);
    var ct = c === 'm' ? L('madrugador', 'early type') : c === 'n' ? L('nocturno', 'late type') : L('intermedio', 'intermediate');
    return L('Cronotipo ' + ct + ' · necesitas unas ' + hm(m.necesidad) + ' · en día libre duermes ' + hm(m.sdf) + (m.deuda >= 30 ? ' (' + hm(m.deuda) + ' más que antes de trabajar)' : ''),
      'Chronotype: ' + ct + ' · you need about ' + hm(m.necesidad) + ' · on days off you sleep ' + hm(m.sdf) + (m.deuda >= 30 ? ' (' + hm(m.deuda) + ' more than before work)' : ''));
  }
  /* Lo que el modelo hará con estas respuestas, con la MISMA regla que motor.js:
     levantarse = firma − (coche + arreglarse); acostarse adelantando como mucho
     1h30 para buscar las horas que necesitas. */
  function introEjemplo(r) {
    var nec = root.FatigaPerfil.mctq(r).necesidad;
    var firma = 6 * 60, lev = firma - (r.coche + r.prep);
    var aco = Math.max(r.acostar - 90, Math.min(r.acostar, lev + 1440 - nec));
    var dur = lev + 1440 - aco;
    return L('Con una firma a las 06:00 te levantas a las ' + hhmmMin(lev) + ' y te acuestas a las ' + hhmmMin(aco) + ': ' + hm(dur) + ' de sueño' + (dur < nec ? ', menos de las ' + hm(nec) + ' que necesitas.' : '.'),
      'With a 06:00 report you get up at ' + hhmmMin(lev) + ' and go to bed at ' + hhmmMin(aco) + ': ' + hm(dur) + ' of sleep' + (dur < nec ? ', less than the ' + hm(nec) + ' you need.' : '.'));
  }
  /* Lo que ha medido ARIA en sus briefings (tiempo real de casa a la base). Se
     DICE junto a la pregunta; no cambia la respuesta del piloto. */
  function introCoche() {
    var rc = root.FatigaPerfil.resumenCoche && root.FatigaPerfil.resumenCoche();
    if (!rc) return '';
    return '<div class="fsub fiq-aria" data-fiq-aria>' + esc(rc.n === 1
      ? L('ARIA lo midió una vez: ' + rc.mediana + ' min con tráfico.', 'ARIA measured it once: ' + rc.mediana + ' min with traffic.')
      : L('ARIA lo ha medido ' + rc.n + ' veces: ' + rc.mediana + ' min de mediana' + (rc.coherente ? '.' : ' (varía bastante).'), 'ARIA has measured it ' + rc.n + ' times: ' + rc.mediana + ' min median' + (rc.coherente ? '.' : ' (it varies a lot).'))) + '</div>' +
      (rc.coherente && ST.intro && ST.intro.r.coche !== rc.mediana && Math.abs(ST.intro.r.coche - rc.mediana) >= 10
        ? '<button type="button" class="fbtnp fbtn-s fiq-usar" data-fiq-usar onclick="fatIntroSel(\'coche\',\'' + rc.mediana + '\')">' + esc(L('Usar los ' + rc.mediana + ' min medidos', 'Use the measured ' + rc.mediana + ' min')) + '</button>' : '');
  }
  /* La propuesta en la pantalla: 3 o más mediciones coherentes que se apartan
     10 min o más de lo contestado (perfil.js, propuestaCoche). No cambia nada
     sola: el piloto acepta o dice que no, y el «no» se recuerda. */
  function propuestaCoche() {
    var FP = root.FatigaPerfil, p = FP && FP.propuestaCoche && FP.propuestaCoche();
    if (!p) return '';
    return '<div class="fcard fprop" data-fat-prop role="group" aria-label="' + esc(L('Tiempo de casa a la base', 'Time from home to base')) + '">' +
      '<div class="flab t-acc">' + L('LO HA MEDIDO ARIA', 'MEASURED BY ARIA') + '</div>' +
      '<div class="fprop-t">' + esc(L('Tardas unos ' + p.mediana + ' min de casa a la base, no ' + p.actual, 'It takes you about ' + p.mediana + ' min from home to base, not ' + p.actual)) + '</div>' +
      '<p class="fsub">' + esc(L('ARIA lo ha medido en ' + p.n + ' briefings antes de salir, con tráfico. Con eso el modelo calcula a qué hora te levantas antes de firmar.', 'ARIA measured it in ' + p.n + ' briefings before leaving, with traffic. The model uses it to work out when you get up before reporting.')) + '</p>' +
      '<div class="fprop-b"><button type="button" class="fbtnp" data-fat-prop-si onclick="fatPropCoche(true)">' + esc(L('Cambiar a ' + p.mediana + ' min', 'Change to ' + p.mediana + ' min')) + '</button>' +
      '<button type="button" class="fbtnp fbtn-s" data-fat-prop-no onclick="fatPropCoche(false)">' + L('Dejarlo como está', 'Keep it') + '</button></div></div>';
  }
  root.fatPropCoche = function (si) {
    var FP = root.FatigaPerfil; if (!FP) return;
    if (si) FP.aceptaCoche(); else FP.rechazaCoche();
    render();
  };
  function intro() {
    var FP = root.FatigaPerfil; if (!FP || !ST.intro) return '';
    var r = ST.intro.r;
    var qs = IQ.map(function (q) {
      return '<div class="fiq" role="group" aria-label="' + esc(L(q.t[0], q.t[1])) + '"><div class="fiq-t">' + esc(L(q.t[0], q.t[1])) + '</div><div class="fiq-o' + (q.k === 'crono' ? ' fiq-3' : '') + '">' +
        (q.k === 'coche' && FP.OPC.coche.indexOf(r.coche) < 0 ? FP.OPC.coche.concat([r.coche]).sort(function (a, b) { return a - b; }) : FP.OPC[q.k]).map(function (v) {
          var on = r[q.k] === v, def = FP.DEF[q.k] === v;
          return '<button type="button" class="' + (on ? 'on' : '') + '" aria-pressed="' + on + '" data-k="' + q.k + '" data-v="' + v + '" onclick="fatIntroSel(\'' + q.k + '\',\'' + v + '\')">' + esc(opcTxt(q.k, v)) + (def ? '<i>' + L('habitual', 'typical') + '</i>' : q.k === 'coche' && FP.OPC.coche.indexOf(v) < 0 ? '<i>' + L('medido', 'measured') + '</i>' : '') + '</button>';
        }).join('') + '</div>' + (q.k === 'coche' ? introCoche() : '') + '</div>';
    }).join('');
    return '<div class="fov" onclick="if(event.target===this)fatIntroCierra()"><div class="fsheet fintro" role="dialog" aria-modal="true" aria-label="' + esc(L('Tus datos de sueño', 'Your sleep details')) + '">' +
      '<div class="fgrip"></div><div class="flab t-acc">' + L('FATIGA · 1 MINUTO', 'FATIGUE · 1 MINUTE') + '</div>' +
      '<div class="fsh-t">' + L('Ajustemos el modelo a ti', 'Let’s fit the model to you') + '</div>' +
      '<p class="fsh-p">' + L('Tu fatiga prevista sale de cuándo puedes dormir. Con esto deja de suponer lo de un piloto medio. Viene marcado lo que supone ahora: cambia lo que no sea tuyo.', 'Your forecast fatigue comes from when you can sleep. With this it stops assuming an average pilot. What it assumes now is already selected: change what isn’t yours.') + '</p>' +
      qs +
      '<div class="fsh-tip fiq-ej"><div data-fiq-res>' + esc(introResultado(r)) + '</div><div data-fiq-ej>' + esc(introEjemplo(r)) + '</div></div>' +
      '<button type="button" class="fbtnp" data-fiq-ok onclick="fatIntroGuarda()">' + L('Guardar', 'Save') + '</button>' +
      '<button type="button" class="fbtnp fbtn-s" onclick="' + (ST.intro.primera ? 'fatIntroOmite()' : 'fatIntroCierra()') + '">' + (ST.intro.primera ? L('Ahora no', 'Not now') : L('Cancelar', 'Cancel')) + '</button>' +
      '<div class="fsub fiq-pie">' + L('Se guarda en tu perfil y lo cambias cuando quieras desde «Tus datos de sueño».', 'It is saved in your profile; change it any time from «Your sleep details».') + '</div>' +
      '</div></div>';
  }
  function datosBtn() {
    return '<button type="button" class="fdocb" data-fat-datos onclick="fatIntro()"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.5A8 8 0 1 1 8.5 4 6.5 6.5 0 0 0 20 15.5z"/></svg>' +
      '<span>' + L('Tus datos de sueño', 'Your sleep details') + '</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>';
  }
  root.fatIntro = function (primera) {
    var FP = root.FatigaPerfil; if (!FP) return;
    var g = FP.lee();
    ST.intro = { r: FP.completa(g && !g.omitido ? g : null), primera: !!primera };
    ST.ay = null; ST.doc = null;
    if (primera) FP.marca();
    pintaHoja();
  };
  root.fatIntroSel = function (k, v) {
    if (!ST.intro) return;
    ST.intro.r[k] = +v;
    var b = document.querySelector('#fat-hoja .fsheet'), y = b ? b.scrollTop : 0;
    pintaHoja();
    b = document.querySelector('#fat-hoja .fsheet'); if (b) b.scrollTop = y;
  };
  root.fatIntroCierra = function () { ST.intro = null; pintaHoja(); };
  root.fatIntroGuarda = function () {
    if (!ST.intro || !root.FatigaPerfil) return;
    var r = ST.intro.r; r.at = Date.now();
    root.FatigaPerfil.guarda(r); ST.intro = null; render();
  };
  root.fatIntroOmite = function () {
    if (root.FatigaPerfil) root.FatigaPerfil.guarda({ omitido: 1, at: Date.now() });
    ST.intro = null; render();
  };

  /* ── El documento «Cómo funciona» (js/fatiga-doc.js) ────────────────────
     En castellano y en inglés, con su propio conmutador: se lee en el idioma
     que se elija, sea cual sea el de la app. */
  function docBtn() {
    return '<button type="button" class="fdocb" onclick="fatDoc(\'' + (en() ? 'en' : 'es') + '\')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/></svg>' +
      '<span>' + L('Cómo funciona y cómo se calcula', 'How it works and how it is calculated') + '</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>';
  }
  function doc() {
    var D = root.FatigaDoc; if (!D || !ST.doc) return '';
    var lg = ST.doc === 'en' ? 'en' : 'es', B = D[lg];
    var T = lg === 'en' ? { t: 'How the Fatigue section works', s: 'What it does, how it does it and how it is calculated', c: 'Close' } : { t: 'Cómo funciona la sección de Fatiga', s: 'Qué hace, cómo lo hace y cómo lo calcula', c: 'Cerrar' };
    var h = B.map(function (b) {
      if (b.h) return '<h3>' + esc(b.h) + '</h3>';
      if (b.p) return '<p>' + esc(b.p) + '</p>';
      if (b.f) return '<div class="fdoc-f">' + esc(b.f).replace(/\n/g, '<br>') + '</div>';
      if (b.li) return '<ul>' + b.li.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
      if (b.fig) return root.FatigaDocFig ? root.FatigaDocFig.html(b.fig, lg) : '';
      if (b.ref) return '<ol class="fdoc-ref">' + b.ref.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>';
      return '';
    }).join('');
    return '<div class="fov" onclick="if(event.target===this)fatDoc(null)"><div class="fsheet fdoc" role="dialog" aria-modal="true" lang="' + lg + '" aria-label="' + esc(T.t) + '">' +
      '<div class="fgrip"></div><div class="fdoc-hd"><div><div class="fsh-t">' + esc(T.t) + '</div><div class="fsub">' + esc(T.s) + '</div></div>' +
      '<div class="fdoc-lg" role="group" aria-label="Idioma / Language"><button type="button" class="' + (lg === 'es' ? 'on' : '') + '" aria-pressed="' + (lg === 'es') + '" onclick="fatDoc(\'es\')">ES</button><button type="button" class="' + (lg === 'en' ? 'on' : '') + '" aria-pressed="' + (lg === 'en') + '" onclick="fatDoc(\'en\')">EN</button></div></div>' +
      '<div class="fdoc-b">' + h + '</div>' +
      '<button type="button" class="fbtnp" onclick="fatDoc(null)">' + esc(T.c) + '</button></div></div>';
  }
  root.fatDoc = function (lg) {
    var cambia = ST.doc && lg && lg !== ST.doc;
    ST.doc = lg || null; if (lg) ST.ay = null;
    pintaHoja();
    if (cambia) { var b = document.querySelector('#fat-hoja .fsheet'); if (b) b.scrollTop = 0; }
  };

  /* La hoja de ayuda cuelga de <body>, no de la pantalla: dentro de #scr-fatigue
     (contexto de apilamiento propio) la barra de abajo se pintaba ENCIMA y
     tapaba el «Entendido». Se cierra sola si la pantalla deja de estar delante. */
  function pintaHoja() {
    var h = document.getElementById('fat-hoja');
    if (!h) { h = document.createElement('div'); h.id = 'fat-hoja'; h.setAttribute('translate', 'no'); document.body.appendChild(h); }
    h.innerHTML = ST.doc ? doc() : ST.intro ? intro() : hoja();
  }
  try {
    var _scrObs = function () {
      var s = document.getElementById('scr-fatigue');
      if (!s || !root.MutationObserver) return;
      new MutationObserver(function () {
        if (!s.classList.contains('active') && (ST.ay || ST.doc || ST.intro)) { ST.ay = null; ST.doc = null; ST.intro = null; pintaHoja(); }
        else if (s.classList.contains('active') && !ST.intro && root.FatigaPerfil && root.FatigaPerfil.toca()) root.fatIntro(true);
      }).observe(s, { attributes: true, attributeFilter: ['class'] });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _scrObs); else _scrObs();
  } catch (e) {}

  /* ── Pintar ────────────────────────────────────────────────────────────── */
  function render() {
    var body = document.getElementById('fat-body'); if (!body) return;
    css();
    var scr = document.getElementById('scr-fatigue');
    var r = res(); _rCache = r;
    var j = sel(r);
    if (!j) {
      if (scr) scr.setAttribute('data-nivel', '');
      body.innerHTML = '<div class="fcard fvacio"><div class="ftit2">' + L('Sin jornadas en tu roster', 'No duties in your roster') + '</div><p class="fsub2">' + L('La fatiga prevista sale de tu roster. Impórtalo en la pestaña Roster y aquí verás cada jornada con su nivel, su reloj y tu semana.', 'Forecast fatigue comes from your roster. Import it in the Roster tab and here you will see each duty with its level, its clock and your week.') + '</p>' +
        '<button type="button" class="fbtnp" onclick="goTo(\'roster\')">' + L('Ir al roster', 'Go to roster') + '</button></div>' + propuestaCoche() + datosBtn() + docBtn();
      introSiToca();
      return;
    }
    if (scr) scr.setAttribute('data-nivel', j.nivel);
    var v = ST.tab === 'plan' ? vistaPlan(j, r) : ST.tab === 'reloj' ? vistaReloj(j, r) : ST.tab === 'semana' ? vistaSemana(j, r) : ST.tab === 'check' ? vistaCheck(j, r) : vistaHoy(j, r);
    body.innerHTML = cabecera(j, r) + tabs() + '<div class="fview">' + v + '</div>' + propuestaCoche() + datosBtn() + docBtn();
    introSiToca();
  }
  /* La primera vez se abre sola, pero sólo con la pantalla DELANTE: render()
     también lo llaman el Home y la actualización del roster. */
  function introSiToca() {
    var s = document.getElementById('scr-fatigue');
    if (!ST.intro && root.FatigaPerfil && s && s.classList.contains('active') && root.FatigaPerfil.toca()) { root.fatIntro(true); return; }
    pintaHoja();
  }
  root.fatTab = function (t) { if (PV) pvtAcaba(false); ST.tab = t; render(); };
  root.fatAyuda = function (k) { ST.ay = k; ST.doc = null; pintaHoja(); };
  root.fatVe = function (f, tab) { if (PV) pvtAcaba(false); ST.fecha = f; if (tab) ST.tab = tab; render(); };
  root.fatMueve = function (d) {
    var r = res(); if (!r || !r.lista.length) return;
    var j = sel(r), i = r.lista.indexOf(j) + d;
    if (i < 0 || i >= r.lista.length) return;
    if (PV) pvtAcaba(false);
    ST.fecha = r.lista[i].fecha; render();
  };
  /* ── La tarjeta del Home: la PRÓXIMA jornada y sus próximos 7 días ────── */
  function actualizaHome() {
    var big = document.getElementById('dh-fat-big'); if (!big) return;
    css();
    var sub = document.getElementById('dh-fat-sub'), foot = document.getElementById('dh-fat-foot'), d7 = document.getElementById('dh-fat-7');
    var r = res(), ahora = Date.now();
    var sig = r && r.lista ? r.lista.filter(function (x) { return x.fin >= ahora; })[0] : null;
    if (!sig) {
      big.textContent = '—'; big.removeAttribute('data-n');
      sub.textContent = L('Sin jornadas próximas', 'No upcoming duties');
      foot.textContent = L('Importa tu roster ›', 'Import your roster ›'); d7.innerHTML = ''; return;
    }
    big.setAttribute('data-n', sig.nivel);
    big.textContent = nivTxt(sig.nivel, true);
    sub.textContent = nombreDia(sig.fecha, true) + ' · ' + L('firma', 'report') + ' ' + hhmm(sig.inicio, r);
    foot.textContent = 'KSS ≈ ' + Math.round(sig.kss) + ' · ' + L('aterrizaje', 'landing') + ' ' + hhmm((sig.peor && sig.peor.ms) || sig.fin, r);
    var h = '', hoy = fechaMs(ahora, r);
    for (var i = 0; i < 7; i++) {
      var f = fechaMs(medianocheLocal(hoy, r) + i * DIA + 12 * 3600000, r), x = r.porFecha[f];
      h += '<i class="' + (x ? 'p-' + x.nivel : 'p-libre') + '"></i>';
    }
    d7.innerHTML = h;
  }
  root.fatigaHome = actualizaHome;

  root.FatigaUI = { render: render, ayuda: AY, _st: ST, home: actualizaHome };
  try { root.addEventListener('pilotos-fatiga-perfil', function () { try { actualizaHome(); } catch (e) {} }); } catch (e) {}
  try { root.addEventListener('pilotos-roster-updated', function () { var s = document.getElementById('scr-fatigue'); if (s && s.classList.contains('active')) render(); actualizaHome(); }); } catch (e) {}
  // El Home se pinta antes que el roster: se repite cuando ya está cargado.
  try {
    [1500, 5000].forEach(function (ms) { setTimeout(function () { try { actualizaHome(); } catch (e) {} }, ms); });
    root.addEventListener('load', function () { try { actualizaHome(); } catch (e) {} });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) try { actualizaHome(); } catch (e) {} });
  } catch (e) {}

  /* ── Estilos ───────────────────────────────────────────────────────────── */
  /* Los estilos viven en public/fatiga/fatiga.css. */
  function css() {}
})(typeof window !== 'undefined' ? window : this);
