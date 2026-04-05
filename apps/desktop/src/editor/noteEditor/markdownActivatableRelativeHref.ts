import {
  MARKDOWN_EXTENSION,
  isExternalMarkdownHref,
  stripMarkdownLinkHrefToPathPart,
} from '@notebox/core';

/** Same policy as table cell / note editor: only in-vault relative `.md` targets are activatable. */
export function isActivatableRelativeMarkdownHref(href: string): boolean {
  const part = stripMarkdownLinkHrefToPathPart(href);
  if (part === '' || isExternalMarkdownHref(part)) {
    return false;
  }
  return part.toLowerCase().endsWith(MARKDOWN_EXTENSION.toLowerCase());
}
