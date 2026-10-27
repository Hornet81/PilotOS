/* ══════════════════════════════════════════════════════════════════════════
   FATIGA — el documento «Cómo funciona» (castellano e inglés)

   Lo abre la sección de Fatiga (js/fatiga-ui.js). Explica qué hace la
   sección, de dónde salen los datos, el modelo y sus ecuaciones, cómo se
   estima el sueño, el check antes de firmar, en qué se parece y en qué no a
   los modelos comerciales, y sus límites.

   ⚠ Cada cifra de aquí tiene que coincidir con el código:
     · coeficientes y reglas de sueño → P en js/fatiga.js
     · PVT-B (2–5 s, 355 ms, salidas en falso < 100 ms) → js/fatiga-ui.js
   Si cambia uno, cambia el otro. El banco scripts/fatiga-seccion-test.js lo
   comprueba leyendo los dos archivos.
   ══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var ES = [
    { h: 'Qué hace esta sección' },
    { fig: 'hoy' },
    { p: 'Calcula, para cada jornada de tu roster, cómo de despierto vas a estar en el momento más delicado: el aterrizaje. Lo dice con un nivel (bajo, moderado o alto), una cifra de vigilia y su equivalente en la escala de somnolencia de Karolinska (KSS), y te enseña POR QUÉ: el sueño que habrás podido tener, las horas que llevarás despierto, la deuda de sueño y si vuelas en la franja de la noche en la que el cuerpo rinde peor.' },
    { p: 'Es una previsión para ayudarte a planificar el descanso y a reconocer los días delicados. No es un diagnóstico, no sustituye a cómo te sientes y no decide nada por ti: si estás fatigado, se reporta. La decisión de operar es del comandante (EASA ORO.FTL.105).' },

    { h: 'De dónde salen los datos' },
    { fig: 'roster' },
    { li: ['Tu roster: la firma, cada sector y su aterrizaje. Se usa la hora real si la hay, si no la estimada y si no la programada.', 'Tu base: la hora de tu cuerpo es la de tu base (Madrid o Canarias), con sus cambios de hora. Los cálculos de ritmo circadiano se hacen con esa hora, no con la del aeropuerto.', 'Tu sueño NO lo sabe el roster: se ESTIMA con unas reglas (abajo). Por eso la cifra es de una persona media con esos horarios, no la tuya exacta.'] },
    { p: 'Todo se calcula en tu teléfono. No se envía nada a ningún servidor.' },

    { h: 'El modelo: tres procesos de Åkerstedt y Folkard' },
    { fig: 'modelo' },
    { p: 'Se usa el modelo de tres procesos de la vigilia (Three-Process Model, TPM), desarrollado en el Instituto Karolinska de Estocolmo y publicado con todas sus ecuaciones. Es el modelo con más validación en entornos de trabajo reales, y se ha validado con tripulaciones de aerolínea (Ingre y otros, 2014). La vigilia A es la suma de tres procesos:' },
    { f: 'A = S + C + W' },
    { p: 'S — presión de sueño (homeostática). Baja mientras estás despierto y se recupera durmiendo, en curvas exponenciales:' },
    { f: 'despierto:  S = 2,4 + (S₀ − 2,4)·e^(−0,0353·t)\ndurmiendo:  S = 14,3 − (14,3 − S₀)·e^(−0,381·t)\n(t en horas; S₀ = valor de S al empezar)' },
    { p: 'C — ritmo circadiano. Una onda de 24 horas que alcanza su máximo a media tarde y su mínimo de madrugada:' },
    { f: 'C = 2,5·cos(2π·(h − 16,8)/24)\n(h = hora local de tu base)' },
    { p: 'W — inercia del sueño. Al despertar, la vigilia empieza más baja y se recupera en una o dos horas:' },
    { f: 'W = −5,72·e^(−1,51·t)\n(t = horas desde que te despiertas)' },
    { p: 'La escala de A va más o menos de 2 a 16: cuanto más alta, más despierto. Para que la cifra se pueda leer se convierte a la escala KSS (1 = muy despierto, 9 = luchando contra el sueño) con la transformación lineal publicada:' },
    { f: 'KSS ≈ 10,6 − 0,6·A' },
    { p: 'Los coeficientes son los valores por defecto publicados del modelo (Åkerstedt, Folkard y Portin 2004; Ingre y otros 2014). La app los usa tal cual: no los ha recalibrado.' },

    { h: 'Los niveles' },
    { fig: 'niveles' },
    { li: ['Alto: A por debajo de 7 (KSS ≈ 6,4 o más). Es la zona que la literatura del modelo asocia a somnolencia marcada.', 'Moderado: A entre 7 y 8,5 (KSS ≈ 5,5 a 6,4).', 'Bajo: A de 8,5 o más.'] },
    { p: 'Los dos umbrales son una elección de la app sobre esa literatura, no un límite legal. Se mira la vigilia en cada aterrizaje operado de la jornada y manda el peor: ése es el «momento más crítico».' },
    { p: 'Regla añadida por la app: si en los tres días anteriores te faltan 6 horas o más de sueño (sobre 8 por noche), el nivel sube un escalón. El modelo recupera muy deprisa con una sola noche y subestima la deuda acumulada; la pantalla dice cuándo se ha aplicado.' },

    { h: 'Cómo se estima tu sueño' },
    { fig: 'sueno' },
    { p: 'Entre dos jornadas, la app supone que duermes así (hora de tu base):' },
    { li: ['Te acuestas a las 23:00. Si al día siguiente madrugas, adelantas para buscar 8 horas, como mucho hasta las 21:30.', 'Te levantas a las 07:00 (08:00 si al día siguiente no trabajas), o antes si la firma lo obliga: 90 minutos antes de firmar en casa y 60 en un hotel.', 'Tras una jornada, te duermes 45 minutos después de acabar en casa y 30 en un hotel. La jornada acaba en el último calzo más 20 minutos.', 'Si llegas tarde, duermes hasta 8 horas sin pasar de las 11:00.', 'Un sueño que empieza de día (tras una noche trabajando) dura como mucho 5 horas.', 'No se cuentan episodios de menos de 60 minutos.'] },
    { p: 'Son hábitos medios. Si tú duermes distinto, la previsión se desvía; por eso existe el check antes de firmar, y en una fase siguiente la app leerá el sueño de tu reloj.' },

    { h: 'Tus datos de sueño' },
    { fig: 'datos' },
    { p: 'Esas son las reglas de un piloto medio. Con «Tus datos de sueño» (la primera vez que entras en Fatiga, y después cuando quieras) las cambias por las tuyas. Son seis preguntas: el tiempo de casa a la base y el de arreglarte (juntos sustituyen a los 90 minutos), el del hotel al aeropuerto (más 30 minutos para arreglarte, sustituye a los 60), y un bloque del cuestionario de cronotipo de Múnich (MCTQ, Roenneberg y otros 2003): a qué hora te duermes y te despiertas sin despertador en un día libre, y cuánto duermes la noche antes de una jornada de mañana.' },
    { p: 'De ese bloque salen dos cosas. Tu cronotipo: el punto medio de tu sueño en día libre, corregido por el sueño de recuperación como hace el MCTQ (MSFsc = MSF − (SDf − SDweek)/2, con SDweek = (5·SDw + 2·SDf)/7); el pico del ritmo circadiano se mueve lo mismo que tu punto medio se aparte del de un piloto medio, como mucho 1 hora y media. Y lo que necesitas dormir: la media entre lo que duermes en día libre (con recuperación) y antes de trabajar (recortado). Las dos reglas son criterio de la app: el MCTQ está validado para medir el cronotipo, pero cuánto mueve eso este modelo no está calibrado. Lo que viene marcado es lo que el modelo supone sin tus datos; si no cambias nada, calcula igual que antes.' },
    { p: 'ARIA mide con tráfico el tiempo de casa a tu base cada vez que te hace el briefing antes de una jornada. La hoja enseña lo medido junto a tu respuesta. Cuando hay 3 mediciones o más que coinciden (±10 min) y se apartan 10 min o más de lo que contestaste, la pantalla te propone cambiarlo; nunca lo cambia sola, y si dices que no, no lo vuelve a proponer hasta que lo medido se mueva otros 10 min. Se guarda sólo en este teléfono: los minutos, no tu posición.' },
    { h: 'Qué significa cada número' },
    { fig: 'numeros' },
    { li: ['Vigilia (A): el resultado del modelo en el peor aterrizaje.', 'KSS: esa misma vigilia en la escala de Karolinska.', 'Último sueño: el episodio de sueño más reciente antes de firmar (no la suma de 24 horas).', 'Despierto: horas desde que te levantas hasta el último aterrizaje.', 'Deuda 3 días: lo que te falta para 24 horas de sueño en las 72 horas antes de firmar.', 'Ventana de bajo rendimiento (WOCL): de 02:00 a 06:00 en tu base, el mínimo del ritmo circadiano.'] },
    { p: 'Los motivos que se enseñan: firmar antes de las 05:00 o antes de las 07:00, tres madrugadas seguidas, acabar después de las 23:00, tocar la ventana 02:00–06:00, menos de 6 horas de último sueño, 4 sectores o más, 16 horas o más despierto y 4 horas o más de deuda.' },

    { h: 'El check antes de firmar' },
    { fig: 'check' },
    { p: 'La previsión es de una persona media; el check es TUYO, de ese día. Tiene dos partes:' },
    { li: ['Escala de somnolencia de Karolinska (KSS, Åkerstedt y Gillberg 1990): del 1 (muy despierto) al 9 (mucho sueño, luchando por no dormirse). Es la escala de referencia en los estudios de fatiga de tripulaciones.', 'Test de reflejos PVT-B (Basner, Mollicone y Dinges 2011): la versión de 3 minutos del test de vigilancia psicomotora, validada contra el de 10 minutos. Una luz se enciende cada 2 a 5 segundos al azar y tocas lo más rápido que puedas. Lapso = reacción de 355 ms o más. Tocar antes de la luz, o a menos de 100 ms, es una salida en falso.'] },
    { p: 'Tu base es la mediana de tus tres primeros tests: hazlos en días descansados. La app considera una señal de fatiga ir 40 ms o más por encima de tu base, o tener 3 lapsos o más; esos dos criterios son de la app.' },
    { p: 'Importante: una pantalla táctil añade su propio retraso, distinto en cada teléfono. Por eso lo que más vale es compararte contigo mismo en el mismo aparato, no las cifras absolutas. Los resultados se guardan sólo en este teléfono.' },

    { h: 'El plan: medidas para llegar más despierto' },
    { fig: 'plan' },
    { p: 'La pestaña Plan propone, para la jornada elegida, qué hacer y a qué hora. Hay dos clases de medida y la pantalla las distingue siempre:' },
    { li: ['Calculadas: la siesta antes de firmar y el descanso controlado en cabina. Son sueño, y el mismo modelo sabe sumarlo: la app añade ese sueño, recalcula y te da la vigilia en el aterrizaje más crítico antes y después. También elige la mejor hora probando todas las posibles.', 'Recomendaciones: la cafeína, la luz, moverse y comer. No forman parte del modelo de tres procesos, así que se dan con su fuente y sin un número inventado.'] },
    { p: 'Siesta antes de firmar: se busca entre 3 horas después de levantarte y la hora de salir de casa (menos 30 minutos de margen). Se prueban dos: 20 minutos, corta para no llegar al sueño profundo (en Brooks y Lack 2006 las siestas de 10 minutos fueron las más eficaces y la de 30 empeoraba al principio por la torpeza del despertar), y 90 minutos, un ciclo de sueño entero. Manda la corta salvo que la larga gane claramente.' },
    { p: 'Descanso controlado en cabina: 20 minutos en crucero, empezando 25 minutos después del despegue y terminando al menos 30 minutos antes del inicio del descenso (se supone 30 minutos antes del aterrizaje), que es lo que tarda en irse la torpeza del despertar. Sólo en sectores de casi dos horas o más, y sólo si el manual de operaciones de tu compañía (OM-A) lo permite. El modelo muestra por qué importa la hora: el mismo descanso demasiado cerca del aterrizaje resta en vez de sumar. El estudio de la NASA sobre descanso planificado en cabina en largo radio encontró mejor rendimiento y vigilancia al final del vuelo (Rosekind y otros 1994).' },
    { p: 'Cafeína: hacia una hora antes del aterrizaje más crítico, porque tarda 20–30 minutos en hacer efecto y así cubre el descenso. Pero nunca en las 6 horas antes del siguiente sueño: tomada incluso 6 horas antes, la cafeína recorta el sueño (Drake y otros 2013). Si la hora ideal cae dentro de ese corte, la app adelanta el café al último momento permitido; entre 6 y 4 horas antes, propone té, que lleva menos cafeína; más tarde, nada. Un café tiene unos 80–100 mg y un té unos 30–50 mg; la EFSA considera seguros hasta 200 mg de una vez y 400 mg al día en un adulto (EFSA 2015).' },
    { p: 'Moverse, la luz y la comida: levantarse y caminar unos minutos en cada escala, la luz fuerte de noche y comer ligero ayudan durante poco tiempo (de 15 a 30 minutos en el caso de moverse) y no sustituyen al sueño. Al volver de una noche, conviene dormir al llegar pero no más de unas 5 horas, y volver al horario normal esa misma noche.' },
    { p: 'Si la previsión es alta, el plan empieza por decirlo: cuéntaselo al otro piloto en el briefing y, si no te encuentras apto, repórtalo. Ninguna medida cambia tus límites ni tu deber de reportar.' },

    { h: 'Comparado con los modelos del mercado' },
    { p: 'Las aerolíneas con sistema de gestión del riesgo de fatiga (FRMS) usan modelos biomatemáticos comerciales. Todos combinan, con matices, lo mismo: una presión de sueño que crece despierto y se recupera durmiendo, y un ritmo circadiano.' },
    { li: ['SAFTE-FAST (Hursh y otros 2004): muy usado en aviación y en defensa en EE. UU. Modelo comercial con licencia.', 'FAID (Dawson y Fletcher 2001): da una puntuación de fatiga a partir del horario de trabajo. Comercial.', 'BAM (Boeing Alertness Model) y otras herramientas de planificación de tripulaciones: comerciales, se ajustan con datos de cada operador.', 'Modelo de tres procesos (Åkerstedt y Folkard): publicado con sus ecuaciones y coeficientes, y validado en tripulaciones de aerolínea. Es el que usa esta app.'] },
    { p: 'Se usa el de tres procesos porque cualquiera puede comprobar sus ecuaciones. Los comerciales son más completos (por ejemplo, la adaptación al cambio horario en vuelos largos o el ajuste con datos de la compañía) pero son cajas cerradas. Esta sección NO es un sistema FRMS ni sustituye al de tu compañía.' },

    { h: 'Límites' },
    { li: ['Es un modelo de población media: con «Tus datos de sueño» se acerca a tus horarios, pero no sabe cómo duermes de verdad cada noche.', 'No tiene en cuenta el desfase horario de varios husos (jet lag) ni la siesta en vuelo o en tierra.', 'La regla de la deuda, los umbrales de nivel y los criterios del check son decisiones de la app, no partes publicadas del modelo.', 'No se ha contrastado todavía con reportes de fatiga reales de pilotos de la compañía.', 'Si te sientes cansado, eso manda sobre cualquier cifra de la pantalla.'] },

    { h: 'Referencias' },
    { ref: ['Åkerstedt T, Folkard S, Portin C (2004). Predictions from the three-process model of alertness. Aviation, Space, and Environmental Medicine 75(3 Suppl): A75–A83.', 'Ingre M, Van Leeuwen W, Klemets T, y otros (2014). Validating and extending the three process model of alertness in airline operations. PLoS ONE 9(10): e108679.', 'Åkerstedt T, Gillberg M (1990). Subjective and objective sleepiness in the active individual. International Journal of Neuroscience 52: 29–37.', 'Basner M, Mollicone D, Dinges DF (2011). Validity and sensitivity of a brief psychomotor vigilance test (PVT-B) to total and partial sleep deprivation. Acta Astronautica 69: 949–959.', 'Hursh SR y otros (2004). Fatigue models for applied research in warfighting. Aviation, Space, and Environmental Medicine 75(3 Suppl): A44–A53.', 'Dawson D, Fletcher A (2001). A quantitative model of work-related fatigue: background and definition. Ergonomics 44(2): 144–163.', 'Roenneberg T, Wirz-Justice A, Merrow M (2003). Life between clocks: daily temporal patterns of human chronotypes. Journal of Biological Rhythms 18(1): 80–90.', 'Brooks A, Lack L (2006). A brief afternoon nap following nocturnal sleep restriction: which nap duration is most recuperative? Sleep 29(6): 831–840.', 'Rosekind MR y otros (1994). Crew factors in flight operations IX: Effects of planned cockpit rest on crew performance and alertness in long-haul operations. NASA Technical Memorandum 108839.', 'Drake C, Roehrs T, Shambroom J, Roth T (2013). Caffeine effects on sleep taken 0, 3, or 6 hours before going to bed. Journal of Clinical Sleep Medicine 9(11): 1195–1200.', 'EFSA Panel on Dietetic Products, Nutrition and Allergies (2015). Scientific Opinion on the safety of caffeine. EFSA Journal 13(5): 4102.', 'EASA, Reglamento (UE) 965/2012 — ORO.FTL.105, ORO.FTL.120 (FRM). OACI Doc 9966, Manual de supervisión de los enfoques de gestión de la fatiga.'] }
  ];

  var EN = [
    { h: 'What this section does' },
    { fig: 'hoy' },
    { p: 'For every duty in your roster it works out how alert you will be at the most delicate moment: the landing. It gives a level (low, moderate or high), an alertness figure and its equivalent on the Karolinska Sleepiness Scale (KSS), and it shows you WHY: how much sleep you will have been able to get, how long you will have been awake, your sleep debt and whether you fly in the night window when the body performs worst.' },
    { p: 'It is a forecast to help you plan your rest and spot the delicate days. It is not a diagnosis, it does not replace how you feel and it does not decide anything for you: if you are fatigued, report it. The decision to operate rests with the commander (EASA ORO.FTL.105).' },

    { h: 'Where the data comes from' },
    { fig: 'roster' },
    { li: ['Your roster: the report time, every sector and its landing. The actual time is used if there is one, otherwise the estimated one, otherwise the scheduled one.', 'Your base: your body runs on your base time (Madrid or the Canaries), with its clock changes. The circadian calculations use that time, not the airport\'s.', 'Your sleep is NOT in the roster: it is ESTIMATED with a set of rules (below). So the figure is for an average person with those hours, not exactly you.'] },
    { p: 'Everything is calculated on your phone. Nothing is sent to any server.' },

    { h: 'The model: Åkerstedt and Folkard\'s three processes' },
    { fig: 'modelo' },
    { p: 'It uses the Three-Process Model of alertness (TPM), developed at the Karolinska Institute in Stockholm and published with all its equations. It is the model with the most validation in real work settings, and it has been validated with airline crews (Ingre et al., 2014). Alertness A is the sum of three processes:' },
    { f: 'A = S + C + W' },
    { p: 'S — sleep pressure (homeostatic). It falls while you are awake and recovers while you sleep, along exponential curves:' },
    { f: 'awake:   S = 2.4 + (S₀ − 2.4)·e^(−0.0353·t)\nasleep:  S = 14.3 − (14.3 − S₀)·e^(−0.381·t)\n(t in hours; S₀ = value of S at the start)' },
    { p: 'C — circadian rhythm. A 24-hour wave that peaks in the late afternoon and bottoms out in the early morning:' },
    { f: 'C = 2.5·cos(2π·(h − 16.8)/24)\n(h = local time at your base)' },
    { p: 'W — sleep inertia. When you wake up, alertness starts lower and recovers over one or two hours:' },
    { f: 'W = −5.72·e^(−1.51·t)\n(t = hours since you woke up)' },
    { p: 'The A scale runs roughly from 2 to 16: the higher, the more alert. To make it readable it is converted to the KSS (1 = very alert, 9 = fighting sleep) with the published linear transformation:' },
    { f: 'KSS ≈ 10.6 − 0.6·A' },
    { p: 'The coefficients are the model\'s published default values (Åkerstedt, Folkard and Portin 2004; Ingre et al. 2014). The app uses them as they are: it has not recalibrated them.' },

    { h: 'The levels' },
    { fig: 'niveles' },
    { li: ['High: A below 7 (KSS ≈ 6.4 or more). It is the zone the model\'s literature associates with marked sleepiness.', 'Moderate: A between 7 and 8.5 (KSS ≈ 5.5 to 6.4).', 'Low: A of 8.5 or more.'] },
    { p: 'Both thresholds are the app\'s choice based on that literature, not a legal limit. Alertness is checked at every operated landing of the duty and the worst one counts: that is the «most critical moment».' },
    { p: 'Rule added by the app: if over the previous three days you are short of 6 hours of sleep or more (against 8 a night), the level goes up one step. The model recovers very quickly after a single night and underestimates accumulated debt; the screen says when this has been applied.' },

    { h: 'How your sleep is estimated' },
    { fig: 'sueno' },
    { p: 'Between two duties, the app assumes you sleep like this (base time):' },
    { li: ['You go to bed at 23:00. If you start early the next day, you go earlier to try for 8 hours, but no earlier than 21:30.', 'You get up at 07:00 (08:00 if you are not working the next day), or earlier if the report time demands it: 90 minutes before reporting at home and 60 in a hotel.', 'After a duty, you fall asleep 45 minutes after finishing at home and 30 in a hotel. The duty ends at the last on-blocks plus 20 minutes.', 'If you get back late, you sleep up to 8 hours but not past 11:00.', 'Sleep that starts in the daytime (after working a night) lasts 5 hours at most.', 'Episodes shorter than 60 minutes are not counted.'] },
    { p: 'These are average habits. If you sleep differently, the forecast drifts; that is what the pre-report check is for, and in a later phase the app will read the sleep from your watch.' },

    { h: 'Your sleep details' },
    { fig: 'datos' },
    { p: 'Those are the rules of an average pilot. With «Your sleep details» (the first time you open Fatigue, and any time after) you replace them with yours. There are six questions: the time from home to your base and the time to get ready (together they replace the 90 minutes), the time from the hotel to the airport (plus 30 minutes to get ready, it replaces the 60), and a block from the Munich ChronoType Questionnaire (MCTQ, Roenneberg et al. 2003): when you fall asleep and wake up without an alarm on a day off, and how long you sleep the night before an early duty.' },
    { p: 'That block gives two things. Your chronotype: the midpoint of your sleep on days off, corrected for recovery sleep as the MCTQ does (MSFsc = MSF − (SDf − SDweek)/2, with SDweek = (5·SDw + 2·SDf)/7); the peak of the circadian rhythm moves as much as your midpoint differs from an average pilot\'s, by at most an hour and a half. And how much sleep you need: the average of what you sleep on days off (with recovery) and before work (cut short). Both rules are the app\'s own criterion: the MCTQ is validated for measuring chronotype, but how much that moves this model is not calibrated. What comes selected is what the model assumes without your details; if you change nothing, it calculates as before.' },
    { p: 'ARIA measures, with traffic, the time from home to your base every time it gives you the briefing before a duty. The sheet shows what was measured next to your answer. When there are 3 or more measurements that agree (±10 min) and differ from your answer by 10 min or more, the screen offers to change it; it never changes it on its own, and if you say no it won’t ask again until the measurement moves another 10 min. It is stored only on this phone: the minutes, not your location.' },
    { h: 'What each number means' },
    { fig: 'numeros' },
    { li: ['Alertness (A): the model\'s result at the worst landing.', 'KSS: that same alertness on the Karolinska scale.', 'Last sleep: the most recent sleep episode before reporting (not the 24-hour total).', 'Awake: hours from getting up to the last landing.', '3-day debt: how far short of 24 hours of sleep you are in the 72 hours before reporting.', 'Window of circadian low (WOCL): 02:00 to 06:00 at your base, the bottom of the circadian rhythm.'] },
    { p: 'The reasons shown are: reporting before 05:00 or before 07:00, three early starts in a row, finishing after 23:00, touching the 02:00–06:00 window, less than 6 hours of last sleep, 4 or more sectors, 16 or more hours awake and 4 or more hours of debt.' },

    { h: 'The pre-report check' },
    { fig: 'check' },
    { p: 'The forecast is for an average person; the check is YOURS, for that day. It has two parts:' },
    { li: ['Karolinska Sleepiness Scale (KSS, Åkerstedt and Gillberg 1990): from 1 (very alert) to 9 (very sleepy, fighting to stay awake). It is the reference scale in aircrew fatigue studies.', 'PVT-B reaction test (Basner, Mollicone and Dinges 2011): the 3-minute version of the psychomotor vigilance test, validated against the 10-minute one. A light comes on at random every 2 to 5 seconds and you tap as fast as you can. A lapse is a reaction of 355 ms or more. Tapping before the light, or under 100 ms, is a false start.'] },
    { p: 'Your baseline is the median of your first three tests: do them on rested days. The app treats being 40 ms or more above your baseline, or having 3 or more lapses, as a sign of fatigue; those two criteria are the app\'s.' },
    { p: 'Important: a touchscreen adds its own delay, different on every phone. So what matters most is comparing yourself with yourself on the same device, not the absolute figures. Results are stored only on this phone.' },

    { h: 'The plan: measures to arrive more alert' },
    { fig: 'plan' },
    { p: 'The Plan tab suggests, for the chosen duty, what to do and when. There are two kinds of measure and the screen always tells them apart:' },
    { li: ['Calculated: the nap before reporting and controlled rest in the cockpit. They are sleep, and the same model knows how to add it: the app adds that sleep, recalculates and gives you the alertness at the most critical landing before and after. It also picks the best time by trying every possible one.', 'Guidance: caffeine, light, moving and eating. They are not part of the three-process model, so they come with their source and without an invented number.'] },
    { p: 'Nap before reporting: it is placed between 3 hours after you get up and the time you leave home (minus a 30-minute margin). Two are tried: 20 minutes, short enough not to reach deep sleep (in Brooks and Lack 2006, 10-minute naps were the most effective and a 30-minute nap made things worse at first because of the grogginess of waking), and 90 minutes, a full sleep cycle. The short one wins unless the long one is clearly better.' },
    { p: 'Controlled rest in the cockpit: 20 minutes in cruise, starting 25 minutes after take-off and ending at least 30 minutes before the start of the descent (assumed 30 minutes before landing), which is how long the grogginess of waking takes to go. Only on sectors of about two hours or more, and only if your company\'s operations manual (OM-A) allows it. The model shows why the timing matters: the same rest too close to landing takes away instead of adding. NASA\'s study of planned cockpit rest on long-haul flights found better performance and alertness at the end of the flight (Rosekind et al. 1994).' },
    { p: 'Caffeine: about an hour before the most critical landing, because it takes 20–30 minutes to work and so covers the descent. But never in the 6 hours before your next sleep: taken even 6 hours before bed, caffeine cuts sleep short (Drake et al. 2013). If the ideal time falls inside that cut-off, the app moves the coffee to the latest allowed time; between 6 and 4 hours before, it suggests tea, which has less caffeine; later, nothing. A coffee has about 80–100 mg and a tea about 30–50 mg; EFSA considers up to 200 mg at once and 400 mg a day safe for an adult (EFSA 2015).' },
    { p: 'Moving, light and food: getting up and walking for a few minutes at each turnaround, bright light at night and eating light help for a short time (15 to 30 minutes for moving) and do not replace sleep. After a night duty, it is best to sleep when you get back but for no more than about 5 hours, and to return to your normal schedule that same night.' },
    { p: 'If the forecast is high, the plan starts by saying so: tell the other pilot at the briefing and, if you do not feel fit, report it. No measure changes your limits or your duty to report.' },

    { h: 'Compared with commercial models' },
    { p: 'Airlines with a fatigue risk management system (FRMS) use commercial biomathematical models. With nuances, they all combine the same things: a sleep pressure that builds while awake and recovers with sleep, and a circadian rhythm.' },
    { li: ['SAFTE-FAST (Hursh et al. 2004): widely used in aviation and US defence. Commercial, licensed.', 'FAID (Dawson and Fletcher 2001): gives a fatigue score from the work schedule. Commercial.', 'BAM (Boeing Alertness Model) and other crew planning tools: commercial, tuned with each operator\'s data.', 'Three-Process Model (Åkerstedt and Folkard): published with its equations and coefficients, and validated with airline crews. This is the one the app uses.'] },
    { p: 'The three-process model is used because anyone can check its equations. The commercial ones are more complete (for example, adapting to time zones on long flights, or tuning with company data) but they are closed boxes. This section is NOT an FRMS and does not replace your company\'s.' },

    { h: 'Limits' },
    { li: ['It is an average-population model: «Your sleep details» brings it closer to your habits, but it does not know how you actually sleep each night.', 'It does not account for multi-time-zone jet lag or naps in flight or on the ground.', 'The debt rule, the level thresholds and the check criteria are the app\'s decisions, not published parts of the model.', 'It has not yet been compared with real fatigue reports from the company\'s pilots.', 'If you feel tired, that overrides any figure on the screen.'] },

    { h: 'References' },
    { ref: ES[ES.length - 1].ref.slice(0, -1).map(function (r) { return r.replace('y otros', 'et al.'); }).concat(['EASA, Regulation (EU) 965/2012 — ORO.FTL.105, ORO.FTL.120 (FRM). ICAO Doc 9966, Manual for the Oversight of Fatigue Management Approaches.']) }
  ];
  root.FatigaDoc = { es: ES, en: EN };
})(typeof window !== 'undefined' ? window : this);
