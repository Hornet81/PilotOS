// ============================================================
//  PilotOS — Módulo: Documentos (Pilot Wallet)
//  Rediseño: hero de cumplimiento + "¿Legal para volar?" +
//  grid 2 columnas con iconos SVG + ficha de detalle (bottom sheet).
//  MISMO almacenamiento (localStorage 'pilotos_docs', mismos ids)
//  → cero pérdida de datos.
//  Depende de globales de index.html: lsGet, showToast.
// ============================================================

// ── Catálogo de documentos ──────────────────────────────────
// required:true → cuenta para "¿Legal para volar?"
// renewLead → días de antelación recomendada para renovar
// col → color del icono/acento · icon → clave SVG (DOC_SVG)
const DOCS_META = {
  medical:    { name: 'Médico',        sub: 'Class 1',   icon: 'heartpulse', col: '#F43F5E', authority: 'AeMC / AME', required: true, renewLead: 45 },
  license:    { name: 'Licencia',      sub: 'ATPL/CPL',  icon: 'idcard', col: '#3B82F6', authority: 'AESA',          required: true, renewLead: 60 },
  typerating: { name: 'Habilitación',  sub: 'Type A320', icon: 'plane',  col: '#8B5CF6', authority: 'AESA / TRE',    required: true, renewLead: 60 },
  lang:       { name: 'Inglés',        sub: 'Nivel OACI',icon: 'globe',  col: '#0EA5E9', authority: 'AESA',          required: true, renewLead: 90 },
  passport:   { name: 'Pasaporte',     sub: '',          icon: 'passport', col: '#818CF8', authority: 'Min. Interior',              renewLead: 120 },
  company:    { name: 'T. Compañía',   sub: 'Vueling',   icon: 'companyid', col: '#10B981', authority: 'Vueling',                    renewLead: 30 },
};
const MAX_FILE_MB = 5;
let docsData = {};
try { docsData = JSON.parse(lsGet('pilotos_docs','{}')); } catch(e) {}

