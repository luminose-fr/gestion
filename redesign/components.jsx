// ─── Luminose Gestion — UI Components ───────────────────────────────────────
// Shared components exported to window for use in main app

const { useState, useEffect, useMemo, useRef, useCallback } = React;

// ─────────────────────────────────────────────────────────────────────────────
// ATOMS
// ─────────────────────────────────────────────────────────────────────────────

const Badge = ({ children, variant = 'neutral', size = 'sm' }) => {
  const variants = {
    neutral:  'bg-[var(--c-surface-2)] text-[var(--c-text-2)] border-[var(--c-border)]',
    primary:  'bg-[var(--c-primary-bg)] text-[var(--c-primary)] border-[var(--c-primary)]/20',
    valid:    'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800/50',
    bland:    'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800/50',
    work:     'bg-red-50 text-red-600 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800/50',
    pink:     'bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-900/20 dark:text-pink-300 dark:border-pink-800/50',
    purple:   'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800/50',
  };
  const sizes = {
    xs: 'text-[10px] px-1.5 py-0.5 gap-1',
    sm: 'text-xs px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5',
  };
  return (
    <span className={`inline-flex items-center rounded-full font-semibold border ${variants[variant] || variants.neutral} ${sizes[size]}`}>
      {children}
    </span>
  );
};

const VerdictBadge = ({ verdict }) => {
  const cfg = {
    'Valide':     { variant: 'valid',  icon: 'circle-check' },
    'Trop lisse': { variant: 'bland',  icon: 'circle-minus' },
    'À revoir':   { variant: 'work',   icon: 'circle-xmark' },
  }[verdict];
  if (!cfg) return null;
  return (
    <Badge variant={cfg.variant} size="xs">
      <i className={`fa-solid fa-${cfg.icon} text-[9px]`} />
      {verdict}
    </Badge>
  );
};

const Spinner = ({ size = 'sm' }) => (
  <i className={`fa-solid fa-spinner fa-spin ${size === 'sm' ? 'text-sm' : 'text-lg'}`} />
);

// ─────────────────────────────────────────────────────────────────────────────
// SIDEBAR
// ─────────────────────────────────────────────────────────────────────────────

const SPACES = [
  { id: 'social',       icon: 'briefcase',     label: 'Contenus',        defaultTab: 'ideas'  },
  { id: 'clients',      icon: 'users',          label: 'Clients',         defaultTab: 'ideas'  },
  { id: 'videos',       icon: 'film',           label: 'Vidéos',          defaultTab: 'ideas'  },
  { id: 'psychedelics', icon: 'wand-sparkles',  label: 'Psychédéliques',  defaultTab: 'ideas'  },
];

const SOCIAL_TABS = [
  { id: 'ideas',    icon: 'lightbulb',    label: 'Boîte à idées'  },
  { id: 'drafts',   icon: 'pen-line',     label: 'En cours'       },
  { id: 'ready',    icon: 'circle-check', label: 'Prêts'          },
  { id: 'calendar', icon: 'calendar',     label: 'Calendrier'     },
  { id: 'archive',  icon: 'box-archive',  label: 'Archives'       },
];


// ─────────────────────────────────────────────────────────────────────────────
// SIDEBAR — Rail icônes + panneau adjacent
// ─────────────────────────────────────────────────────────────────────────────

const Sidebar = ({ space, tab, counts, onNavigate, onOpenSettings, isMobileOpen, onMobileClose }) => {
  const currentSpace = SPACES.find(s => s.id === space) || SPACES[0];
  const showSubPanel = space === 'social';

  return (
    <>
      {isMobileOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={onMobileClose} />
      )}
      <aside className={`
        fixed md:static inset-y-0 left-0 z-50 md:z-auto h-full
        flex shrink-0 transition-transform duration-300 ease-out md:translate-x-0
        ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Rail (icons only) */}
        <div className="w-[64px] shrink-0 bg-[var(--c-surface)] border-r border-[var(--c-border)] flex flex-col items-center py-3 gap-1">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--c-primary)] to-violet-400 flex items-center justify-center shadow-sm shadow-[var(--c-primary)]/30 mb-3">
            <span className="text-white font-bold text-base" style={{fontFamily:"'Lora',Georgia,serif",fontStyle:'italic'}}>L</span>
          </div>
          {SPACES.map(s => {
            const active = space === s.id;
            return (
              <button key={s.id} onClick={() => { onNavigate(s.id, s.defaultTab); onMobileClose(); }}
                title={s.label}
                className={`relative w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-150 group ${
                  active
                    ? 'bg-[var(--c-primary)] text-white shadow-md shadow-[var(--c-primary)]/30'
                    : 'text-[var(--c-text-3)] hover:bg-[var(--c-surface-2)] hover:text-[var(--c-text)]'
                }`}
              >
                <i className={`fa-solid fa-${s.icon} text-[15px]`} />
                {/* Tooltip */}
                <span className="absolute left-full ml-2 px-2 py-1 rounded-md bg-[var(--c-text)] text-[var(--c-surface)] text-[11px] font-semibold whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-30 shadow-lg">
                  {s.label}
                </span>
              </button>
            );
          })}
          <div className="flex-1" />
          <button onClick={onOpenSettings} title="Réglages"
            className="w-11 h-11 rounded-xl flex items-center justify-center text-[var(--c-text-3)] hover:bg-[var(--c-surface-2)] hover:text-[var(--c-text)] transition-all"
          >
            <i className="fa-solid fa-sliders text-[14px]" />
          </button>
        </div>

        {/* Sub-panel — only when current space has tabs */}
        {showSubPanel && (
          <div className="w-[210px] bg-[var(--c-bg)] border-r border-[var(--c-border)] flex flex-col">
            <div className="px-4 h-[var(--header-h)] flex items-center border-b border-[var(--c-border)]">
              <p className="font-bold text-sm text-[var(--c-text)] truncate">{currentSpace.label}</p>
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
              {SOCIAL_TABS.map(t => {
                const active = tab === t.id;
                return (
                  <button key={t.id} onClick={() => { onNavigate('social', t.id); onMobileClose(); }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-[13px] font-medium transition-all group ${
                      active
                        ? 'bg-[var(--c-primary)] text-white shadow-sm shadow-[var(--c-primary)]/25'
                        : 'text-[var(--c-text-2)] hover:bg-[var(--c-surface)] hover:text-[var(--c-text)]'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <i className={`fa-solid fa-${t.icon} fa-fw text-[12px] ${active ? 'text-white/80' : 'text-[var(--c-text-3)] group-hover:text-[var(--c-primary)]'}`} />
                      {t.label}
                    </span>
                    {counts[t.id] !== undefined && (
                      <span className={`text-[10px] font-bold min-w-[18px] text-center px-1.5 py-0.5 rounded-full leading-none ${
                        active ? 'bg-white/20 text-white' : 'bg-[var(--c-surface-2)] text-[var(--c-text-3)]'
                      }`}>
                        {counts[t.id]}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </aside>
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// HEADER
// ─────────────────────────────────────────────────────────────────────────────

const Header = ({ title, isSyncing, onSync, onLogout, onMenuOpen }) => (
  <header className="h-[var(--header-h)] px-4 md:px-6 flex items-center justify-between border-b border-[var(--c-border)] bg-[var(--c-surface)] shrink-0 z-20">
    <div className="flex items-center gap-3">
      <button onClick={onMenuOpen}
        className="md:hidden p-2 -ml-1 rounded-lg text-[var(--c-text-3)] hover:bg-[var(--c-surface-2)] transition-colors"
      >
        <i className="fa-solid fa-bars text-sm" />
      </button>
      <h1 className="font-bold text-[var(--c-text)] text-sm">{title}</h1>
    </div>
    <div className="flex items-center gap-0.5">
      <button onClick={onSync} disabled={isSyncing} title="Synchroniser Notion"
        className="p-2 rounded-lg text-[var(--c-text-3)] hover:bg-[var(--c-surface-2)] hover:text-[var(--c-text)] transition-colors disabled:opacity-40"
      >
        <i className={`fa-solid fa-arrows-rotate text-sm ${isSyncing ? 'fa-spin' : ''}`} />
      </button>
      <button onClick={onLogout} title="Déconnexion"
        className="p-2 rounded-lg text-[var(--c-text-3)] hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 transition-colors"
      >
        <i className="fa-solid fa-right-from-bracket text-sm" />
      </button>
    </div>
  </header>
);

// ─────────────────────────────────────────────────────────────────────────────
// IDEAS VIEW
// ─────────────────────────────────────────────────────────────────────────────

const VERDICT_STRIPE = {
  'Valide':     '#10b981',
  'Trop lisse': '#f59e0b',
  'À revoir':   '#ef4444',
};

const hilite = (text, q) => {
  if (!q || !text) return text;
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${esc})`, 'gi'));
  return parts.map((p, i) =>
    p.toLowerCase() === q.toLowerCase()
      ? <mark key={i} style={{background:'rgba(250,204,21,0.5)',color:'inherit',borderRadius:2,padding:'0 2px'}}>{p}</mark>
      : p
  );
};

