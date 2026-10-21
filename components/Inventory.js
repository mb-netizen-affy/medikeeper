'use client';

import { useMemo, useState } from 'react';
import { actions } from '../lib/store';
import { prettySubstance } from '../lib/meds';
import { byExpiry, expiryLabel, expiryStatus, isoToMonth, monthToIso } from '../lib/utils';

export default function Inventory({ state, kitFilter, setKitFilter, onScan }) {
  const [editing, setEditing] = useState(null);
  const kitsById = useMemo(() => Object.fromEntries(state.kits.map((k) => [k.id, k])), [state.kits]);

  const items = useMemo(
    () => state.items.filter((it) => !kitFilter || it.kitId === kitFilter).sort(byExpiry),
    [state.items, kitFilter]
  );
  const counts = useMemo(() => {
    const c = { expired: 0, soon: 0 };
    items.forEach((it) => {
      const s = expiryStatus(it.expiry);
      if (c[s] !== undefined) c[s]++;
    });
    return c;
  }, [items]);

  return (
    <section className="screen">
      <header className="screen__head">
        <h1>Mon armoire</h1>
        <p className="muted">
          {items.length} boîte{items.length > 1 ? 's' : ''}
          {kitFilter ? ` · ${kitsById[kitFilter]?.name}` : ` · ${state.kits.length} trousse${state.kits.length > 1 ? 's' : ''}`}
        </p>
      </header>

      <div className="chips" role="tablist">
        <button className={`chip ${!kitFilter ? 'chip--on' : ''}`} onClick={() => setKitFilter(null)}>
          Tout
        </button>
        {state.kits.map((k) => (
          <button key={k.id} className={`chip ${kitFilter === k.id ? 'chip--on' : ''}`} onClick={() => setKitFilter(k.id)}>
            {k.emoji} {k.name}
          </button>
        ))}
      </div>

      {(counts.expired > 0 || counts.soon > 0) && (
        <div className={`alert ${counts.expired ? 'alert--expired' : 'alert--soon'}`}>
          <div>
            {counts.expired > 0 && (
              <strong>
                {counts.expired} boîte{counts.expired > 1 ? 's' : ''} périmée{counts.expired > 1 ? 's' : ''}
              </strong>
            )}
            {counts.expired > 0 && counts.soon > 0 && ' · '}
            {counts.soon > 0 && <span>{counts.soon} expire{counts.soon > 1 ? 'nt' : ''} d'ici 3 mois</span>}
            {counts.expired > 0 && <p className="small">À rapporter en pharmacie : elles y sont collectées gratuitement.</p>}
          </div>
          {counts.expired > 0 && (
            <button
              className="btn btn--small"
              onClick={() => {
                if (confirm('Retirer de la liste les boîtes périmées ?')) actions.removeExpired(kitFilter);
              }}
            >
              C'est fait
            </button>
          )}
        </div>
      )}

      {items.length === 0 ? (
        <div className="empty empty--big">
          <p className="empty__icon">💊</p>
          <p>Ton armoire est vide pour l'instant.</p>
          <button className="btn btn--primary" onClick={onScan}>
            Scanner mes boîtes
          </button>
        </div>
      ) : (
        <ul className="items">
          {items.map((it) => {
            const status = expiryStatus(it.expiry);
            const kit = kitsById[it.kitId];
            return (
              <li key={it.id}>
                <button className={`item item--${status}`} onClick={() => setEditing(it)}>
                  <span className="item__main">
                    <strong>{it.name}</strong>
                    <span className="muted small">
                      {it.substance ? prettySubstance(it.substance) : it.presentation || ''}
                      {!kitFilter && kit ? `${it.substance || it.presentation ? ' · ' : ''}${kit.emoji} ${kit.name}` : ''}
                    </span>
                  </span>
                  <span className={`badge badge--${status}`}>{expiryLabel(it.expiry)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {editing && <ItemSheet item={editing} kits={state.kits} onClose={() => setEditing(null)} />}
    </section>
  );
}

function ItemSheet({ item, kits, onClose }) {
  const [name, setName] = useState(item.name);
  const [month, setMonth] = useState(isoToMonth(item.expiry));
  const [kitId, setKitId] = useState(item.kitId);

  function save() {
    actions.updateItem(item.id, { name: name.trim() || item.name, expiry: monthToIso(month), kitId });
    onClose();
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Modifier la boîte">
        <div className="sheet__grip" />
        <label className="field">
          <span>Nom</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        {item.substance && <p className="muted small">Contient : {prettySubstance(item.substance)}</p>}
        {item.presentation && <p className="muted small">{item.presentation}</p>}
        <div className="field-row">
          <label className="field">
            <span>Péremption</span>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </label>
          <label className="field">
            <span>Trousse</span>
            <select value={kitId} onChange={(e) => setKitId(e.target.value)}>
              {kits.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.emoji} {k.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {item.lot && <p className="muted small">Lot {item.lot}</p>}
        <button className="btn btn--primary btn--block" onClick={save}>
          Enregistrer
        </button>
        <button
          className="btn btn--danger btn--block"
          onClick={() => {
            actions.removeItem(item.id);
            onClose();
          }}
        >
          Boîte finie ou jetée
        </button>
      </div>
    </div>
  );
}
