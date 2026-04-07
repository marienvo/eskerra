import {useEffect} from 'react';

import type {SessionNotification} from '../lib/sessionNotifications';

import {MaterialIcon} from './MaterialIcon';

type NotificationsPanelProps = {
  /** Match vault tree (capture) vs podcasts (consume) pane chrome. */
  appSurface: 'capture' | 'consume';
  items: readonly SessionNotification[];
  highlightId: string | null;
  onDismiss: (id: string) => void;
  onClearAll: () => void;
};

export function NotificationsPanel({
  appSurface,
  items,
  highlightId,
  onDismiss,
  onClearAll,
}: NotificationsPanelProps) {
  useEffect(() => {
    if (!highlightId) {
      return;
    }
    const row = document.getElementById(`desktop-notif-${highlightId}`);
    row?.scrollIntoView({block: 'nearest', behavior: 'smooth'});
  }, [highlightId]);

  return (
    <div
      className="panel-surface notifications-panel"
      data-app-surface={appSurface}
    >
      <div className="pane-header">
        <span className="pane-title">Notifications</span>
        <div className="pane-header-trailing-actions">
          <button
            type="button"
            className="pane-header-add-btn icon-btn-ghost app-tooltip-trigger"
            disabled={items.length === 0}
            aria-label="Clear all notifications"
            data-tooltip="Clear all"
            data-tooltip-placement="inline-start"
            onClick={onClearAll}
          >
            <span className="pane-header-add-btn__glyph" aria-hidden>
              <MaterialIcon name="delete_sweep" size={12} />
            </span>
          </button>
        </div>
      </div>
      <div className="notifications-panel__body">
        {items.length === 0 ? (
          <p className="notifications-panel__empty muted">No notifications yet.</p>
        ) : (
          <ul className="notifications-panel__list">
            {items.map(item => (
              <li
                key={item.id}
                id={`desktop-notif-${item.id}`}
                className={[
                  'notifications-panel__row',
                  item.tone === 'error' ? 'notifications-panel__row--error' : 'notifications-panel__row--info',
                  highlightId === item.id ? 'notifications-panel__row--highlight' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <p className="notifications-panel__text">{item.text}</p>
                <button
                  type="button"
                  className="notifications-panel__dismiss icon-btn-ghost app-tooltip-trigger"
                  aria-label="Dismiss notification"
                  data-tooltip="Dismiss"
                  data-tooltip-placement="inline-start"
                  onClick={() => onDismiss(item.id)}
                >
                  <MaterialIcon name="close" size={12} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