const IdeaRow = ({ item, onClick, search, prefs = {} }) => {
  const showPlatforms = prefs.showPlatforms !== false;
  const showDepth     = prefs.showDepth !== false;
  const showOffer     = prefs.showOffer !== false;
  const showStripe    = prefs.showStripe !== false;
  return (
  <div onClick={() => onClick(item)}
    className="group flex bg-[var(--c-surface)] rounded-xl border border-[var(--c-border)] hover:border-[var(--c-primary)]/40 hover:shadow-md hover:shadow-[var(--c-primary)]/5 cursor-pointer transition-all duration-150 overflow-hidden"
  >
    {showStripe && (
      <div className="w-[3px] shrink-0 transition-colors duration-150"
        style={{ backgroundColor: item.verdict ? VERDICT_STRIPE[item.verdict] : 'var(--c-border)' }} />
    )}
    <div className="flex-1 px-4 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3 min-w-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
          <VerdictBadge verdict={item.verdict} />
          {showDepth && item.depth && (
            <Badge variant="primary" size="xs">
              <i className="fa-solid fa-bolt text-[9px]" />{item.depth}
            </Badge>
          )}
          {showOffer && item.targetOffer && (
            <Badge variant="neutral" size="xs">
              <i className="fa-solid fa-tag text-[9px]" />{item.targetOffer}
            </Badge>
          )}
          {!item.analyzed && (
            <Badge variant="neutral" size="xs">
              <i className="fa-solid fa-circle-question text-[9px]" />À analyser
            </Badge>
          )}
        </div>
        <p className="font-semibold text-[var(--c-text)] leading-snug group-hover:text-[var(--c-primary)] transition-colors">
          {hilite(item.title || 'Idée sans titre', search)}
        </p>
        {item.strategicAngle ? (
          <p className="text-xs text-[var(--c-text-3)] mt-0.5 line-clamp-1 italic">
            {item.strategicAngle.replace(/\*\*/g, '').split('\n')[0]}
          </p>
        ) : item.notes ? (
          <p className="text-xs text-[var(--c-text-2)] mt-0.5 line-clamp-1">{hilite(item.notes, search)}</p>
        ) : null}
      </div>
      <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
        {item.targetFormat && <Badge variant="pink" size="xs">{item.targetFormat}</Badge>}
        {showPlatforms && (item.platforms || []).slice(0, 2).map(p => (
          <Badge key={p} variant="neutral" size="xs">
            <i className="fa-solid fa-globe text-[9px]" />{p}
          </Badge>
        ))}
        {showPlatforms && (item.platforms || []).length > 2 && (
          <span className="text-[10px] text-[var(--c-text-3)]">+{item.platforms.length - 2}</span>
        )}
        <i className="fa-solid fa-chevron-right text-[10px] text-[var(--c-text-3)] group-hover:text-[var(--c-primary)] transition-colors ml-1" />
      </div>
    </div>
  </div>
  );
};

