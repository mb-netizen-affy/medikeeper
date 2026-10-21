'use client';

// Trousses : maison, voiture, voyage, chez un proche…
// Chacune a sa checklist, et peut être partagée en fichier
// (pour suivre l'armoire d'un parent depuis son propre téléphone).

import { useRef, useState } from 'react';
import { actions, exportKit, KIT_PRESETS } from '../lib/store';
import { byExpiry, expiryStatus, formatExpiry, uid } from '../lib/utils';

const EMOJIS = ['🏠', '🚗', '🧳', '👵', '👴', '👶', '🎒', '🏕️', '🏢', '⛵', '💼', '❤️'];

export default function Kits({ state, onOpenKit }) {
  const [openId, setOpenId] = useState(null);
  const [adding, setAdding] = useState(false);
  const fileRef = useRef(null);
  const [msg, setMsg] = useState(null);

  function flash(m) {
    setMsg(m);
    setTimeout(() => setMsg(null), 3500);
  }

  async function onImport(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const exists = state.kits.some((k) => k.id === data?.kit?.id);
      const kit = actions.importKit(data);
      flash(`${kit.emoji} ${kit.name} ${exists ? 'mise à jour' : 'ajoutée'} (${data.items?.length || 0} boîtes)`);
    } catch {
      flash("Ce fichier n'est pas une trousse MediKeeper.");
    }
  }

  return (
    <section className="screen">
      <header className="screen__head">
        <h1>Trousses</h1>
        <p className="muted">Une trousse par endroit… ou par personne.</p>
      </header>

      {msg && <div className="toast toast--static">{msg}</div>}

      <ul className="kits">
        {state.kits.map((k) => (
          <KitCard
            key={k.id}
            kit={k}
            items={state.items.filter((it) => it.kitId === k.id)}
            open={openId === k.id}
            onToggle={() => setOpenId(openId === k.id ? null : k.id)}
            onOpenKit={() => onOpenKit(k.id)}
            canDelete={state.kits.length > 1}
            state={state}
          />
        ))}
      </ul>

      {adding ? (
        <div className="card">
          <h2>Nouvelle trousse</h2>
          <div className="presets">
            {KIT_PRESETS.map((p) => (
              <button
                key={p.kind}
                className="preset"
                onClick={() => {
                  const kit = actions.addKit(p);
                  setAdding(false);
                  setOpenId(kit.id);
                }}
              >
                <span>{p.emoji}</span>
                {p.name}
              </button>
            ))}
          </div>
          <p className="muted small">Tu pourras la renommer ensuite.</p>
          <button className="btn btn--ghost btn--block" onClick={() => setAdding(false)}>
            Annuler
          </button>
        </div>
      ) : (
        <div className="row-actions">
          <button className="btn btn--primary" onClick={() => setAdding(true)}>
            + Nouvelle trousse
          </button>
          <button className="btn btn--ghost" onClick={() => fileRef.current?.click()}>
            📥 Importer
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onImport} />
        </div>
      )}

      <div className="card card--soft">
        <h2>👵 Suivre l'armoire d'un proche</h2>
        <p className="small">
          Crée une trousse « Chez Maman » et scanne ses boîtes lors de ta prochaine visite. Si elle a aussi
          MediKeeper, elle peut t'envoyer sa trousse (bouton <em>Partager le fichier</em>) : en l'important ici, ta
          copie se met à jour. La synchronisation automatique arrive dans la prochaine version.
        </p>
      </div>
    </section>
  );
}

