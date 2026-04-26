/**
 * Stable Markdown samples shared by core, mobile, and desktop podcast parser tests.
 */

export const PODCAST_FIXTURE_EPISODE_LINE_UNPLAYED =
  '- [ ] 2026-03-20; #52 - Flitspalen, een gereedschapskist en een bosje tulpen (S10) [▶️](https://example.com/episode.mp3) (De Stemming van Vullings en De Rooy ●)';

export const PODCAST_FIXTURE_EPISODE_LINE_PLAYED =
  "- [x] 2026-03-20; [🌐](https://example.com/article) Van Iran tot Oekraïne: hackers storten zich op beveiligingscamera's [▶️](https://example.com/audio.mp3) (Schaduwoorlog)";

export const PODCAST_FIXTURE_MULTI_LINE_BODY = [
  '- [ ] 2026-01-02; Titel A [▶️](https://example.com/a.mp3) (Serie A)',
  '- [x] 2026-01-03; [🌐](https://example.com) Titel B [▶️](https://example.com/b.mp3) (Serie B)',
  'Not an entry',
].join('\n');

export const PODCAST_FIXTURE_GROUP_BODY = [
  '- [ ] 2026-01-02; Titel A [▶️](https://example.com/a.mp3) (Serie A)',
  '- [ ] 2026-01-03; Titel B [▶️](https://example.com/b.mp3) (Serie B)',
].join('\n');
