'use client';

// Scan en rafale : on vide l'armoire sur la table, on scanne les boîtes
// à la suite, on vérifie la liste, puis on valide tout d'un coup.

import { useRef, useState } from 'react';
import Scanner from './Scanner';
import { parseMedCode } from '../lib/gs1';
import { lookupMed } from '../lib/meds';
import { actions } from '../lib/store';
import { beep, expiryLabel, expiryStatus, isoToMonth, monthToIso, uid } from '../lib/utils';

export default function ScanSession({ state, defaultKitId, onDone }) {
  const [rows, setRows] = useState([]);
  const [kitId, setKitId] = useState(defaultKitId || state.kits[0]?.id);
  const [toast, setToast] = useState(null);
  const [paste, setPaste] = useState('');
  const [camera, setCamera] = useState(true);
  const seen = useRef(new Set());
  const lastAccept = useRef(0);
  const lastToast = useRef(0);

  function say(msg, force) {
    const now = Date.now();
    if (!force && now - lastToast.current < 2000) return;
    lastToast.current = now;
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 2200);
  }

  function patch(key, p) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  }

  async function handleRaw(raw, fromPaste = false) {
    const now = Date.now();
    if (!fromPaste && now - lastAccept.current < 900) return;
    const code = parseMedCode(raw);
    if (!code) return say("Ce code n'est pas celui d'un médicament");
    const dedupeKey = code.serial ? `${code.gtin}|${code.serial}` : code.raw;
    if (seen.current.has(dedupeKey)) {
      return say('Déjà scannée · utilise « +1 » pour une 2e boîte identique');
    }
    seen.current.add(dedupeKey);
    lastAccept.current = now;
    beep();

    const key = uid();
    setRows((rs) => [
      {
        key,
        gtin: code.gtin,
        cip13: code.cip13,
        lot: code.lot,
        serial: code.serial,
        expiry: code.expiry,
        name: '',
        cis: null,
        substance: '',
        presentation: '',
        qty: 1,
        loading: true,
        nameTyped: false,
      },
      ...rs,
    ]);
    const info = await lookupMed(code, state.names);
    patch(key, info ? { ...info, loading: false } : { loading: false });
  }

  function addManual() {
    setRows((rs) => [
      { key: uid(), gtin: null, cip13: null, lot: null, serial: null, expiry: null, name: '', cis: null, substance: '', presentation: '', qty: 1, loading: false, nameTyped: true, manual: true },
      ...rs,
    ]);
  }

  // Code complet collé d'un coup (Datamatrix avec date, ou CIP13 français)
  function looksLikeCode(v) {
    const code = parseMedCode(v);
    return !!code && (!!code.expiry || /^\s*3400\d{9}\s*$/.test(v));
  }

  function codeInsteadOfName(key, v) {
    setRows((rs) => rs.filter((x) => x.key !== key));
    handleRaw(v, true);
  }

  const missingName = rows.some((r) => !r.loading && !r.name.trim());
  const total = rows.reduce((n, r) => n + r.qty, 0);

  function validate() {
    const items = rows.flatMap((r) =>
      Array.from({ length: r.qty }, (_, i) => ({
        kitId,
        gtin: r.gtin,
        cip13: r.cip13,
        cis: r.cis,
        name: r.name.trim(),
        nameTyped: r.nameTyped,
        substance: r.substance,
        presentation: r.presentation,
        lot: r.lot,
        serial: i === 0 ? r.serial : null,
        expiry: r.expiry,
      }))
    );
    actions.addItems(items);
    onDone?.(kitId, items.length);
  }

  return (
    <section className="screen">
      <header className="screen__head">
        <h1>Scanner</h1>
        <label className="kit-picker">
          <span>Ranger dans</span>
          <select value={kitId} onChange={(e) => setKitId(e.target.value)}>
            {state.kits.map((k) => (
              <option key={k.id} value={k.id}>
                {k.emoji} {k.name}
              </option>
            ))}
          </select>
        </label>
      </header>

      {camera ? (
        <Scanner onCode={(raw) => handleRaw(raw)} />
      ) : (
        <button className="btn btn--ghost btn--block" onClick={() => setCamera(true)}>
          📷 Rallumer la caméra
        </button>
      )}

      {toast && <div className="toast">{toast}</div>}

      <div className="row-actions">
        <button className="btn btn--ghost" onClick={addManual}>
          ✍️ Sans code
        </button>
        {camera && (
          <button className="btn btn--ghost" onClick={() => setCamera(false)}>
            Couper la caméra
          </button>
        )}
      </div>

      <details className="paste">
        <summary>⌨️ Taper ou coller le code de la boîte (sans caméra)</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (paste.trim()) handleRaw(paste, true);
            setPaste('');
          }}
        >
          <input
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder="Code CIP13 ou texte du Datamatrix"
            inputMode="text"
          />
          <button className="btn" type="submit">
            Ajouter
          </button>
        </form>
      </details>

      {rows.length === 0 ? (
        <p className="empty">
          Sors toutes les boîtes, puis scanne-les une par une : chaque boîte reconnue fait <em>bip</em> et
          s'ajoute ici. Tu valides tout à la fin.
        </p>
      ) : (
        <ul className="scan-list">
          {rows.map((r) => {
            const status = expiryStatus(r.expiry);
            return (
              <li key={r.key} className={`scan-row scan-row--${status}`}>
                <div className="scan-row__main">
                  {r.loading ? (
                    <span className="muted">Recherche du médicament…</span>
                  ) : r.name && !r.nameTyped ? (
                    <>
                      <strong>{r.name}</strong>
                      {r.presentation && <span className="muted small">{r.presentation}</span>}
                    </>
                  ) : (
                    <input
                      className="input-name"
                      value={r.name}
                      autoFocus={r.manual}
                      onChange={(e) => {
                        const v = e.target.value;
                        // un code collé dans la case du nom → on le lit comme un scan
                        if (r.manual && looksLikeCode(v)) return codeInsteadOfName(r.key, v);
                        patch(r.key, { name: v, nameTyped: true });
                      }}
                      onBlur={(e) => r.manual && parseMedCode(e.target.value)?.cip13 && codeInsteadOfName(r.key, e.target.value)}
                      placeholder={r.manual ? 'Nom du produit (ou code de la boîte)' : 'Médicament inconnu : tape son nom'}
                    />
                  )}
                  <div className="scan-row__meta">
                    {r.expiry ? (
                      <span className={`badge badge--${status}`}>{expiryLabel(r.expiry)}</span>
                    ) : (
                      <label className="month">
                        <span>Péremption</span>
                        <input
                          type="month"
                          value={isoToMonth(r.expiry)}
                          onChange={(e) => patch(r.key, { expiry: monthToIso(e.target.value) })}
                        />
                      </label>
                    )}
                    {r.lot && <span className="muted small">Lot {r.lot}</span>}
                  </div>
                </div>
                <div className="qty">
                  <button onClick={() => (r.qty > 1 ? patch(r.key, { qty: r.qty - 1 }) : setRows((rs) => rs.filter((x) => x.key !== r.key)))} aria-label="Retirer">
                    {r.qty > 1 ? '−' : '✕'}
                  </button>
                  <span>{r.qty}</span>
                  <button onClick={() => patch(r.key, { qty: r.qty + 1 })} aria-label="Une boîte de plus">
                    +1
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {rows.length > 0 && (
        <div className="sticky-cta">
          {missingName && <p className="warn small">Donne un nom aux médicaments inconnus pour valider.</p>}
          <button className="btn btn--primary btn--block" disabled={missingName || rows.some((r) => r.loading)} onClick={validate}>
            Ranger {total} boîte{total > 1 ? 's' : ''}
          </button>
        </div>
      )}
    </section>
  );
}