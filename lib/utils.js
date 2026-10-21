export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// minuscules, sans accents : "Paracétamol" → "paracetamol"
export const norm = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

const DAY = 24 * 60 * 60 * 1000;
export const SOON_DAYS = 90; // "expire bientôt" = moins de 3 mois

export function daysUntil(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const end = new Date(y, m - 1, d, 23, 59, 59);
  return Math.floor((end - Date.now()) / DAY);
}

// 'expired' | 'soon' | 'ok' | 'unknown'
export function expiryStatus(iso) {
  const days = daysUntil(iso);
  if (days === null) return 'unknown';
  if (days < 0) return 'expired';
  if (days <= SOON_DAYS) return 'soon';
  return 'ok';
}

// "2027-12-31" → "12/2027" (comme sur les boîtes)
export function formatExpiry(iso) {
  if (!iso) return 'Date ?';
  const [y, m] = iso.split('-');
  return `${m}/${y}`;
}

export function expiryLabel(iso) {
  const days = daysUntil(iso);
  if (days === null) return 'Péremption inconnue';
  if (days < 0) return `Périmé depuis ${formatExpiry(iso)}`;
  if (days === 0) return "Expire aujourd'hui";
  if (days <= 31) return `Expire dans ${days} j`;
  if (days <= SOON_DAYS) return `Expire dans ${Math.round(days / 30)} mois`;
  return `Exp. ${formatExpiry(iso)}`;
}

// <input type="month"> donne "2027-12" → dernier jour du mois
export function monthToIso(v) {
  if (!/^\d{4}-\d{2}$/.test(v || '')) return null;
  const [y, m] = v.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${v}-${String(d).padStart(2, '0')}`;
}

export const isoToMonth = (iso) => (iso ? iso.slice(0, 7) : '');

export function byExpiry(a, b) {
  if (!a.expiry && !b.expiry) return a.name.localeCompare(b.name);
  if (!a.expiry) return 1;
  if (!b.expiry) return -1;
  return a.expiry.localeCompare(b.expiry);
}

// Petit retour sensoriel quand un scan est accepté
let audioCtx;
export function beep() {
  try {
    if (navigator.vibrate) navigator.vibrate(60);
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = 1320;
    g.gain.setValueAtTime(0.08, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.12);
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + 0.13);
  } catch {
    /* pas de son, pas grave */
  }
}
