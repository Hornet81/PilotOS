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
  typerating: { name: 'Revalidaciones', sub: 'Habilitaciones', icon: 'planejet', col: '#8B5CF6', authority: 'AESA / TRE', required: true, ratings: true, renewLead: 60 },
  lang:       { name: 'Inglés',        sub: 'Nivel OACI',icon: 'globe',  col: '#0EA5E9', authority: 'AESA',          required: true, renewLead: 90 },
  passport:   { name: 'Pasaporte',     sub: '',          icon: 'passport', col: '#818CF8', authority: 'Min. Interior',  format: 'card', renewLead: 120 },
  company:    { name: 'T. Compañía',   sub: 'Vueling',   icon: 'companyid', col: '#10B981', authority: 'Vueling',       format: 'card', role: true, renewLead: 30 },
};
const MAX_FILE_MB = 5;
let docsData = {};
try { docsData = JSON.parse(lsGet('pilotos_docs','{}')); } catch(e) {}

// Acabados metálicos para tarjetas personalizadas
const FINISHES = {
  gold:   { label: 'Oro',   col: '#C9A227', grad: 'linear-gradient(135deg,#FBE7A8 0%,#E7C766 26%,#B8912F 52%,#F3DE9B 70%,#8C6E1F 100%)', light: true },
  silver: { label: 'Plata', col: '#9AA0AB', grad: 'linear-gradient(135deg,#F4F6F9 0%,#CBD0D8 26%,#9BA1AC 52%,#EEF1F5 70%,#868C96 100%)', light: true },
  chrome: { label: 'Cromo', col: '#8894A2', grad: 'linear-gradient(135deg,#EAF1F8 0%,#B4BEC9 26%,#7B8794 50%,#DEE7F0 70%,#68727E 100%)', light: true },
  carbon: { label: 'Negro', col: '#4A4E57', grad: 'linear-gradient(135deg,#3B3F47 0%,#23262C 46%,#141619 76%,#2E313A 100%)', light: false },
};
// Re-registra en DOCS_META los documentos personalizados guardados en docsData
function _loadCustomDocs() {
  Object.keys(docsData).forEach(function (id) {
    const d = docsData[id];
    if (d && d.custom && !DOCS_META[id]) {
      const fin = FINISHES[d.finish] || FINISHES.gold;
      DOCS_META[id] = { name: d.name || 'Documento', sub: d.sub || '', icon: d.icon || 'custom', col: fin.col, finish: d.finish || 'gold', custom: true, renewLead: 60 };
    }
  });
}