// ── Iconos SVG (line icons profesionales) ───────────────────
const DOC_SVG = {
  cross:  '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M12 8v8M8 12h8"/>',
  idcard: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M14 10h4M14 13.5h4M6.2 16c.5-1.4 5.1-1.4 5.6 0"/>',
  plane:  '<path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>',
  globe:  '<circle cx="12" cy="12" r="9.5"/><path d="M2.5 12h19"/><path d="M12 2.5c2.6 2.7 3.9 5.9 3.9 9.5S14.6 18.8 12 21.5C9.4 18.8 8.1 15.6 8.1 12S9.4 5.2 12 2.5z"/>',
  book:   '<path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H19v20H7.5A2.5 2.5 0 0 1 5 19.5z"/><path d="M5 17.5h14"/><circle cx="12" cy="8.5" r="2.3"/>',
  badge:  '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 3v1.6h6V3"/><circle cx="12" cy="10" r="2.2"/><path d="M8.4 16.2c.7-1.7 6.5-1.7 7.2 0"/>',
  // Pasaporte (SVG del usuario, viewBox 500x500) — se pinta con degradado en docIcon
  passport: '<path d="M335.1,83.76c-4.05-3.48-9.4-5-14.68-4.19l-165.92,17.38h186.94c-.19-5.09-2.46-9.87-6.34-13.19Z"/><path d="M349.01,105.95h-198.02c-1.2,0-2.37.12-3.5.34-.11.02-.22.04-.32.07-.52.11-1.03.24-1.54.4-.03,0-.07.02-.1.03-6.24,1.96-11.05,7.18-12.41,13.66,0,.05-.02.09-.03.14-.1.51-.18,1.03-.24,1.56,0,.09-.03.17-.03.26-.06.6-.09,1.21-.09,1.82v278.15c0,10.08,8.2,18.27,18.27,18.27h198.02c10.08,0,18.27-8.2,18.27-18.27V124.22c0-10.08-8.2-18.27-18.27-18.27ZM305.06,176.25c-6.58,3.56-13.72,6.45-21.23,8.62-5.56-15.02-13.33-26.08-19.69-33.36,16.37,3.32,30.71,12.27,40.92,24.74ZM303.2,268.35c-10.05,11.33-23.66,19.45-39.06,22.57,5.96-6.82,13.16-16.95,18.62-30.55,7.17,2,14.02,4.67,20.44,7.98ZM255.17,157.05c5.66,6.27,13.09,16.33,18.48,30.28-6.03,1.18-12.22,1.9-18.48,2.16v-32.45ZM255.17,199.85c7.36-.28,14.65-1.17,21.73-2.63,1.57,5.75,2.74,12.02,3.34,18.83h-25.06v-16.2ZM255.17,226.38h25.06c-.7,7.97-2.21,15.22-4.21,21.76-6.77-1.33-13.74-2.14-20.85-2.4v-19.36ZM255.17,256.09c5.88.24,11.65.87,17.27,1.9-5.25,12.4-12.02,21.49-17.27,27.34v-29.24ZM227.56,257.99c5.62-1.03,11.39-1.66,17.27-1.9v29.23c-5.25-5.84-12.02-14.94-17.27-27.33ZM235.86,290.92c-15.4-3.12-29-11.24-39.06-22.57,6.42-3.31,13.27-5.98,20.44-7.98,5.46,13.6,12.66,23.73,18.62,30.55ZM223.98,248.14c-2-6.54-3.51-13.78-4.21-21.76h25.06v19.36c-7.11.26-14.08,1.07-20.85,2.4ZM219.77,216.05c.6-6.8,1.78-13.07,3.35-18.82,7.07,1.45,14.35,2.34,21.71,2.62v16.2h-25.06ZM226.38,187.34c5.38-13.89,12.79-23.95,18.45-30.24v32.39c-6.25-.26-12.43-.98-18.45-2.16ZM235.86,151.51c-6.36,7.28-14.14,18.34-19.69,33.36-7.51-2.17-14.65-5.06-21.23-8.62,10.2-12.47,24.55-21.43,40.92-24.74ZM188.96,184.76c7.44,4.13,15.55,7.47,24.08,9.95-1.74,6.5-3.04,13.6-3.66,21.33h-30.29c.82-11.37,4.31-22.01,9.87-31.28ZM209.38,226.38c.71,8.88,2.31,16.93,4.47,24.2-8.23,2.34-16.08,5.49-23.41,9.43-6.41-9.81-10.46-21.29-11.35-33.63h30.29ZM316.42,377.14h-132.83c-2.49,0-4.5-2.01-4.5-4.5s2.01-4.5,4.5-4.5h132.83c2.49,0,4.5,2.01,4.5,4.5s-2.01,4.5-4.5,4.5ZM316.42,344.63h-132.83c-2.49,0-4.5-2.01-4.5-4.5s2.01-4.5,4.5-4.5h132.83c2.49,0,4.5,2.01,4.5,4.5s-2.01,4.5-4.5,4.5ZM309.56,260.01c-7.33-3.94-15.18-7.09-23.41-9.43,2.16-7.27,3.77-15.32,4.47-24.2h30.29c-.89,12.34-4.94,23.82-11.35,33.63ZM290.62,216.05c-.61-7.73-1.91-14.83-3.66-21.33,8.53-2.49,16.63-5.82,24.08-9.95,5.56,9.27,9.05,19.91,9.87,31.28h-30.29Z"/>',
  // Tarjeta de compañía / credencial con lanyard (SVG del usuario, viewBox 612x792)
  companyid: '<path d="M191.08,380.57c-61.91,0-112.28,51.02-112.28,113.74s50.37,113.74,112.28,113.74,112.29-51.02,112.29-113.74-50.37-113.74-112.29-113.74ZM191.08,600.64c-57.88,0-104.98-47.7-104.98-106.34s47.09-106.34,104.98-106.34,104.98,47.7,104.98,106.34-47.09,106.34-104.98,106.34Z"/><path d="M188.22,492.81c23.52,0,42.66-19.38,42.66-43.22s-19.14-43.23-42.66-43.23-42.67,19.4-42.67,43.23,19.14,43.22,42.67,43.22ZM188.22,413.77c19.5,0,35.36,16.07,35.36,35.83s-15.86,35.82-35.36,35.82-35.37-16.07-35.37-35.82,15.87-35.83,35.37-35.83Z"/><path d="M220.96,492.51c-1.18-.72-2.66-.66-3.82.09-15.49,10.2-37.46,10.87-54.21,1.1-1.18-.69-2.62-.66-3.78.09-16.9,10.9-27,29.56-27,49.88,0,4.93.56,9.58,1.67,13.82.17.64.51,1.23.98,1.69,15.03,14.87,35.01,23.05,56.28,23.05s41.17-8.22,56.28-23.17c.47-.46.81-1.06.98-1.69,1.11-4.23,1.68-8.85,1.68-13.7,0-21.03-11.13-40.63-29.04-51.15ZM241.52,554.47c-13.64,13.14-31.51,20.35-50.44,20.35s-36.87-7.17-50.43-20.22c-.78-3.37-1.18-7.04-1.18-10.94,0-17.06,8.13-32.77,21.83-42.44,18.06,9.6,40.94,8.96,57.85-1.19,14.58,9.44,23.56,25.96,23.56,43.62,0,3.84-.4,7.47-1.18,10.81Z"/><path d="M546.07,295.98h-190.35l135.3-131.28c1.08-1.04,1.42-2.64.86-4.05s-1.9-2.33-3.39-2.33h-52.45c-.92,0-1.81.35-2.48.98l-134.85,126.42-124.69-126.32c-.68-.69-1.61-1.08-2.58-1.08h-52.46c-1.48,0-2.8.9-3.37,2.28-.56,1.37-.26,2.96.78,4.03l128.95,131.34H66.67c-17,0-30.83,14.01-30.83,31.22v274.99c0,17.23,13.83,31.23,30.83,31.23h479.4c17,0,30.84-14.01,30.84-31.23v-274.99c0-17.21-13.83-31.22-30.84-31.22ZM437.49,165.73h41.92l-134.25,130.26h-36.32l-4.95-5.02,133.6-125.24ZM169.93,165.73l134.81,136.57h0s19.48,19.73,19.48,19.73h-42.99l-24.51-24.96h0L127.77,165.73h42.16ZM569.6,602.2c0,13.14-10.55,23.83-23.53,23.83H66.67c-12.97,0-23.52-10.7-23.52-23.83v-274.99c0-13.14,10.55-23.82,23.52-23.82h185.94l18.31,18.65h-21.6c-2.02,0-3.65,1.66-3.65,3.7s1.63,3.7,3.65,3.7h114.11c2.02,0,3.65-1.66,3.65-3.7s-1.63-3.7-3.65-3.7h-29.39l-1.11-1.56c-.07-.11-.2-.16-.29-.25-.05-.06-.04-.15-.1-.21l-16.41-16.62h229.93c12.98,0,23.53,10.68,23.53,23.82v274.99Z"/><path d="M513.64,420.24c0-2.04-1.63-3.7-3.65-3.7h-81.63c-2.02,0-3.65,1.66-3.65,3.7s1.63,3.7,3.65,3.7h81.63c2.02,0,3.65-1.66,3.65-3.7Z"/><path d="M332.11,423.94h62.73c2.02,0,3.65-1.66,3.65-3.7s-1.63-3.7-3.65-3.7h-62.73c-2.02,0-3.65,1.66-3.65,3.7s1.63,3.7,3.65,3.7Z"/><path d="M524.6,445.9h-20.96c-2.02,0-3.65,1.66-3.65,3.7s1.63,3.7,3.65,3.7h20.96c2.02,0,3.65-1.66,3.65-3.7s-1.63-3.7-3.65-3.7Z"/><path d="M448.37,445.9c-2.02,0-3.65,1.66-3.65,3.7s1.63,3.7,3.65,3.7h27.32c2.02,0,3.65-1.66,3.65-3.7s-1.63-3.7-3.65-3.7h-27.32Z"/><path d="M332.11,453.3h62.73c2.02,0,3.65-1.66,3.65-3.7s-1.63-3.7-3.65-3.7h-62.73c-2.02,0-3.65,1.66-3.65,3.7s1.63,3.7,3.65,3.7Z"/><path d="M496.49,475.24h-164.38c-2.02,0-3.65,1.66-3.65,3.7s1.63,3.7,3.65,3.7h164.38c2.02,0,3.65-1.66,3.65-3.7s-1.63-3.7-3.65-3.7Z"/><path d="M402.63,504.59h-70.52c-2.02,0-3.65,1.66-3.65,3.7s1.63,3.7,3.65,3.7h70.52c2.02,0,3.65-1.66,3.65-3.7s-1.63-3.7-3.65-3.7Z"/><path d="M532,399.66h-199.79c-2.07,0-3.75-1.67-3.75-3.78s1.68-3.78,3.75-3.78h199.79c2.07,0,3.75,1.67,3.75,3.78s-1.68,3.78-3.75,3.78Z"/>',
  // Corazón + pulso (SVG del usuario, viewBox 612x792) — se pinta con degradado en docIcon
  heartpulse: 'M514,237.07c-27.27-27.27-63.24-42.12-101.34-41.84-39.72.3-78.54,17.05-112.83,48.58-33.53-30.71-71.64-46.87-110.81-46.87-.14,0-.28,0-.41,0-37.67.11-73.42,15.17-100.66,42.41-27.24,27.24-42.3,62.99-42.41,100.66-.06,20.69,4.4,41.1,13.13,60.69h140.73l44.4-95.87s.04-.08.06-.12c.11-.22.22-.44.34-.65.09-.16.18-.33.27-.49.11-.18.23-.34.34-.51.12-.18.24-.37.37-.55.1-.13.21-.26.32-.39.16-.19.31-.39.48-.58.11-.12.24-.24.36-.36.17-.17.34-.35.52-.51.17-.15.35-.29.52-.43.14-.12.28-.24.43-.35.22-.16.45-.31.69-.46.11-.07.22-.15.34-.22.23-.14.48-.26.72-.39.13-.07.25-.14.39-.2.21-.1.43-.19.65-.28.18-.07.35-.15.53-.21.19-.07.38-.12.57-.18.22-.07.45-.14.67-.2.05-.01.09-.03.14-.04.13-.03.27-.05.4-.07.24-.05.47-.1.71-.13.2-.03.39-.05.59-.07.22-.02.44-.04.66-.05.21,0,.42-.01.63,0,.21,0,.42,0,.63.01.21.01.43.03.64.05.2.02.41.04.61.07.22.03.43.07.64.12.2.04.4.08.6.13.22.06.43.12.64.19.19.06.38.12.57.18.22.08.43.17.64.26.13.06.27.1.41.16.05.02.09.05.14.07.19.09.38.19.56.3.2.11.39.21.58.32.14.08.26.17.4.26.22.15.45.29.66.45.08.06.16.13.24.19.25.2.5.4.73.61.06.05.11.11.17.17.24.23.48.46.7.71.09.1.17.21.25.31.18.21.36.42.52.64.12.17.23.35.35.52.11.17.23.33.33.51.12.2.22.41.33.61.09.16.18.32.26.49.09.19.17.39.25.59.08.2.17.39.24.59.06.17.11.35.17.53.07.23.15.47.21.71.01.05.03.09.04.14l34.92,147.81,33.08-97.32c.04-.12.1-.24.14-.36.09-.23.17-.47.28-.69.08-.18.17-.36.26-.54.1-.19.19-.39.3-.58.11-.19.22-.37.33-.55.11-.17.22-.34.33-.51.12-.18.25-.35.38-.51.13-.16.26-.33.39-.49.13-.15.27-.3.4-.45.15-.16.31-.32.47-.48.13-.13.27-.25.41-.37.18-.16.36-.31.54-.45.14-.11.29-.22.44-.32.19-.14.38-.27.58-.4.16-.1.33-.2.5-.3.19-.11.38-.22.58-.32.2-.1.4-.19.6-.28.14-.06.27-.13.41-.19.05-.02.1-.03.14-.05.22-.09.45-.16.67-.23.18-.06.36-.13.55-.18.21-.06.42-.1.63-.15.2-.05.41-.1.61-.13.19-.03.38-.05.57-.08.23-.03.46-.07.68-.08.17-.01.35-.01.52-.02.25,0,.49-.02.74-.02.16,0,.32.02.49.03.26.02.52.03.77.06.15.02.3.05.46.07.27.04.54.08.8.14.14.03.29.08.43.11.27.07.54.14.8.23.04.01.08.02.12.03.12.04.23.09.34.14.24.09.48.18.72.28.18.08.35.17.52.25.2.1.4.2.59.31.19.11.37.22.55.33.17.11.34.22.51.33.18.13.35.26.53.39.16.12.32.25.47.38.16.14.32.28.47.43.15.14.3.29.45.44.14.15.27.3.41.45.14.16.28.33.42.5.13.16.24.32.36.49.12.17.25.35.36.53.12.19.23.38.34.57.1.17.19.34.28.51.12.23.22.46.32.69.05.12.11.22.16.34l17.68,43.63h84.05c7.11,0,12.88,5.77,12.88,12.88s-5.77,12.88-12.88,12.88h-92.65s-.04,0-.07,0c-.04,0-.08,0-.12,0-.53,0-1.05-.05-1.56-.12-.15-.02-.29-.04-.43-.07-.53-.09-1.05-.2-1.55-.35-.03,0-.05-.01-.08-.02-.55-.17-1.09-.38-1.6-.62-.1-.05-.2-.09-.3-.14-.47-.23-.93-.48-1.36-.76-.05-.03-.1-.06-.15-.09-.45-.3-.88-.64-1.29-1-.12-.1-.24-.21-.35-.32-.37-.34-.72-.7-1.04-1.09-.05-.06-.1-.11-.15-.17-.35-.42-.66-.88-.95-1.34-.07-.11-.14-.22-.2-.33-.3-.51-.57-1.04-.79-1.59,0-.01-.01-.02-.02-.03l-7.94-19.6-36.37,107c-.02.06-.05.12-.07.19-.06.16-.12.33-.19.49-.09.21-.18.42-.27.63-.06.13-.12.26-.19.39-.13.26-.27.51-.42.76-.04.07-.08.15-.13.22-.41.66-.88,1.28-1.4,1.85-.07.08-.14.15-.22.22-.19.2-.38.39-.58.57-.1.1-.21.19-.32.28-.18.16-.36.3-.55.45-.12.09-.24.19-.36.28-.25.18-.51.35-.78.51-.15.09-.31.18-.46.27-.22.12-.44.24-.66.35-.14.07-.28.13-.42.19-.23.1-.47.2-.71.29-.12.04-.24.09-.36.13-.8.27-1.64.46-2.49.57-.09.01-.18.02-.27.03-.44.05-.89.08-1.33.08,0,0,0,0,0,0h0s-.08,0-.13,0c-.31,0-.61-.01-.92-.04-.22-.02-.44-.05-.66-.08-.13-.02-.25-.03-.38-.05-.27-.05-.55-.11-.82-.17-.07-.02-.14-.03-.22-.05-.3-.08-.59-.16-.89-.26-.04-.01-.09-.02-.13-.04,0,0,0,0-.01,0-.39-.13-.77-.29-1.15-.46-.1-.05-.2-.1-.3-.15-.25-.12-.49-.24-.73-.38-.15-.08-.29-.17-.44-.26-.18-.11-.37-.23-.54-.36-.15-.1-.3-.21-.44-.32-.17-.13-.34-.27-.51-.41-.13-.11-.26-.21-.38-.33-.22-.2-.44-.41-.64-.63-.05-.06-.11-.11-.17-.17-.27-.29-.52-.6-.76-.91-.03-.05-.06-.09-.1-.14-.2-.27-.39-.55-.57-.84-.05-.08-.1-.16-.14-.25-.15-.25-.3-.51-.43-.78-.06-.11-.11-.22-.16-.33-.11-.24-.22-.48-.31-.72-.06-.14-.11-.29-.16-.43-.08-.21-.14-.43-.21-.64-.05-.18-.11-.36-.15-.54-.02-.07-.04-.13-.06-.2l-36.66-155.17-32.2,69.54c-.03.06-.06.11-.09.16-.23.47-.48.93-.76,1.36-.04.06-.08.13-.12.19-.3.44-.62.86-.97,1.27-.11.12-.22.24-.33.36-.29.31-.6.61-.92.9-.09.08-.17.16-.26.23-.4.34-.83.64-1.27.93-.11.07-.22.13-.33.2-.4.24-.81.46-1.24.66-.07.03-.14.07-.22.1-.5.22-1.02.41-1.55.57-.08.02-.17.04-.25.07-.44.12-.88.21-1.33.29-.15.02-.29.05-.44.07-.49.06-.98.1-1.49.11-.04,0-.09,0-.13,0-.02,0-.04,0-.06,0H72.9c7.39,11.09,16.22,21.82,26.48,32.07l193.17,193.17c2.01,2.01,4.65,3.02,7.28,3.02s5.27-1.01,7.28-3.02l193.17-193.17c36.03-36.03,55.24-77.56,55.56-120.11.28-38.08-14.58-74.07-41.84-101.34Z',
};
function docIcon(id, size) {
  const m = DOCS_META[id]; const s = size || 20;
  if (m.icon === 'heartpulse') {
    const gid = 'medg' + s;
    return '<svg class="doc-heart" width="' + s + '" height="' + s + '" viewBox="18 178 576 452" style="overflow:visible;filter:drop-shadow(0 0 4px rgba(244,63,94,.6))">'
      + '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="1" y2="1">'
      + '<stop offset="0" stop-color="#FF8FA8"/><stop offset="0.5" stop-color="#F43F5E"/><stop offset="1" stop-color="#C81E4E"/>'
      + '</linearGradient></defs>'
      + '<path fill="url(#' + gid + ')" d="' + DOC_SVG.heartpulse + '"/></svg>';
  }
  if (m.icon === 'passport') {
    const gid = 'passg' + s;
    return '<svg class="doc-pass" width="' + s + '" height="' + s + '" viewBox="120 64 260 372" style="overflow:visible;filter:drop-shadow(0 0 6px rgba(129,140,248,.75))">'
      + '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="1" y2="1">'
      + '<stop offset="0" stop-color="#C7D2FE"/><stop offset="0.5" stop-color="#818CF8"/><stop offset="1" stop-color="#3730A3"/>'
      + '</linearGradient></defs>'
      + '<g fill="url(#' + gid + ')">' + DOC_SVG.passport + '</g></svg>';
  }
  if (m.icon === 'companyid') {
    const gid = 'cidg' + s;
    return '<svg class="doc-id" width="' + s + '" height="' + s + '" viewBox="28 150 560 500" style="overflow:visible;filter:drop-shadow(0 0 4px rgba(16,185,129,.5))">'
      + '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="1" y2="1">'
      + '<stop offset="0" stop-color="#34D399"/><stop offset="0.5" stop-color="#10B981"/><stop offset="1" stop-color="#047857"/>'
      + '</linearGradient></defs>'
      + '<g fill="url(#' + gid + ')">' + DOC_SVG.companyid + '</g></svg>';
  }
  const isFill = (m.icon === 'plane');
  return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="' + (isFill ? 'currentColor' : 'none') + '" stroke="' + (isFill ? 'none' : 'currentColor') + '" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + DOC_SVG[m.icon] + '</svg>';
}
function docIconBox(id, sz, iconSz) {
  const m = DOCS_META[id];
  const custom = (m.icon === 'heartpulse' || m.icon === 'passport' || m.icon === 'companyid');
  const beat = (m.icon === 'heartpulse') ? ' doc-ic-beat' : '';
  const extra = custom ? ';box-shadow:0 0 14px ' + m.col + '3a,inset 0 0 0 1px ' + m.col + '30' : '';
  return '<div class="doc-ic' + beat + '" style="width:' + sz + 'px;height:' + sz + 'px;border-radius:' + Math.round(sz * .28) + 'px;color:' + m.col + ';background:' + m.col + '22;border-color:' + m.col + '40' + extra + '">' + docIcon(id, iconSz) + '</div>';
}
function docRing(state) {
  const col = state === 'exp' ? '#EF4444' : (state === 'warn' ? '#F59E0B' : (state === 'empty' ? '#94A3B8' : '#22C55E'));
  const ic  = state === 'exp' ? '✕' : (state === 'warn' ? '!' : (state === 'empty' ? '+' : '✓'));
  return '<span class="doc-ring" style="border-color:' + col + ';color:' + col + '">' + ic + '</span>';
}
const PILL_LABEL = { ok:'Vigente', warn:'Caduca pronto', exp:'Caducado', empty:'Sin documento' };

