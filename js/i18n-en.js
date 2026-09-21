/* ════════ PilotOS · diccionario INGLÉS — Fase 1: login, Home y menús ════════
   Clave = el texto en español EXACTO como sale en pantalla (los espacios dan igual).
   Si cambias un texto en español, cambia también su clave aquí o volverá a salir en
   español en inglés (no rompe nada: sólo deja de traducirse).
   Lo que NO se traduce a propósito: códigos de roster (SROF, RVAC…), nómina/convenio,
   y lo que ya está en inglés técnico (METAR, OFP, Briefing, Report…).
   Motor y reglas: js/i18n.js */
(function(){
  if (typeof window.pilotosI18nAdd !== 'function') return;

  var MES = { ENE:'JAN', FEB:'FEB', MAR:'MAR', ABR:'APR', MAY:'MAY', JUN:'JUN',
              JUL:'JUL', AGO:'AUG', SEP:'SEP', OCT:'OCT', NOV:'NOV', DIC:'DEC' };
  var MESLARGO = { enero:'January', febrero:'February', marzo:'March', abril:'April', mayo:'May', junio:'June',
                   julio:'July', agosto:'August', septiembre:'September', octubre:'October', noviembre:'November', diciembre:'December' };
  var DIA = { lunes:'Monday', martes:'Tuesday', 'miércoles':'Wednesday', jueves:'Thursday', viernes:'Friday',
              'sábado':'Saturday', domingo:'Sunday' };
  var FUERZA = { flojo:'light', moderado:'moderate', fuerte:'strong' };
  var RUMBO = { 'del norte':'from the north', 'del noreste':'from the northeast', 'del este':'from the east',
                'del sureste':'from the southeast', 'del sur':'from the south', 'del suroeste':'from the southwest',
                'del oeste':'from the west', 'del noroeste':'from the northwest', 'variable':'variable' };
  var FENOMENO = { tormenta:'thunderstorm', nieve:'snow', lluvia:'rain', llovizna:'drizzle',
                   niebla:'fog', neblina:'mist' };

  window.pilotosI18nAdd('en', {
    // ── Tiempo relativo en minúscula (pastilla eCrews del roster: "↻ ahora") ──
    'ahora': 'now',
    // ── Selector de idioma ──
    'Idioma': 'Language',
    'Idioma de la app': 'App language',
    'Automático': 'Automatic',
    'Castellano': 'Spanish',

    // ── Login / registro ──
    'Iniciar sesión': 'Sign in',
    'Registro': 'Sign up',
    'Contraseña': 'Password',
    'piloto@aerolinea.com': 'pilot@airline.com',
    '¿Olvidaste tu contraseña?': 'Forgot your password?',
    'Aerolínea': 'Airline',
    'Flota': 'Fleet',
    'Entrar →': 'Sign in →',
    'Crear cuenta →': 'Create account →',
    'Comprobando servidor…': 'Checking server…',
    '✅ Servidor activo': '✅ Server online',
    '🔴 Servidor no responde (arrancando…)': '🔴 Server not responding (starting up…)',
    '🔴 No se puede conectar al servidor': "🔴 Can't connect to the server",
    'Escribe tu email arriba y vuelve a pulsar aquí.': 'Type your email above and tap here again.',
    'Enviando…': 'Sending…',
    'Si ese email tiene una cuenta, te llega un correo con el enlace. Mira también en spam.':
      "If that email has an account, you'll receive a message with the link. Check your spam folder too.",
    'No se ha podido contactar con el servidor. Inténtalo de nuevo.': "Couldn't reach the server. Please try again.",
    'Nueva contraseña (mínimo 8 caracteres)': 'New password (at least 8 characters)',
    'Nueva contraseña': 'New password',
    'Guardar contraseña →': 'Save password →',
    'Elige tu nueva contraseña.': 'Choose your new password.',
    'La contraseña debe tener al menos 8 caracteres.': 'Your password must be at least 8 characters long.',
    'Guardando…': 'Saving…',
    'No se ha podido cambiar la contraseña.': "Couldn't change the password.",
    '✅ Contraseña cambiada. Ya puedes entrar con la nueva.': '✅ Password changed. You can now sign in with the new one.',
    'Introduce email y contraseña para continuar.': 'Enter your email and password to continue.',
    'Conectando…': 'Connecting…',
    'Conectando con el servidor…': 'Connecting to the server…',
    'El servidor está arrancando…': 'The server is starting up…',
    'Casi listo, un momento…': 'Almost ready, one moment…',
    'Error al autenticar. Inténtalo de nuevo.': 'Sign-in error. Please try again.',
    '✅ Cuenta creada. Revisa tu email y confirma tu dirección antes de entrar.':
      '✅ Account created. Check your email and confirm your address before signing in.',
    'Error: no se recibió token de sesión. Inténtalo de nuevo.': 'Error: no session token received. Please try again.',
    'El servidor está tardando en arrancar. Espera 10 segundos y vuelve a pulsar Entrar.':
      'The server is taking a while to start. Wait 10 seconds and tap Sign in again.',

    // ── Panel del piloto / engranaje / menú de usuario ──
    'Piloto': 'Pilot',
    'Mi perfil': 'My profile',
    'Datos y configuracion': 'Details & settings',
    'Gestionar suscripcion': 'Manage subscription',
    'Gestionar suscripción': 'Manage subscription',
    'Tu plan actual': 'Your current plan',
    'Plan Beta (tester)': 'Beta plan (tester)',
    'Acceso de tester': 'Tester access',
    'Ver planes disponibles': 'See available plans',
    'Ver planes →': 'See plans →',
    'Guía de uso': 'User guide',
    'Aprende a sacarle el máximo': 'Get the most out of PilotOS',
    'Enviados': 'Sent',
    'Tus reportes y en qué van': 'Your reports and their status',
    'Cerrar sesion': 'Sign out',
    'Cerrar sesión': 'Sign out',
    'Salir de la cuenta': 'Leave your account',
    'Notificaciones': 'Notifications',
    'Sin alertas nuevas': 'No new alerts',
    'Mensajes': 'Messages',
    'Bandeja de entrada': 'Inbox',
    'Filtros': 'Filters',
    'Categorias del dashboard': 'Dashboard categories',
    'Modo Día': 'Day mode',
    'Modo Noche': 'Night mode',
    'Activar para mayor visibilidad': 'Turn on for better visibility',
    'Volver al modo oscuro': 'Back to dark mode',
    'Automático día/noche': 'Automatic day/night',
    'Sigue el orto y el ocaso': 'Follows sunrise and sunset',
    'Sigue el sol': 'Follows the sun',
    'Desactivado': 'Off',
    'lo eliges tú': 'you choose',
    'Sin ubicación': 'No location',
    'por hora local': 'by local time',
    '⚠️ Hay una nueva versión ·': '⚠️ New version available ·',
    'Actualizar': 'Update',
    'estable': 'stable',

    // ── Comunes (salen en muchas pantallas) ──
    'Cancelar': 'Cancel',
    'Alerta': 'Alert',

    // ── Barra inferior / avisos globales ──
    'Inicio': 'Home',
    '📡 Sin conexión': '📡 Offline',
    'App funcionando offline': 'App working offline',
    'Arrastra para actualizar': 'Pull to refresh',
    'Suelta para actualizar': 'Release to refresh',

    // ── Home: filtros y tarjetas ──
    'Sin datos del mes': 'No data this month',
    'Sin subir': 'Not uploaded',
    'Filtrar': 'Filter',
    'Todo': 'All',
    'Examen Oral': 'Oral Exam',
    'Herramientas': 'Tools',
    'Carrera': 'Career',
    'cargando…': 'loading…',
    'próximo servicio': 'next duty',
    'Personalizar paneles': 'Customise panels',
    'Vueling — próximos vuelos': 'Vueling — upcoming flights',
    'Próximos 3 vuelos': 'Next 3 flights',
    'Sin roster importado': 'No roster imported',
    'Sin vuelos próximos': 'No upcoming flights',
    'Ver roster completo': 'View full roster',
    'Preguntas sobre FCOM & FCTM': 'Questions about FCOM & FCTM',
    'Pregunta…': 'Ask…',
    'Preguntar a CAFI': 'Ask CAFI',
    'Acumulado del mes': 'Month to date',
    'Bruto devengado': 'Gross earned',
    'Ocultar/mostrar el importe': 'Hide/show amount',
    'Pronto': 'Soon',
    'Pre-servicio': 'Pre-duty',
    'BAJO': 'LOW',
    'Punto débil': 'Weak spot',
    'Licencias': 'Licences',
    'Simulador': 'Simulator',
    'Entrenamiento': 'Training',
    'Horas, ratings y upgrade': 'Hours, ratings & upgrade',
    'Progreso a Captain': 'Progress to Captain',
    'Registro EASA FCL.050': 'EASA FCL.050 record',

    // ── Home: próximo servicio / report ──
    'Hoy': 'Today',
    'Mañana': 'Tomorrow',
    'En 2 días': 'In 2 days',
    'Servicio': 'Duty',
    'Imaginaria': 'Standby',
    'Imaginaria en aeropuerto': 'Airport standby',
    'Evaluación': 'Assessment',
    'FIRMA AHORA': 'REPORT NOW',
    'EN SERVICIO': 'ON DUTY',
    'Quedan menos de 2 horas': 'Less than 2 hours to go',
    '¿Te preparo el briefing de audio de la jornada? Se descarga entero, así que luego suena en el coche aunque te quedes sin cobertura.':
      "Shall I prepare the audio briefing for your duty day? It downloads in full, so it will play in the car even if you lose coverage.",
    '▶ Generar briefing': '▶ Generate briefing',
    'Ahora no': 'Not now',

    // ── Home: hoja "Personalizar paneles" ──
    'Reordena con las flechas y muestra u oculta cada tarjeta.': 'Reorder with the arrows and show or hide each card.',
    'Oculto': 'Hidden',
    'Restablecer': 'Reset',
    'Guardar': 'Save',

    // ── Home: tarjeta Sky View (meteo del próximo vuelo) ──
    'Buen tiempo (VMC)': 'Good weather (VMC)',
    'Tiempo marginal (MVMC)': 'Marginal weather (MVMC)',
    'Condiciones IFR': 'IFR conditions',
    'IFR bajo (LIFR)': 'Low IFR (LIFR)',
    'viento en calma': 'calm wind',
    'cielo despejado': 'clear sky',
    'cielo cubierto': 'overcast',
    'muy nuboso': 'mostly cloudy',
    'nubes dispersas': 'scattered clouds',
    'algunas nubes': 'a few clouds'
  }, [
    // "14 AGO" → "14 AUG"
    [/^(\d{1,2}) (ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)$/, function(m){ return m[1] + ' ' + MES[m[2]]; }],
    // Cuenta atrás del report: "en 45m" · "en 3h 05m" · "en 2d 4h"
    [/^en (\d+)m$/, 'in $1m'],
    [/^en (\d+)h (\d+)m$/, 'in $1h $2m'],
    [/^en (\d+)d (\d+)h$/, 'in $1d $2h'],
    // Meses completos: "Septiembre" · "septiembre 2026" · "15 de septiembre" · "15 de septiembre de 2026"
    [/^(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?: (?:de )?(\d{4}))?$/i, function(m){
      var n = MESLARGO[m[1].toLowerCase()];
      if (m[1] === m[1].toUpperCase()) n = n.toUpperCase();
      return n + (m[2] ? ' ' + m[2] : '');
    }],
    [/^(\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?: de (\d{4}))?$/i, function(m){
      return m[1] + ' ' + MESLARGO[m[2].toLowerCase()] + (m[3] ? ' ' + m[3] : '');
    }],
    // "Miércoles, 16 de septiembre (de 2026)"
    [/^(lunes|martes|miércoles|jueves|viernes|sábado|domingo), (\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?: de (\d{4}))?$/i, function(m){
      return DIA[m[1].toLowerCase()] + ', ' + m[2] + ' ' + MESLARGO[m[3].toLowerCase()] + (m[4] ? ' ' + m[4] : '');
    }],
    [/^(lunes|martes|miércoles|jueves|viernes|sábado|domingo)$/i, function(m){
      var d = DIA[m[1].toLowerCase()];
      return m[1] === m[1].toUpperCase() ? d.toUpperCase() : d;
    }],
    // Cambios de programación (js/roster-changes.js): "cambia el nº de vuelo y el fin se retrasa 7h"
    [/^el (inicio|fin) se (adelanta|retrasa) (\S+)$/, function(m){
      return (m[1] === 'inicio' ? 'the start moves ' : 'the end moves ') + m[3] + (m[2] === 'adelanta' ? ' earlier' : ' later');
    }],
    [/^la jornada se corre (\S+) entre los dos extremos$/, 'the duty shifts $1 across both ends'],
    [/^cambia el nº de vuelo y (.+)$/, function(m, T){ return 'flight number changes and ' + T(m[1]); }],
    // SkyView: rótulos con dato variable
    [/^Fatiga (LOW|MODERATE|HIGH|SEVERE|BAJA|MODERADA|ALTA)$/, function(m){
      return 'Fatigue ' + ({ BAJA:'LOW', MODERADA:'MODERATE', ALTA:'HIGH' }[m[1]] || m[1]);
    }],
    [/^Perfil (.+)$/, 'Profile $1'],
    [/^VÁLIDO (.+)$/, 'VALID $1'],
    [/^Alternativos habituales de la ficha CCI de (\w+)\.$/, 'Usual alternates from the $1 CCI sheet.'],
    // Viento con rumbo cardinal español: "SO 31kt" → "SW 31kt"
    [/^(SO|O|NO) (\d+\s?kt)$/, function(m){ return ({ SO:'SW', O:'W', NO:'NW' }[m[1]]) + ' ' + m[2]; }],
    // Documentos: "Médico (sin datos)"
    [/^(.+) \(sin datos\)$/, function(m, T){ return T(m[1]) + ' (no data)'; }],
    [/^(.+) ✓$/, function(m, T){ var r = T(m[1]); return r === m[1] ? null : r + ' ✓'; }],
    // Roster: "Viendo Octubre 2026 — No es el mes actual"
    [/^Viendo (.+?) — No es el mes actual$/, function(m, T){ return 'Viewing ' + T(m[1]) + ' — not the current month'; }],
    // Pay Check: frases con el nombre del mes
    [/^\. Para la nómina de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre), importa$/i, function(m){
      return '. For the ' + MESLARGO[m[1].toLowerCase()] + ' payslip, import';
    }],
    [/^(?:Volver a i|I)mportar (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?: (\d{4}))? de PilotOS$/i, function(m){
      return (/^Volver/.test(m[0]) ? 'Re-import ' : 'Import ') + MESLARGO[m[1].toLowerCase()] + (m[2] ? ' ' + m[2] : '') + ' from PilotOS';
    }],
    // Meses abreviados en minúscula/capitalizados: "Ago", "Ago 2026", "15 ago"
    [/^(?:(\d{1,2}) )?(ene|abr|ago|dic)(?: (\d{2,4}))?$/i, function(m){
      var en = { ene:'jan', abr:'apr', ago:'aug', dic:'dec' }[m[2].toLowerCase()];
      if (m[2] === m[2].toUpperCase()) en = en.toUpperCase();
      else if (m[2][0] === m[2][0].toUpperCase()) en = en[0].toUpperCase() + en.slice(1);
      return (m[1] ? m[1] + ' ' : '') + en + (m[3] ? ' ' + m[3] : '');
    }],
    // "AGO 2026" · "01 JUN 2026"
    [/^(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC) (\d{4})$/, function(m){ return MES[m[1]] + ' ' + m[2]; }],
    [/^(\d{1,2}) (ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC) (\d{4})$/, function(m){ return m[1] + ' ' + MES[m[2]] + ' ' + m[3]; }],
    [/^Firmas a las (\d{1,2}:\d{2}) zulú$/, 'You report at $1 Zulu'],
    // Automático día/noche: "anochece 20:15"
    [/^anochece (\d{1,2}:\d{2})$/, 'sunset $1'],
    [/^amanece (\d{1,2}:\d{2})$/, 'sunrise $1'],
    // Meteo del Home
    [/^viento (flojo|moderado|fuerte) (.+)$/, function(m){ return FUERZA[m[1]] + ' wind ' + (RUMBO[m[2]] || m[2]); }],
    [/^(tormenta|nieve|lluvia|llovizna)(?: y (niebla|neblina))?$|^(niebla|neblina)$/, function(m){
      var a = m[1] || m[3], b = m[2];
      return FENOMENO[a] + (b ? ' and ' + FENOMENO[b] : '');
    }],
    [/^Viento (\S.*)$/, 'Wind $1'],
    // Login
    [/^⚠️ Servidor respondió con error (\d+)$/, '⚠️ Server responded with error $1'],
    [/^No se puede conectar con el servidor\. ¿Backend activo en (.+)\?$/, "Can't connect to the server. Is the backend running at $1?"]
  ]);
})();
