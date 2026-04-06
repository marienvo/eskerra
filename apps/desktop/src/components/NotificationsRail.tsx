import {TabButton} from '../ds';

type NotificationsRailProps = {
  panelVisible: boolean;
  onToggle: () => void;
};

export function NotificationsRail({panelVisible, onToggle}: NotificationsRailProps) {
  return (
    <nav className="rail rail--end" aria-label="Notifications">
      <TabButton
        active={panelVisible}
        aria-label="Show or hide notifications"
        ariaPressed={panelVisible}
        icon="notifications"
        tooltip="Notifications"
        tooltipPlacement="inline-start"
        onClick={onToggle}
      />
      <div className="rail-spacer" aria-hidden />
    </nav>
  );
}