// ── Estado de un documento ──────────────────────────────────
function docStatus(id) {
  const d = docsData[id];
  const meta = DOCS_META[id] || {};
  if (!d || (!d.fileName && !d.expiry && !d.issued)) return { state:'empty', days:null, expStr:null };
  if (!d.expiry) return { state:'ok', days:null, expStr:null, noExpiry:true };
  const today = new Date(); today.setHours(0,0,0,0);
  const exp = new Date(d.expiry);
  const days = Math.floor((exp - today) / 86400000);
  const expStr = exp.toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'numeric'});
  if (days < 0)  return { state:'exp',  days, expStr };
  if (days <= 90) return { state:'warn', days, expStr, renew: !!(meta.renewLead && days <= meta.renewLead) };
  return { state:'ok', days, expStr };
}
// Texto largo de estado (ficha)
function docStatusLabel(id) {
  const s = docStatus(id);
  if (s.state === 'empty') return 'Sin documento';
  if (s.noExpiry) return 'Subido · sin caducidad';
  if (s.state === 'exp') return 'CADUCADO · ' + s.expStr;
  if (s.state === 'warn') return 'Caduca en ' + s.days + 'd' + (s.renew ? ' · toca renovar' : '') + ' · ' + s.expStr;
  return 'Válido · ' + s.expStr;
}

