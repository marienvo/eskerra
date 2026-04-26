/**
 * Approximate total height when MiniPlayer is visible. Used for keyboard footer offset;
 * update if container padding, artwork row, or progress block changes.
 * Artwork action mode matches the same ~64px text column height; an error line below actions
 * can add ~22px but is omitted here to keep the offset conservative.
 */
export const MINI_PLAYER_LAYOUT_HEIGHT =
  1 + 20 + 64 + 8 + 40 + 6 + 52;// + 20;
