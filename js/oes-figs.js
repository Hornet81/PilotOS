/* ══════════════════════════════════════════════════════════════════════════════
   PilotOS — Figuras para el Oral Trainer
   Diagramas SVG que se muestran en la respuesta (feedback) de ciertas preguntas.
   Una pregunta los pide con el campo  fig:"<clave>"  ; renderFB() los pinta.

   REDIBUJADOS a partir del FCOM (no son la página escaneada): más ligeros, nítidos,
   sin marca de agua, tematizados para la pantalla oscura del Oral Trainer, y así
   podemos RESALTAR lo que enseña cada pregunta. Valores verificados contra el PDF.
   Autocontenidos (SVG inline) → funcionan offline.
   ══════════════════════════════════════════════════════════════════════════════ */
window.OES_FIGS = window.OES_FIGS || {};

/* APU — Operational Envelope (LIM-APU p.97, avión de referencia EC-MOG).
   El punto didáctico: hay DOS límites de rearranque, dibujados por separado.
     · turquesa (contorno)      = APU Operation and Normal Restart Limit  → 41 000 ft
     · ámbar (línea discontinua)= APU Battery Restart Limit (Elec Emer Config) → 25 000 ft */
window.OES_FIGS['apu-envelope'] =
'<figure class="oes-fig" aria-label="Envolvente operacional del APU">' +
'<svg viewBox="0 0 380 336" xmlns="http://www.w3.org/2000/svg" role="img" font-family="ui-sans-serif,system-ui,sans-serif">' +
  '<rect x="0" y="0" width="380" height="336" rx="10" fill="#0b1426"/>' +
  '<text x="16" y="22" fill="#e8eeff" font-size="12.5" font-weight="700">Envolvente operacional del APU</text>' +
  '<text x="16" y="37" fill="#7f92b0" font-size="9.5">EC-MOG · LIM-APU p.97</text>' +
  // ── ejes ──
  '<line x1="46" y1="52" x2="46" y2="277" stroke="#33415c" stroke-width="1"/>' +
  '<line x1="46" y1="277" x2="366" y2="277" stroke="#33415c" stroke-width="1"/>' +
  '<text x="14" y="60" fill="#7f92b0" font-size="8.5">ft</text>' +
  '<text x="330" y="292" fill="#7f92b0" font-size="8.5">OAT °C</text>' +
  // ── rejilla + ticks eje Y (18..248 mapea 42000..-3000; usamos 52..277 para +34 de cabecera) ──
  // Y = 52 + (42000-alt)/45000*225
  '<g stroke="#1c2740" stroke-width="1">' +
    '<line x1="46" y1="57"  x2="366" y2="57"/>' +   // 41000
    '<line x1="46" y1="137" x2="366" y2="137"/>' +  // 25000  (se repinta abajo resaltado)
    '<line x1="46" y1="190" x2="366" y2="190"/>' +  // 14500
    '<line x1="46" y1="262" x2="366" y2="262"/>' +  // 0
  '</g>' +
  '<g fill="#7f92b0" font-size="8.5" text-anchor="end">' +
    '<text x="42" y="60">41 000</text>' +
    '<text x="42" y="140">25 000</text>' +
    '<text x="42" y="193">14 500</text>' +
    '<text x="42" y="265">0</text>' +
    '<text x="42" y="277">-2 000</text>' +
  '</g>' +
  '<g fill="#7f92b0" font-size="8.5" text-anchor="middle">' +
    '<text x="116" y="290">-55</text>' +
    '<text x="226" y="290">0</text>' +
    '<text x="336" y="290">+55</text>' +
  '</g>' +
  // ── envolvente (contorno turquesa) ──
  // vértices (temp,alt)->px con Y=52+(42000-a)/45000*225 , X=46+(t+90)/160*320
  '<polygon points="86,57 176,57 176,88 336,262 336,272 116,272 116,187" ' +
           'fill="rgba(34,211,238,0.09)" stroke="#22d3ee" stroke-width="1.4" stroke-linejoin="round"/>' +
  // sub-zona: APU Ground Operation (-2000..14500)
  '<rect x="116" y="190" width="164" height="82" fill="rgba(148,163,184,0.06)" stroke="#3a4a68" stroke-width="0.8" stroke-dasharray="2 2"/>' +
  '<text x="150" y="238" fill="#8ea0bd" font-size="9">APU Ground Operation</text>' +
  // divisor Elec Power Only / Bleed Air (22500) — sutil
  '<line x1="116" y1="149" x2="336" y2="149" stroke="#3a4a68" stroke-width="0.8" stroke-dasharray="2 3"/>' +
  '<text x="122" y="112" fill="#8ea0bd" font-size="8.5">Elec Power Only</text>' +
  '<text x="122" y="171" fill="#8ea0bd" font-size="8.5">Bleed Air + Elec</text>' +
  // ── LÍMITE 1: operación y rearranque NORMAL — 41 000 ft (turquesa, resaltado) ──
  '<line x1="86" y1="57" x2="176" y2="57" stroke="#22d3ee" stroke-width="3"/>' +
  '<circle cx="86" cy="57" r="3" fill="#22d3ee"/>' +
  '<text x="184" y="53" fill="#22d3ee" font-size="9.5" font-weight="700">Operación y rearranque normal</text>' +
  '<text x="184" y="64" fill="#22d3ee" font-size="9.5" font-weight="700">41 000 ft</text>' +
  // ── LÍMITE 2: rearranque con BATERÍA (Elec Emer Config) — 25 000 ft (ámbar, discontinua) ──
  '<line x1="60" y1="137" x2="356" y2="137" stroke="#f59e0b" stroke-width="2.4" stroke-dasharray="7 4"/>' +
  '<text x="200" y="132" fill="#f59e0b" font-size="9.5" font-weight="700" text-anchor="end">Rearranque con batería · Elec Emer Config</text>' +
  // ── leyenda inferior (el mensaje que enseña la pregunta) ──
  '<rect x="12" y="300" width="356" height="28" rx="6" fill="#101c33"/>' +
  '<rect x="20" y="309" width="18" height="4" rx="2" fill="#22d3ee"/>' +
  '<text x="44" y="316" fill="#c7d2e6" font-size="8.7">Rearranque NORMAL → 41 000 ft</text>' +
  '<line x1="210" y1="311" x2="228" y2="311" stroke="#f59e0b" stroke-width="3" stroke-dasharray="5 3"/>' +
  '<text x="234" y="316" fill="#c7d2e6" font-size="8.7">Rearranque con BATERÍA → 25 000 ft</text>' +
'</svg></figure>';
