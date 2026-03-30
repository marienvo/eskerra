import {isNavigateToAddNoteAction} from '../src/navigation/navigationActionGuards';

describe('isNavigateToAddNoteAction', () => {
  test('returns true for NAVIGATE to AddNote', () => {
    expect(
      isNavigateToAddNoteAction({
        type: 'NAVIGATE',
        payload: {name: 'AddNote', params: {noteUri: 'x'}},
      }),
    ).toBe(true);
  });

  test('returns false for other screens', () => {
    expect(
      isNavigateToAddNoteAction({
        type: 'NAVIGATE',
        payload: {name: 'Vault'},
      }),
    ).toBe(false);
  });

  test('returns false for non-NAVIGATE', () => {
    expect(isNavigateToAddNoteAction({type: 'GO_BACK'})).toBe(false);
  });
});
