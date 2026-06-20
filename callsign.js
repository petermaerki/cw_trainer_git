/* ------------------------------------------------------------------ */
/*  Rufzeichen-Generator                                               */
/* ------------------------------------------------------------------ */

// Länderliste: [Prefix, DigitRange|null, Gewicht]
// DigitRange null → Ziffer bereits im Prefix enthalten
const _CS_PREFIXES = [
  // Europa ~40%
  ['DL',  [1,9], 8],   // Deutschland
  ['DK',  [1,9], 2],
  ['DJ',  [1,9], 2],
  ['DF',  [1,9], 1],
  ['HB9', null,  3],   // Schweiz (Volllizenz)
  ['HB3', null,  1],   // Schweiz (Einsteigerlizenz)
  ['OE',  [1,9], 3],   // Österreich
  ['F',   [1,9], 5],   // Frankreich
  ['I',   [0,9], 3],   // Italien
  ['IK',  [0,9], 2],
  ['IZ',  [0,9], 1],
  ['PA',  [0,9], 2],   // Niederlande
  ['PE',  [0,9], 1],
  ['G',   [0,9], 4],   // England
  ['M',   [0,9], 2],
  ['SP',  [1,9], 3],   // Polen
  ['SQ',  [1,9], 1],
  ['OK',  [1,9], 3],   // Tschechien
  ['OL',  [1,9], 1],
  ['SM',  [1,9], 3],   // Schweden
  ['SK',  [1,9], 1],
  ['LA',  [1,9], 2],   // Norwegen
  ['OH',  [1,9], 3],   // Finnland
  ['HA',  [1,9], 2],   // Ungarn
  ['LZ',  [1,9], 2],   // Bulgarien
  ['YO',  [1,9], 2],   // Rumänien
  ['UT',  [1,9], 2],   // Ukraine
  ['UR',  [1,9], 1],
  ['EA',  [1,9], 3],   // Spanien
  ['ON',  [1,9], 2],   // Belgien
  ['OZ',  [1,9], 2],   // Dänemark
  ['CT',  [1,9], 1],   // Portugal
  ['UA',  [1,9], 3],   // Russland
  ['RA',  [1,9], 2],
  ['RK',  [1,9], 1],
  ['OM',  [1,9], 1],   // Slowakei
  ['YU',  [1,9], 1],   // Serbien
  ['SV',  [1,9], 2],   // Griechenland
  // Nordamerika ~25%
  ['W',   [1,9], 6],   // USA
  ['K',   [1,9], 5],
  ['N',   [1,9], 4],
  ['AA',  [1,9], 1],
  ['WB',  [1,9], 1],
  ['WA',  [1,9], 1],
  ['VE',  [1,9], 4],   // Kanada
  ['VA',  [1,9], 2],
  // Asien / Ozeanien ~15%
  ['JA',  [1,9], 5],   // Japan
  ['JH',  [1,9], 2],
  ['JR',  [1,9], 1],
  ['VK',  [1,9], 3],   // Australien
  ['ZL',  [1,9], 2],   // Neuseeland
  ['BY',  [1,9], 2],   // China
  ['BG',  [1,9], 1],
  ['HL',  [1,9], 2],   // Südkorea
  ['9V1', null,  1],   // Singapur
  ['HS',  [0,9], 1],   // Thailand
  // Südamerika ~10%
  ['PY',  [1,9], 3],   // Brasilien
  ['LU',  [1,9], 2],   // Argentinien
  ['CE',  [1,9], 1],   // Chile
  ['YV',  [1,9], 1],   // Venezuela
  ['CX',  [1,9], 1],   // Uruguay
  // Afrika / Naher Osten ~10%
  ['ZS',  [1,9], 2],   // Südafrika
  ['4X',  [1,9], 2],   // Israel
  ['5B4', null,  1],   // Zypern
  ['A6',  [1,9], 1],   // Vereinigte Arabische Emirate
  ['CN',  [2,9], 1],   // Marokko
  ['SU',  [1,9], 1],   // Ägypten
];

const _CS_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const _CS_SUFFIXES = ['/P', '/M', '/MM', '/QRP'];

// Gesamtgewicht vorausberechnen
const _CS_TOTAL_W = _CS_PREFIXES.reduce((s, p) => s + p[2], 0);

function generateCallsign() {
  // Gewichtsbasierte Auswahl des Präfixes
  let r = Math.random() * _CS_TOTAL_W;
  let entry = _CS_PREFIXES[0];
  for (const p of _CS_PREFIXES) {
    r -= p[2];
    if (r <= 0) { entry = p; break; }
  }

  let call = entry[0];

  // Ziffer hinzufügen falls nicht im Präfix eingebettet
  if (entry[1] !== null) {
    const [min, max] = entry[1];
    call += String(min + Math.floor(Math.random() * (max - min + 1)));
  }

  // Suffix: 30% 2-buchstabig, 70% 3-buchstabig
  const sfxLen = Math.random() < 0.3 ? 2 : 3;
  for (let i = 0; i < sfxLen; i++)
    call += _CS_LETTERS[Math.floor(Math.random() * 26)];

  // Gelegentlich /P /M /MM /QRP (~7%)
  if (Math.random() < 0.07)
    call += _CS_SUFFIXES[Math.floor(Math.random() * _CS_SUFFIXES.length)];

  return call;
}

