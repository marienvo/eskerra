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
        className={`rail-tab app-tooltip-trigger ${active === 'podcasts' ? 'active' : ''}`}
        aria-label="Episodes"
        data-tooltip="Episodes"
        data-tooltip-placement="inline-end"
        onClick={() => onSelect('podcasts')}
      >
        <MaterialIcon name="radio" size={12} aria-hidden />
      </button>
      <button
        type="button"
        className={`rail-tab app-tooltip-trigger ${active === 'inbox' ? 'active' : ''}`}
        aria-label="Log"
        data-tooltip="Log"
        data-tooltip-placement="inline-end"
        onClick={() => onSelect('inbox')}
      >
        <MaterialIcon name="edit_note" size={12} aria-hidden />
      </button>
    </nav>
  );
}
