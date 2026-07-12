import { useEffect, useState } from 'react';
import PartiesTab from './admin-data/PartiesTab.jsx';
import AlliancesTab from './admin-data/AlliancesTab.jsx';
import ResultsTab from './admin-data/ResultsTab.jsx';
import StatesTab from './admin-data/StatesTab.jsx';
import ImportTab from './admin-data/ImportTab.jsx';

const TABS = [
  { id: 'parties', label: 'Parties', Component: PartiesTab },
  { id: 'alliances', label: 'Alliances', Component: AlliancesTab },
  { id: 'results', label: 'Results', Component: ResultsTab },
  { id: 'states', label: 'States', Component: StatesTab },
  { id: 'import', label: 'Import', Component: ImportTab },
];

function tabFromHash() {
  const h = window.location.hash.replace(/^#/, '');
  return TABS.some((t) => t.id === h) ? h : 'parties';
}

export default function AdminData() {
  const [tab, setTab] = useState(tabFromHash);
  const [notice, setNotice] = useState(null); // {type: 'success'|'error', text}

  // Keep the active tab in the URL hash so it survives reloads and can be
  // linked to (/admin/data#import).
  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  function selectTab(id) {
    if (id === tab) return;
    setNotice(null);
    setTab(id);
    window.history.replaceState(null, '', `#${id}`);
  }

  // Tabs call notify('success'|'error', text) — or notify(null) to clear.
  function notify(type, text) {
    setNotice(type ? { type, text } : null);
  }

  const active = TABS.find((t) => t.id === tab) || TABS[0];
  const ActiveComponent = active.Component;

  return (
    <div className="page wide-page">
      <h1 className="page-title">Admin — Data</h1>

      <div className="seg-toggle adm-tabs" role="tablist" aria-label="Data sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === tab}
            className={t.id === tab ? 'seg-btn active' : 'seg-btn'}
            onClick={() => selectTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {notice && (
        <p className={notice.type === 'error' ? 'notice notice-error' : 'notice notice-success'}>
          {notice.text}
        </p>
      )}

      <ActiveComponent notify={notify} />
    </div>
  );
}