// ── Iconos SVG (line icons profesionales) ───────────────────
const DOC_SVG = {
  cross:  '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M12 8v8M8 12h8"/>',
  idcard: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M14 10h4M14 13.5h4M6.2 16c.5-1.4 5.1-1.4 5.6 0"/>',
  plane:  '<path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>',
  // Jet diagonal Type Rating (SVG del usuario, viewBox 2050x2050) — degradado en docIcon
  planejet: 'M1526.04,523.96c-20.64-20.64-89.8,3.51-113.02,12.63-26.77,10.5-52.56,26.75-82.32,57.04l-159.91,162.8-100.79-28.06,13.43-13.43c14.15-14.16,11.38-40.08-6.17-57.62h0c-17.55-17.56-43.48-20.32-57.62-6.18l-49.44,49.44-354.11-98.61c-25.03-6.89-28.86-5.08-46.12,11.75l-41.04,41.05,473.46,273.12-142.78,145.38c-11.85,12.07-52.26,64.41-91.68,121.75-1.13,1.65-2.21,3.36-3.5,4.88-4.66,5.61-8.83,6.31-18.21,4.21l-148.09-41.16c-33.01-7.47-33.11-10.95-56.25,11.62l-26.04,26.04,183.16,105.67c-15.19,29.5-22.63,52.04-15.55,59.57.11.12.26.21.38.33.11.11.2.26.32.38,7.53,7.08,30.08-.36,59.57-15.56l105.67,183.18,26.04-26.05c22.55-23.13,19.08-23.22,11.61-56.24l-41.16-148.09c-2.12-9.51-1.39-13.66,4.42-18.4,1.45-1.19,4.66-3.31,4.66-3.31,57.35-39.41,109.71-79.84,121.76-91.68l145.38-142.78,273.14,473.46,41.03-41.03c16.83-17.27,18.64-21.09,11.75-46.12l-98.59-354.11,49.44-49.44c14.14-14.14,11.38-40.07-6.17-57.62h0c-17.55-17.55-43.49-20.32-57.63-6.17l-13.43,13.42-28.07-100.79,162.8-159.9c30.29-29.77,46.53-55.57,57.04-82.32,9.11-23.24,33.26-92.39,12.62-113.04h0Z',
  globe:  '<circle cx="12" cy="12" r="9.5"/><path d="M2.5 12h19"/><path d="M12 2.5c2.6 2.7 3.9 5.9 3.9 9.5S14.6 18.8 12 21.5C9.4 18.8 8.1 15.6 8.1 12S9.4 5.2 12 2.5z"/>',
  book:   '<path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H19v20H7.5A2.5 2.5 0 0 1 5 19.5z"/><path d="M5 17.5h14"/><circle cx="12" cy="8.5" r="2.3"/>',
  badge:  '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 3v1.6h6V3"/><circle cx="12" cy="10" r="2.2"/><path d="M8.4 16.2c.7-1.7 6.5-1.7 7.2 0"/>',
  custom: '<circle cx="12" cy="9" r="6"/><path d="M8.6 13.6 7 22l5-2.8 5 2.8-1.6-8.4"/><path d="M12 6.3l.9 1.9 2.1.2-1.6 1.4.5 2-1.9-1.1-1.9 1.1.5-2-1.6-1.4 2.1-.2z"/>',
  // Pasaporte (SVG del usuario, viewBox 500x500) — se pinta con degradado en docIcon
  passport: '<path d="M335.1,83.76c-4.05-3.48-9.4-5-14.68-4.19l-165.92,17.38h186.94c-.19-5.09-2.46-9.87-6.34-13.19Z"/><path d="M349.01,105.95h-198.02c-1.2,0-2.37.12-3.5.34-.11.02-.22.04-.32.07-.52.11-1.03.24-1.54.4-.03,0-.07.02-.1.03-6.24,1.96-11.05,7.18-12.41,13.66,0,.05-.02.09-.03.14-.1.51-.18,1.03-.24,1.56,0,.09-.03.17-.03.26-.06.6-.09,1.21-.09,1.82v278.15c0,10.08,8.2,18.27,18.27,18.27h198.02c10.08,0,18.27-8.2,18.27-18.27V124.22c0-10.08-8.2-18.27-18.27-18.27ZM305.06,176.25c-6.58,3.56-13.72,6.45-21.23,8.62-5.56-15.02-13.33-26.08-19.69-33.36,16.37,3.32,30.71,12.27,40.92,24.74ZM303.2,268.35c-10.05,11.33-23.66,19.45-39.06,22.57,5.96-6.82,13.16-16.95,18.62-30.55,7.17,2,14.02,4.67,20.44,7.98ZM255.17,157.05c5.66,6.27,13.09,16.33,18.48,30.28-6.03,1.18-12.22,1.9-18.48,2.16v-32.45ZM255.17,199.85c7.36-.28,14.65-1.17,21.73-2.63,1.57,5.75,2.74,12.02,3.34,18.83h-25.06v-16.2ZM255.17,226.38h25.06c-.7,7.97-2.21,15.22-4.21,21.76-6.77-1.33-13.74-2.14-20.85-2.4v-19.36ZM255.17,256.09c5.88.24,11.65.87,17.27,1.9-5.25,12.4-12.02,21.49-17.27,27.34v-29.24ZM227.56,257.99c5.62-1.03,11.39-1.66,17.27-1.9v29.23c-5.25-5.84-12.02-14.94-17.27-27.33ZM235.86,290.92c-15.4-3.12-29-11.24-39.06-22.57,6.42-3.31,13.27-5.98,20.44-7.98,5.46,13.6,12.66,23.73,18.62,30.55ZM223.98,248.14c-2-6.54-3.51-13.78-4.21-21.76h25.06v19.36c-7.11.26-14.08,1.07-20.85,2.4ZM219.77,216.05c.6-6.8,1.78-13.07,3.35-18.82,7.07,1.45,14.35,2.34,21.71,2.62v16.2h-25.06ZM226.38,187.34c5.38-13.89,12.79-23.95,18.45-30.24v32.39c-6.25-.26-12.43-.98-18.45-2.16ZM235.86,151.51c-6.36,7.28-14.14,18.34-19.69,33.36-7.51-2.17-14.65-5.06-21.23-8.62,10.2-12.47,24.55-21.43,40.92-24.74ZM188.96,184.76c7.44,4.13,15.55,7.47,24.08,9.95-1.74,6.5-3.04,13.6-3.66,21.33h-30.29c.82-11.37,4.31-22.01,9.87-31.28ZM209.38,226.38c.71,8.88,2.31,16.93,4.47,24.2-8.23,2.34-16.08,5.49-23.41,9.43-6.41-9.81-10.46-21.29-11.35-33.63h30.29ZM316.42,377.14h-132.83c-2.49,0-4.5-2.01-4.5-4.5s2.01-4.5,4.5-4.5h132.83c2.49,0,4.5,2.01,4.5,4.5s-2.01,4.5-4.5,4.5ZM316.42,344.63h-132.83c-2.49,0-4.5-2.01-4.5-4.5s2.01-4.5,4.5-4.5h132.83c2.49,0,4.5,2.01,4.5,4.5s-2.01,4.5-4.5,4.5ZM309.56,260.01c-7.33-3.94-15.18-7.09-23.41-9.43,2.16-7.27,3.77-15.32,4.47-24.2h30.29c-.89,12.34-4.94,23.82-11.35,33.63ZM290.62,216.05c-.61-7.73-1.91-14.83-3.66-21.33,8.53-2.49,16.63-5.82,24.08-9.95,5.56,9.27,9.05,19.91,9.87,31.28h-30.29Z"/>',
  // Tarjeta de compañía / credencial con lanyard (SVG del usuario, viewBox 612x792)
  companyid: '<path d="M545.92,303.18h-229.62l16.49,16.7q0,.37.37.37l.75,1.9h29.59c1.87,0,3.75,1.52,3.75,3.42,0,2.28-1.87,3.8-3.75,3.8h-114.24c-1.87,0-3.75-1.52-3.75-3.8,0-1.9,1.87-3.42,3.75-3.42h21.72l-18.35-18.97H66.84c-13.11,0-23.59,10.62-23.59,23.91v275.08c0,13.28,10.48,23.9,23.59,23.9h479.08c13.1,0,23.59-10.62,23.59-23.9v-275.08c0-13.28-10.49-23.91-23.59-23.91ZM428.3,423.83c-1.87,0-3.37-1.51-3.37-3.79,0-1.9,1.5-3.79,3.37-3.79h81.66c2.24,0,3.74,1.89,3.74,3.79,0,2.28-1.5,3.79-3.74,3.79h-81.66ZM479.62,449.64c0,1.9-1.87,3.8-3.75,3.8h-27.34c-2.25,0-3.75-1.9-3.75-3.8,0-2.28,1.5-3.8,3.75-3.8h27.34c1.87,0,3.75,1.52,3.75,3.8ZM394.96,423.83h-62.93c-1.87,0-3.37-1.51-3.37-3.79,0-1.9,1.5-3.79,3.37-3.79h62.93c1.87,0,3.37,1.89,3.37,3.79,0,2.28-1.5,3.79-3.37,3.79ZM398.34,449.64c0,1.9-1.5,3.8-3.37,3.8h-62.93c-1.87,0-3.37-1.9-3.37-3.8,0-2.28,1.5-3.8,3.37-3.8h62.93c1.87,0,3.37,1.52,3.37,3.8ZM191.2,607.86c-61.81,0-112.37-50.84-112.37-113.45s50.56-113.83,112.37-113.83,112,50.85,112,113.83-50.2,113.45-112,113.45ZM402.83,511.86h-70.79c-1.87,0-3.37-1.51-3.37-3.79,0-1.9,1.5-3.42,3.37-3.42h70.79c1.87,0,3.75,1.52,3.75,3.42,0,2.28-1.87,3.79-3.75,3.79ZM496.47,482.66h-164.43c-1.87,0-3.37-1.52-3.37-3.8,0-1.9,1.5-3.8,3.37-3.8h164.43c2.25,0,3.75,1.9,3.75,3.8,0,2.28-1.5,3.8-3.75,3.8ZM524.56,453.44h-20.98c-1.87,0-3.37-1.9-3.37-3.8,0-2.28,1.49-3.8,3.37-3.8h20.98c2.25,0,3.75,1.52,3.75,3.8,0,1.9-1.5,3.8-3.75,3.8Z"/><polygon points="479.45 165.69 345.17 295.94 308.93 295.94 303.96 290.91 437.51 165.69 479.45 165.69"/><path d="M223.6,449.57c0,19.68-15.78,35.82-35.36,35.82s-35.36-16.13-35.36-35.82,15.93-35.82,35.36-35.82,35.36,15.99,35.36,35.82Z"/><path d="M242.74,543.55c0,3.85-.44,7.55-1.17,10.8-13.59,13.17-31.56,20.43-50.41,20.43s-36.97-7.25-50.41-20.28c-.88-3.4-1.17-6.96-1.17-10.95,0-17.02,8.04-32.71,21.77-42.33,18.12,9.47,40.91,8.88,57.86-1.18,14.61,9.33,23.53,25.9,23.53,43.51Z"/><polygon points="324.27 321.99 281.32 321.99 256.77 296.98 127.9 165.69 169.98 165.69 304.84 302.16 324.27 321.99"/><path d="M191.17,387.85c-57.86,0-105.06,47.81-105.06,106.42s47.2,106.27,105.06,106.27,104.91-47.66,104.91-106.27-47.05-106.42-104.91-106.42ZM188.24,406.35c23.52,0,42.66,19.39,42.66,43.22s-19.14,43.22-42.66,43.22-42.67-19.39-42.67-43.22,19.14-43.22,42.67-43.22ZM248.44,557.31c-.15.59-.59,1.19-1.02,1.63-15.05,14.95-35.07,23.24-56.25,23.24s-41.2-8.14-56.26-23.09c-.59-.44-.87-1.04-1.02-1.63-1.17-4.29-1.61-8.88-1.61-13.92,0-20.27,10.08-38.92,26.88-49.88,1.17-.74,2.63-.74,3.8,0,16.8,9.77,38.72,9.03,54.21-1.19,1.17-.74,2.63-.74,3.8,0,17.97,10.51,29.08,30.05,29.08,51.06,0,4.89-.59,9.47-1.61,13.76Z"/><path d="M532.21,396.55h-199.8c-2.07,0-3.75-1.67-3.75-3.78s1.68-3.78,3.75-3.78h199.8c2.07,0,3.75,1.67,3.75,3.78s-1.68,3.78-3.75,3.78Z"/>',
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
  if (m.icon === 'planejet') {
    const gid = 'jetg' + s;
    return '<svg class="doc-plane" width="' + s + '" height="' + s + '" viewBox="476 476 1098 1098" style="overflow:visible;filter:drop-shadow(0 0 6px rgba(139,92,246,.6))">'
      + '<defs><linearGradient id="' + gid + '" x1="0" y1="1" x2="1" y2="0">'
      + '<stop offset="0" stop-color="#8B5CF6"/><stop offset="0.5" stop-color="#7C7CF2"/><stop offset="1" stop-color="#22D3EE"/>'
      + '</linearGradient></defs>'
      + '<path fill-rule="evenodd" fill="url(#' + gid + ')" d="' + DOC_SVG.planejet + '"/></svg>';
  }
  const isFill = (m.icon === 'plane');
  return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="' + (isFill ? 'currentColor' : 'none') + '" stroke="' + (isFill ? 'none' : 'currentColor') + '" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + DOC_SVG[m.icon] + '</svg>';
}
function docIconBox(id, sz, iconSz) {
  const m = DOCS_META[id];
  const custom = (m.icon === 'heartpulse' || m.icon === 'passport' || m.icon === 'companyid');
  const beat = (m.icon === 'heartpulse') ? ' doc-ic-beat' : '';
  const extra = custom ? ';box-shadow:0 0 14px ' + m.col + '3a,inset 0 0 0 1px ' + m.col + '30' : '';
  return '<div class="doc-ic' + beat + '" style="width:' + sz + 'px;height:' + sz + 'px;border-radius:' + Math.round(sz * .28) + 'px;color:' + m.col + ';background:linear-gradient(140deg,' + m.col + '55,' + m.col + '16);border-color:' + m.col + '4d' + extra + '">' + docIcon(id, iconSz) + '</div>';
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

// ── Habilitaciones / revalidaciones ─────────────────────────
function _ratingUntilStatus(until) {
  if (!until) return { col: '#94A3B8', days: null, str: null };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(until);
  const days = Math.floor((d - today) / 86400000);
  const col = days < 0 ? '#F87171' : (days <= 90 ? '#F59E0B' : '#4ADE80');
  return { col: col, days: days, str: d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) };
}
function _ratingsHtml(ratings) {
  if (!ratings || !ratings.length) return '<div class="rate-empty">Sin habilitaciones escaneadas</div>';
  return ratings.map(function (r) {
    const s = _ratingUntilStatus(r.until || r.valid_until);
    return '<div class="rate-row"><span class="rate-name">' + _esc(r.name) + '</span><span class="rate-until" style="color:' + s.col + '">' + (s.str || '—') + '</span></div>';
  }).join('');
}
function _earliestRating(ratings) {
  let min = null;
  (ratings || []).forEach(function (r) { const u = r.until || r.valid_until; if (u) { if (!min || u < min) min = u; } });
  return min;
}
// Habilitaciones EDITABLES (nombre + fecha), para poder corregir lo que detecta la IA
function _ratingsEditHtml(ratings, prefix) {
  const rts = (ratings || []).map(function (r) { return { name: r.name || '', until: r.until || r.valid_until || '' }; });
  let rows = rts.map(function (r, i) {
    return '<div class="scan-rate"><input type="text" class="scan-rate-name" id="' + prefix + '-name-' + i + '" value="' + _esc(r.name) + '"><input type="date" class="scan-rate-until" id="' + prefix + '-until-' + i + '" value="' + _esc(r.until) + '"></div>';
  }).join('');
  if (!rts.length) rows = '<div class="rate-empty">Sin habilitaciones — escanea el certificado de revalidación</div>';
  return '<div class="scan-rates" id="' + prefix + '-rates" data-n="' + rts.length + '">' + rows + '</div>';
}
function _readRatings(prefix) {
  const rc = document.getElementById(prefix + '-rates');
  if (!rc) return null;
  const n = parseInt(rc.getAttribute('data-n'), 10) || 0;
  const out = [];
  for (let i = 0; i < n; i++) {
    const nm = (document.getElementById(prefix + '-name-' + i) || {}).value || '';
    const un = (document.getElementById(prefix + '-until-' + i) || {}).value || '';
    if (nm.trim() || un) out.push({ name: nm.trim(), until: un });
  }
  return out;
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
    ok:   { ico:'🛫', title:'Legal para volar hoy',   sub:'Médico, licencia, revalidaciones e inglés vigentes' },
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
      + '<div class="doc-tile-top">' + docIconBox(id, 48, 34) + docRing(s.state) + '</div>'
      + '<div class="doc-tile-name">' + m.name + '</div>'
      + '<div class="doc-tile-sub">' + (m.sub || '&nbsp;') + '</div>'
      + '<div class="doc-tile-pill ' + s.state + '">' + PILL_LABEL[s.state] + '</div>'
      + '<div class="doc-tile-foot">' + foot + '</div>'
      + '</div>';
  });
  html += '<div class="doc-tile doc-add" onclick="docAddOpen()"><div class="doc-add-inner"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg><span>Añadir documento</span></div></div>';
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
  _loadCustomDocs();
  renderHero();
  renderLegal();
  renderGrid();
  renderDocsStrip();
}
function renderDocStatus() { renderWallet(); }
function toggleDocPreview(id) { openDocSheet(id); }