function KitCard({ kit, items, open, onToggle, onOpenKit, canDelete, state }) {
  const expired = items.filter((it) => expiryStatus(it.expiry) === 'expired').length;
  const soon = items.filter((it) => expiryStatus(it.expiry) === 'soon').length;
  const [newLine, setNewLine] = useState('');
  const checklist = kit.checklist || [];
  const done = checklist.filter((c) => c.done).length;

  function setChecklist(list) {
    actions.updateKit(kit.id, { checklist: list });
  }

  async function shareText() {
    const lines = [...items]
      .sort(byExpiry)
      .map((it) => `• ${it.name} — ${it.expiry ? formatExpiry(it.expiry) : 'date ?'}${expiryStatus(it.expiry) === 'expired' ? ' (PÉRIMÉ)' : ''}`);
    const text = `${kit.emoji} ${kit.name} — ${items.length} boîte(s)\n${lines.join('\n')}`;
    try {
      if (navigator.share) await navigator.share({ title: kit.name, text });
      else {
        await navigator.clipboard.writeText(text);
        alert('Liste copiée !');
      }
    } catch {
      /* partage annulé */
    }
  }

  async function shareFile() {
    const data = JSON.stringify(exportKit(state, kit.id), null, 1);
    const fileName = `medikeeper-${kit.name.toLowerCase().replace(/[^a-z0-9]+/gi, '-')}.json`;
    const file = new File([data], fileName, { type: 'application/json' });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `Trousse ${kit.name}` });
        return;
      }
    } catch {
      return; // partage annulé
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <li className={`kit ${open ? 'kit--open' : ''}`}>
      <button className="kit__head" onClick={onToggle}>
        <span className="kit__emoji">{kit.emoji}</span>
        <span className="kit__title">
          <strong>{kit.name}</strong>
          <span className="muted small">
            {items.length} boîte{items.length > 1 ? 's' : ''}
            {checklist.length > 0 && ` · checklist ${done}/${checklist.length}`}
            {kit.syncedAt && ` · reçue le ${new Date(kit.syncedAt).toLocaleDateString('fr-FR')}`}
          </span>
        </span>
        {expired > 0 && <span className="badge badge--expired">{expired} périmé{expired > 1 ? 's' : ''}</span>}
        {!expired && soon > 0 && <span className="badge badge--soon">{soon} bientôt</span>}
      </button>

      {open && (
        <div className="kit__body">
          <div className="field-row">
            <label className="field field--emoji">
              <span>Icône</span>
              <select value={kit.emoji} onChange={(e) => actions.updateKit(kit.id, { emoji: e.target.value })}>
                {EMOJIS.map((e) => (
                  <option key={e}>{e}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Nom</span>
              <input defaultValue={kit.name} onBlur={(e) => e.target.value.trim() && actions.updateKit(kit.id, { name: e.target.value.trim() })} />
            </label>
          </div>

          <h3>Checklist {kit.kind === 'voyage' ? 'avant de partir' : ''}</h3>
          <ul className="checklist">
            {checklist.map((c) => (
              <li key={c.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={c.done}
                    onChange={() => setChecklist(checklist.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)))}
                  />
                  <span className={c.done ? 'done' : ''}>{c.text}</span>
                </label>
                <button className="icon-btn" aria-label="Supprimer" onClick={() => setChecklist(checklist.filter((x) => x.id !== c.id))}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newLine.trim()) return;
              setChecklist([...checklist, { id: uid(), text: newLine.trim(), done: false }]);
              setNewLine('');
            }}
          >
            <input value={newLine} onChange={(e) => setNewLine(e.target.value)} placeholder="Ajouter à la checklist…" />
            <button className="btn btn--small" type="submit">
              +
            </button>
          </form>
          {done > 0 && (
            <button className="link" onClick={() => setChecklist(checklist.map((c) => ({ ...c, done: false })))}>
              Tout décocher pour le prochain départ
            </button>
          )}

          <div className="kit__actions">
            <button className="btn btn--small" onClick={onOpenKit}>
              Voir les boîtes
            </button>
            <button className="btn btn--small btn--ghost" onClick={shareText}>
              📋 Envoyer la liste
            </button>
            <button className="btn btn--small btn--ghost" onClick={shareFile}>
              📤 Partager le fichier
            </button>
            {canDelete && (
              <button
                className="btn btn--small btn--danger"
                onClick={() => {
                  if (confirm(`Supprimer la trousse « ${kit.name} » et ses ${items.length} boîte(s) ?`)) actions.removeKit(kit.id);
                }}
              >
                Supprimer
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
