import {TabButton} from '../ds';

type RailNavProps = {
  vaultPaneVisible: boolean;
  onToggleVault: () => void;
};

export function RailNav({vaultPaneVisible, onToggleVault}: RailNavProps) {
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
    </nav>
  );
}
