declare module 'turndown-plugin-gfm' {
  type TurndownSvc = import('turndown');

  export function highlightedCodeBlock(turndownService: TurndownSvc): void;
  export function strikethrough(turndownService: TurndownSvc): void;
  export function tables(turndownService: TurndownSvc): void;
  export function taskListItems(turndownService: TurndownSvc): void;
  export function gfm(turndownService: TurndownSvc): void;
}