const QuickAdd = ({ onAdd, isSyncing }) => {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [format, setFormat] = useState('');
  const inputRef = useRef(null);
  useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);

  const reset = () => { setTitle(''); setNotes(''); setFormat(''); setOpen(false); };

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    await onAdd(title.trim(), notes.trim(), format || null);
    reset();
  };

  return (
    <div className="bg-[var(--c-surface)] rounded-xl border border-[var(--c-border)] overflow-hidden transition-all">
      {!open ? (
        <button onClick={() => setOpen(true)}
          className="w-full flex items-center gap-3 px-4 py-3.5 text-sm text-[var(--c-text-3)] hover:text-[var(--c-text)] hover:bg-[var(--c-surface-2)] transition-colors group"
        >
          <span className="w-6 h-6 rounded-md bg-[var(--c-primary-bg)] flex items-center justify-center shrink-0 group-hover:bg-[var(--c-primary)] transition-colors">
            <i className="fa-solid fa-plus text-[var(--c-primary)] text-xs group-hover:text-white" />
          </span>
          Ajouter une idée…
        </button>
      ) : (
        <form onSubmit={submit} className="p-4 space-y-3">
          {/* Titre */}
          <input ref={inputRef} type="text" value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Titre de l'idée…"
            className="w-full px-3 py-2.5 bg-[var(--c-bg)] border border-[var(--c-border)] focus:border-[var(--c-primary)] rounded-lg text-sm font-semibold text-[var(--c-text)] placeholder-[var(--c-text-3)] outline-none transition-colors"
          />
          {/* Notes */}
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            placeholder="Notes, sources, premières idées… (optionnel)"
            className="w-full px-3 py-2 bg-[var(--c-bg)] border border-[var(--c-border)] focus:border-[var(--c-primary)] rounded-lg text-sm text-[var(--c-text)] placeholder-[var(--c-text-3)] outline-none transition-colors resize-none leading-relaxed"
          />
          {/* Format */}
          <div className="flex items-center gap-2 bg-[var(--c-surface-2)] rounded-lg px-3 py-2">
            <i className="fa-solid fa-arrow-right-from-bracket text-[11px] text-[var(--c-text-3)] shrink-0" />
            <label className="text-[11px] font-bold text-[var(--c-text-3)] uppercase tracking-wider shrink-0">Format</label>
            <select value={format} onChange={e => setFormat(e.target.value)}
              className="flex-1 bg-transparent border-none text-sm text-[var(--c-text)] outline-none cursor-pointer min-w-0"
            >
              <option value="">— Choisir un format —</option>
              {FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={reset}
              className="px-3 py-1.5 text-sm text-[var(--c-text-3)] hover:text-[var(--c-text)] transition-colors">
              Annuler
            </button>
            <button type="submit" disabled={!title.trim() || isSyncing}
              className="flex items-center gap-2 px-4 py-1.5 bg-[var(--c-primary)] hover:bg-[var(--c-primary-hover)] text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-40 shadow-sm shadow-[var(--c-primary)]/30"
            >
              {isSyncing ? <Spinner /> : <i className="fa-solid fa-plus text-xs" />}
              Ajouter
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

const FILTER_CHIPS = [
  { id: 'ALL',         label: 'Tout',       activeColor: '' },
  { id: 'TO_ANALYZE',  label: 'À analyser', activeColor: '' },
  { id: 'VALID',       label: 'Valide',     activeColor: 'bg-emerald-600 border-emerald-600 shadow-emerald-600/20' },
  { id: 'TOO_BLAND',   label: 'Trop lisse', activeColor: 'bg-amber-500 border-amber-500 shadow-amber-500/20' },
  { id: 'NEEDS_WORK',  label: 'À revoir',   activeColor: 'bg-red-500 border-red-500 shadow-red-500/20' },
];

const IdeasView = ({ items, onEdit, onAdd, onGlobalAnalyze, isSyncing, prefs = {} }) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('ALL');

  const filtered = useMemo(() => items.filter(i => {
    const q = search.toLowerCase();
    const ms = !search || i.title.toLowerCase().includes(q) || (i.notes || '').toLowerCase().includes(q);
    if (!ms) return false;
    if (filter === 'ALL') return true;
    if (filter === 'TO_ANALYZE') return !i.analyzed;
    if (filter === 'VALID') return i.verdict === 'Valide';
    if (filter === 'TOO_BLAND') return i.verdict === 'Trop lisse';
    if (filter === 'NEEDS_WORK') return i.verdict === 'À revoir';
    return true;
  }), [items, search, filter]);

  const cc = useMemo(() => ({
    ALL:        items.length,
    TO_ANALYZE: items.filter(i => !i.analyzed).length,
    VALID:      items.filter(i => i.verdict === 'Valide').length,
    TOO_BLAND:  items.filter(i => i.verdict === 'Trop lisse').length,
    NEEDS_WORK: items.filter(i => i.verdict === 'À revoir').length,
  }), [items]);

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <QuickAdd onAdd={onAdd} isSyncing={isSyncing} />

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative">
          <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-[var(--c-text-3)]" />
          <input type="text" placeholder="Rechercher…" value={search} onChange={e => setSearch(e.target.value)}
            className="pl-8 pr-4 py-2 bg-[var(--c-surface)] border border-[var(--c-border)] focus:border-[var(--c-primary)] rounded-lg text-sm text-[var(--c-text)] placeholder-[var(--c-text-3)] outline-none transition-colors w-44"
          />
        </div>
        {/* Filter chips */}
        <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0 flex-wrap">
          {FILTER_CHIPS.map(c => (
            <button key={c.id} onClick={() => setFilter(c.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap transition-all shadow-sm ${
                filter === c.id
                  ? `${c.activeColor || 'bg-[var(--c-primary)] border-[var(--c-primary)] shadow-[var(--c-primary)]/20'} text-white`
                  : 'bg-[var(--c-surface)] text-[var(--c-text-2)] border-[var(--c-border)] hover:border-[var(--c-primary)]/40 shadow-none'
              }`}
            >
              {c.label}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none ${filter === c.id ? 'bg-white/25' : 'bg-[var(--c-surface-2)]'}`}>
                {cc[c.id]}
              </span>
            </button>
          ))}
        </div>
        <div className="flex-1 hidden sm:block" />
        <button onClick={onGlobalAnalyze}
          className="flex items-center gap-2 px-3 py-2 bg-violet-50 hover:bg-violet-100 dark:bg-violet-900/20 dark:hover:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-xs font-semibold rounded-lg border border-violet-200 dark:border-violet-800/50 transition-colors whitespace-nowrap shadow-sm"
        >
          <i className="fa-solid fa-wand-magic-sparkles" />
          Analyser tout
        </button>
      </div>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <i className="fa-solid fa-lightbulb text-5xl block mb-4" style={{color:'var(--c-border)'}} />
            <p className="text-sm text-[var(--c-text-3)]">
              {search ? 'Aucune idée pour cette recherche.' : 'La boîte à idées est vide pour ce filtre.'}
            </p>
          </div>
        ) : (
          filtered.map(item => <IdeaRow key={item.id} item={item} onClick={onEdit} search={search} prefs={prefs} />)
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// DRAFTS VIEW
// ─────────────────────────────────────────────────────────────────────────────

const DraftCard = ({ item, onClick, prefs = {} }) => (
  <div onClick={() => onClick(item)}
    className="group bg-[var(--c-surface)] rounded-xl border border-[var(--c-border)] hover:border-[var(--c-primary)]/40 hover:shadow-lg hover:shadow-[var(--c-primary)]/5 p-4 cursor-pointer transition-all duration-150 flex flex-col"
  >
    <div className="flex items-start gap-2 mb-2">
      <h4 className="flex-1 font-semibold text-[var(--c-text)] leading-snug line-clamp-2 group-hover:text-[var(--c-primary)] transition-colors">
        {item.title || 'Brouillon sans titre'}
      </h4>
    </div>
    <p className="text-xs text-[var(--c-text-2)] line-clamp-3 flex-1 mb-3 leading-relaxed">
      {item.body || 'Pas de contenu…'}
    </p>
    <div className="flex items-center justify-between gap-2 flex-wrap mt-auto">
      <div className="flex gap-1.5 flex-wrap">
        {prefs.showPlatforms !== false && (item.platforms || []).slice(0, 2).map(p => <Badge key={p} variant="neutral" size="xs">{p}</Badge>)}
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {item.targetFormat && <Badge variant="pink" size="xs">{item.targetFormat}</Badge>}
        {prefs.showOffer && item.targetOffer && <Badge variant="primary" size="xs">{item.targetOffer}</Badge>}
      </div>
    </div>
  </div>
);

const DraftsView = ({ items, onEdit, prefs = {} }) => (
  <div className="animate-in fade-in duration-200">
    {items.length === 0 ? (
      <EmptyState icon="pen-line" title="Aucun brouillon en cours" desc="Transformez une idée en brouillon pour commencer." />
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {items.map(item => <DraftCard key={item.id} item={item} onClick={onEdit} prefs={prefs} />)}
      </div>
    )}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// READY TABLE
// ─────────────────────────────────────────────────────────────────────────────

const ReadyTable = ({ items, onEdit, prefs = {} }) => {
  const showPlatforms = prefs.showPlatforms !== false;
  const showOffer     = prefs.showOffer !== false;

  // Build columns dynamically based on prefs
  const cols = ['Contenu', 'Format'];
  if (showOffer)     cols.push('Offre');
  if (showPlatforms) cols.push('Plateformes');
  cols.push('Publication');

  return (
  <div className="animate-in fade-in duration-200">
    {items.length === 0 ? (
      <EmptyState icon="circle-check" title="Rien à publier" desc="Les posts validés et prêts apparaîtront ici." />
    ) : (
      <div className="overflow-hidden rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-[var(--c-surface-2)] border-b border-[var(--c-border)]">
              <tr>
                {cols.map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-[var(--c-text-3)] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--c-border)]">
              {items.map(item => (
                <tr key={item.id} onClick={() => onEdit(item)}
                  className="cursor-pointer hover:bg-[var(--c-surface-2)] transition-colors group"
                >
                  <td className="px-4 py-4 align-top min-w-[16rem]">
                    <p className="font-semibold text-[var(--c-text)] group-hover:text-[var(--c-primary)] leading-tight transition-colors">{item.title}</p>
                  </td>
                  <td className="px-4 py-4 align-top whitespace-nowrap">
                    {item.targetFormat ? <Badge variant="pink" size="xs">{item.targetFormat}</Badge> : <span className="text-[var(--c-text-3)]">—</span>}
                  </td>
                  {showOffer && (
                    <td className="px-4 py-4 align-top whitespace-nowrap">
                      {item.targetOffer ? <Badge variant="primary" size="xs">{item.targetOffer}</Badge> : <span className="text-[var(--c-text-3)]">—</span>}
                    </td>
                  )}
                  {showPlatforms && (
                    <td className="px-4 py-4 align-top">
                      <div className="flex gap-1.5 flex-wrap">
                        {(item.platforms || []).map(p => <Badge key={p} variant="neutral" size="xs">{p}</Badge>)}
                      </div>
                    </td>
                  )}
                  <td className="px-4 py-4 align-top whitespace-nowrap text-[var(--c-text-2)]">
                    {item.scheduledDate
                      ? new Date(item.scheduledDate).toLocaleDateString('fr-FR', { day:'numeric', month:'short', year:'numeric' })
                      : <span className="text-[var(--c-text-3)]">Non planifié</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )}
  </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// IDEA PANEL  (slide-in from right)
// ─────────────────────────────────────────────────────────────────────────────

const FORMATS = [
  'Post Texte (Court)', 'Article (Long/SEO)', 'Script Vidéo (Reel/Short)',
  'Script Vidéo (Youtube)', 'Carrousel (Slide par Slide)', 'Newsletter', 'Prompt Image',
];

const IdeaPanel = ({ item, onClose, onSave, onDelete, onTransform, onAnalyze, isReanalyzing }) => {
  const [local, setLocal] = useState({ ...item });
  const [saveStatus, setSaveStatus] = useState('idle'); // idle | saved | error
  const isDirty = JSON.stringify(local) !== JSON.stringify(item);
  const timerRef = useRef(null);

  useEffect(() => { setLocal({ ...item }); }, [item.id]);

  useEffect(() => {
    setLocal(prev => ({
      ...prev,
      analyzed: item.analyzed, verdict: item.verdict,
      strategicAngle: item.strategicAngle, platforms: item.platforms,
      depth: item.depth, targetOffer: item.targetOffer,
      justification: item.justification, suggestedMetaphor: item.suggestedMetaphor,
    }));
  }, [item.analyzed, item.verdict, item.strategicAngle, item.depth]);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const upd = (k, v) => setLocal(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    if (!isDirty) return;
    try {
      await onSave(local);
      setSaveStatus('saved');
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setSaveStatus('idle'), 2500);
    } catch { setSaveStatus('error'); }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/25 dark:bg-black/50 backdrop-blur-[2px]"
        style={{animation:'lmFadeIn 0.2s ease-out'}} onClick={onClose} />
      <aside className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-[480px] bg-[var(--c-surface)] border-l border-[var(--c-border)] flex flex-col shadow-2xl shadow-black/20"
        style={{animation:'lmSlideIn 0.28s cubic-bezier(0.16,1,0.3,1)'}}>

        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-[var(--c-border)] shrink-0">
          <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0 mt-0.5">
            <i className="fa-solid fa-lightbulb text-amber-500 dark:text-amber-400 text-sm" />
          </div>
          <input type="text" value={local.title || ''}
            onChange={e => upd('title', e.target.value)}
            className="flex-1 text-base font-bold text-[var(--c-text)] bg-transparent outline-none placeholder-[var(--c-text-3)] min-w-0"
            placeholder="Titre de l'idée…"
          />
          <button onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--c-surface-2)] text-[var(--c-text-3)] transition-colors shrink-0 mt-0.5"
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Format */}
          <div className="flex items-center gap-3 bg-[var(--c-surface-2)] rounded-xl px-4 py-3">
            <label className="text-xs font-bold text-[var(--c-text-3)] uppercase tracking-wider whitespace-nowrap shrink-0">
              <i className="fa-solid fa-arrow-right-from-bracket mr-1.5" />Format
            </label>
            <select value={local.targetFormat || ''} onChange={e => upd('targetFormat', e.target.value || null)}
              className="flex-1 bg-transparent border-none text-sm text-[var(--c-text)] outline-none cursor-pointer"
            >
              <option value="">— Choisir un format —</option>
              {FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>

          {/* Notes */}
          <div className="rounded-xl border border-[var(--c-border)] overflow-hidden">
            <div className="px-4 py-2.5 bg-[var(--c-surface-2)] border-b border-[var(--c-border)]">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--c-text-3)]">
                <i className="fa-solid fa-note-sticky mr-1.5" />Notes & Inspiration
              </p>
            </div>
            <textarea value={local.notes || ''} onChange={e => upd('notes', e.target.value)}
              rows={5} placeholder="Détaillez votre idée, vos sources, vos inspirations…"
              className="w-full px-4 py-3 bg-[var(--c-bg)] text-sm text-[var(--c-text)] placeholder-[var(--c-text-3)] outline-none resize-none leading-relaxed"
            />
          </div>

          {/* AI Analysis block */}
          <div className="rounded-xl border border-violet-200/60 dark:border-violet-800/40 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-violet-50 dark:bg-violet-900/15 border-b border-violet-200/60 dark:border-violet-800/40">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-violet-800 dark:text-violet-200 flex items-center gap-1.5">
                  <i className="fa-solid fa-brain" />
                  {local.analyzed ? 'Analyse Stratégique' : "Analyser avec l'IA"}
                </span>
                <VerdictBadge verdict={local.verdict} />
                {local.depth && (
                  <Badge variant="purple" size="xs">
                    <i className="fa-solid fa-bolt text-[9px]" />{local.depth}
                  </Badge>
                )}
              </div>
              <button onClick={onAnalyze} disabled={isReanalyzing}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white dark:bg-violet-900/40 hover:bg-violet-50 dark:hover:bg-violet-800/40 text-violet-700 dark:text-violet-200 border border-violet-200 dark:border-violet-700 transition-colors disabled:opacity-50 whitespace-nowrap shadow-sm"
              >
                <i className={`fa-solid fa-arrows-rotate text-[10px] ${isReanalyzing ? 'fa-spin' : ''}`} />
                {isReanalyzing ? 'Analyse…' : local.analyzed ? 'Ré-analyser' : 'Analyser'}
              </button>
            </div>
            <div className="p-4 bg-[var(--c-surface)]">
              {local.analyzed && local.strategicAngle ? (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--c-text-3)] mb-2">Angle recommandé</p>
                    <p className="text-sm text-[var(--c-text)] leading-relaxed whitespace-pre-wrap">
                      {local.strategicAngle.replace(/\*\*/g, '')}
                    </p>
                  </div>
                  {(local.platforms || []).length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--c-text-3)] mb-2">Plateformes</p>
                      <div className="flex flex-wrap gap-1.5">
                        {local.platforms.map(p => <Badge key={p} variant="primary" size="xs">{p}</Badge>)}
                      </div>
                    </div>
                  )}
                  {local.justification && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--c-text-3)] mb-1.5">Justification</p>
                      <p className="text-xs text-[var(--c-text-2)] leading-relaxed">{local.justification}</p>
                    </div>
                  )}
                  {local.suggestedMetaphor && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--c-text-3)] mb-1.5">Métaphore suggérée</p>
                      <p className="text-xs text-[var(--c-text-2)] italic">"{local.suggestedMetaphor}"</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-[var(--c-text-3)] italic text-center py-6">
                  Cliquez sur "Analyser" pour obtenir un avis stratégique et des suggestions de plateformes.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[var(--c-border)] bg-[var(--c-surface-2)]/60 flex items-center justify-between gap-3 shrink-0">
          <button onClick={() => onDelete(local)}
            className="p-2.5 rounded-lg text-[var(--c-text-3)] hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 transition-colors"
            title="Supprimer cette idée"
          >
            <i className="fa-solid fa-trash-can" />
          </button>
          <div className="flex items-center gap-2">
            {saveStatus === 'saved' && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <i className="fa-solid fa-circle-check text-xs" />Enregistré
              </span>
            )}
            <button onClick={handleSave} disabled={!isDirty}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isDirty
                  ? 'text-[var(--c-text)] hover:bg-[var(--c-border)]/50 cursor-pointer'
                  : 'text-[var(--c-text-3)] cursor-default'
              }`}
            >
              <i className="fa-solid fa-floppy-disk text-xs" />
              Enregistrer
            </button>
            <button onClick={() => onTransform(local)} disabled={!local.analyzed}
              className="flex items-center gap-2 px-5 py-2 bg-[var(--c-primary)] hover:bg-[var(--c-primary-hover)] text-white text-sm font-semibold rounded-lg shadow-sm shadow-[var(--c-primary)]/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Travailler cette idée
              <i className="fa-solid fa-arrow-right text-xs" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// DRAFT EDITOR  (full-area takeover, replaces main content)
// ─────────────────────────────────────────────────────────────────────────────

const EDITOR_STEPS = [
  { id: 'idea',     icon: 'lightbulb',  label: 'Idée'      },
  { id: 'atelier',  icon: 'comments',   label: 'Atelier'   },
  { id: 'redaction',icon: 'pen-nib',    label: 'Rédaction' },
  { id: 'apercu',   icon: 'eye',        label: 'Aperçu'    },
];

const COACH_MESSAGES = [
  { role: 'assistant', content: "Bonjour ! Je suis prêt à t'aider à développer cette idée. Commençons par l'angle — qu'est-ce qui rend cette histoire **unique dans ta vie** ? Quel moment précis t'a fait réaliser quelque chose ?" },
  { role: 'user',      content: "Il y a 2 ans, j'ai perdu un gros client parce que je ne voulais pas négocier. J'ai cru que c'était une erreur. Aujourd'hui je réalise que ça m'a sauvé." },
  { role: 'assistant', content: "Parfait — voilà un angle fort. La perte volontaire comme acte de positionnement. On peut construire autour de : **« J'ai refusé 10 000€ — et c'était la meilleure décision de ma carrière »**. Ça pose une tension immédiate. Tu veux qu'on développe la structure ?" },
];

const DraftEditor = ({ item, onClose, onSave, onMarkReady }) => {
  const [step, setStep] = useState('redaction');
  const [body, setBody] = useState(item.body || '');
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState(COACH_MESSAGES);
  const [isThinking, setIsThinking] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!chatInput.trim()) return;
    const userMsg = { role: 'user', content: chatInput };
    setMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setIsThinking(true);
    await new Promise(r => setTimeout(r, 1200));
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: "Excellente matière. Je te suggère de structurer ainsi :\n\n1. **Hook** : la perte (chiffre ou situation précise)\n2. **Tension** : pourquoi tout le monde aurait dit oui\n3. **Pivot** : ce que tu as vu que les autres ne voyaient pas\n4. **Résolution** : ce que ça t'a apporté concrètement\n\nTu veux qu'on rédige le hook ensemble ?"
    }]);
    setIsThinking(false);
  };

  const wordCount = body.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="flex flex-col h-full bg-[var(--c-bg)] animate-in">

      {/* ── Editor header ── */}
      <div className="flex items-center gap-3 px-4 py-3 bg-[var(--c-surface)] border-b border-[var(--c-border)] shrink-0 z-10">
        <button onClick={onClose}
          className="flex items-center gap-2 text-sm font-medium text-[var(--c-text-2)] hover:text-[var(--c-text)] pr-4 border-r border-[var(--c-border)] transition-colors"
        >
          <i className="fa-solid fa-chevron-left text-xs" />
          <span className="hidden sm:inline">Retour</span>
        </button>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[var(--c-text)] text-sm truncate">{item.title}</p>
          <div className="flex items-center gap-2 mt-0.5">
            {item.platforms?.slice(0,2).map(p => <Badge key={p} variant="neutral" size="xs">{p}</Badge>)}
            {item.targetFormat && <Badge variant="pink" size="xs">{item.targetFormat}</Badge>}
          </div>
        </div>

        {/* Step tabs */}
        <div className="hidden md:flex items-center gap-1 bg-[var(--c-surface-2)] rounded-xl p-1">
          {EDITOR_STEPS.map((s, i) => (
            <button key={s.id} onClick={() => setStep(s.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                step === s.id
                  ? 'bg-[var(--c-surface)] text-[var(--c-primary)] shadow-sm'
                  : 'text-[var(--c-text-3)] hover:text-[var(--c-text-2)]'
              }`}
            >
              <i className={`fa-solid fa-${s.icon} text-[10px]`} />
              {s.label}
            </button>
          ))}
        </div>

        <button onClick={() => { onMarkReady(item); onClose(); }}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors whitespace-nowrap"
        >
          <i className="fa-solid fa-circle-check text-[10px]" />
          <span className="hidden sm:inline">Marquer prêt</span>
        </button>
      </div>

      {/* Mobile step tabs */}
      <div className="md:hidden flex items-center gap-1 px-3 py-2 bg-[var(--c-surface)] border-b border-[var(--c-border)] overflow-x-auto" style={{scrollbarWidth:'none'}}>
        {EDITOR_STEPS.map(s => (
          <button key={s.id} onClick={() => setStep(s.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all shrink-0 ${
              step === s.id
                ? 'bg-[var(--c-primary)] text-white shadow-sm'
                : 'text-[var(--c-text-2)] hover:bg-[var(--c-surface-2)]'
            }`}
          >
            <i className={`fa-solid fa-${s.icon} text-[10px]`} />
            {s.label}
          </button>
        ))}
      </div>

      {/* ── Step: Idée ── */}
      {step === 'idea' && (
        <div className="flex-1 overflow-y-auto p-5 md:p-8">
          <div className="max-w-2xl mx-auto space-y-5">
            <div className="bg-[var(--c-surface)] rounded-xl border border-[var(--c-border)] p-5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--c-text-3)] mb-3">Résumé de l'idée</p>
              <h2 className="text-lg font-bold text-[var(--c-text)] mb-2">{item.title}</h2>
              {item.notes && <p className="text-sm text-[var(--c-text-2)] leading-relaxed">{item.notes}</p>}
            </div>
            {item.strategicAngle && (
              <div className="bg-violet-50 dark:bg-violet-900/15 rounded-xl border border-violet-200/60 dark:border-violet-800/40 p-5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-violet-400 mb-3 flex items-center gap-1.5">
                  <i className="fa-solid fa-brain" />Angle stratégique IA
                </p>
                <p className="text-sm text-[var(--c-text)] leading-relaxed">{item.strategicAngle.replace(/\*\*/g,'')}</p>
              </div>
            )}
            <button onClick={() => setStep('atelier')}
              className="w-full flex items-center justify-center gap-2 py-3 bg-[var(--c-primary)] hover:bg-[var(--c-primary-hover)] text-white font-semibold rounded-xl shadow-sm shadow-[var(--c-primary)]/25 transition-all"
            >
              Passer à l'atelier <i className="fa-solid fa-arrow-right text-xs" />
            </button>
          </div>
        </div>
      )}

      {/* ── Step: Atelier (Coach Chat) ── */}
      {step === 'atelier' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
            <div className="max-w-2xl mx-auto space-y-3">
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-7 h-7 rounded-full bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center shrink-0 mt-0.5">
                      <i className="fa-solid fa-brain text-[10px] text-violet-600 dark:text-violet-300" />
                    </div>
                  )}
                  <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-[var(--c-primary)] text-white rounded-tr-sm'
                      : 'bg-[var(--c-surface)] border border-[var(--c-border)] text-[var(--c-text)] rounded-tl-sm'
                  }`}>
                    {msg.content.replace(/\*\*/g, '')}
                  </div>
                </div>
              ))}
              {isThinking && (
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center shrink-0">
                    <i className="fa-solid fa-brain text-[10px] text-violet-600 dark:text-violet-300" />
                  </div>
                  <div className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-2xl rounded-tl-sm px-4 py-3">
                    <i className="fa-solid fa-ellipsis text-[var(--c-text-3)] animate-pulse" />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          </div>
          <div className="px-4 py-3 border-t border-[var(--c-border)] bg-[var(--c-surface)] shrink-0">
            <div className="max-w-2xl mx-auto flex gap-2">
              <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                placeholder="Réponds au coach…"
                className="flex-1 px-4 py-2.5 bg-[var(--c-bg)] border border-[var(--c-border)] focus:border-[var(--c-primary)] rounded-xl text-sm text-[var(--c-text)] placeholder-[var(--c-text-3)] outline-none transition-colors"
              />
              <button onClick={sendMessage} disabled={!chatInput.trim() || isThinking}
                className="p-2.5 bg-[var(--c-primary)] hover:bg-[var(--c-primary-hover)] text-white rounded-xl transition-colors disabled:opacity-40"
              >
                <i className="fa-solid fa-paper-plane text-sm" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Step: Rédaction ── */}
      {step === 'redaction' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 md:p-8">
            <div className="max-w-2xl mx-auto">
              <textarea
                value={body}
                onChange={e => { setBody(e.target.value); setIsDirty(true); }}
                placeholder="Commencez à rédiger votre contenu ici…"
                className="w-full h-full min-h-[400px] bg-[var(--c-surface)] border border-[var(--c-border)] focus:border-[var(--c-primary)] rounded-xl p-5 text-sm text-[var(--c-text)] placeholder-[var(--c-text-3)] outline-none transition-colors leading-relaxed resize-none"
                style={{minHeight: 'calc(100vh - 300px)'}}
              />
            </div>
          </div>
          <div className="px-5 py-3 border-t border-[var(--c-border)] bg-[var(--c-surface)] flex items-center justify-between shrink-0">
            <span className="text-xs text-[var(--c-text-3)]">
              <span className="font-semibold text-[var(--c-text-2)]">{wordCount}</span> mots
            </span>
            <button onClick={() => { onSave({...item, body}); setIsDirty(false); }}
              disabled={!isDirty}
              className="flex items-center gap-2 px-4 py-2 bg-[var(--c-primary)] hover:bg-[var(--c-primary-hover)] text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-40 shadow-sm"
            >
              <i className="fa-solid fa-floppy-disk text-xs" />
              Enregistrer
            </button>
          </div>
        </div>
      )}

      {/* ── Step: Aperçu ── */}
      {step === 'apercu' && (
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-xl mx-auto">
            {/* Simulated post preview */}
            <div className="bg-[var(--c-surface)] rounded-2xl border border-[var(--c-border)] shadow-sm overflow-hidden">
              <div className="p-5 border-b border-[var(--c-border)]">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--c-text-3)] mb-3">
                  <i className="fa-solid fa-eye mr-1.5" />Aperçu — {item.targetFormat || 'Post'}
                </p>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--c-primary)] to-violet-400 flex items-center justify-center">
                    <span className="text-white font-bold text-sm" style={{fontFamily:"'Lora',Georgia,serif",fontStyle:'italic'}}>L</span>
                  </div>
                  <div>
                    <p className="font-bold text-[var(--c-text)] text-sm">Luminose Studio</p>
                    <p className="text-xs text-[var(--c-text-3)]">Il y a 2 minutes</p>
                  </div>
                </div>
                <p className="text-sm text-[var(--c-text)] leading-relaxed whitespace-pre-wrap">
                  {body || item.body || 'Aucun contenu rédigé pour l\'instant.'}
                </p>
              </div>
              <div className="px-5 py-3 flex items-center gap-4 text-xs text-[var(--c-text-3)]">
                <span><i className="fa-regular fa-heart mr-1" />J'aime</span>
                <span><i className="fa-regular fa-comment mr-1" />Commenter</span>
                <span><i className="fa-solid fa-share mr-1" />Partager</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
