import {MaterialIcon} from './MaterialIcon';

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
        aria-label="Episodes"
        data-tooltip="Episodes"
        onClick={() => onSelect('podcasts')}
      >
        <MaterialIcon name="radio" size={12} aria-hidden />
      </button>
      <button
        type="button"
        className={`rail-tab ${active === 'inbox' ? 'active' : ''}`}
        aria-label="Log"
        data-tooltip="Log"
        onClick={() => onSelect('inbox')}
      >
        <MaterialIcon name="edit_note" size={12} aria-hidden />
      </button>
    </nav>
  );
}
