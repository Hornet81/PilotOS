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
   TRES limitaciones de altitud, cada una con su color:
     · turquesa (contorno)       = APU Operation and Normal Restart Limit → 41 000 ft
     · ámbar (línea discontinua) = APU Battery Restart Limit (Elec Emer Config) → 25 000 ft
     · lima (línea)              = frontera del APU bleed: por encima de 22 500 ft, sólo Elec Power */
window.OES_FIGS['apu-envelope'] =
'<figure class="oes-fig" aria-label="Envolvente operacional del APU">' +
'<svg viewBox="0 0 380 372" xmlns="http://www.w3.org/2000/svg" role="img" font-family="ui-sans-serif,system-ui,sans-serif">' +
  '<title>Envolvente operacional del APU: rearranque normal 41 000 ft, batería 25 000 ft, bleed hasta 22 500 ft</title>' +
  '<rect x="0" y="0" width="380" height="372" rx="10" fill="#0b1426"/>' +
  '<text x="16" y="22" fill="#e8eeff" font-size="12.5" font-weight="700">Envolvente operacional del APU</text>' +
  '<text x="16" y="37" fill="#7f92b0" font-size="9.5">EC-MOG · LIM-APU p.97</text>' +
  // ── ejes ──  Y = 52 + (42000-alt)/45000*225   ·   X = 46 + (temp+90)/160*320
  '<line x1="46" y1="52" x2="46" y2="277" stroke="#33415c" stroke-width="1"/>' +
  '<line x1="46" y1="277" x2="366" y2="277" stroke="#33415c" stroke-width="1"/>' +
  '<text x="14" y="60" fill="#7f92b0" font-size="8.5">ft</text>' +
  '<text x="330" y="292" fill="#7f92b0" font-size="8.5">OAT °C</text>' +
  // rejilla tenue
  '<g stroke="#1c2740" stroke-width="1">' +
    '<line x1="46" y1="190" x2="366" y2="190"/>' +  // 14500
    '<line x1="46" y1="262" x2="366" y2="262"/>' +  // 0
  '</g>' +
  // valores del eje Y — los 3 límites en su color, el resto en gris
  '<g font-size="8.5" text-anchor="end" font-weight="700">' +
    '<text x="42" y="60"  fill="#22d3ee">41 000</text>' +
    '<text x="42" y="140" fill="#f59e0b">25 000</text>' +
    '<text x="42" y="153" fill="#a3e635">22 500</text>' +
  '</g>' +
  '<g fill="#7f92b0" font-size="8.5" text-anchor="end">' +
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
  '<polygon points="86,57 176,57 176,88 336,262 336,272 116,272 116,187" ' +
           'fill="rgba(34,211,238,0.08)" stroke="#22d3ee" stroke-width="1.4" stroke-linejoin="round"/>' +
  // sub-zona: APU Ground Operation (-2000..14500)
  '<rect x="116" y="190" width="164" height="82" fill="rgba(148,163,184,0.06)" stroke="#3a4a68" stroke-width="0.8" stroke-dasharray="2 2"/>' +
  '<text x="150" y="238" fill="#8ea0bd" font-size="9">APU Ground Operation</text>' +
  // etiquetas de zona (arriba / abajo de 22 500)
  '<text x="122" y="100" fill="#9ab06a" font-size="8.5">Elec Power Only</text>' +
  '<text x="122" y="178" fill="#8ea0bd" font-size="8.5">Bleed Air + Elec</text>' +
  // ── LÍMITE 1: operación y rearranque NORMAL — 41 000 ft (turquesa) ──
  '<line x1="86" y1="57" x2="176" y2="57" stroke="#22d3ee" stroke-width="3"/>' +
  '<circle cx="86" cy="57" r="3" fill="#22d3ee"/>' +
  // ── LÍMITE 2: rearranque con BATERÍA (Elec Emer Config) — 25 000 ft (ámbar, discontinua) ──
  '<line x1="60" y1="137" x2="356" y2="137" stroke="#f59e0b" stroke-width="2.4" stroke-dasharray="7 4"/>' +
  // ── LÍMITE 3: frontera del APU bleed — 22 500 ft (lima) ──
  '<line x1="116" y1="150" x2="233" y2="150" stroke="#a3e635" stroke-width="2.4"/>' +
  // ── leyenda inferior: las TRES limitaciones ──
  '<rect x="12" y="300" width="356" height="64" rx="6" fill="#101c33"/>' +
  '<rect x="20" y="312" width="20" height="4" rx="2" fill="#22d3ee"/>' +
  '<text x="48" y="317" fill="#c7d2e6" font-size="8.7">Operación y rearranque normal → 41 000 ft</text>' +
  '<line x1="20" y1="333" x2="40" y2="333" stroke="#f59e0b" stroke-width="3" stroke-dasharray="5 3"/>' +
  '<text x="48" y="336" fill="#c7d2e6" font-size="8.7">Rearranque con batería (Elec Emer Config) → 25 000 ft</text>' +
  '<rect x="20" y="350" width="20" height="4" rx="2" fill="#a3e635"/>' +
  '<text x="48" y="355" fill="#c7d2e6" font-size="8.7">APU Bleed hasta 22 500 ft · por encima, sólo Elec Power</text>' +
'</svg></figure>';
