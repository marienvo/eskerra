import {
  markEpisodeAsPlayedInContent,
} from '../src/features/podcasts/services/markEpisodeAsPlayed';

describe('markEpisodeAsPlayedInContent', () => {
  test('replaces [ ] with [x] on matching episode line', () => {
    const content = [
      '- [ ] 2026-03-20; Episode A [▶️](https://example.com/a.mp3) (Series A)',
      '- [ ] 2026-03-21; Episode B [▶️](https://example.com/b.mp3) (Series B)',
    ].join('\n');

    const {nextContent, updated} = markEpisodeAsPlayedInContent(
      content,
      'https://example.com/b.mp3',
    );

    expect(updated).toBe(true);
    expect(nextContent).toContain(
      '- [x] 2026-03-21; Episode B [▶️](https://example.com/b.mp3) (Series B)',
    );
  });

  test('does not change a line already marked [x]', () => {
    const content =
      '- [x] 2026-03-20; Episode A [▶️](https://example.com/a.mp3) (Series A)';

    const {nextContent, updated} = markEpisodeAsPlayedInContent(
      content,
      'https://example.com/a.mp3',
    );

    expect(updated).toBe(false);
    expect(nextContent).toBe(content);
  });

  test('does not change non-matching lines', () => {
    const content = [
      '- [ ] 2026-03-20; Episode A [▶️](https://example.com/a.mp3) (Series A)',
      '- [ ] 2026-03-21; Episode B [▶️](https://example.com/b.mp3) (Series B)',
    ].join('\n');

    const {nextContent, updated} = markEpisodeAsPlayedInContent(
      content,
      'https://example.com/c.mp3',
    );

    expect(updated).toBe(false);
    expect(nextContent).toBe(content);
  });
});
