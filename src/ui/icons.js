// Ícones da interface, desenhados para o jogo: SVG de traço numa grade de
// 24x24, na cor do texto (currentColor). Classes dentro do desenho:
//   f  preenchido na cor do traço (olhos, rodas)
//   t  preenchimento leve, por baixo do traço (dá peso a chamas, gotas...)
// Ver todos juntos em docs/icones.html.

const wave = (y) => `M2.5 ${y}c1.5-1 3-1 4.5 0s3 1 4.5 0`;
const drop = (x, y, s = 1) => `M${x} ${y}s${4 * s} ${4.3 * s} ${4 * s} ${7.2 * s}a${4 * s} ${4 * s} 0 0 1-${8 * s} 0C${x - 4 * s} ${y + 4.3 * s} ${x} ${y} ${x} ${y}z`;
const ear = (y) => `M12 ${y}c-2.6 0-4-1.6-4-4 2.4 0 4 1.4 4 4zM12 ${y}c2.6 0 4-1.6 4-4-2.4 0-4 1.4-4 4z`;
const face = (mouth) => `<circle cx="12" cy="12" r="9"/><circle class="f" cx="9" cy="9.5" r="1.1"/><circle class="f" cx="15" cy="9.5" r="1.1"/><path d="${mouth}"/>`;
const arrows = '<path d="M20 12a8 8 0 0 1-14.3 4.9M4 12a8 8 0 0 1 14.3-4.9"/><path d="M18.5 3v4.2h-4.2M5.5 21v-4.2h4.2"/>';
const tray = '<path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16"/>';
const triangles = (n) => Array.from({ length: n }, (_, i) => {
  const w = 14 / n;
  const x = 5 + i * w;
  return `<path class="f" d="M${x} 6v12l${w + 1} -6z"/>`;
}).join('');