// ── ¿Legal para volar? (según documentos) ───────────────────
function docLegalToFly() {
  const req = Object.keys(DOCS_META).filter(id => DOCS_META[id].required);
  let state = 'ok'; const probs = [];
  req.forEach(id => {
    const s = docStatus(id);
    if (s.state === 'empty') { probs.push(DOCS_META[id].name + ' (sin datos)'); if (state === 'ok') state = 'warn'; }
    else if (s.state === 'exp') { probs.push(DOCS_META[id].name + ' caducado'); state = 'bad'; }
    else if (s.state === 'warn' && s.days != null && s.days <= 30) { probs.push(DOCS_META[id].name + ' ' + s.days + 'd'); if (state !== 'bad') state = 'warn'; }
  });
  return { state, probs };
}

// ── Render: hero de cumplimiento ─────────────────────────────
function renderHero() {
  const host = document.getElementById('docs-hero');
  if (!host) return;
  const ids = Object.keys(DOCS_META);
  let tracked = 0, valid = 0, next = null;
  ids.forEach(id => {
    const s = docStatus(id);
    if (s.state !== 'empty') { tracked++; if (s.state !== 'exp') valid++; }
    if (s.days != null && s.days >= 0) { if (!next || s.days < next.days) next = { id, days:s.days }; }
  });
  const pct = tracked ? Math.round(valid / tracked * 100) : 0;
  const ringCol = tracked === 0 ? '#64748B' : (pct >= 80 ? '#22C55E' : (pct >= 50 ? '#F59E0B' : '#EF4444'));
  const circ = 2 * Math.PI * 25;
  const off = circ * (1 - (tracked ? pct : 0) / 100);
  const subTxt = tracked === 0 ? 'Añade tus documentos para empezar' : (valid + ' de ' + tracked + ' vigentes · ' + ids.length + ' tipos');
  let nextHtml = '';
  if (next) {
    const nc = next.days <= 30 ? '#EF4444' : (next.days <= 90 ? '#F97316' : '#22C55E');
    nextHtml = '<div class="dw-hero-next" onclick="openDocSheet(\'' + next.id + '\')">'
      + '<div class="dw-hero-next-lbl">PRÓXIMA</div>'
      + '<div class="dw-hero-next-days" style="color:' + nc + '">' + next.days + ' d</div>'
      + '<div class="dw-hero-next-name">' + DOCS_META[next.id].name + '</div></div>';
  }
  host.innerHTML =
    '<div class="dw-hero">'
    + '<div class="dw-hero-ring">'
      + '<svg width="66" height="66"><circle cx="33" cy="33" r="25" fill="none" stroke="rgba(120,140,170,.18)" stroke-width="5"/>'
      + '<circle cx="33" cy="33" r="25" fill="none" stroke="' + ringCol + '" stroke-width="5" stroke-linecap="round" stroke-dasharray="' + circ.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '" style="transition:stroke-dashoffset 1.1s ease .1s"/></svg>'
      + '<span class="dw-ring-ico">🛡️</span>'
    + '</div>'
    + '<div class="dw-hero-main">'
      + '<div class="dw-hero-eyebrow">ESTADO GENERAL</div>'
      + '<div class="dw-hero-pct">' + (tracked ? pct + '%' : '—') + (tracked ? ' <span style="font-size:12px;font-weight:600;color:' + ringCol + '">compliant</span>' : '') + '</div>'
      + '<div class="dw-hero-sub">' + subTxt + '</div>'
    + '</div>'
    + nextHtml
    + '</div>';
}