// ── Ficha de detalle (bottom sheet) ─────────────────────────
function _sheetFieldsHtml(id, d) {
  const num = function (lbl, ph) { return '<div class="doc-date-input" style="margin-bottom:10px"><label>' + lbl + '</label><input type="text" id="doc-' + id + '-number" value="' + _esc(d.number) + '" placeholder="' + (ph || '') + '"></div>'; };
  const exp = '<div class="doc-date-input"><label>Fecha caducidad</label><input type="date" id="doc-' + id + '-expiry" value="' + _esc(d.expiry) + '"></div>';
  if (id === 'company') {
    return '<div class="doc-date-input" style="margin-bottom:10px"><label>Rol</label><input type="text" id="doc-' + id + '-role" value="' + _esc(d.role || _docRole()) + '" placeholder="Comandante"></div>'
      + '<div class="doc-date-form"><div class="doc-date-input"><label>Nº de empleado</label><input type="text" id="doc-' + id + '-number" value="' + _esc(d.number) + '" placeholder="Ej. 6578"></div>' + exp + '</div>';
  }
  if (id === 'typerating') {
    return '<div class="doc-date-input" style="margin-bottom:8px"><label>Habilitaciones · edita las fechas</label></div>' + _ratingsEditHtml(d.ratings, 'doc-' + id)
      + '<div class="doc-date-input" style="margin-top:10px"><label>Nº / CID</label><input type="text" id="doc-' + id + '-number" value="' + _esc(d.number) + '"></div>';
  }
  if (id === 'license') {
    return num('Nº de licencia', 'ESP.FCL.00023776')
      + '<div class="doc-date-input"><label>Tipos de licencia</label><input type="text" id="doc-' + id + '-types" value="' + _esc((d.types || []).join(' · ')) + '" placeholder="ATPL(A) · CPL(A) · PPL(A)"></div>';
  }
  if (id === 'medical') {
    return num('Nº de certificado', 'E-10019009')
      + '<div class="doc-date-form"><div class="doc-date-input"><label>Caducidad (Clase 1)</label><input type="date" id="doc-' + id + '-expiry" value="' + _esc(d.expiry) + '"></div><div class="doc-date-input"><label>Reconocimiento</label><input type="date" id="doc-' + id + '-exam" value="' + _esc(d.examDate) + '"></div></div>'
      + '<div class="doc-date-form" style="margin-top:10px"><div class="doc-date-input"><label>Último ECG</label><input type="date" id="doc-' + id + '-ecg" value="' + _esc(d.lastEcg) + '"></div><div class="doc-date-input"><label>Último audiograma</label><input type="date" id="doc-' + id + '-audio" value="' + _esc(d.lastAudio) + '"></div></div>';
  }
  return num('Número de documento', 'Ej. AMC-ES-8841')
    + '<div class="doc-date-form"><div class="doc-date-input"><label>Fecha emisión</label><input type="date" id="doc-' + id + '-issued" value="' + _esc(d.issued) + '"></div>' + exp + '</div>';
}
function docAddOpen() {
  const id = 'cst_' + Date.now().toString(36);
  docsData[id] = { custom: true, name: 'Nuevo documento', finish: 'gold', icon: 'custom' };
  _loadCustomDocs();
  try { localStorage.setItem('pilotos_docs', JSON.stringify(docsData)); } catch (e) {}
  renderWallet();
  openDocSheet(id);
}
function _customEditHtml(id, m) {
  const cur = m.finish || 'gold';
  const chips = Object.keys(FINISHES).map(function (k) {
    const f = FINISHES[k];
    return '<div class="fin-chip' + (k === cur ? ' on' : '') + '" data-fin="' + k + '" onclick="docSetFinish(\'' + id + '\',\'' + k + '\')"><span class="fin-swatch" style="background:' + f.grad + '"></span>' + f.label + '</div>';
  }).join('');
  return '<div class="doc-date-input" style="margin-bottom:10px"><label>Nombre del documento</label><input type="text" id="doc-' + id + '-name" value="' + _esc(m.name) + '"></div>'
    + '<div class="doc-date-input" style="margin-bottom:14px"><label>Acabado de la tarjeta</label><div class="fin-picker" id="doc-' + id + '-finish" data-fin="' + cur + '">' + chips + '</div></div>';
}
function docSetFinish(id, key) {
  const p = document.getElementById('doc-' + id + '-finish');
  if (!p) return;
  p.setAttribute('data-fin', key);
  p.querySelectorAll('.fin-chip').forEach(function (c) { c.classList.toggle('on', c.getAttribute('data-fin') === key); });
}
function docDelete(id) {
  if (typeof confirm === 'function' && !confirm('¿Eliminar este documento?')) return;
  docCloudDelete(id);
  delete docsData[id]; delete DOCS_META[id];
  try { localStorage.setItem('pilotos_docs', JSON.stringify(docsData)); } catch (e) {}
  closeDocSheet();
  renderWallet();
  showToast('Documento eliminado');
}
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
      + docIconBox(id, 62, 46)
      + '<div style="flex:1;min-width:0"><div class="doc-sheet-title">' + m.name + (m.sub ? ' <span style="font-weight:600;font-size:14px;opacity:.6">' + m.sub + '</span>' : '') + '</div>'
        + '<div class="doc-sheet-sub">' + badge + '</div></div>'
      + '<div class="doc-sheet-x" onclick="closeDocSheet()">✕</div>'
    + '</div>'
    + '<div class="doc-sheet-rows">' + rows + '</div>'
    + (m.custom ? _customEditHtml(id, m) : '')
    + '<div class="doc-sheet-sectlbl">ARCHIVO Y FECHAS</div>'
    + '<button class="doc-scan-btn" onclick="docScan(\'' + id + '\')"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2M4 12h16"/></svg>✦ Escanear con IA</button>'
    + '<div class="doc-upload-area"><div class="doc-upload-row">'
      + '<label class="doc-upload-single"><input type="file" accept="image/*,application/pdf" onchange="handleDocUpload(\'' + id + '\',this)">📎 Archivo</label>'
      + '<label class="doc-upload-single camera"><input type="file" accept="image/*" capture="environment" onchange="handleDocUpload(\'' + id + '\',this)">📷 Cámara</label>'
    + '</div><div style="font-size:10px;opacity:.55;text-align:center;margin-top:6px">JPEG o PDF · máx 5 MB · se guarda en este dispositivo</div></div>'
    + imgWrap
    + _sheetFieldsHtml(id, d)
    + '<div style="display:flex;gap:10px;margin-top:16px">'
      + '<button class="doc-save-btn" style="margin:0;width:auto;flex:1" onclick="saveDoc(\'' + id + '\')">Guardar</button>'
      + dl
    + '</div>'
    + (m.custom ? '<button class="doc-del-btn" onclick="docDelete(\'' + id + '\')">Eliminar documento</button>' : '')
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
  const isImg = (file.type || '').indexOf('image/') === 0;
  const isPdf = file.type === 'application/pdf';
  if (!isImg && !isPdf) { showToast('❌ Solo se aceptan imágenes o PDF'); input.value = ''; return; }
  if (file.size > MAX_FILE_MB * 1024 * 1024) { showToast('❌ Archivo demasiado grande (máx ' + MAX_FILE_MB + ' MB)'); input.value = ''; return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    const finish = function (dataURL, ftype) {
      if (!docsData[id]) docsData[id] = {};
      docsData[id].fileData = dataURL;
      docsData[id]._cloudFile = false;
      docsData[id].fileName = file.name;
      docsData[id].fileType = ftype;
      docsData[id].fileSize = Math.round((dataURL.length * 0.73) / 1024) + ' KB';
      const im = document.getElementById('doc-' + id + '-img');
      const wr = document.getElementById('doc-' + id + '-img-wrap');
      if (ftype.indexOf('image/') === 0 && im && wr) { im.src = dataURL; wr.style.display = 'block'; }
      showToast('✓ Archivo cargado. Guarda para confirmar.');
    };
    if (isImg) _compressImageDataURL(e.target.result, function (c) { finish(c, 'image/jpeg'); });
    else finish(e.target.result, file.type);
  };
  reader.readAsDataURL(file);
}

