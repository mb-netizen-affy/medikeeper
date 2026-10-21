// Génère public/meds.json à partir de la Base de données publique des médicaments (ANSM).
//
//   npm run meds                 → télécharge les fichiers officiels
//   npm run meds -- ./mon-dossier → utilise des fichiers déjà téléchargés
//                                   (CIS_bdpm.txt, CIS_CIP_bdpm.txt, CIS_COMPO_bdpm.txt)
//
// À relancer de temps en temps pour récupérer les nouveaux médicaments.

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = 'https://base-donnees-publique.medicaments.gouv.fr';
const FILES = ['CIS_bdpm.txt', 'CIS_CIP_bdpm.txt', 'CIS_COMPO_bdpm.txt'];
const OUT = path.join(process.cwd(), 'public', 'meds.json');

function decode(buf) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf); // anciens fichiers en Latin-1
  }
}

async function getFile(name, localDir) {
  if (localDir) return decode(await readFile(path.join(localDir, name)));
  const urls = [`${BASE}/download/file/${name}`, `${BASE}/telechargement.php?fichier=${name}`];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        process.stdout.write(`  ✓ ${name}\n`);
        return decode(new Uint8Array(await res.arrayBuffer()));
      }
    } catch {
      /* URL suivante */
    }
  }
  throw new Error(
    `Impossible de télécharger ${name}.\n` +
      `Télécharge-le à la main sur ${BASE}/telechargement puis lance : npm run meds -- ./dossier`
  );
}

const rows = (text) =>
  text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => l.split('\t').map((c) => c.trim()));

const shorten = (s, n = 90) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

async function main() {
  const localDir = process.argv[2];
  if (localDir) await stat(localDir);
  console.log(localDir ? `Lecture des fichiers dans ${localDir}…` : 'Téléchargement des fichiers ANSM…');

  const [specialites, presentations, compositions] = await Promise.all(FILES.map((f) => getFile(f, localDir)));

  // CIS → nom ("DOLIPRANE 1000 mg, comprimé")
  const s = {};
  for (const r of rows(specialites)) if (r[0] && r[1]) s[r[0]] = r[1];

  // CIS → substance(s) active(s). Pour chaque composant, on préfère
  // la "fraction thérapeutique" (FT) à la "substance active" (SA).
  const parts = {};
  for (const r of rows(compositions)) {
    const [cis, , , substance, , , nature, link] = r;
    if (!cis || !substance || !['SA', 'FT'].includes(nature)) continue;
    const key = `${cis}|${link || substance}`;
    if (!parts[key] || nature === 'FT') parts[key] = { cis, substance: substance.toUpperCase() };
  }
  const c = {};
  for (const { cis, substance } of Object.values(parts)) {
    c[cis] ||= [];
    if (!c[cis].includes(substance)) c[cis].push(substance);
  }
  for (const cis in c) c[cis] = c[cis].sort().join(' + ');

  // CIP13 → [CIS, présentation]
  const p = {};
  for (const r of rows(presentations)) {
    const [cis, , label, , , , cip13] = r;
    if (cis && /^\d{13}$/.test(cip13 || '') && s[cis]) p[cip13] = [cis, shorten(label || '')];
  }

  // On ne garde que les spécialités qui ont au moins une boîte
  const used = new Set(Object.values(p).map(([cis]) => cis));
  for (const cis of Object.keys(s)) if (!used.has(cis)) delete s[cis];
  for (const cis of Object.keys(c)) if (!used.has(cis)) delete c[cis];

  await mkdir(path.dirname(OUT), { recursive: true });
  const json = JSON.stringify({ date: new Date().toISOString().slice(0, 10), s, c, p });
  await writeFile(OUT, json);
  console.log(
    `✅ public/meds.json : ${Object.keys(p).length} boîtes, ${used.size} médicaments (${(json.length / 1e6).toFixed(1)} Mo)`
  );
}

main().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