// ── Render: banner "¿Legal para volar?" ─────────────────────
function renderLegal() {
  const host = document.getElementById('docs-legal');
  if (!host) return;
  const { state, probs } = docLegalToFly();
  const map = {
    ok:   { ico:'🛫', title:'Legal para volar hoy',   sub:'Médico, licencia, habilitación e inglés vigentes' },
    warn: { ico:'⚠️', title:'Atención antes de volar', sub: probs.join(' · ') },
    bad:  { ico:'⛔', title:'Revisa antes de volar',   sub: probs.join(' · ') },
  };
  const m = map[state];
  host.innerHTML =
    '<div class="dw-legal ' + state + '">'
    + '<span class="dw-legal-ico">' + m.ico + '</span>'
    + '<div class="dw-legal-main"><div class="dw-legal-title">' + m.title + '</div>'
    + '<div class="dw-legal-sub">' + m.sub + '</div></div>'
    + '<span class="dw-legal-tag">SEGÚN DOCS</span>'
    + '</div>';
}

// ── Render: tiles (grid 2 columnas) ─────────────────────────
function renderGrid() {
  const grid = document.getElementById('doc-grid');
  if (!grid) return;
  let html = '';
  Object.keys(DOCS_META).forEach(id => {
    const m = DOCS_META[id];
    const s = docStatus(id);
    let foot;
    if (s.state === 'empty') foot = '<span>Toca para añadir</span>';
    else if (s.noExpiry) foot = '<span>Subido</span><b>Permanente</b>';
    else {
      const fc = s.days < 0 ? '#F87171' : (s.days <= 90 ? '#F59E0B' : '#4ADE80');
      foot = '<span>' + s.expStr + '</span><b style="color:' + fc + '">' + (s.days < 0 ? '!' : s.days + 'd') + '</b>';
    }
    html +=
      '<div class="doc-tile" onclick="openDocSheet(\'' + id + '\')">'
      + '<div class="doc-tile-top">' + docIconBox(id, 48, 24) + docRing(s.state) + '</div>'
      + '<div class="doc-tile-name">' + m.name + '</div>'
      + '<div class="doc-tile-sub">' + (m.sub || '&nbsp;') + '</div>'
      + '<div class="doc-tile-pill ' + s.state + '">' + PILL_LABEL[s.state] + '</div>'
      + '<div class="doc-tile-foot">' + foot + '</div>'
      + '</div>';
  });
  grid.innerHTML = html;
}