function updateDocDates() {}

// ── Guardar: persiste, cierra ficha, re-renderiza ───────────
function saveDoc(id) {
  const iss = document.getElementById('doc-' + id + '-issued');
  const exp = document.getElementById('doc-' + id + '-expiry');
  const numEl = document.getElementById('doc-' + id + '-number');
  if (!docsData[id]) docsData[id] = {};
  docsData[id].issued = iss ? iss.value : '';
  docsData[id].expiry = exp ? exp.value : '';
  if (numEl) docsData[id].number = numEl.value.trim();
  const roleEl = document.getElementById('doc-' + id + '-role');
  if (roleEl) docsData[id].role = roleEl.value.trim();
  const typesEl = document.getElementById('doc-' + id + '-types');
  if (typesEl) docsData[id].types = typesEl.value ? typesEl.value.split(/[·,\n\/]+/).map(function (s) { return s.trim(); }).filter(Boolean) : [];
  if (id === 'typerating') {
    const rr = _readRatings('doc-' + id);
    if (rr) { docsData[id].ratings = rr; docsData[id].expiry = _earliestRating(rr) || docsData[id].expiry || ''; }
  }
  const examEl = document.getElementById('doc-' + id + '-exam'); if (examEl) docsData[id].examDate = examEl.value;
  const ecgEl = document.getElementById('doc-' + id + '-ecg'); if (ecgEl) docsData[id].lastEcg = ecgEl.value;
  const audEl = document.getElementById('doc-' + id + '-audio'); if (audEl) docsData[id].lastAudio = audEl.value;
  const nameEl = document.getElementById('doc-' + id + '-name');
  if (nameEl && DOCS_META[id] && DOCS_META[id].custom) { const nm = nameEl.value.trim() || 'Documento'; DOCS_META[id].name = nm; docsData[id].name = nm; docsData[id].custom = true; }
  const finP = document.getElementById('doc-' + id + '-finish');
  if (finP && DOCS_META[id] && DOCS_META[id].custom) { const fk = finP.getAttribute('data-fin') || 'gold'; const fc = (FINISHES[fk] || FINISHES.gold).col; DOCS_META[id].finish = fk; docsData[id].finish = fk; DOCS_META[id].col = fc; docsData[id].col = fc; }
  docsData[id]._ts = Date.now();
  try { localStorage.setItem('pilotos_docs', JSON.stringify(docsData)); }
  catch(e) { showToast('⚠ Almacenamiento lleno. Imagen demasiado grande.'); return; }
  closeDocSheet();
  renderWallet();
  docCloudPush(id);
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

// ════════════════════════════════════
//  MODO INSPECCIÓN — baraja de tarjetas VIP
// ════════════════════════════════════
const INSP_GRAD = {
  medical:    'linear-gradient(135deg,#FB7185,#F43F5E 45%,#9F1239)',
  license:    'linear-gradient(135deg,#60A5FA,#3B82F6 48%,#1E3A8A)',
  typerating: 'linear-gradient(120deg,#A78BFA,#8B5CF6 42%,#22D3EE)',
  lang:       'linear-gradient(135deg,#38BDF8,#0EA5E9 48%,#075985)',
  passport:   'linear-gradient(135deg,#A5B4FC,#6366F1 48%,#312E81)',
  company:    'linear-gradient(135deg,#34D399,#10B981 48%,#065F46)',
};
const VIP_WAVE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M7 9.2a5.5 5.5 0 0 1 0 5.6"/><path d="M10.6 6.6a10 10 0 0 1 0 10.8"/><path d="M14.2 4a14.5 14.5 0 0 1 0 16"/></svg>';

function _pilotName() {
  try { const au = JSON.parse(localStorage.getItem('cafi_auth_user') || '{}'); if (au.name) return au.name; } catch(e) {}
  try { const p = localStorage.getItem('pilot_name'); if (p) return p; } catch(e) {}
  try { const au2 = JSON.parse(localStorage.getItem('cafi_auth_user') || '{}'); if (au2.email) return au2.email.split('@')[0]; } catch(e) {}
  return 'Piloto';
}
function _mmYyyy(iso) { const d = new Date(iso); return ('0' + (d.getMonth() + 1)).slice(-2) + ' / ' + d.getFullYear(); }

function inspCard(id) {
  const m = DOCS_META[id]; const d = docsData[id] || {}; const s = docStatus(id);
  const pc = { ok:'#15803D', warn:'#B45309', exp:'#B91C1C', empty:'#475569' }[s.state];
  const exp = d.expiry ? _mmYyyy(d.expiry) : (s.state === 'empty' ? '—' : 'PERM.');
  const name = (_pilotName() || '').toUpperCase();
  const typ = (m.name + (m.sub ? ' · ' + m.sub : '')).toUpperCase();
  const numHtml = d.number
    ? '<div class="vip-num">' + d.number + '</div>'
    : '<div class="vip-num" style="opacity:.4;font-size:12px">•••• ••••</div>';
  const isImg = d.fileData && d.fileType && d.fileType.indexOf('image/') === 0;
  let back;
  if (id === 'typerating' && d.ratings && d.ratings.length) {
    back = '<div class="vip-rates"><div class="vip-rates-h">Habilitaciones</div>' + _ratingsHtml(d.ratings)
      + (d.fileData ? '<button class="vip-back-btn" onclick="event.stopPropagation();inspZoom(\'' + id + '\')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>Ver original</button>' : '')
      + '</div>';
  } else if (isImg) {
    back = '<img src="' + d.fileData + '" alt=""><button class="vip-back-btn" onclick="event.stopPropagation();inspZoom(\'' + id + '\')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>Ampliar</button>';
  } else if (d.fileData) {
    back = '<div class="vip-back-empty">📄 Documento PDF adjunto</div><button class="vip-back-btn" onclick="event.stopPropagation();inspZoom(\'' + id + '\')">Abrir</button>';
  } else {
    back = '<div class="vip-back-empty">Sin documento escaneado.<br>Súbelo desde la ficha del documento.</div>';
  }
  return '<div class="vip-slot"><div class="vip-card" onpointermove="inspTilt(event,this)" onpointerleave="inspTiltReset(this)" onclick="inspTap(this)">'
    + '<div class="vip-flip">'
      + '<div class="vip-face vip-front' + (m.finish ? ((FINISHES[m.finish] && FINISHES[m.finish].light) ? ' metal metal-light' : ' metal metal-dark') : '') + '" style="background:' + (m.finish ? (FINISHES[m.finish] || FINISHES.gold).grad : (INSP_GRAD[id] || m.col)) + '">'
        + '<div class="vip-sheen"></div>'
        + '<div class="vip-mark">' + docIcon(id, 120) + '</div>'
        + '<div class="vip-head"><span class="vip-type">' + typ + '</span><span class="vip-status" style="color:' + pc + '">' + PILL_LABEL[s.state] + '</span></div>'
        + '<div class="vip-bottom">'
          + numHtml
          + '<div class="vip-name">' + name + '</div>'
          + '<div class="vip-foot">'
            + '<div><div class="k">CADUCA</div><div class="v">' + exp + '</div></div>'
            + (id === 'company'
              ? '<div><div class="k">ROL</div><div class="v" style="font-size:10px">' + (d.role || _docRole()) + '</div></div>'
              : '<div><div class="k">EMISOR</div><div class="v" style="font-size:10px">' + (d.authority || m.authority) + '</div></div>')
            + '<span class="vip-brand">PILOT<b>OS</b></span>'
          + '</div>'
        + '</div>'
      + '</div>'
      + '<div class="vip-face vip-back">' + back + '<div class="vip-hint"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 12a8 8 0 1 1 2.3 5.6M4 12v4M4 16H8"/></svg>Toca para volver</div></div>'
    + '</div>'
  + '</div></div>';
}

function openInspect() {
  let ov = document.getElementById('doc-inspect');
  if (!ov) { ov = document.createElement('div'); ov.id = 'doc-inspect'; ov.className = 'insp-ov'; document.body.appendChild(ov); }
  const cards = Object.keys(DOCS_META).map(inspCard).join('');
  const now = new Date(); const hh = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
  ov.innerHTML =
    '<div class="insp-head">'
    + '<button class="insp-hbtn" onclick="closeInspect()">✕</button>'
    + '<div><div class="insp-title">Modo inspección</div><div class="insp-sub">Consultado hoy · ' + hh + ' · sin conexión</div></div>'
    + '<span class="insp-hbtn" style="visibility:hidden"></span>'
    + '</div>'
    + '<div class="insp-scroll"><div class="insp-stack">' + cards + '</div></div>';
  ov.classList.add('open');
  document.documentElement.classList.add('insp-lock');
  const stack = ov.querySelector('.insp-stack');
  const first = stack && stack.querySelector('.vip-slot');
  if (first) first.classList.add('exp');
  setTimeout(function () { _inspLayout(stack); }, 30);
  if (!window._inspResizeBound) { window._inspResizeBound = true; window.addEventListener('resize', function () { const o = document.getElementById('doc-inspect'); if (o && o.classList.contains('open')) _inspLayout(o.querySelector('.insp-stack')); }); }
}
function closeInspect() {
  const ov = document.getElementById('doc-inspect');
  if (ov) { ov.classList.remove('open'); ov.innerHTML = ''; }
  document.documentElement.classList.remove('insp-lock');
}
// Baraja apilada: coloca cada slot con translateY (acelerado por GPU = fluido)
function _inspLayout(stack) {
  if (!stack) return;
  const slots = stack.querySelectorAll('.vip-slot');
  if (!slots.length) return;
  const flip = slots[0].querySelector('.vip-flip');
  const fullH = (flip && flip.offsetHeight) ? flip.offsetHeight : 210;
  const peek = 62, gap = 16;
  let y = 0, lastTop = 0;
  slots.forEach(function (sl, i) {
    sl.style.transform = 'translate3d(0,' + y + 'px,0)';
    sl.style.zIndex = i + 1;
    lastTop = y;
    y += sl.classList.contains('exp') ? (fullH + gap) : peek;
  });
  stack.style.height = (lastTop + fullH + 16) + 'px';
}
// Tocar una tarjeta: si está apilada la abre (cierra las demás); si ya está abierta, la voltea
function inspTap(card) {
  const slot = card.closest('.vip-slot');
  if (!slot) return;
  if (slot.classList.contains('exp')) {
    const f = card.querySelector('.vip-flip');
    if (f) f.classList.toggle('flipped');
    return;
  }
  const stack = slot.parentNode;
  stack.querySelectorAll('.vip-slot.exp').forEach(function (s) {
    s.classList.remove('exp');
    const ff = s.querySelector('.vip-flip'); if (ff) ff.classList.remove('flipped');
    const cc = s.querySelector('.vip-card'); if (cc) cc.style.transform = '';
  });
  slot.classList.add('exp');
  _inspLayout(stack);
  const sc = stack.closest('.insp-scroll');
  if (sc) { const ty = parseFloat((slot.style.transform.match(/,\s*(-?[\d.]+)px/) || [])[1]) || 0; sc.scrollTo({ top: Math.max(0, ty - 12), behavior: 'smooth' }); }
}
function inspTilt(e, card) {
  const slot = card.closest('.vip-slot');
  if (!slot || !slot.classList.contains('exp')) return;
  const r = card.getBoundingClientRect();
  const px = (e.clientX - r.left) / r.width - 0.5;
  const py = (e.clientY - r.top) / r.height - 0.5;
  card.style.transform = 'rotateX(' + (-py * 9).toFixed(2) + 'deg) rotateY(' + (px * 11).toFixed(2) + 'deg)';
  const sheen = card.querySelector('.vip-sheen');
  if (sheen) { sheen.style.animation = 'none'; sheen.style.backgroundPosition = (50 - px * 130).toFixed(0) + '% 0'; }
}
function inspTiltReset(card) {
  card.style.transform = '';
  const sheen = card.querySelector('.vip-sheen');
  if (sheen) { sheen.style.animation = ''; sheen.style.backgroundPosition = ''; }
}

// ── Visor a pantalla completa ───────────────────────────────
let _zoomRot = 0, _zoomBig = false;
function _zoomApply() { const img = document.getElementById('zoom-img'); if (img) img.style.transform = 'rotate(' + _zoomRot + 'deg) scale(' + (_zoomBig ? 2.3 : 1) + ')'; }
function inspZoomRot() { _zoomRot = (_zoomRot + 90) % 360; _zoomApply(); }
function inspZoomToggle() { _zoomBig = !_zoomBig; const img = document.getElementById('zoom-img'); if (img) img.style.cursor = _zoomBig ? 'zoom-out' : 'zoom-in'; _zoomApply(); }
function inspZoomClose() { const ov = document.getElementById('doc-zoom'); if (ov) { ov.classList.remove('open'); ov.innerHTML = ''; } }
function inspZoom(id) {
  const d = docsData[id] || {}; if (!d.fileData) return;
  let ov = document.getElementById('doc-zoom');
  if (!ov) { ov = document.createElement('div'); ov.id = 'doc-zoom'; ov.className = 'zoom-ov'; document.body.appendChild(ov); }
  const isImg = d.fileType && d.fileType.indexOf('image/') === 0;
  _zoomRot = 0; _zoomBig = false;
  const media = isImg
    ? '<img id="zoom-img" src="' + d.fileData + '" alt="" style="cursor:zoom-in" onclick="inspZoomToggle()">'
    : '<iframe src="' + d.fileData + '" style="width:100%;height:100%;border:0;background:#fff;border-radius:8px"></iframe>';
  ov.innerHTML =
    '<div class="zoom-bar">'
    + '<button class="insp-hbtn" onclick="inspZoomClose()">✕</button>'
    + (isImg ? '<button class="insp-hbtn" onclick="inspZoomRot()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/></svg></button>' : '<span style="width:34px"></span>')
    + '</div><div class="zoom-body">' + media + '</div>';
  ov.classList.add('open');
}

// ════════════════════════════════════
//  ESCÁNER DE DOCUMENTOS (cámara + IA)
// ════════════════════════════════════
let _scanId = null, _scanStream = null, _scanTrack = null, _scanShot = null, _scanStepTimer = null, _scanFlashOn = false;
let _scanAuto = true, _scanRAF = null, _scanPrev = null, _scanSteady = 0, _scanFiring = false, _scanLast = 0, _scanAlignedState = null, _scanData = null, _scanDiffEMA = null, _scanFmt = 'doc';
const _XSVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
function _esc(s) { return (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

function docScan(id) {
  if (typeof isPro === 'function' && !isPro()) {
    try { if (typeof showPlanToast === 'function') { showPlanToast('ocr'); return; } } catch (e) {}
    showToast('El escaneo con IA está disponible en Pro y Unlimited');
    return;
  }
  openScanner(id);
}
function _scanOv() {
  let ov = document.getElementById('doc-scan');
  if (!ov) { ov = document.createElement('div'); ov.id = 'doc-scan'; ov.className = 'scan-ov'; document.body.appendChild(ov); }
  return ov;
}
function _scanStopStream() {
  try { if (_scanStream) _scanStream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
  _scanStream = null; _scanTrack = null; _scanFlashOn = false;
}
function closeScanner() {
  _scanStopStream(); _scanStopLoop(); clearInterval(_scanStepTimer);
  const ov = document.getElementById('doc-scan');
  if (ov) { ov.classList.remove('open'); ov.innerHTML = ''; }
  document.documentElement.classList.remove('insp-lock');
}
// ── Auto-detección: encuadre + estabilidad → verde → autodisparo ──
function scanToggleAuto() {
  _scanAuto = !_scanAuto;
  const b = document.getElementById('scan-auto-btn');
  if (b) b.classList.toggle('on', _scanAuto);
  _scanSteady = 0;
  if (!_scanAuto) { _scanSetAligned(false); }
}
function _scanStartLoop() {
  _scanStopLoop();
  _scanPrev = null; _scanSteady = 0; _scanFiring = false; _scanLast = 0; _scanAlignedState = null; _scanDiffEMA = null;
  _scanRAF = requestAnimationFrame(_scanLoop);
}
function _scanStopLoop() {
  if (_scanRAF) cancelAnimationFrame(_scanRAF);
  _scanRAF = null; _scanPrev = null; _scanSteady = 0; _scanFiring = false;
}
// Mapea el rectángulo del marco (en pantalla) a coordenadas del vídeo (object-fit:cover)
function _scanGuideVideoRect(v, frame) {
  const cam = frame.parentElement;
  const cr = cam.getBoundingClientRect(), fr = frame.getBoundingClientRect();
  const vw = v.videoWidth, vh = v.videoHeight;
  if (!vw || !vh || !cr.width) return null;
  const scale = Math.max(cr.width / vw, cr.height / vh);
  const offX = (cr.width - vw * scale) / 2, offY = (cr.height - vh * scale) / 2;
  const sx = (fr.left - cr.left - offX) / scale;
  const sy = (fr.top - cr.top - offY) / scale;
  const sw = fr.width / scale, sh = fr.height / scale;
  return {
    sx: Math.max(0, Math.min(vw - 1, sx)), sy: Math.max(0, Math.min(vh - 1, sy)),
    sw: Math.max(1, Math.min(vw, sw)), sh: Math.max(1, Math.min(vh, sh))
  };
}
function _scanSetAligned(on) {
  if (on === _scanAlignedState) return;
  _scanAlignedState = on;
  const fr = document.querySelector('#doc-scan .scan-frame');
  if (fr) fr.classList.toggle('ok', !!on);
  if (_scanFiring) return;
  const g = document.querySelector('#doc-scan .scan-guide');
  if (!g) return;
  const dot = on ? '#34D399' : '#22D3EE';
  const txt = on ? 'Encuadrado — mantén firme' : 'Ajusta la tarjeta dentro del marco';
  g.innerHTML = '<span style="width:7px;height:7px;border-radius:50%;background:' + dot + ';box-shadow:0 0 8px ' + dot + '"></span>' + txt;
}
function _scanAutoFire() {
  const g = document.querySelector('#doc-scan .scan-guide');
  if (g) g.innerHTML = '<span style="width:7px;height:7px;border-radius:50%;background:#34D399;box-shadow:0 0 8px #34D399"></span>✓ Capturando…';
  setTimeout(function () { if (_scanFiring) scanCapture(); }, 430);
}
function _scanLoop() {
  _scanRAF = requestAnimationFrame(_scanLoop);
  const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  if (now - _scanLast < 140) return;
  _scanLast = now;
  const v = document.getElementById('scan-video');
  const frame = document.querySelector('#doc-scan .scan-frame');
  if (!v || !v.videoWidth || !frame || _scanFiring) return;
  const r = _scanGuideVideoRect(v, frame);
  if (!r || r.sw < 10 || r.sh < 10) return;
  const W = 48, H = Math.max(8, Math.round(48 * (r.sh / r.sw)));
  let cv = _scanLoop._cv; if (!cv) { cv = _scanLoop._cv = document.createElement('canvas'); }
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  try { ctx.drawImage(v, r.sx, r.sy, r.sw, r.sh, 0, 0, W, H); } catch (e) { return; }
  let data;
  try { data = ctx.getImageData(0, 0, W, H).data; } catch (e) { return; }
  const n = W * H, gray = new Float32Array(n);
  let sum = 0, sum2 = 0;
  for (let i = 0, j = 0; i < data.length; i += 4, j++) { const gg = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114; gray[j] = gg; sum += gg; sum2 += gg * gg; }
  const mean = sum / n, variance = Math.max(0, sum2 / n - mean * mean);
  let diff = 999;
  if (_scanPrev && _scanPrev.length === n) { diff = 0; for (let j = 0; j < n; j++) diff += Math.abs(gray[j] - _scanPrev[j]); diff /= n; }
  _scanPrev = gray;
  // Suavizado del movimiento (media móvil) para no parpadear con micro-temblores
  if (_scanDiffEMA == null) _scanDiffEMA = diff; else _scanDiffEMA = _scanDiffEMA * 0.55 + diff * 0.45;
  const motion = _scanDiffEMA;
  const content = variance > 45;
  // Histéresis: entra en verde fácil (<15) y sólo lo pierde si se mueve claramente (>30)
  let aligned = (_scanAlignedState === true);
  if (!aligned) { if (motion < 15 && content) aligned = true; }
  else { if (motion > 30 || !content) aligned = false; }
  _scanSetAligned(aligned);
  _scanSteady = aligned ? _scanSteady + 1 : 0;
  if (_scanAuto && _scanSteady >= 6 && !_scanFiring) { _scanFiring = true; _scanAutoFire(); }
}
function openScanner(id) {
  _scanId = id; _scanShot = null;
  _scanFmt = ((DOCS_META[id] || {}).format === 'card') ? 'card' : 'doc';
  const ov = _scanOv(); ov.classList.add('open');
  document.documentElement.classList.add('insp-lock');
  _scanPhaseCamera();
}
function _scanPhaseCamera() {
  const ov = _scanOv(); const m = DOCS_META[_scanId] || {};
  ov.innerHTML =
    '<div class="scan-top"><span class="scan-ic" onclick="closeScanner()">' + _XSVG + '</span>'
    + '<span class="t">Escanear · ' + (m.name || 'documento') + '</span>'
    + '<span style="display:flex;gap:8px">'
      + '<span class="scan-ic" onclick="scanToggleFmt()" title="Girar formato"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="8" rx="1.5"/><path d="M8 4.5v3M16 4.5v3M8 16.5v3M16 16.5v3"/></svg></span>'
      + '<span class="scan-ic" id="scan-flash" onclick="scanToggleFlash()" style="visibility:hidden"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9z"/></svg></span>'
    + '</span></div>'
    + '<div class="scan-cam"><video id="scan-video" autoplay playsinline muted></video><div class="scan-grid"></div>'
      + '<div class="scan-frame' + (_scanFmt === 'card' ? ' card' : '') + '"><div class="scan-cnr tl"></div><div class="scan-cnr tr"></div><div class="scan-cnr bl"></div><div class="scan-cnr br"></div><div class="scan-laser"></div></div>'
      + '<div class="scan-guide"><span style="width:7px;height:7px;border-radius:50%;background:#22D3EE;box-shadow:0 0 8px #22D3EE"></span>' + (_scanFmt === 'card' ? 'Encuadra la tarjeta en horizontal' : 'Encuadra el documento en el marco') + '</div>'
    + '</div>'
    + '<div class="scan-ctrls">'
      + '<label class="scan-ic"><input type="file" accept="image/*" onchange="scanFromFile(this)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg></label>'
      + '<button class="scan-shutter" onclick="scanCapture()"><i></i></button>'
      + '<button class="scan-auto' + (_scanAuto ? ' on' : '') + '" id="scan-auto-btn" onclick="scanToggleAuto()"><span class="d"></span>Auto</button>'
    + '</div>';
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then(function (stream) {
        _scanStream = stream;
        const v = document.getElementById('scan-video');
        if (!v) { _scanStopStream(); return; }
        v.srcObject = stream; v.setAttribute('playsinline', ''); v.muted = true; v.play().catch(function () {});
        _scanTrack = stream.getVideoTracks()[0];
        try { const caps = _scanTrack.getCapabilities && _scanTrack.getCapabilities(); if (caps && caps.torch) { const fb = document.getElementById('scan-flash'); if (fb) fb.style.visibility = 'visible'; } } catch (e) {}
        _scanStartLoop();
      })
      .catch(function () { _scanFallback(); });
  } else { _scanFallback(); }
}
function _scanFallback() {
  const ov = _scanOv(); const m = DOCS_META[_scanId] || {};
  ov.innerHTML =
    '<div class="scan-top"><span class="scan-ic" onclick="closeScanner()">' + _XSVG + '</span><span class="t">Escanear · ' + (m.name || '') + '</span><span class="scan-ic" style="visibility:hidden"></span></div>'
    + '<div class="scan-mid"><div style="font-size:38px;margin-bottom:12px">📷</div><div style="color:#fff;font-size:14px;margin-bottom:6px">Cámara no disponible</div>'
    + '<div style="color:rgba(255,255,255,.5);font-size:12px;margin-bottom:22px;max-width:260px">Haz una foto del documento o elige una de tu galería.</div>'
    + '<label class="scan-save" style="max-width:240px;position:relative;overflow:hidden;display:inline-block;text-align:center">Hacer foto o subir<input type="file" accept="image/*" capture="environment" onchange="scanFromFile(this)" style="position:absolute;inset:0;opacity:0"></label></div>';
}
function scanToggleFmt() {
  _scanFmt = (_scanFmt === 'card') ? 'doc' : 'card';
  const fr = document.querySelector('#doc-scan .scan-frame');
  if (fr) fr.classList.toggle('card', _scanFmt === 'card');
  _scanAlignedState = null; _scanSteady = 0;
  const g = document.querySelector('#doc-scan .scan-guide');
  if (g) g.innerHTML = '<span style="width:7px;height:7px;border-radius:50%;background:#22D3EE;box-shadow:0 0 8px #22D3EE"></span>' + (_scanFmt === 'card' ? 'Encuadra la tarjeta en horizontal' : 'Encuadra el documento en el marco');
}
function scanToggleFlash() {
  if (!_scanTrack) return;
  _scanFlashOn = !_scanFlashOn;
  try { _scanTrack.applyConstraints({ advanced: [{ torch: _scanFlashOn }] }); } catch (e) {}
}
function _docRole() {
  try { const r = (typeof _ldDominantRole === 'function') ? _ldDominantRole() : 'FO'; return r === 'CPT' ? 'Comandante' : 'Copiloto'; } catch (e) { return ''; }
}
function _cropAspect(v, aspect) {
  const vw = v.videoWidth, vh = v.videoHeight;
  let tw, th;
  if (vw / vh > aspect) { th = vh; tw = Math.round(vh * aspect); }
  else { tw = vw; th = Math.round(vw / aspect); }
  const sx = Math.round((vw - tw) / 2), sy = Math.round((vh - th) / 2);
  const cv = document.createElement('canvas'); cv.width = tw; cv.height = th;
  cv.getContext('2d').drawImage(v, sx, sy, tw, th, 0, 0, tw, th);
  return cv;
}
// Recorta el fondo alrededor del documento: detecta el rectángulo del documento
// (lo que se distingue del color de las esquinas = fondo) y recorta a él con un margen.
function _autoTrim(srcCanvas) {
  try {
    const cw = srcCanvas.width, ch = srcCanvas.height;
    const scale = Math.min(1, 240 / cw);
    const w = Math.max(1, Math.round(cw * scale)), h = Math.max(1, Math.round(ch * scale));
    const a = document.createElement('canvas'); a.width = w; a.height = h;
    const actx = a.getContext('2d'); actx.drawImage(srcCanvas, 0, 0, w, h);
    const d = actx.getImageData(0, 0, w, h).data;
    const gray = function (i) { return d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114; };
    const cs = Math.max(2, Math.round(Math.min(w, h) * 0.06));
    const corner = function (x0, y0) { let s = 0, n = 0; for (let y = y0; y < y0 + cs; y++) for (let x = x0; x < x0 + cs; x++) { s += gray((y * w + x) * 4); n++; } return s / n; };
    const bg = (corner(0, 0) + corner(w - cs, 0) + corner(0, h - cs) + corner(w - cs, h - cs)) / 4;
    const thr = 24;
    let minx = w, miny = h, maxx = 0, maxy = 0, found = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (Math.abs(gray((y * w + x) * 4) - bg) > thr) { found++; if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
    }
    const bw = maxx - minx, bh = maxy - miny;
    if (found < w * h * 0.05 || bw < w * 0.45 || bh < h * 0.45) return srcCanvas;
    const pad = Math.round(Math.min(w, h) * 0.015);
    minx = Math.max(0, minx - pad); miny = Math.max(0, miny - pad); maxx = Math.min(w - 1, maxx + pad); maxy = Math.min(h - 1, maxy + pad);
    const rx = minx / scale, ry = miny / scale, rw = (maxx - minx) / scale, rh = (maxy - miny) / scale;
    const out = document.createElement('canvas'); out.width = Math.max(1, Math.round(rw)); out.height = Math.max(1, Math.round(rh));
    out.getContext('2d').drawImage(srcCanvas, rx, ry, rw, rh, 0, 0, out.width, out.height);
    return out;
  } catch (e) { return srcCanvas; }
}
// Reduce una imagen (dataURL) a JPEG de máx 1600px lado y calidad 0.72 → mucho menos peso
function _compressImageDataURL(dataURL, cb) {
  try {
    const img = new Image();
    img.onload = function () {
      const maxDim = 1600, w = img.width, h = img.height;
      const sc = Math.min(1, maxDim / Math.max(w, h));
      const cw = Math.max(1, Math.round(w * sc)), ch = Math.max(1, Math.round(h * sc));
      const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
      cv.getContext('2d').drawImage(img, 0, 0, cw, ch);
      cb(cv.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = function () { cb(dataURL); };
    img.src = dataURL;
  } catch (e) { cb(dataURL); }
}
function _canvasToJpeg(cv, maxDim, q) {
  const w = cv.width, h = cv.height, sc = Math.min(1, maxDim / Math.max(w, h));
  if (sc < 1) { const o = document.createElement('canvas'); o.width = Math.round(w * sc); o.height = Math.round(h * sc); o.getContext('2d').drawImage(cv, 0, 0, o.width, o.height); cv = o; }
  return cv.toDataURL('image/jpeg', q);
}
function scanCapture() {
  const v = document.getElementById('scan-video');
  if (!v || !v.videoWidth) { showToast('Espera a que la cámara enfoque'); return; }
  const frame = document.querySelector('#doc-scan .scan-frame');
  const r = frame ? _scanGuideVideoRect(v, frame) : null;
  let cv;
  if (r && r.sw > 10 && r.sh > 10) {
    cv = document.createElement('canvas'); cv.width = Math.round(r.sw); cv.height = Math.round(r.sh);
    cv.getContext('2d').drawImage(v, r.sx, r.sy, r.sw, r.sh, 0, 0, cv.width, cv.height);
  } else if ((DOCS_META[_scanId] || {}).format === 'card') { cv = _cropAspect(v, 1.586); }
  else { cv = document.createElement('canvas'); cv.width = v.videoWidth; cv.height = v.videoHeight; cv.getContext('2d').drawImage(v, 0, 0); }
  cv = _autoTrim(cv);
  const data = _canvasToJpeg(cv, 1600, 0.78);
  _scanStopStream(); _scanStopLoop();
  _scanProcess(data);
}
function scanFromFile(input) {
  const f = input.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = function (e) {
    _scanStopStream();
    if ((f.type || '').indexOf('image/') === 0) _compressImageDataURL(e.target.result, function (c) { _scanProcess(c); });
    else _scanProcess(e.target.result);
  };
  r.readAsDataURL(f);
}
function _scanProcess(dataURL) {
  _scanShot = dataURL;
  const ov = _scanOv();
  const STEPS = ['Preparando imagen', 'Detectando el documento', 'Leyendo el texto', 'Extrayendo datos con IA', 'Verificando'];
  ov.innerHTML =
    '<div class="scan-top"><span class="scan-ic" onclick="closeScanner()">' + _XSVG + '</span><span class="t">Analizando…</span><span class="scan-ic" style="visibility:hidden"></span></div>'
    + '<div class="scan-mid"><div class="scan-shot"><img src="' + dataURL + '" alt=""></div><div class="scan-steps">'
    + STEPS.map(function (s) { return '<div class="scan-step"><span class="dot"></span>' + s + '</div>'; }).join('')
    + '</div></div>';
  const els = ov.querySelectorAll('.scan-step');
  if (els[0]) els[0].classList.add('on');
  let i = 0;
  clearInterval(_scanStepTimer);
  _scanStepTimer = setInterval(function () {
    if (i < els.length) {
      els[i].classList.remove('on'); els[i].classList.add('done');
      els[i].querySelector('.dot').innerHTML = '<svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="#4ADE80" stroke-width="1.7" stroke-linecap="round"><path d="M1.5 4.5l2 2L7.5 2"/></svg>';
      i++; if (i < els.length) els[i].classList.add('on');
    } else { clearInterval(_scanStepTimer); }
  }, 650);
  let token = ''; try { token = lsGet('cafi_auth_token', ''); } catch (e) {}
  const b64 = dataURL.split(',')[1];
  fetch(ldBackendUrl() + '/documents/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify({ image_base64: b64, media_type: 'image/jpeg', doc_type: (DOCS_META[_scanId] || {}).name || '' })
  })
    .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, j: j }; }); })
    .then(function (res) {
      clearInterval(_scanStepTimer);
      if (!res.ok) {
        if (res.status === 403) { closeScanner(); try { if (typeof showPlanToast === 'function') showPlanToast('ocr'); } catch (e) {} showToast((res.j && res.j.message) || 'Función Pro/Unlimited'); return; }
        _scanError((res.j && res.j.error) || 'No se pudo leer el documento'); return;
      }
      _scanReview(res.j || {});
    })
    .catch(function () { clearInterval(_scanStepTimer); _scanError('Sin conexión con el servidor. Inténtalo de nuevo.'); });
}
function _scanError(msg) {
  const ov = _scanOv();
  ov.innerHTML =
    '<div class="scan-top"><span class="scan-ic" onclick="closeScanner()">' + _XSVG + '</span><span class="t">Error</span><span class="scan-ic" style="visibility:hidden"></span></div>'
    + '<div class="scan-mid"><div style="font-size:32px;margin-bottom:12px">⚠️</div><div style="color:#fff;font-size:14px;margin-bottom:6px">No se pudo leer el documento</div>'
    + '<div style="color:rgba(255,255,255,.5);font-size:12px;max-width:260px;margin-bottom:22px">' + _esc(msg) + '</div>'
    + '<button class="scan-save" style="max-width:220px" onclick="openScanner(_scanId)">Reintentar</button></div>';
}
function _scanFieldsHtml(data) {
  const id = _scanId;
  const dateFld = function (lbl, idd, val) { return '<div class="scan-fld"><label>' + lbl + '</label><input type="date" id="' + idd + '" value="' + _esc(val) + '"></div>'; };
  const textFld = function (lbl, idd, val, ph) { return '<div class="scan-fld"><label>' + lbl + '</label><input type="text" id="' + idd + '" value="' + _esc(val) + '" placeholder="' + (ph || '') + '"></div>'; };
  if (id === 'company') {
    return textFld('Rol', 'scan-role', data.role || _docRole())
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
      + textFld('Nº de empleado', 'scan-number', data.employee_number || data.number)
      + dateFld('Caducidad', 'scan-expiry', data.expiry_date)
      + '</div>';
  }
  if (id === 'typerating') {
    return '<div class="scan-fld"><label>Habilitaciones detectadas · revisa las fechas</label>' + _ratingsEditHtml(data.ratings, 'scan') + '</div>'
      + textFld('Nº / CID', 'scan-number', data.number);
  }
  if (id === 'license') {
    const typesStr = (data.license_types || []).filter(Boolean).join(' · ');
    return textFld('Nº de licencia', 'scan-number', data.number, 'ESP.FCL.00023776')
      + textFld('Tipos de licencia', 'scan-types', typesStr, 'ATPL(A) · CPL(A) · PPL(A)');
  }
  if (id === 'medical') {
    let classesHtml = '';
    if (data.classes && data.classes.length) {
      classesHtml = '<div class="scan-fld"><label>Clases detectadas</label><div style="background:rgba(255,255,255,.05);border-radius:11px;padding:2px 13px">'
        + data.classes.map(function (c) { const s = _ratingUntilStatus(c.expiry || c.valid_until); return '<div class="rate-row"><span class="rate-name" style="font-family:inherit">' + _esc(c.class) + '</span><span class="rate-until" style="color:' + s.col + '">' + (s.str || '—') + '</span></div>'; }).join('')
        + '</div></div>';
    }
    return textFld('Nº de certificado', 'scan-number', data.number)
      + classesHtml
      + dateFld('Caducidad (Clase 1)', 'scan-expiry', data.expiry_date)
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
      + dateFld('Reconocimiento', 'scan-exam', data.exam_date)
      + dateFld('Último ECG', 'scan-ecg', data.last_ecg)
      + '</div>'
      + dateFld('Último audiograma', 'scan-audio', data.last_audiogram);
  }
  return textFld('Número de documento', 'scan-number', data.number, 'Ej. AMC-ES-8841')
    + textFld('Autoridad emisora', 'scan-authority', data.authority)
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
    + dateFld('Emisión', 'scan-issue', data.issue_date)
    + dateFld('Caducidad', 'scan-expiry', data.expiry_date)
    + '</div>';
}
function _scanReview(data) {
  _scanData = data || {};
  const ov = _scanOv(); const m = DOCS_META[_scanId] || {};
  const conf = data.confidence || 'medium';
  const cc = conf === 'high' ? ['#4ADE80', 'rgba(34,197,94,.14)', 'rgba(34,197,94,.3)', 'Alta confianza']
    : (conf === 'low' ? ['#F87171', 'rgba(239,68,68,.14)', 'rgba(239,68,68,.3)', 'Confianza baja · revisa'] : ['#FBBF24', 'rgba(245,158,11,.14)', 'rgba(245,158,11,.3)', 'Confianza media · revisa']);
  ov.innerHTML =
    '<div class="scan-top"><span class="scan-ic" onclick="closeScanner()">' + _XSVG + '</span><span class="t">Datos detectados</span><span class="scan-ic" style="visibility:hidden"></span></div>'
    + '<div class="scan-review">'
      + '<div style="display:flex;gap:13px;align-items:center;margin-bottom:16px">'
        + (_scanShot ? '<div style="' + (m.format === 'card' ? 'width:104px;height:66px' : 'width:60px;height:76px') + ';border-radius:9px;overflow:hidden;flex-shrink:0;border:1px solid rgba(255,255,255,.15)"><img src="' + _scanShot + '" style="width:100%;height:100%;object-fit:cover"></div>' : '')
        + '<div style="min-width:0"><div style="font-size:15px;font-weight:700;color:#fff">' + _esc(data.title || m.name) + '</div>'
          + '<div class="scan-rev-badge" style="color:' + cc[0] + ';background:' + cc[1] + ';border:1px solid ' + cc[2] + ';margin-top:8px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>' + cc[3] + '</div></div>'
      + '</div>'
      + _scanFieldsHtml(data)
      + (data.notes ? '<div style="font-size:11.5px;color:#FBBF24;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);border-radius:10px;padding:9px 12px;margin-bottom:12px">' + _esc(data.notes) + '</div>' : '')
      + '<button class="scan-save" onclick="scanSaveReview()">Guardar en la tarjeta</button>'
      + '<button class="scan-retry" onclick="openScanner(_scanId)">Repetir escaneo</button>'
    + '</div>';
}
function scanSaveReview() {
  const id = _scanId; if (!id) return;
  const g = function (x) { const el = document.getElementById(x); return el ? el.value.trim() : ''; };
  if (!docsData[id]) docsData[id] = {};
  docsData[id].number = g('scan-number');
  docsData[id].issued = g('scan-issue');
  docsData[id].expiry = g('scan-expiry');
  const auth = g('scan-authority'); if (auth) docsData[id].authority = auth;
  const role = g('scan-role'); if (role) docsData[id].role = role;
  const types = g('scan-types');
  if (id === 'license') docsData[id].types = types ? types.split(/[·,\n\/]+/).map(function (s) { return s.trim(); }).filter(Boolean) : ((_scanData && _scanData.license_types) || []).filter(Boolean);
  if (id === 'typerating') {
    const rr = _readRatings('scan');
    if (rr) { docsData[id].ratings = rr; docsData[id].expiry = _earliestRating(rr) || ''; }
  }
  if (id === 'medical') {
    if (_scanData && _scanData.classes) docsData[id].classes = _scanData.classes;
    const ex = g('scan-exam'); if (ex) docsData[id].examDate = ex;
    const ec = g('scan-ecg'); if (ec) docsData[id].lastEcg = ec;
    const au = g('scan-audio'); if (au) docsData[id].lastAudio = au;
  }
  if (_scanShot) {
    docsData[id].fileData = _scanShot;
    docsData[id].fileName = 'escaneo.jpg';
    docsData[id].fileType = 'image/jpeg';
    docsData[id].fileSize = Math.round((_scanShot.length * 0.73) / 1024) + ' KB';
  }
  docsData[id]._ts = Date.now();
  docsData[id]._cloudFile = false;
  try { localStorage.setItem('pilotos_docs', JSON.stringify(docsData)); }
  catch (e) { showToast('⚠ Almacenamiento lleno. Imagen demasiado grande.'); return; }
  closeScanner();
  renderWallet();
  const sheet = document.getElementById('doc-sheet');
  if (sheet && sheet.classList.contains('open')) openDocSheet(id);
  docCloudPush(id);
  showToast('✓ ' + (DOCS_META[id] ? DOCS_META[id].name : id) + ' escaneado y guardado');
}

