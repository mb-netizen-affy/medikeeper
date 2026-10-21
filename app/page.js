'use client';

import { useState } from 'react';
import { useMediStore } from '../lib/store';
import Inventory from '../components/Inventory';
import ScanSession from '../components/ScanSession';
import CheckOwned from '../components/CheckOwned';
import Kits from '../components/Kits';

const TABS = [
  { id: 'stock', label: 'Armoire', icon: '💊' },
  { id: 'scan', label: 'Scanner', icon: '📷' },
  { id: 'check', label: "J'en ai ?", icon: '🔎' },
  { id: 'kits', label: 'Trousses', icon: '🧰' },
];

export default function Home() {
  const state = useMediStore();
  const [tab, setTab] = useState('stock');
  const [kitFilter, setKitFilter] = useState(null);
  const [notice, setNotice] = useState(null);

  if (!state) return <div className="boot">MediKeeper</div>;

  return (
    <div className="app">
      <main>
        {notice && (
          <div className="toast toast--static" onClick={() => setNotice(null)}>
            {notice}
          </div>
        )}

        {tab === 'stock' && (
          <Inventory state={state} kitFilter={kitFilter} setKitFilter={setKitFilter} onScan={() => setTab('scan')} />
        )}
        {tab === 'scan' && (
          <ScanSession
            state={state}
            defaultKitId={kitFilter}
            onDone={(kitId, n) => {
              setKitFilter(kitId);
              setTab('stock');
              setNotice(`✅ ${n} boîte${n > 1 ? 's' : ''} rangée${n > 1 ? 's' : ''}`);
              setTimeout(() => setNotice(null), 3000);
            }}
          />
        )}
        {tab === 'check' && <CheckOwned state={state} />}
        {tab === 'kits' && (
          <Kits
            state={state}
            onOpenKit={(id) => {
              setKitFilter(id);
              setTab('stock');
            }}
          />
        )}

        <footer className="disclaimer">
          MediKeeper t'aide à savoir ce que tu as, pas à te soigner : pour toute question sur un médicament, demande à ton
          pharmacien ou ton médecin. Tes données restent sur ce téléphone.
        </footer>
      </main>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'tab--on' : ''}`} onClick={() => setTab(t.id)}>
            <span className="tab__icon">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
