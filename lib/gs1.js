// Lecture des codes imprimés sur les boîtes de médicaments.
//
// Le Datamatrix d'une boîte suit la norme GS1 : une suite de champs,
// chacun précédé d'un identifiant (AI) :
//   (01) code produit GTIN, 14 chiffres — en France "0" + CIP13
//   (17) date de péremption AAMMJJ (JJ = 00 → fin du mois)
//   (10) numéro de lot, longueur variable
//   (21) numéro de série, longueur variable
// Les champs variables sont terminés par le caractère GS (code 29),
// que certains lecteurs perdent : on retombe alors sur une lecture
// par essais (voir parseLoose).

const GS = '\u001d';

// AI à longueur fixe utiles ici (nombre de caractères après l'AI)
const FIXED = { '01': 14, '02': 14, '11': 6, '15': 6, '16': 6, '17': 6 };
// AI à longueur variable (longueur max)
const VARIABLE = { '10': 20, '21': 20, '22': 20, '240': 30, '710': 20, '711': 20, '712': 20, '714': 20 };

function aiAt(s, i) {
  for (const len of [2, 3]) {
    const ai = s.slice(i, i + len);
    if (FIXED[ai] || VARIABLE[ai]) return ai;
  }
  return null;
}

function isValidDate6(v) {
  if (!/^\d{6}$/.test(v)) return false;
  const m = Number(v.slice(2, 4));
  const d = Number(v.slice(4, 6));
  return m >= 1 && m <= 12 && d >= 0 && d <= 31;
}

function isValidGtin(v) {
  if (!/^\d{14}$/.test(v)) return false;
  let sum = 0;
  for (let i = 0; i < 13; i++) sum += Number(v[i]) * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === Number(v[13]);
}

function validField(ai, v) {
  if (ai === '01' || ai === '02') return isValidGtin(v);
  if (['11', '15', '16', '17'].includes(ai)) return isValidDate6(v);
  return v.length > 0 && !v.includes(GS);
}

// Lecture stricte : les séparateurs GS sont présents
function parseStrict(s) {
  const out = {};
  let i = 0;
  while (i < s.length) {
    if (s[i] === GS) { i++; continue; }
    const ai = aiAt(s, i);
    if (!ai) return null;
    i += ai.length;
    let v;
    if (FIXED[ai]) {
      v = s.slice(i, i + FIXED[ai]);
      i += FIXED[ai];
    } else {
      const end = s.indexOf(GS, i);
      v = end === -1 ? s.slice(i) : s.slice(i, end);
      i = end === -1 ? s.length : end + 1;
    }
    if (!validField(ai, v)) return null;
    out[ai] = v;
  }
  return out;
}

// Lecture par essais quand les GS ont disparu : pour chaque champ variable,
// on essaie toutes les longueurs jusqu'à ce que la suite se lise entièrement.
// On privilégie la coupe la plus courte qui permet de lire un champ
// fixe valide juste après (typiquement 17 = date).
function parseLoose(s, i = 0, seen = new Set()) {
  if (i === s.length) return {};
  const ai = aiAt(s, i);
  if (!ai || seen.has(ai)) return null;
  const start = i + ai.length;
  const next = new Set(seen).add(ai);
  if (FIXED[ai]) {
    const v = s.slice(start, start + FIXED[ai]);
    if (v.length !== FIXED[ai] || !validField(ai, v)) return null;
    const rest = parseLoose(s, start + FIXED[ai], next);
    return rest ? { [ai]: v, ...rest } : null;
  }
  const max = Math.min(VARIABLE[ai], s.length - start);
  for (let len = 1; len <= max; len++) {
    const v = s.slice(start, start + len);
    if (start + len === s.length) return { [ai]: v };
    const nextAi = aiAt(s, start + len);
    // on ne coupe que devant un champ à longueur fixe : c'est la seule
    // coupe qu'on peut vérifier (date ou GTIN valides)
    if (!nextAi || !FIXED[nextAi]) continue;
    const rest = parseLoose(s, start + len, next);
    if (rest) return { [ai]: v, ...rest };
  }
  return null;
}

function clean(raw) {
  let s = String(raw || '').trim();
  s = s.replace(/^\][a-zA-Z]\d/, ''); // identifiant de symbologie, ex. ]d2
  s = s.replace(/<GS>|\{GS\}|\\x1d|\\u001d/gi, GS); // GS écrits en texte
  while (s.startsWith(GS)) s = s.slice(1);
  return s;
}

// Forme lisible "(01)03400...(17)271231(10)AB12"
function parseHuman(s) {
  if (!s.startsWith('(')) return null;
  const out = {};
  const re = /\((\d{2,4})\)([^(]*)/g;
  let m;
  while ((m = re.exec(s))) out[m[1]] = m[2].trim();
  return Object.keys(out).length ? out : null;
}

// 20AAMMJJ → "AAAA-MM-JJ" ; JJ = 00 → dernier jour du mois
export function gs1DateToIso(v) {
  if (!isValidDate6(v)) return null;
  const y = 2000 + Number(v.slice(0, 2));
  const m = Number(v.slice(2, 4));
  let d = Number(v.slice(4, 6));
  if (d === 0) d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// CIP13 français : commence par 34009 (ou 3400 pour les anciens)
export function gtinToCip13(gtin) {
  if (!gtin) return null;
  const g = gtin.length === 14 ? gtin.slice(1) : gtin;
  return /^3400\d{9}$/.test(g) ? g : null;
}

/**
 * Lit un code scanné (Datamatrix GS1, code-barres EAN-13 / CIP13, ou texte collé).
 * Retourne { gtin, cip13, expiry, lot, serial, raw } ou null si illisible.
 */
export function parseMedCode(raw) {
  const s = clean(raw);
  if (!s) return null;

  // Code-barres linéaire : EAN-13 ou CIP13 seul, sans date
  if (/^\d{13}$/.test(s)) {
    const gtin = '0' + s;
    return { gtin, cip13: gtinToCip13(gtin), expiry: null, lot: null, serial: null, raw: s };
  }

  const fields =
    parseHuman(s) ||
    (s.includes(GS) ? parseStrict(s) : null) ||
    parseLoose(s) ||
    parseStrict(s);

  if (!fields || !fields['01']) return null;
  return {
    gtin: fields['01'],
    cip13: gtinToCip13(fields['01']),
    expiry: fields['17'] ? gs1DateToIso(fields['17']) : null,
    lot: fields['10'] || null,
    serial: fields['21'] || null,
    raw: s,
  };
}
