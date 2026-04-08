/** Shell callbacks for vault wiki / relative `.md` link activation (click or middle-click). */
export type VaultWikiLinkActivatePayload = {
  inner: string;
  at: number;
  /** Middle-click: open target in a new background editor tab. */
  openInBackgroundTab?: boolean;
};

export type VaultRelativeMarkdownLinkActivatePayload = {
  href: string;
  at: number;
  openInBackgroundTab?: boolean;
};