// ── Render: tira de estado superior ─────────────────────────
function renderDocsStrip() {
  const strip = document.getElementById('docs-strip');
  if (!strip) return;
  let items = '';
  Object.keys(DOCS_META).forEach(id => {
    const meta = DOCS_META[id];
    const s = docStatus(id);
    if (s.state === 'empty') { items += '<div class="dss-item dss-empty"><span class="dss-dot"></span>' + meta.name + '</div>'; return; }
    if (s.state === 'exp')   { items += '<div class="dss-item dss-exp"><span class="dss-dot"></span>⚠ ' + meta.name + '</div>'; return; }
    if (s.state === 'warn')  { items += '<div class="dss-item dss-warn"><span class="dss-dot"></span>' + meta.name + ' · ' + s.days + 'd</div>'; return; }
    items += '<div class="dss-item dss-ok"><span class="dss-dot"></span>' + meta.name + ' ✓</div>';
  });
  strip.innerHTML = items;
}

// ── Render completo del wallet ──────────────────────────────
function renderWallet() {
  const grid = document.getElementById('doc-grid');
  if (!grid) return;
  renderHero();
  renderLegal();
  renderGrid();
  renderDocsStrip();
}
function renderDocStatus() { renderWallet(); }
function toggleDocPreview(id) { openDocSheet(id); }

