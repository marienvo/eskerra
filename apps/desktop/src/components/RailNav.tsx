import {TabButton} from '../ds';

type RailNavProps = {
  vaultPaneVisible: boolean;
  episodesPaneVisible: boolean;
  onToggleVault: () => void;
  onToggleEpisodes: () => void;
};

export function RailNav({
  vaultPaneVisible,
  episodesPaneVisible,
  onToggleVault,
  onToggleEpisodes,
}: RailNavProps) {
  return (
    <nav className="rail" aria-label="Main">
      <TabButton
        active={vaultPaneVisible}
        ariaPressed={vaultPaneVisible}
        aria-label="Vault"
        icon="edit_note"
        tooltip="Vault"
        onClick={onToggleVault}
      />
      <div className="rail-spacer" aria-hidden />
      <TabButton
        active={episodesPaneVisible}
        ariaPressed={episodesPaneVisible}
        aria-label="Episodes"
        icon="radio"
        tooltip="Episodes"
        onClick={onToggleEpisodes}
      />
    </nav>
  );
}
