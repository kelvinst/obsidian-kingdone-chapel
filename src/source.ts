/**
 * What a note's source says, whichever plugin is reading it.
 *
 * `live.ts` walks the source looking for `~sub~ ^sup^ ,,small,,` runs and
 * `softlink-live.ts` walks it looking for `((target|display))` tokens, but
 * both are reading the same document under the same editor, and both have to
 * answer the same three questions before they can trust a line at all: is it
 * inside a fenced code block, what does it say once its quote markers are
 * taken off, and does the cursor or selection reach into the span in
 * question. A fix to any of the three belongs here, once, rather than in
 * each plugin that asks it.
 */

import type { EditorState } from '@codemirror/state';

/** A line opening or closing a code block, where a token is only text. */
export const CODE_BLOCK = /^\s*(?:```|~~~)/;

/** What a line says once its quote markers are taken off. */
export function unquoted(text: string): string {
  return text.replace(/^(\s*>)+\s?/, '');
}

/** Whether anything is selected, or the cursor sits, within `from`-`to`. */
export function touched(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some((r) => r.from <= to && r.to >= from);
}
