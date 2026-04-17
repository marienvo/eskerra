# Design system — on-device review (Android)

Use this checklist before **release** when `@eskerra/ds-mobile` or native-affecting app code changed. RN-Web Storybook being green is **not** sufficient.

## Gestures & motion

- [ ] `react-native-reanimated` animations behave as expected (no jank, no stuck frames).
- [ ] `react-native-gesture-handler` interactions (scroll, pan, long-press where used) feel correct.

## Keyboard & lists

- [ ] Software keyboard / `react-native-keyboard-controller` does not obscure focused inputs.
- [ ] Long lists (`FlatList` / virtualization) scroll smoothly with real data density.

## Audio & storage (if touched)

- [ ] `react-native-track-player` / notification behavior sanity check.
- [ ] SAF / folder picker flows if `react-native-saf-x` changed.

## Accessibility & device

- [ ] TalkBack: focus order and labels on changed surfaces.
- [ ] Safe area / display cutout on at least one physical device.
- [ ] Visual check on AMOLED vs LCD if color tokens changed.

## Storybook on-device

- [ ] `npm run storybook:android -w @eskerra/mobile` opens Storybook; smoke-navigate DS stories that were modified.
