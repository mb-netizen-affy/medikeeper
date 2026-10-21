'use client';

// Toutes les données restent sur l'appareil (localStorage).
// Pas de compte, pas de serveur : ce sont des données de santé.

import { useEffect, useState, useSyncExternalStore } from 'react';
import { uid } from './utils';

const KEY = 'medikeeper:v1';

export const KIT_PRESETS = [
  { kind: 'maison', emoji: '🏠', name: 'Maison' },
  { kind: 'voiture', emoji: '🚗', name: 'Voiture' },
  { kind: 'voyage', emoji: '🧳', name: 'Trousse de voyage' },
  { kind: 'proche', emoji: '👵', name: 'Chez Maman' },
  { kind: 'autre', emoji: '🎒', name: 'Sac de sport' },
];

// Simples aide-mémoire, modifiables : pas des conseils médicaux.
const CHECKLIST_PRESETS = {
  voyage: ['Traitements habituels (assez pour tout le séjour)', 'Ordonnances en cours', 'Carte Vitale / carte européenne', 'Pansements', 'Thermomètre'],
  voiture: ['Pansements', 'Compresses', 'Gants', 'Couverture de survie'],
};

export function newKit(preset) {
  return {
    id: uid(),
    kind: preset.kind,
    emoji: preset.emoji,
    name: preset.name,
    checklist: (CHECKLIST_PRESETS[preset.kind] || []).map((text) => ({ id: uid(), text, done: false })),
    createdAt: new Date().toISOString(),
  };
}

function initialState() {
  return { kits: [newKit(KIT_PRESETS[0])], items: [], names: {} };
}

let state = null;
const listeners = new Set();

function load() {
  if (state) return state;
  try {
    const raw = localStorage.getItem(KEY);
    state = raw ? JSON.parse(raw) : initialState();
    if (!state.kits?.length) state = { ...initialState(), ...state, kits: initialState().kits };
    state.names ||= {};
  } catch {
    state = initialState();
  }
  return state;
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* stockage plein ou bloqué : on garde en mémoire */
  }
}

export function update(fn) {
  state = fn(load());
  save();
  listeners.forEach((l) => l());
}

function subscribe(l) {
  listeners.add(l);
  const onStorage = (e) => {
    if (e.key === KEY) {
      state = null;
      l();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener('storage', onStorage);
  };
}

const getServerSnapshot = () => null;

/** Renvoie l'état (null tant que la page n'est pas chargée dans le navigateur). */
export function useMediStore() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const snap = useSyncExternalStore(subscribe, () => (mounted ? load() : null), getServerSnapshot);
  return snap;
}

// ---------- Actions ----------

export const actions = {
  addItems(newItems) {
    update((s) => {
      const names = { ...s.names };
      newItems.forEach((it) => {
        if (it.nameTyped && it.gtin) names[it.gtin] = it.name;
      });
      const clean = newItems.map(({ nameTyped, ...it }) => ({ ...it, id: uid(), addedAt: new Date().toISOString() }));
      return { ...s, names, items: [...s.items, ...clean] };
    });
  },
  updateItem(id, patch) {
    update((s) => ({ ...s, items: s.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) }));
  },
  removeItem(id) {
    update((s) => ({ ...s, items: s.items.filter((it) => it.id !== id) }));
  },
  removeExpired(kitId) {
    const today = new Date().toISOString().slice(0, 10);
    update((s) => ({
      ...s,
      items: s.items.filter((it) => !(it.expiry && it.expiry < today && (!kitId || it.kitId === kitId))),
    }));
  },
  addKit(preset) {
    const kit = newKit(preset);
    update((s) => ({ ...s, kits: [...s.kits, kit] }));
    return kit;
  },
  updateKit(id, patch) {
    update((s) => ({ ...s, kits: s.kits.map((k) => (k.id === id ? { ...k, ...patch } : k)) }));
  },
  removeKit(id) {
    update((s) => ({
      ...s,
      kits: s.kits.filter((k) => k.id !== id),
      items: s.items.filter((it) => it.kitId !== id),
    }));
  },
  // Import d'une trousse exportée depuis un autre téléphone :
  // si elle existe déjà ici (même identifiant), son contenu est remplacé.
  importKit(data) {
    if (data?.app !== 'medikeeper' || !data.kit?.id) throw new Error('Fichier non reconnu');
    update((s) => {
      const exists = s.kits.some((k) => k.id === data.kit.id);
      const kit = { ...data.kit, syncedAt: new Date().toISOString() };
      return {
        ...s,
        kits: exists ? s.kits.map((k) => (k.id === kit.id ? kit : k)) : [...s.kits, kit],
        items: [
          ...s.items.filter((it) => it.kitId !== kit.id),
          ...(data.items || []).map((it) => ({ ...it, kitId: kit.id })),
        ],
      };
    });
    return data.kit;
  },
};

export function exportKit(s, kitId) {
  const kit = s.kits.find((k) => k.id === kitId);
  return {
    app: 'medikeeper',
    version: 1,
    exportedAt: new Date().toISOString(),
    kit,
    items: s.items.filter((it) => it.kitId === kitId),
  };
}