// ── Ficha de detalle (bottom sheet) ─────────────────────────
function openDocSheet(id) {
  const ov = document.getElementById('doc-sheet');
  if (!ov) return;
  const m = DOCS_META[id];
  const d = docsData[id] || {};
  const s = docStatus(id);
  const pillCol = { ok:'#22C55E', warn:'#F59E0B', exp:'#EF4444', empty:'#94A3B8' }[s.state];
  const badge = '<span class="doc-tile-pill ' + s.state + '">' + PILL_LABEL[s.state] + '</span>'
    + (s.days != null && s.days >= 0 ? '<span style="font-size:12px;font-weight:600;color:' + pillCol + '">' + s.days + ' días restantes</span>' : '');
  // Filas de datos
  let rows = '<div class="doc-sheet-row"><span class="k">Autoridad emisora</span><span class="v">' + m.authority + '</span></div>';
  rows += '<div class="doc-sheet-row"><span class="k">Caducidad</span><span class="v">' + (d.expiry ? s.expStr : (s.state === 'empty' ? '—' : 'Permanente')) + '</span></div>';
  if (s.days != null && s.days >= 0) rows += '<div class="doc-sheet-row"><span class="k">Días restantes</span><span class="v">' + s.days + ' días</span></div>';
  if (d.fileName) rows += '<div class="doc-sheet-row"><span class="k">Archivo</span><span class="v">' + (d.fileType === 'application/pdf' ? 'PDF' : 'JPEG') + ' · ' + (d.fileSize || '') + '</span></div>';
  // Preview imagen
  const showImg = d.fileData && d.fileType && d.fileType.indexOf('image/') === 0;
  const imgWrap = '<div id="doc-' + id + '-img-wrap"' + (showImg ? '' : ' style="display:none"') + '><img id="doc-' + id + '-img" src="' + (showImg ? d.fileData : '') + '" alt="" class="doc-preview-img"></div>';
  // Descarga offline
  const dl = d.fileData
    ? '<a class="doc-download-btn" style="width:48px;height:46px" href="' + d.fileData + '" download="' + m.name + '_offline' + (d.fileType === 'application/pdf' ? '.pdf' : '.jpg') + '" title="Descargar offline">💾</a>'
    : '';
  ov.innerHTML =
    '<div class="doc-sheet" onclick="event.stopPropagation()">'
    + '<div class="doc-sheet-grab"></div>'
    + '<div class="doc-sheet-head">'
      + docIconBox(id, 62, 31)
      + '<div style="flex:1;min-width:0"><div class="doc-sheet-title">' + m.name + (m.sub ? ' <span style="font-weight:600;font-size:14px;opacity:.6">' + m.sub + '</span>' : '') + '</div>'
        + '<div class="doc-sheet-sub">' + badge + '</div></div>'
      + '<div class="doc-sheet-x" onclick="closeDocSheet()">✕</div>'
    + '</div>'
    + '<div class="doc-sheet-rows">' + rows + '</div>'
    + '<div class="doc-sheet-sectlbl">ARCHIVO Y FECHAS</div>'
    + '<div class="doc-upload-area"><div class="doc-upload-row">'
      + '<label class="doc-upload-single"><input type="file" accept="image/jpeg,image/jpg,application/pdf" onchange="handleDocUpload(\'' + id + '\',this)">📎 Archivo</label>'
      + '<label class="doc-upload-single camera"><input type="file" accept="image/jpeg,image/jpg" capture="environment" onchange="handleDocUpload(\'' + id + '\',this)">📷 Cámara</label>'
    + '</div><div style="font-size:10px;opacity:.55;text-align:center;margin-top:6px">JPEG o PDF · máx 5 MB · se guarda en este dispositivo</div></div>'
    + imgWrap
    + '<div class="doc-date-form">'
      + '<div class="doc-date-input"><label>Fecha emisión</label><input type="date" id="doc-' + id + '-issued" value="' + (d.issued || '') + '"></div>'
      + '<div class="doc-date-input"><label>Fecha caducidad</label><input type="date" id="doc-' + id + '-expiry" value="' + (d.expiry || '') + '"></div>'
    + '</div>'
    + '<div style="display:flex;gap:10px;margin-top:16px">'
      + '<button class="doc-save-btn" style="margin:0;width:auto;flex:1" onclick="saveDoc(\'' + id + '\')">Guardar</button>'
      + dl
    + '</div>'
    + '</div>';
  ov.classList.add('open');
  ov.onclick = closeDocSheet;
}
function closeDocSheet() {
  const ov = document.getElementById('doc-sheet');
  if (ov) { ov.classList.remove('open'); ov.innerHTML = ''; ov.onclick = null; }
}