export const ICONS = {
  // --- Topo e painéis ------------------------------------------------------
  people: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.6 2.7-6 6-6s6 2.4 6 6"/><circle cx="16.5" cy="9" r="2.6"/><path d="M15.8 14.2c2.9 0 5.2 2.1 5.2 5.3"/>',
  jobs: '<rect x="3" y="7.5" width="18" height="12" rx="2"/><path d="M9 7.5v-2A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5v2M3 12.5h18M12 11.5v2.5"/>',
  'face-happy': face('M8 14c1 1.8 2.3 2.6 4 2.6s3-.8 4-2.6'),
  'face-neutral': face('M8.5 15h7'),
  'face-sad': face('M8 16.5c1-1.6 2.3-2.3 4-2.3s3 .7 4 2.3'),
  money: '<circle cx="12" cy="12" r="9"/><path d="M14.8 8.8c-.6-.9-1.6-1.3-2.8-1.3-1.6 0-2.8.8-2.8 2.1 0 3 5.8 1.6 5.8 4.7 0 1.3-1.3 2.2-3 2.2-1.3 0-2.4-.5-3-1.4M12 5.8v1.7M12 16.5v1.7"/>',
  research: '<path class="t" d="M7.4 15h9.2l2.4 3.5a1.7 1.7 0 0 1-1.5 2.5h-11A1.7 1.7 0 0 1 5 18.5z"/><path d="M9.5 3h5M10.5 3v6L5 18.5A1.7 1.7 0 0 0 6.5 21h11a1.7 1.7 0 0 0 1.5-2.5L13.5 9V3"/>',
  culture: '<path d="M9 18V5.5l11-2.5v13"/><path d="M9 9.5l11-2.5"/><circle class="t" cx="6.5" cy="18" r="2.5"/><circle class="t" cx="17.5" cy="16" r="2.5"/>',
  sport: '<circle cx="12" cy="12" r="9"/><path class="t" d="M12 7.6l3.2 2.3-1.2 3.8h-4l-1.2-3.8z"/><path d="M12 3v4.6M15.2 9.9l4.4-1.5M14 13.7l2.7 3.8M10 13.7l-2.7 3.8M8.8 9.9 4.4 8.4"/>',
  power: '<path class="t" d="M13 2.5 5 13.5h6l-1 8 8-11h-6z"/>',
  water: `<path class="t" d="${drop(12, 3, 1.55)}"/>`,
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="1.5"/><path d="M8 10.5v-3a4 4 0 0 1 8 0v3M12 14.5v2"/>',
  pause: '<path class="f" d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/>',
  speed1: triangles(1),
  speed2: triangles(2),
  speed3: triangles(3),

  // --- Imprensa (notícias e cada tipo de veículo) ---------------------------
  news: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h10A1.5 1.5 0 0 1 17 5.5V18a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2z"/><path d="M17 9h2.5a1 1 0 0 1 1 1v8a2 2 0 0 1-2 2"/><rect class="t" x="7" y="7" width="7" height="4" rx=".5"/><path d="M7 14h7M7 17h5"/>',
  radio: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M7 8 17 3.5"/><circle class="t" cx="8.5" cy="14" r="3"/><path d="M14.5 12h3.5M14.5 15h3.5"/>',
  tv: '<rect x="3" y="6" width="18" height="12.5" rx="2"/><path d="M8.5 2.5 12 6l3.5-3.5M8 21.5h8"/><rect class="t" x="5.5" y="8.5" width="13" height="7.5" rx="1"/>',
  web: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3z"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2"/><path d="M10.5 5h3"/><path class="t" d="M9 9.5h6v5h-3.2L9.5 16.5V14.5H9z"/><circle class="f" cx="12" cy="18.8" r=".9"/>',

  // --- Arquivo -------------------------------------------------------------
  save: '<path d="M5 3.5h11l3.5 3.5v12a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5z"/><path d="M7.5 3.5v5h8v-5"/><rect x="7" y="13" width="10" height="7.5" rx="1"/>',
  'save-as': '<path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5z"/><path d="M13.5 7l3 3M13 20h7"/>',
  load: '<path d="M3 7a1.5 1.5 0 0 1 1.5-1.5H9l2 2h8.5A1.5 1.5 0 0 1 21 9v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18z"/><path d="M3 10.5h18"/>',
  export: `<path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5"/>${tray}`,
  import: `<path d="M12 14.5v-11M7.5 8 12 3.5 16.5 8"/>${tray}`,
  code: '<circle cx="8" cy="15" r="4.5"/><path d="M11.2 11.8 20 3M16.5 6.5 19 9M14 9l2 2"/>',
  new: '<path class="t" d="M11 3l1.8 5.2L18 10l-5.2 1.8L11 17l-1.8-5.2L4 10l5.2-1.8z"/><path d="M18 15v5M15.5 17.5h5"/>',

  // --- Navegação e menus ---------------------------------------------------
  inspect: '<path class="t" d="M5 3.5l13 6.2-5.6 1.7 3.6 6.4-2.6 1.4-3.5-6.4L5.5 17z"/>',
  build: '<path d="M7 21V3.5M3.5 21h8M4 3.5h16M7 7.5l4-4M7 11.5l3-3M7 15.5l3-3"/><path d="M17.5 3.5V10"/><rect class="t" x="15.5" y="10" width="4" height="3.5" rx=".5"/>',
  map: '<path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z"/><path d="M9 4v13.5M15 6.5V20"/>',
  'map-off': '<path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z" opacity=".45"/><path d="M4 4l16 16"/>',
  roads: '<path d="M8 3 4 21M16 3l4 18"/><path d="M12 4v2.5M12 10v3M12 17v3.5"/>',
  zones: '<path d="M3 20.5V11l5-4.5 5 4.5v9.5"/><path d="M13 20.5V8.5h8v12M2 20.5h20M6.5 20.5v-4h3v4M15.5 11.5h1M18.5 11.5h1M15.5 14.5h1M18.5 14.5h1"/>',
  infra: '<path d="M9 3v5M15 3v5M12 17v4.5"/><path class="t" d="M6 8h12v3a6 6 0 0 1-12 0z"/>',
  services: '<path d="M3 21h18M5 21V10h14v11"/><path d="M3.5 10 12 4.5l8.5 5.5"/><path d="M8.5 13v5M12 13v5M15.5 13v5"/>',
  leisure: '<circle cx="12" cy="10" r="6.5"/><circle class="f" cx="12" cy="10" r="1.3"/><path d="M12 3.5v13M5.5 10h13M7.4 5.4l9.2 9.2M16.6 5.4l-9.2 9.2M8.5 21 12 10l3.5 11M6.5 21h11"/>',
  transport: '<rect x="5" y="3" width="14" height="15" rx="2.5"/><path d="M5 11h14M5 7h14M7.5 18v2.5M16.5 18v2.5"/><circle class="f" cx="8.5" cy="14.5" r="1.1"/><circle class="f" cx="15.5" cy="14.5" r="1.1"/>',
  // Eventos (avisos)
  fire: '<path class="t" d="M12 21.5c-3.9 0-6.5-2.6-6.5-6.2 0-4.2 4-6.3 4.5-11.3 2.6 1.9 4 4.4 4 7 1-.6 1.6-1.8 1.7-3 1.7 1.7 2.8 4.2 2.8 6.9 0 4-2.6 6.6-6.5 6.6z"/><path d="M12 21.5c-1.7 0-2.8-1.1-2.8-2.7 0-1.9 1.8-2.7 2.3-4.8 1.8 1.2 3.3 2.9 3.3 4.8 0 1.6-1.1 2.7-2.8 2.7z"/>',
  epidemic: '<circle class="t" cx="12" cy="12" r="5"/><path d="M12 7V4.5M12 17v2.5M7 12H4.5M17 12h2.5M8.5 8.5 6.7 6.7M15.5 15.5l1.8 1.8M8.5 15.5l-1.8 1.8M15.5 8.5l1.8-1.8"/><circle class="f" cx="12" cy="3.8" r="1.2"/><circle class="f" cx="12" cy="20.2" r="1.2"/><circle class="f" cx="3.8" cy="12" r="1.2"/><circle class="f" cx="20.2" cy="12" r="1.2"/><circle class="f" cx="6.2" cy="6.2" r="1.2"/><circle class="f" cx="17.8" cy="17.8" r="1.2"/><circle class="f" cx="6.2" cy="17.8" r="1.2"/><circle class="f" cx="17.8" cy="6.2" r="1.2"/>',
  party: '<path class="t" d="M3 21 8 8l8 8z"/><path d="M14 3c-.5 2 .5 3 2 3s2.5 1 2 3M21 11c-1.5-.5-3 0-3.5 1.5M10.5 3.5l.5 1.5M19.5 4.5l.01 0"/>',

  // --- Ruas e zonas --------------------------------------------------------
  road: '<path d="M8 3 4 21M16 3l4 18"/><path d="M12 4v2.5M12 10v3M12 17v3.5"/>',
  avenida: '<path d="M2.5 4.5h19M2.5 19.5h19M2.5 11h19M2.5 13h19M4 7.75h3M10.5 7.75h3M17 7.75h3M4 16.25h3M10.5 16.25h3M17 16.25h3"/>',
  expressa: '<path d="M8 3 4 21M16 3l4 18"/><path d="M9.5 16l2.5-3 2.5 3M9.5 11l2.5-3 2.5 3"/>',
  calcadao: '<circle cx="13" cy="4.5" r="1.8"/><path d="M12.5 8 10 13l3 2.5V21M10 13l-2.5 7.5M12.5 8l3.5 3.5 3 .5M12.5 8 9 9.5l-1.5 3"/>',
  residencial: '<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5M10 20v-5.5h4V20"/>',
  comercial: '<path d="M4 10.5V20h16v-9.5"/><path d="M3.5 4h17L22 9a2.5 2.5 0 0 1-5 .5 2.5 2.5 0 0 1-5 0 2.5 2.5 0 0 1-5 0A2.5 2.5 0 0 1 2 9z"/><path d="M9.5 20v-5h5v5"/>',
  industrial: '<path d="M3 20.5V12l5-3v3l5-3v3l5-3V3.5h2.5v17zM2 20.5h20"/><path d="M6.5 16.5h1.5M10.5 16.5H12M14.5 16.5H16"/>',
  rural: `<path d="M12 21.5V5"/><path d="${ear(9)}${ear(13.5)}${ear(18)}"/><path d="M12 5V2.5"/>`,
  bulldoze: '<rect x="2.5" y="15.5" width="13" height="5" rx="2.5"/><path d="M4.5 15.5v-8h5l2 4h3.5v4M15.5 13.5h3"/><path class="t" d="M18.5 10v10.5l3-1V11z"/>',
  parque: '<path class="t" d="M12 2.5 7 9.5h3l-4 6.5h12l-4-6.5h3z"/><path d="M12 16v5.5"/>',
  revitalizar: '<path d="M3 21v-8l5-3v3l5-3v11zM2 21h13"/><path class="t" d="M18 3l1 2.6 2.5 1-2.5 1L18 10l-1-2.4-2.5-1 2.5-1z"/>',

  // --- Energia e água ------------------------------------------------------
  usina_carvao: '<path d="M2.5 21h19M4 21v-7l4-2.5V14l4-2.5V21M14 21V8h3.5v13"/><path class="t" d="M15 5.5a2 2 0 0 1 3.4-1.6A2.2 2.2 0 1 1 20.5 7.5h-5A1 1 0 0 1 15 5.5z"/>',
  usina_gas: '<path class="t" d="M12 21.5c-3.9 0-6.5-2.6-6.5-6.2 0-4.2 4-6.3 4.5-11.3 2.6 1.9 4 4.4 4 7 1-.6 1.6-1.8 1.7-3 1.7 1.7 2.8 4.2 2.8 6.9 0 4-2.6 6.6-6.5 6.6z"/>',
  hidreletrica: `<path class="t" d="M13 4h3l5 17h-8z"/><path d="${wave(8.5)}${wave(13)}${wave(17.5)}M12 21h10"/>`,
  usina_eolica: '<path d="M12 10.5v11M9.5 21.5h5M12 7.6V2.5M13.2 9.7l4.4 2.6M10.8 9.7l-4.4 2.6"/><circle class="t" cx="12" cy="9" r="1.6"/>',
  usina_solar: '<path class="t" d="M4 15 7 8h13l-3 7z"/><path d="M5.5 11.5h13M10.6 8l-2 7M15.3 8l-2 7M10.5 15v4M7 21h7"/><circle cx="5" cy="4.5" r="1.8"/>',
  usina_hidrogenio: '<circle cx="7.5" cy="12" r="4.5"/><circle cx="16.5" cy="12" r="4.5"/><path d="M5.8 10v4M9.2 10v4M5.8 12h3.4M14.8 10v4M18.2 10v4M14.8 12h3.4"/>',
  bomba_agua: '<rect x="5" y="3" width="14" height="7.5" rx="2"/><path d="M7 10.5 5.5 21M17 10.5l1.5 10.5M6.3 15.5h11.4M9 10.5l6 5M15 10.5l-6 5"/><path class="f" d="M12 4.6s1.6 1.8 1.6 2.9a1.6 1.6 0 0 1-3.2 0c0-1.1 1.6-2.9 1.6-2.9z"/>',
  poco: '<path d="M5 13h14v8H5zM5 16.5h14M7 13V7.5M17 13V7.5M4 7.8 12 3.5l8 4.3M12 7.5v2.5"/><path class="t" d="M10.5 10h3v2.5h-3z"/>',

  // --- Pesquisa e estatais -------------------------------------------------
  instituto_pesquisa: '<circle class="f" cx="12" cy="12" r="1.6"/><ellipse cx="12" cy="12" rx="9" ry="3.6"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(-60 12 12)"/>',
  parque_tecnologico: '<rect x="6" y="6" width="12" height="12" rx="1.5"/><rect class="t" x="9.5" y="9.5" width="5" height="5"/><path d="M9.5 3v3M14.5 3v3M9.5 18v3M14.5 18v3M3 9.5h3M3 14.5h3M18 9.5h3M18 14.5h3"/>',
  refinaria: '<path d="M5 21V6l1.5-2.5L8 6v15M5 10h3M5 14h3"/><circle class="t" cx="15.5" cy="12.5" r="4.5"/><path d="M13 16.3 12 21M18 16.3l1 4.7M2.5 21h19"/>',
  fabrica_cimento: '<ellipse cx="12" cy="9.5" rx="7" ry="4.5" transform="rotate(-20 12 9.5)"/><path d="M7.5 9.5 15.6 6.6M8.4 12.4l7.9-2.8M7 14l-2 7M17 12.5l2 8.5M3 21h18"/>',
  usina_etanol: `<path d="M7 21.5V2.5M7 7.5 4.5 5.5M7 12.5l3-3M7 17 4.5 15"/><path class="t" d="${drop(16, 9)}"/>`,
  petroquimica: '<path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z"/><path d="M12 7l4.3 2.5v5L12 17l-4.3-2.5v-5z"/>',
  biotecnologia: '<path d="M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9"/><path d="M9.5 6h5M9.5 18h5M10 9.2h4M10 14.8h4"/>',
  torre_celular: '<path d="M12 9.5 8 21.5M12 9.5l4 12M9.5 16.5h5"/><circle class="f" cx="12" cy="8" r="1.4"/><path d="M8.5 4.5a5 5 0 0 0 0 7M15.5 4.5a5 5 0 0 1 0 7M5.7 2.5a9 9 0 0 0 0 11M18.3 2.5a9 9 0 0 1 0 11"/>',

  // --- Educação ------------------------------------------------------------
  creche: '<rect x="3.5" y="12" width="8" height="8.5" rx="1"/><rect x="12.5" y="12" width="8" height="8.5" rx="1"/><rect class="t" x="8" y="3.5" width="8" height="8.5" rx="1"/><path d="M10.5 10l1.5-4 1.5 4M11 8.6h2"/>',
  escola: '<path d="M3 21V11h18v10M9 11V7l3-3 3 3v4M2 21h20M10.5 21v-4h3v4M5.5 14h2M16.5 14h2"/><circle cx="12" cy="8" r="1"/>',
  escola_media: '<path class="t" d="M12 6.5C10 5 7 4.5 3 5v13.5c4-.5 7 0 9 1.5 2-1.5 5-2 9-1.5V5c-4-.5-7 0-9 1.5z"/><path d="M12 6.5V20"/>',
  escola_tecnica: '<path d="M14.5 3.5a5 5 0 0 0-4.7 6.8l-6.3 6.3a2.1 2.1 0 0 0 3 3l6.3-6.3a5 5 0 0 0 6.7-4.8l-3 3-3-.8-.8-3z"/>',
  senai: '<path class="t" d="M4 16.5a8 8 0 0 1 16 0z"/><path d="M2.5 16.5h19v2.5h-19zM10 9V5.5h4V9"/>',
  universidade: '<path class="t" d="M12 4 2 9l10 5 10-5z"/><path d="M6 11v5c2 2 10 2 12 0v-5M22 9v6"/>',
  biblioteca: '<path d="M4 4h3.5v16H4zM8.5 4H12v16H8.5z"/><path class="t" d="M13.5 5.2l3.3-.9 4 15.4-3.3.9z"/><path d="M2.5 20.5h19"/>',

  // --- Saúde e segurança ---------------------------------------------------
  hospital: '<rect x="4" y="4" width="16" height="17" rx="1.5"/><path d="M9 8v6M15 8v6M9 11h6M10 21v-3.5h4V21"/>',
  clinica: '<path class="t" d="M9 3.5h6V9h5.5v6H15v5.5H9V15H3.5V9H9z"/>',
  posto_saude: '<path d="M17 3.5l3.5 3.5M18.75 5.25l-3 3"/><path class="t" d="M15.5 6 18 8.5 9 17.5 6.5 15z"/><path d="M7.75 16.25 3.5 20.5M10 11.5l1.5 1.5M12.5 9l1.5 1.5"/>',
  caps: '<path d="M9 21v-3.5H6.5A1.5 1.5 0 0 1 5 16v-3l-1.5-.5L5 9.5A7 7 0 0 1 19 9.5c0 2.5-1 4.4-2.5 5.5V21"/><path class="t" d="M12 14.2 9.7 11.9a1.5 1.5 0 0 1 2.3-1.9 1.5 1.5 0 0 1 2.3 1.9z"/>',
  delegacia: '<path class="t" d="M12 2.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 15.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  guarda_municipal: '<path class="t" d="M12 3 4.5 6v5.5c0 4.5 3.2 8 7.5 9.5 4.3-1.5 7.5-5 7.5-9.5V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  central_cameras: '<path class="t" d="M3 7.5 15 4l1.8 6L4.8 13.5z"/><path d="M16.2 8l3.3-1 1 3.3-3.3 1M8 12.3 9.3 17H4M4 14.5v5"/>',
  quartel_bombeiros: '<path class="t" d="M9 9v10.5h6V9a3 3 0 0 0-6 0z"/><path d="M12 4.5V6M7.5 21h9M7.5 9h9M6 13h3M15 13h3"/><circle cx="12" cy="13" r="1.2"/>',
  base_samu: '<path d="M2.5 17V7.5h11V17M13.5 10h4.2l3 3.2V17M2.5 17h18.2M8 10.2v4M6 12.2h4"/><circle class="t" cx="7" cy="17.5" r="1.8"/><circle class="t" cx="16.5" cy="17.5" r="1.8"/>',

  // --- Alimentos -----------------------------------------------------------
  mercado_municipal: '<path class="t" d="M3 9.5h18l-2 10a1.5 1.5 0 0 1-1.5 1.2h-11A1.5 1.5 0 0 1 5 19.5z"/><path d="M8 9.5 11 3.5M16 9.5l-3-6M9 13v4.5M12 13v4.5M15 13v4.5"/>',
  restaurante_popular: '<path d="M6.5 3v6a2 2 0 0 0 4 0V3M8.5 3v18"/><path class="t" d="M17 21V3c-2 1-3 3.5-3 7 0 1.5.8 2.5 3 2.5"/>',
  ceasa: '<path class="t" d="M3 11h18l-1.5 9.5h-15z"/><path d="M5 15.5h14"/><circle cx="8" cy="8" r="3"/><circle cx="15.5" cy="7.5" r="3.5"/><path d="M15.5 4V2.5"/>',

  // --- Turismo e cultura ---------------------------------------------------
  museu: '<path class="t" d="M3 9 12 3.5 21 9z"/><path d="M5 9v9M9.5 9v9M14.5 9v9M19 9v9M3 18h18M2 21h20"/>',
  campo_futebol: '<rect x="2.5" y="5" width="19" height="14" rx="1"/><path d="M12 5v14M2.5 9h3v6h-3M21.5 9h-3v6h3"/><circle cx="12" cy="12" r="2.8"/>',
  estadio: '<ellipse cx="12" cy="9" rx="9.5" ry="5.5"/><ellipse class="t" cx="12" cy="9" rx="5.5" ry="2.6"/><path d="M2.5 9v6c0 3.2 4.3 5.5 9.5 5.5s9.5-2.3 9.5-5.5V9"/>',
  pista_atletismo: '<rect x="2.5" y="6" width="19" height="12" rx="6"/><rect class="t" x="7" y="9.5" width="10" height="5" rx="2.5"/>',
  parque_aquatico: '<path d="M2 16c1.7 0 1.7 1.5 3.3 1.5S7 16 8.7 16s1.7 1.5 3.3 1.5 1.7-1.5 3.3-1.5 1.7 1.5 3.4 1.5S20.3 16 22 16"/><path d="M5 14V5.5a2 2 0 0 1 4 0M13 14V5.5a2 2 0 0 1 4 0M5 8h8M5 11.5h8"/>',
  parque_tematico: '<path d="M2 18c2.5 0 3-10 6-10s3.5 8 6.5 8S18 6 22 6"/><path d="M4 21v-3.5M8 21V8M12 21v-6M16 21v-6M20 21V7"/>',
  hotel: '<path d="M3 5v16M3 15h18v6M21 15v-3a3 3 0 0 0-3-3h-7v6"/><circle class="t" cx="7" cy="11.5" r="2"/>',
  arena_eventos: '<rect class="t" x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M8.5 21h7"/>',
  teatro: '<path class="t" d="M3 4.5h9v5a4.5 4.5 0 0 1-9 0z"/><path d="M5.3 7.5h1.4M8.3 7.5h1.4M5.5 10.5c1 1 3 1 4 0"/><path d="M12.5 10H21v4.5a4.25 4.25 0 0 1-8.5 0z"/><path d="M14.8 12.5h1.4M17.3 12.5h1.4M15 16.6c1-.7 2.5-.7 3.5 0"/>',
  aeroporto: '<path class="t" d="M21 3.2c-.8-.8-2.2-.6-3 .2l-3.3 3.3L6 4.5 4.5 6l7 4.5L8 14H5l-1.5 1.5L7 17l1.5 3.5L10 19v-3l3.5-3.5L18 19.5l1.5-1.5-2.5-8.7 3.3-3.3c.8-.8 1-2.2.2-3z"/>',

  // --- Lixo e esgoto -------------------------------------------------------
  lixao: '<path class="t" d="M2.5 20.5c1.5-3.5 4-5.5 6.5-5.5 1.2-2 3-3 5-3 3 0 5.5 3 7.5 8.5z"/><path d="M8.5 12.5l2-3 1.5 2M15 8.5h3V11h-3M7.5 5.5l1-1M12 4l1 1M17 5l-1-1"/>',
  aterro: '<path d="M2.5 21h19M4 17.5h16M6 14h12M12 14V9"/><path class="t" d="M12 10c-2.5 0-3.5-1.5-3.5-4 2.5 0 3.5 1.5 3.5 4zM12 9c2 0 3-1.2 3-3.2-2 0-3 1.2-3 3.2z"/>',
  centro_reciclagem: arrows,
  estacao_esgoto: '<path d="M2.5 5h8a2 2 0 0 1 2 2v2.5"/><path class="f" d="M12.5 11.5s1.7 1.9 1.7 3.1a1.7 1.7 0 0 1-3.4 0c0-1.2 1.7-3.1 1.7-3.1z"/><path d="M4 15v4.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V15"/><path d="M6.5 18.2c1.2-.8 2.4-.8 3.6 0s2.4.8 3.6 0 2.4-.8 3.6 0"/>',

  // --- Lazer ---------------------------------------------------------------
  praca: '<circle class="t" cx="9" cy="8" r="5"/><path d="M9 13v8M13.5 16.5h8M14.5 16.5V21M20.5 16.5V21M14 19h7"/>',
  cinema: '<rect x="3" y="10" width="18" height="10.5" rx="1.5"/><path class="t" d="M3.2 9.4l17-5 .8 2.7-17 5z"/><path d="M7.5 8.1l1.2 1.4M12 6.8l1.2 1.4M16.5 5.5l1.2 1.4"/>',
  ginasio: '<rect class="t" x="5" y="6.5" width="3" height="11" rx="1"/><rect class="t" x="16" y="6.5" width="3" height="11" rx="1"/><path d="M2.5 9.5v5M21.5 9.5v5M8 12h8"/>',

  // --- Transporte e carga --------------------------------------------------
  ponto_onibus: '<path d="M12 21.5v-9M8.5 21.5h7"/><rect x="5" y="2.5" width="14" height="10" rx="2"/><path class="t" d="M8.5 5h7v5h-7z"/><path d="M8.5 7.5h7"/>',
  estacao_brt: '<path class="t" d="M2.5 16V8A1.5 1.5 0 0 1 4 6.5h16A1.5 1.5 0 0 1 21.5 8v8z"/><path d="M12 6.5V16M5 9.5h4M15 9.5h4"/><circle cx="6" cy="17" r="1.6"/><circle cx="17.5" cy="17" r="1.6"/>',
  estacao_vlt: '<path d="M9 3h6M12 3v3"/><rect x="5" y="6" width="14" height="12" rx="3"/><path d="M5 11h14M8 18l-2 3M16 18l2 3"/><circle class="f" cx="8.5" cy="14.5" r="1"/><circle class="f" cx="15.5" cy="14.5" r="1"/>',
  estacao_metro: '<circle cx="12" cy="12" r="9"/><path d="M7.5 16.5v-9l4.5 6 4.5-6v9"/>',
  patio_ferroviario: '<path d="M8 3 4.5 21M16 3l3.5 18M7 7h10M6.3 11h11.4M5.5 15h13M4.8 19h14.4"/>',
  porto: '<circle cx="12" cy="5" r="2"/><path d="M12 7v14M8 10.5h8M4 13a8 8 0 0 0 16 0M2.5 14.5 4 13l1.5 1.5M18.5 14.5 20 13l1.5 1.5"/>',
  centro_distribuicao: '<path class="t" d="M12 2.8 20.5 7v10L12 21.2 3.5 17V7z"/><path d="M3.5 7 12 11.3 20.5 7M12 11.3v9.9M7.7 4.9l8.5 4.3"/>',

  // --- Mapas ---------------------------------------------------------------
  valor: '<path class="t" d="M3 12.6V4.5A1.5 1.5 0 0 1 4.5 3h8.1l8.5 8.5a1.5 1.5 0 0 1 0 2.1l-7.4 7.4a1.5 1.5 0 0 1-2.1 0z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  poluicao: '<path class="t" d="M6.5 15a4 4 0 0 1-.4-8 5.5 5.5 0 0 1 10.6-1A4.5 4.5 0 0 1 17.5 15z"/><path d="M5 18.5h9M9 21h10"/>',
  saude: '<path class="t" d="M12 20s-8-4.8-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6.2-8 11-8 11z"/><path d="M4.5 12h4L10 9.5l2 5 1.5-2.5h6"/>',
  alimentos: '<path class="t" d="M12 7.5c-1.5-1-5.5-1.5-7 2-1.5 3.6.5 9.5 3.5 10.5 1.3.4 2.3-.3 3.5-.3s2.2.7 3.5.3c3-1 5-6.9 3.5-10.5-1.5-3.5-5.5-3-7-2z"/><path d="M12 7.5c0-2 .5-3.5 2.5-4.5"/>',
  lixo: '<path d="M4 6.5h16M9 6.5V4h6v2.5M10 10.5v6.5M14 10.5v6.5"/><path class="t" d="M6 6.5l1 14h10l1-14"/>',
  transito: '<rect x="8" y="2.5" width="8" height="19" rx="2.5"/><circle class="f" cx="12" cy="7" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="17" r="1.5"/>',
};

// Outros nomes para o mesmo desenho (prédio, mapa ou menu com o mesmo símbolo).
const ALIASES = {
  estatais: 'refinaria',
  energia: 'power', agua: 'water', escolas: 'escola', crime: 'guarda_municipal', satisfacao: 'face-happy',
};

/** SVG do ícone `name` (vazio se não existir). */
export function icon(name, className = '') {
  const body = ICONS[name] ?? ICONS[ALIASES[name]];
  if (!body) return '';
  return `<svg class="icon ${className}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
}

/** Preenche os elementos com data-icon="nome" do HTML estático. */
export function hydrateIcons(root = document) {
  for (const el of root.querySelectorAll('[data-icon]')) el.innerHTML = icon(el.dataset.icon);
}

/** Cor do desenho sobre um fundo `hex`: escuro em fundo claro, claro em fundo escuro. */
export function inkFor(hex) {
  const n = parseInt(hex.slice(1, 7), 16);
  const lum = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  return lum > 150 ? '#1e2127' : '#ffffff';
}
