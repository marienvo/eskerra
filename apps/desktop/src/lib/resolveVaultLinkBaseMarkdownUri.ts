/**
 * The vault `.md` file that link navigation is considered to run "from" (Inbox or Today hub cell).
 * Same rule as wiki-link `activeMarkdownUri` in the main window workspace.
 */
export function resolveVaultLinkBaseMarkdownUri(args: {
  composingNewEntry: boolean;
  showTodayHubCanvas: boolean;
  todayHubWikiNavParentUri: string | null;
  selectedUri: string | null;
}): string | null {
  if (args.composingNewEntry) {
    return null;
  }
  if (args.showTodayHubCanvas) {
    return args.todayHubWikiNavParentUri ?? args.selectedUri;
  }
  return args.selectedUri;
}