// ── Subir archivo (sin cerrar la ficha) ─────────────────────
function handleDocUpload(id, input) {
  const file = input.files[0];
  if (!file) return;
  const allowed = ['image/jpeg','image/jpg','application/pdf'];
  if (!allowed.includes(file.type)) { showToast('❌ Solo se aceptan JPEG o PDF'); input.value = ''; return; }
  if (file.size > MAX_FILE_MB * 1024 * 1024) { showToast('❌ Archivo demasiado grande (máx ' + MAX_FILE_MB + ' MB)'); input.value = ''; return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    if (!docsData[id]) docsData[id] = {};
    docsData[id].fileData = e.target.result;
    docsData[id].fileName = file.name;
    docsData[id].fileType = file.type;
    docsData[id].fileSize = (file.size / 1024).toFixed(0) + ' KB';
    const isImg = file.type.indexOf('image/') === 0;
    const img = document.getElementById('doc-' + id + '-img');
    const wrap = document.getElementById('doc-' + id + '-img-wrap');
    if (isImg && img && wrap) { img.src = e.target.result; wrap.style.display = 'block'; }
    showToast('✓ Archivo cargado. Guarda para confirmar.');
  };
  reader.readAsDataURL(file);
}

function updateDocDates() {}

// ── Guardar: persiste, cierra ficha, re-renderiza ───────────
function saveDoc(id) {
  const iss = document.getElementById('doc-' + id + '-issued');
  const exp = document.getElementById('doc-' + id + '-expiry');
  if (!docsData[id]) docsData[id] = {};
  docsData[id].issued = iss ? iss.value : '';
  docsData[id].expiry = exp ? exp.value : '';
  try { localStorage.setItem('pilotos_docs', JSON.stringify(docsData)); }
  catch(e) { showToast('⚠ Almacenamiento lleno. Imagen demasiado grande.'); return; }
  closeDocSheet();
  renderWallet();
  showToast('✓ ' + DOCS_META[id].name + ' guardado');
}

// ── Aviso de caducidades (al arrancar) ──────────────────────
function checkDocExpiry() {
  renderWallet();
  const alerts = [];
  Object.keys(DOCS_META).forEach(id => {
    const s = docStatus(id);
    if (s.state === 'exp') alerts.push({ id, msg: DOCS_META[id].name + ' está CADUCADO', urgent: true });
    else if (s.state === 'warn') alerts.push({ id, msg: DOCS_META[id].name + ' caduca en ' + s.days + ' días', urgent: s.days <= 30 });
  });
  if (alerts.length > 0) {
    const most = alerts.slice().sort((a,b) => b.urgent - a.urgent)[0];
    showToast('⚠️ ' + most.msg);
    if (alerts.some(a => a.urgent)) setTimeout(() => offerEmailAlert(alerts), 2500);
  }
}

function offerEmailAlert(alerts) {
  const msg = alerts.map(a => '• ' + a.msg).join('\n');
  const subject = 'PilotOS — Alerta de caducidad';
  const body = 'Estimado piloto,\n\nDocumentos que requieren atención:\n\n' + msg + '\n\nPilotOS';
  if (confirm('Documentos próximos a caducar. ¿Enviar aviso por email?')) {
    window.location.href = 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  }
}

document.addEventListener('DOMContentLoaded', () => { renderWallet(); });
