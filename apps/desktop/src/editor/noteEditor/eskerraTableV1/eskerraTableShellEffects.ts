import {StateEffect} from '@codemirror/state';

export type TableShellOpen = {
  headerLineFrom: number;
  baselineText: string;
};

export const suppressTableWidgetAt = StateEffect.define<{lineFrom: number}>();
export const clearTableSuppressionAt = StateEffect.define<{lineFrom: number}>();

export const openTableShellEffect = StateEffect.define<TableShellOpen>();
export const closeTableShellEffect = StateEffect.define<null>();

/** @deprecated use openTableShellEffect */
export const enterTableModeEffect = openTableShellEffect;
/** @deprecated use closeTableShellEffect */
export const exitTableModeEffect = closeTableShellEffect;
