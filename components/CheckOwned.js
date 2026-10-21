'use client';

// « J'en ai déjà ? » : au comptoir de la pharmacie, on scanne la boîte
// (ou on tape un nom) pour savoir si on en a déjà à la maison.

import { useMemo, useState } from 'react';
import Scanner from './Scanner';
import { parseMedCode } from '../lib/gs1';
import { lookupMed, prettySubstance } from '../lib/meds';
import { beep, byExpiry, expiryLabel, expiryStatus, norm } from '../lib/utils';

export default function CheckOwned({ state }) {
  const [query, setQuery] = useState('');
  const [scanning, setScanning] = useState(false);
  const [target, setTarget] = useState(null); // médicament scanné

  const kitsById = useMemo(() => Object.fromEntries(state.kits.map((k) => [k.id, k])), [state.kits]);

  async function onCode(raw) {
    const code = parseMedCode(raw);
    if (!code) return;
    beep();
    setScanning(false);
    const info = await lookupMed(code, state.names);
    setQuery('');
    setTarget({ ...code, name: info?.name || 'Médicament inconnu', cis: info?.cis, substance: info?.substance || '' });
  }

  const groups = useMemo(() => {
    const valid = [...state.items].sort(byExpiry);
    if (target) {
      const exact = valid.filter((it) => it.gtin && it.gtin === target.gtin);
      const sameMed = valid.filter((it) => !exact.includes(it) && target.cis && it.cis === target.cis);
      const sameSub = valid.filter(
        (it) => !exact.includes(it) && !sameMed.includes(it) && target.substance && norm(it.substance) === norm(target.substance)
      );
      return [
        { title: 'Exactement cette boîte', items: exact },
        { title: 'Le même médicament, autre conditionnement', items: sameMed },
        { title: `Autre marque, même substance (${prettySubstance(target.substance)})`, items: sameSub, caution: true },
      ].filter((g) => g.items.length);
    }
    const q = norm(query);
    if (q.length < 2) return [];
    const byName = valid.filter((it) => norm(it.name).includes(q));
    const bySub = valid.filter((it) => !byName.includes(it) && norm(it.substance).includes(q));
    return [
      { title: 'Par nom', items: byName },
      { title: 'Contient cette substance', items: bySub, caution: true },
    ].filter((g) => g.items.length);
  }, [state.items, target, query]);

  const searched = target || norm(query).length >= 2;
  const usable = groups.flatMap((g) => g.items).filter((it) => expiryStatus(it.expiry) !== 'expired');

  return (
    <section className="screen">
      <header className="screen__head">
        <h1>J'en ai déjà ?</h1>
        <p className="muted">Avant d'acheter, vérifie dans toutes tes trousses.</p>
      </header>

      <div className="search">
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setTarget(null);
          }}
          placeholder="Doliprane, paracétamol, sérum…"
        />
        <button className={`btn ${scanning ? '' : 'btn--primary'}`} onClick={() => setScanning((s) => !s)}>
          {scanning ? 'Fermer' : '📷 Scanner'}
        </button>
      </div>

      {scanning && <Scanner compact onCode={onCode} />}

      {target && (
        <div className="target">
          <span className="muted small">Boîte scannée</span>
          <strong>{target.name}</strong>
          {target.substance && <span className="muted small">{prettySubstance(target.substance)}</span>}
        </div>
      )}

      {searched && (
        <div className={`verdict ${usable.length ? 'verdict--yes' : 'verdict--no'}`}>
          {usable.length ? (
            <>
              <strong>Oui !</strong> Tu en as {usable.length} boîte{usable.length > 1 ? 's' : ''} encore valable
              {usable.length > 1 ? 's' : ''}.
            </>
          ) : groups.length ? (
            <>
              <strong>Pas de boîte valable.</strong> Celles que tu as sont périmées.
            </>
          ) : (
            <>
              <strong>Non,</strong> rien de tel dans tes trousses.
            </>
          )}
        </div>
      )}

      {groups.map((g) => (
        <div key={g.title} className="group">
          <h2>{g.title}</h2>
          {g.caution && (
            <p className="muted small">
              Même substance ne veut pas dire même dosage ni même usage : demande à ton pharmacien.
            </p>
          )}
          <ul className="items">
            {g.items.map((it) => {
              const status = expiryStatus(it.expiry);
              const kit = kitsById[it.kitId];
              return (
                <li key={it.id} className={`item item--static item--${status}`}>
                  <span className="item__main">
                    <strong>{it.name}</strong>
                    <span className="muted small">
                      {kit?.emoji} {kit?.name}
                    </span>
                  </span>
                  <span className={`badge badge--${status}`}>{expiryLabel(it.expiry)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