const MobileSubTabs = ({ tab, counts, onNavigate }) => (
  <div className="md:hidden flex items-center gap-1 overflow-x-auto px-3 py-2 border-b border-[var(--c-border)] bg-[var(--c-surface)] shrink-0"
    style={{scrollbarWidth:'none', WebkitOverflowScrolling:'touch'}}>
    {SOCIAL_TABS.map(t => {
      const active = tab === t.id;
      return (
        <button key={t.id} onClick={() => onNavigate('social', t.id)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all shrink-0 ${
            active
              ? 'bg-[var(--c-primary)] text-white shadow-sm'
              : 'text-[var(--c-text-2)] hover:bg-[var(--c-surface-2)]'
          }`}
        >
          <i className={`fa-solid fa-${t.icon} text-[10px]`} />
          {t.label}
          {counts[t.id] > 0 && (
            <span className={`text-[10px] font-bold px-1 rounded-full leading-none ${active ? 'bg-white/25' : 'bg-[var(--c-border)] text-[var(--c-text-3)]'}`}>
              {counts[t.id]}
            </span>
          )}
        </button>
      );
    })}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS PANEL  (in-app slide-in)
// ─────────────────────────────────────────────────────────────────────────────

const AI_MODELS_MOCK = [
  { id:'gemini-flash', name:'Gemini 2.0 Flash', provider:'Google',    cost:'Faible', default:true  },
  { id:'gemini-pro',   name:'Gemini 1.5 Pro',   provider:'Google',    cost:'Moyen'                 },
  { id:'gpt4o',        name:'GPT-4o',            provider:'OpenAI',   cost:'Élevé'                 },
  { id:'claude',       name:'Claude 3.5 Sonnet', provider:'Anthropic',cost:'Moyen'                 },
];
const CONTEXTS_MOCK = [
  { id:'c1', name:'LinkedIn Professionnel', usage:'Rédacteur',   desc:'Ton expert, concis, basé sur des faits.' },
  { id:'c2', name:'Analyste Stratégique',   usage:'Analyste',    desc:'Analyse critique, recommandations actionnables.' },
  { id:'c3', name:'Coach Bienveillant',     usage:'Interviewer', desc:'Questions ouvertes, explorations en profondeur.' },
];

const ToggleSwitch = ({ value, onChange, label, desc }) => (
  <div className="flex items-center justify-between gap-4 py-3 border-b border-[var(--c-border)]/60 last:border-0">
    <div className="min-w-0">
      <p className="text-sm font-medium text-[var(--c-text)]">{label}</p>
      {desc && <p className="text-xs text-[var(--c-text-3)] mt-0.5 leading-snug">{desc}</p>}
    </div>
    <button onClick={() => onChange(!value)} role="switch" aria-checked={value}
      className={`relative shrink-0 w-10 h-[22px] rounded-full transition-colors duration-200 ${value ? 'bg-[var(--c-primary)]' : 'bg-[var(--c-border)]'}`}
    >
      <span className={`absolute top-[3px] left-[3px] w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${value ? 'translate-x-[18px]' : 'translate-x-0'}`} />
    </button>
  </div>
);

const DensitySelector = ({ value, onChange }) => {
  const opts = [
    { id:'compact', icon:'compress', label:'Compacte' },
    { id:'normal',  icon:'minus',    label:'Normale'  },
    { id:'airy',    icon:'expand',   label:'Aérée'    },
  ];
  return (
    <div className="py-3 border-b border-[var(--c-border)]/60">
      <p className="text-sm font-medium text-[var(--c-text)] mb-2">Densité des listes</p>
      <div className="flex gap-2">
        {opts.map(o => (
          <button key={o.id} onClick={() => onChange(o.id)}
            className={`flex-1 flex flex-col items-center gap-1.5 py-2.5 rounded-xl border text-xs font-semibold transition-all ${
              value === o.id
                ? 'bg-[var(--c-primary-bg)] border-[var(--c-primary)] text-[var(--c-primary)]'
                : 'bg-[var(--c-surface-2)] border-[var(--c-border)] text-[var(--c-text-3)] hover:text-[var(--c-text)]'
            }`}
          >
            <i className={`fa-solid fa-${o.icon} text-sm`} />
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
};


const SettingsPanel = ({ prefs, onPrefsChange, onClose }) => {
  const [activeTab, setActiveTab] = useState('affichage');
  const set = (key, val) => onPrefsChange({ ...prefs, [key]: val });

  const TABS = [
    { id:'affichage', icon:'sliders',  label:'Affichage'     },
    { id:'ia',        icon:'brain',    label:'Paramètres IA' },
  ];

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
        style={{animation:'lmFadeIn 0.15s ease-out'}} onClick={onClose} />
      <aside className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-[400px] bg-[var(--c-surface)] border-l border-[var(--c-border)] flex flex-col shadow-2xl"
        style={{animation:'lmSlideIn 0.25s cubic-bezier(0.16,1,0.3,1)'}}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--c-border)] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[var(--c-surface-2)] flex items-center justify-center">
              <i className="fa-solid fa-sliders text-sm text-[var(--c-primary)]" />
            </div>
            <h2 className="font-bold text-[var(--c-text)]">Réglages</h2>
          </div>
          <button onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--c-surface-2)] text-[var(--c-text-3)] transition-colors">
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-4 pt-3 shrink-0">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-t-xl text-sm font-semibold border-b-2 transition-all ${
                activeTab === tab.id
                  ? 'text-[var(--c-primary)] border-[var(--c-primary)] bg-[var(--c-surface-2)]'
                  : 'text-[var(--c-text-3)] border-transparent hover:text-[var(--c-text-2)]'
              }`}
            >
              <i className={`fa-solid fa-${tab.icon} text-[11px]`} />{tab.label}
            </button>
          ))}
        </div>
        <div className="w-full h-px bg-[var(--c-border)] shrink-0" />

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">

          {activeTab === 'affichage' && (
            <div className="animate-in fade-in duration-200">
              <p className="text-[10px] font-black uppercase tracking-widest text-[var(--c-text-3)] mb-3">Espace Contenus</p>
              <DensitySelector value={prefs.density || 'normal'} onChange={v => set('density', v)} />
              <ToggleSwitch label="Bande verdict colorée" desc="Trait coloré à gauche de chaque idée" value={prefs.showStripe !== false} onChange={v => set('showStripe', v)} />
              <ToggleSwitch label="Plateformes" desc="Badges LinkedIn, Instagram, etc." value={prefs.showPlatforms !== false} onChange={v => set('showPlatforms', v)} />
              <ToggleSwitch label="Niveau d'analyse" desc="Direct, Légère, Complète" value={prefs.showDepth !== false} onChange={v => set('showDepth', v)} />
              <ToggleSwitch label="Offre cible" desc="Standard, Seuil, Transverse" value={prefs.showOffer === true} onChange={v => set('showOffer', v)} />
            </div>
          )}

          {activeTab === 'ia' && (
            <div className="animate-in fade-in duration-200 space-y-6">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--c-text-3)] mb-3">Modèles IA</p>
                <div className="space-y-2">
                  {AI_MODELS_MOCK.map(m => (
                    <div key={m.id}
                      className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                        m.default ? 'border-[var(--c-primary)]/40 bg-[var(--c-primary-bg)]' : 'border-[var(--c-border)] bg-[var(--c-surface-2)] hover:border-[var(--c-primary)]/30'
                      }`}
                    >
                      <div className={`w-2 h-2 rounded-full shrink-0 ${m.default ? 'bg-[var(--c-primary)]' : 'bg-[var(--c-border)]'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-[var(--c-text)]">{m.name}</p>
                          {m.default && <Badge variant="primary" size="xs">Défaut</Badge>}
                        </div>
                        <p className="text-xs text-[var(--c-text-3)] mt-0.5">{m.provider} · Coût {m.cost}</p>
                      </div>
                      <i className={`fa-solid fa-circle-check text-sm ${m.default ? 'text-[var(--c-primary)]' : 'text-[var(--c-border)]'}`} />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-[var(--c-text-3)]">Contextes</p>
                  <button className="flex items-center gap-1.5 text-xs font-semibold text-[var(--c-primary)] hover:underline">
                    <i className="fa-solid fa-plus text-[9px]" />Nouveau
                  </button>
                </div>
                <div className="space-y-2">
                  {CONTEXTS_MOCK.map(c => (
                    <div key={c.id} className="p-3.5 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface-2)] hover:border-[var(--c-primary)]/30 transition-all group cursor-pointer">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[var(--c-text)]">{c.name}</p>
                          <p className="text-xs text-[var(--c-text-3)] mt-0.5 line-clamp-2 leading-relaxed">{c.desc}</p>
                        </div>
                        <Badge variant="primary" size="xs">{c.usage}</Badge>
                      </div>
                      <div className="flex gap-3 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="text-xs text-[var(--c-text-3)] hover:text-[var(--c-primary)] flex items-center gap-1 transition-colors">
                          <i className="fa-solid fa-pen-to-square text-[9px]" />Modifier
                        </button>
                        <button className="text-xs text-[var(--c-text-3)] hover:text-red-500 flex items-center gap-1 transition-colors">
                          <i className="fa-solid fa-trash-can text-[9px]" />Supprimer
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};

const EmptyState = ({ icon, title, desc }) => (
  <div className="py-20 text-center">
    <i className={`fa-solid fa-${icon} text-5xl block mb-4`} style={{color:'var(--c-border)'}} />
    <p className="font-semibold text-[var(--c-text)]">{title}</p>
    <p className="text-sm text-[var(--c-text-3)] mt-1 max-w-xs mx-auto">{desc}</p>
  </div>
);

const ComingSoon = ({ icon, title, desc }) => (
  <div className="flex-1 flex items-center justify-center p-8">
    <div className="text-center max-w-sm">
      <div className="w-16 h-16 rounded-2xl bg-[var(--c-surface)] border border-[var(--c-border)] flex items-center justify-center mx-auto mb-5 shadow-sm">
        <i className={`fa-solid fa-${icon} text-2xl text-[var(--c-text-3)]`} />
      </div>
      <h2 className="text-lg font-bold text-[var(--c-text)] mb-2">{title}</h2>
      <p className="text-sm text-[var(--c-text-2)] leading-relaxed">{desc}</p>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────────────────────
Object.assign(window, {
  Badge, VerdictBadge, Spinner,
  Sidebar, Header, MobileSubTabs,
  IdeasView, DraftsView, ReadyTable,
  IdeaPanel, DraftEditor, SettingsPanel,
  EmptyState, ComingSoon,
});
