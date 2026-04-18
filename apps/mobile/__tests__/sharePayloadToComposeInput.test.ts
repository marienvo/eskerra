import {sharePayloadToComposeInput} from '../src/core/share/sharePayloadToComposeInput';

describe('sharePayloadToComposeInput', () => {
  it('returns empty when both empty', () => {
    expect(sharePayloadToComposeInput({subject: '', text: ''})).toBe('');
    expect(sharePayloadToComposeInput({subject: '  ', text: '  '})).toBe('');
  });

  it('uses subject as title and text as body', () => {
    expect(sharePayloadToComposeInput({subject: 'From app', text: 'hello'})).toBe(
      'From app\n\nhello',
    );
  });

  it('uses first line of subject only as title', () => {
    expect(sharePayloadToComposeInput({subject: 'Line1\nLine2', text: 'body'})).toBe(
      'Line1\n\nbody',
    );
  });

  it('subject only yields title without body', () => {
    expect(sharePayloadToComposeInput({subject: 'Title only', text: ''})).toBe('Title only');
  });

  it('multiline text uses first line as title', () => {
    expect(sharePayloadToComposeInput({subject: '', text: 'My title\n\nBody line'})).toBe(
      'My title\n\nBody line',
    );
  });

  it('single-line URL uses Shared as title', () => {
    expect(
      sharePayloadToComposeInput({
        subject: '',
        text: 'https://example.com/path?q=1',
      }),
    ).toBe('Shared\n\nhttps://example.com/path?q=1');
  });

  it('single-line plain text is the title line', () => {
    expect(sharePayloadToComposeInput({subject: '', text: 'Quick jot'})).toBe('Quick jot');
  });
});
