import {useEffect} from 'react';

import type {SessionNotification} from '../lib/sessionNotifications';

import {MaterialIcon} from './MaterialIcon';

type NotificationsPanelProps = {
  items: readonly SessionNotification[];
  highlightId: string | null;
  onDismiss: (id: string) => void;
  onClearAll: () => void;
};

export function NotificationsPanel({
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
    <div className="panel-surface notifications-panel">
      <div className="pane-header notifications-panel__header">
        <span className="pane-title">Notifications</span>
        <div className="notifications-panel__header-actions">
          <button
            type="button"
            className="notifications-panel__clear-all"
            disabled={items.length === 0}
            onClick={onClearAll}
          >
            Clear all
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
                  <MaterialIcon name="close" size={14} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
