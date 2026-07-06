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
  medical:    { name: 'Médico',        sub: 'Class 1',   icon: 'cross',  col: '#14B8A6', authority: 'AeMC / AME',   required: true, renewLead: 45 },
  license:    { name: 'Licencia',      sub: 'ATPL/CPL',  icon: 'idcard', col: '#3B82F6', authority: 'AESA',          required: true, renewLead: 60 },
  typerating: { name: 'Habilitación',  sub: 'Type A320', icon: 'plane',  col: '#8B5CF6', authority: 'AESA / TRE',    required: true, renewLead: 60 },
  lang:       { name: 'Inglés',        sub: 'Nivel OACI',icon: 'globe',  col: '#0EA5E9', authority: 'AESA',          required: true, renewLead: 90 },
  passport:   { name: 'Pasaporte',     sub: '',          icon: 'book',   col: '#6366F1', authority: 'Min. Interior',                renewLead: 120 },
  company:    { name: 'T. Compañía',   sub: 'Vueling',   icon: 'badge',  col: '#059669', authority: 'Vueling',                      renewLead: 30 },
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
};
function docIcon(id, size) {
  const m = DOCS_META[id]; const s = size || 20; const isFill = (m.icon === 'plane');
  return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="' + (isFill ? 'currentColor' : 'none') + '" stroke="' + (isFill ? 'none' : 'currentColor') + '" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + DOC_SVG[m.icon] + '</svg>';
}
function docIconBox(id, sz, iconSz) {
  const m = DOCS_META[id];
  return '<div class="doc-ic" style="width:' + sz + 'px;height:' + sz + 'px;border-radius:' + Math.round(sz * .28) + 'px;color:' + m.col + ';background:' + m.col + '22;border-color:' + m.col + '40">' + docIcon(id, iconSz) + '</div>';
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
      + '<div class="doc-tile-top">' + docIconBox(id, 40, 20) + docRing(s.state) + '</div>'
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
      + docIconBox(id, 52, 26)
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
