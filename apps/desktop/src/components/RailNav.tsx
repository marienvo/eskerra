import {TabButton} from '../ds';

type TabId = 'podcasts' | 'inbox';

type RailNavProps = {
  active: TabId;
  onSelect: (tab: TabId) => void;
  playerDockVisible: boolean;
  playerToggleDisabled: boolean;
  onTogglePlayerDock: () => void;
};

export function RailNav({
  active,
  onSelect,
  onTogglePlayerDock,
  playerDockVisible,
  playerToggleDisabled,
}: RailNavProps) {
  const playerActive = playerDockVisible && !playerToggleDisabled;

  return (
    <nav className="rail" aria-label="Main">
      <TabButton
        active={active === 'podcasts'}
        aria-label="Episodes"
        icon="radio"
        tooltip="Episodes"
        onClick={() => onSelect('podcasts')}
      />
      <TabButton
        active={active === 'inbox'}
        aria-label="Vault"
        icon="edit_note"
        tooltip="Vault"
        onClick={() => onSelect('inbox')}
      />
      <div className="rail-spacer" aria-hidden />
      <TabButton
        active={playerActive}
        aria-label="Show or hide player"
        ariaPressed={playerDockVisible}
        disabled={playerToggleDisabled}
        icon="play_circle"
        tooltip="Player"
        onClick={onTogglePlayerDock}
      />
    </nav>
  );
}
