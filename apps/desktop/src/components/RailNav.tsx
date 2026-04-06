import {TabButton} from '../ds';

type TabId = 'podcasts' | 'inbox';

type RailNavProps = {
  active: TabId;
  onSelect: (tab: TabId) => void;
};

export function RailNav({active, onSelect}: RailNavProps) {
  return (
    <nav className="rail" aria-label="Main">
      <TabButton
        active={active === 'inbox'}
        aria-label="Vault"
        icon="edit_note"
        tooltip="Vault"
        onClick={() => onSelect('inbox')}
      />
      <TabButton
        active={active === 'podcasts'}
        aria-label="Episodes"
        icon="radio"
        tooltip="Episodes"
        onClick={() => onSelect('podcasts')}
      />
    </nav>
  );
}
