type TabId = 'podcasts' | 'inbox';

type RailNavProps = {
  active: TabId;
  onSelect: (tab: TabId) => void;
};

export function RailNav({active, onSelect}: RailNavProps) {
  return (
    <nav className="rail" aria-label="Main">
      <button
        type="button"
        className={`rail-tab ${active === 'podcasts' ? 'active' : ''}`}
        onClick={() => onSelect('podcasts')}
      >
        <span className="rail-icon" aria-hidden>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6zm-2 16c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" />
          </svg>
        </span>
        <span className="rail-label">Podcasts</span>
      </button>
      <button
        type="button"
        className={`rail-tab ${active === 'inbox' ? 'active' : ''}`}
        onClick={() => onSelect('inbox')}
      >
        <span className="rail-icon" aria-hidden>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z" />
          </svg>
        </span>
        <span className="rail-label">Inbox</span>
      </button>
    </nav>
  );
}
