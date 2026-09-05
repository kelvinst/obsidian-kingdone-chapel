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

/**
 * What a line holds that is not prose, read out of a line at a time rather
 * than a rendered document: inline code, maths, and the two forms of link
 * that carry a target as well as what is shown for it.
 *
 * `live.ts` masks this so a run's delimiters are not read out of a target or a
 * dollar sign spent as money, and `softlink-live.ts` masks it so a token is
 * not read out of a rendered link's label or a maths expression — the same
 * two constructs reading view already excludes by tag name in
 * `softlink-read.ts`'s `verbatim`, where the editor has no element to check
 * and has to find the same spans in the source instead. `live.ts` alone adds
 * a block anchor to the alternation, a case that only concerns runs of its
 * own asides, so it is not part of what is shared here.
 *
 * Maths is held to Obsidian's own rule, that a dollar opening or closing it
 * touches what it delimits, so `,,Custa $5,, e $6` — two dollars spent as
 * money — does not pair off and swallow what stands between them.
 */
export const NOT_PROSE_SOURCE =
  '`[^`\\n]*`|\\$(?![\\s$])[^$\\n]*[^\\s$]\\$|!?\\[\\[[^\\]\\n]*\\]\\]|\\[[^\\]\\n]*\\]\\([^)\\n]*\\)';

/** What a line says once its quote markers are taken off. */
export function unquoted(text: string): string {
  return text.replace(/^(\s*>)+\s?/, '');
}

/** Whether anything is selected, or the cursor sits, within `from`-`to`. */
export function touched(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some((r) => r.from <= to && r.to >= from);
}