// ════════════════════════════════════
//  NUBE de documentos (Pro/Unlimited)
//  Sube al guardar, descarga al abrir; mantiene TODO en local para offline.
// ════════════════════════════════════
let _docCloudPulled = false;
function _docAuthToken() { try { return lsGet('cafi_auth_token', ''); } catch (e) { return ''; } }
function _docCloudOn() { try { return (typeof isPro === 'function' && isPro()) && !!_docAuthToken(); } catch (e) { return false; } }

function docCloudPush(id) {
  if (!_docCloudOn()) return;
  const d = docsData[id]; if (!d) return;
  const token = _docAuthToken(); if (!token) return;
  const data = {};
  Object.keys(d).forEach(function (k) { if (k !== 'fileData' && k !== '_cloudFile') data[k] = d[k]; });
  const body = { doc_id: id, data: data };
  const sendFile = !!(d.fileData && d.fileData.indexOf('data:') === 0 && !d._cloudFile);
  if (sendFile) { body.file_base64 = d.fileData.split(',')[1]; body.file_type = d.fileType || 'image/jpeg'; }
  fetch(ldBackendUrl() + '/api/documents', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: JSON.stringify(body) })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) { if (j && j.ok && sendFile && docsData[id]) { docsData[id]._cloudFile = true; try { localStorage.setItem('pilotos_docs', JSON.stringify(docsData)); } catch (e) {} } })
    .catch(function () {});
}
function docCloudDelete(id) {
  if (!_docCloudOn()) return;
  const token = _docAuthToken(); if (!token) return;
  fetch(ldBackendUrl() + '/api/documents/' + encodeURIComponent(id), { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token } }).catch(function () {});
}
function docCloudPull(force) {
  if (!_docCloudOn()) return;
  if (_docCloudPulled && !force) return;
  _docCloudPulled = true;
  const token = _docAuthToken(); if (!token) return;
  fetch(ldBackendUrl() + '/api/documents', { headers: { 'Authorization': 'Bearer ' + token } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) {
      if (!j || !j.documents) return;
      let pending = 0, changed = false;
      const done = function () { if (changed) { _loadCustomDocs(); try { localStorage.setItem('pilotos_docs', JSON.stringify(docsData)); } catch (e) {} renderWallet(); } };
      j.documents.forEach(function (rd) {
        const id = rd.doc_id, remoteTs = Date.parse(rd.updated_at) || 0;
        const local = docsData[id], localTs = (local && local._ts) || 0;
        const applyMeta = (!local || remoteTs >= localTs);
        if (applyMeta) { docsData[id] = Object.assign({}, local || {}, rd.data || {}, { _cloudFile: true, _ts: remoteTs || localTs }); changed = true; }
        const cur = docsData[id];
        const needFile = rd.file_url && (!(cur && cur.fileData) || (applyMeta && remoteTs > localTs));
        if (needFile) {
          pending++;
          fetch(rd.file_url).then(function (resp) { return resp.blob(); }).then(function (blob) {
            const fr = new FileReader();
            fr.onload = function () { if (!docsData[id]) docsData[id] = {}; docsData[id].fileData = fr.result; docsData[id].fileType = rd.file_type || 'image/jpeg'; docsData[id]._cloudFile = true; changed = true; pending--; if (pending === 0) done(); };
            fr.onerror = function () { pending--; if (pending === 0) done(); };
            fr.readAsDataURL(blob);
          }).catch(function () { pending--; if (pending === 0) done(); });
        }
      });
      if (pending === 0) done();
    })
    .catch(function () {});
}

document.addEventListener('DOMContentLoaded', () => { renderWallet(); });
