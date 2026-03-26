/* eslint-env jest, node */
/** Re-apply before every test so no prior suite can leave Jest detection unset. */
beforeEach(() => {
  global.__NOTEBOX_JEST__ = true;
});
