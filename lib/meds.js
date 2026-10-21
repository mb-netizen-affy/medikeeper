// Recherche du nom d'un médicament à partir de son code CIP13,
// grâce au fichier public/meds.json généré par `npm run meds`
// (données publiques de l'ANSM). Tout se passe sur le téléphone.
//
// Format de meds.json :
//   { date, s: { CIS: "NOM, forme" }, c: { CIS: "SUBSTANCE(S)" },
//     p: { CIP13: [CIS, "présentation"] } }

let dbPromise = null;

export function loadMedsDb() {
  if (!dbPromise) {
    dbPromise = fetch('/meds.json')
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return dbPromise;
}

/**
 * Infos d'un médicament : { name, cis, substance, presentation } ou null.
 * `userNames` contient les noms saisis à la main pour les codes inconnus.
 */
export async function lookupMed(code, userNames = {}) {
  if (!code) return null;
  const known = userNames[code.gtin] || (code.cip13 && userNames[code.cip13]);
  const db = code.cip13 ? await loadMedsDb() : null;
  const p = db?.p?.[code.cip13];
  if (p) {
    const [cis, presentation] = p;
    return {
      name: known || prettyName(db.s[cis] || ''),
      cis,
      substance: db.c?.[cis] || '',
      presentation: presentation || '',
    };
  }
  return known ? { name: known, cis: null, substance: '', presentation: '' } : null;
}

// "DOLIPRANE 1000 mg, comprimé" → "Doliprane 1000 mg, comprimé"
export function prettyName(s) {
  const [brand, ...rest] = s.split(',');
  const nice = brand
    .toLowerCase()
    .replace(/(^|[\s\-/(])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase())
    .replace(/\b(Mg|Ml|Ui|G|µg)\b/g, (u) => u.toLowerCase());
  return [nice, ...rest].join(',').trim();
}

export const prettySubstance = (s) =>
  (s || '')
    .toLowerCase()
    .split(' + ')
    .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
    .join(' + ');
