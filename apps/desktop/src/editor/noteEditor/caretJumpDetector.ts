import {Transaction, type Extension} from '@codemirror/state';
import {EditorView} from '@codemirror/view';

import {appBreadcrumb} from '../../observability/appBreadcrumb';
import {captureObservabilityMessage} from '../../observability/captureObservabilityMessage';

/** Suppresses caret-jump telemetry for the rest of this synchronous call stack (used around `loadMarkdown`). */
const programmaticLoadViews = new WeakSet<EditorView>();

export function beginProgrammaticMarkdownLoad(view: EditorView): void {
  programmaticLoadViews.add(view);
}

export function endProgrammaticMarkdownLoad(view: EditorView): void {
  programmaticLoadViews.delete(view);
}

const LARGE_JUMP_CHARS = 200;
/** Head moved to EOF from clearly not EOF (heuristic for the reported bug). */
const EOF_JUMP_CAPTURE_THRESHOLD = 80;

function transactionUserEvent(tr: Transaction): string | undefined {
  return tr.annotation(Transaction.userEvent) as string | undefined;
}

/**
 * Detects large selection moves without a normal typing user event, for triage of caret jumps.
 * Skips updates that occur inside `beginProgrammaticMarkdownLoad` / `endProgrammaticMarkdownLoad`.
 */
export function caretJumpDetectorExtension(): Extension {
  return EditorView.updateListener.of(update => {
    if (programmaticLoadViews.has(update.view)) {
      return;
    }
    if (!update.selectionSet || update.startState.doc === update.state.doc) {
      return;
    }
    const prevHead = update.startState.selection.main.head;
    const nextHead = update.state.selection.main.head;
    const delta = Math.abs(nextHead - prevHead);
    if (delta < LARGE_JUMP_CHARS) {
      return;
    }
    const docLen = update.state.doc.length;
    let sawSuspiciousTr = false;
    let userEventSummary: string | undefined;
    for (const tr of update.transactions) {
      if (tr.startState.selection.eq(tr.newSelection)) {
        continue;
      }
      const ue = transactionUserEvent(tr);
      if (ue != null && ue !== '') {
        userEventSummary = ue;
        continue;
      }
      sawSuspiciousTr = true;
      break;
    }
    if (!sawSuspiciousTr) {
      return;
    }
    const data: Record<string, unknown> = {
      prev_head: prevHead,
      next_head: nextHead,
      delta,
      doc_length: docLen,
      doc_changed: update.docChanged,
    };
    if (userEventSummary !== undefined) {
      data.other_tx_user_event = userEventSummary;
    }
    appBreadcrumb({
      category: 'editor',
      message: 'caret_large_jump',
      level: 'info',
      data,
    });
    const jumpedToEof = nextHead >= docLen && prevHead < docLen - EOF_JUMP_CAPTURE_THRESHOLD;
    if (jumpedToEof) {
      captureObservabilityMessage({
        message: 'eskerra.desktop.caret_jump_eof',
        level: 'warning',
        extra: data,
        fingerprint: ['eskerra.desktop', 'caret_jump_eof'],
      });
    }
  });
}
