import { quoteHeadings } from './books';
import {
  blockIdLine,
  hasBlockId,
  outsideFences,
  quotePlacement,
} from './utils';
import type { Editor } from 'obsidian';
import type { Passage } from './suggest-rows';
import type KingdoneChapelPlugin from './main';

/** Where a quote was written, for the cursor to be read back against. */
export interface QuoteWrite {
  /** Line the quote was written at the end of. */
  line: number;
  /** Lines it added there. */
  lines: number;
}

/**
 * Put the quote at the end of the note, out of the way of the line being
 * written: a reference in the middle of a sentence is there to be read as a
 * reference, and the passage it stands for belongs at the foot of the page.
 *
 * A passage already quoted is left as it is, so referring to it a second
 * time writes a second link to the one quote rather than a second copy of it.
 * The quote is found by reading the lines rather than by a pattern built
 * from the id: the id is only ever asked whether it closes a line, and a
 * pattern would have to be written around whatever a version is named.
 *
 * The suggester is one way here, and the refs modal another: a reference
 * chosen away from the line it is written on still points at a quote, and the
 * quote is written into the note either way.
 */
export function appendPassage(
  plugin: KingdoneChapelPlugin,
  editor: Editor,
  passage: Passage,
): QuoteWrite | null {
  if (hasBlockId(editor.getValue(), passage.id)) return null;

  // The quotes written before the ids carried the `quote-` prefix name the
  // same passage under the id it went by then. That is the quote this
  // reference points at, so it is renamed where it stands — the link about to
  // be written names the prefixed id, and would point at nothing otherwise.
  const legacy = passage.id.replace(/^quote-/, '');
  const named = blockIdLine(editor.getValue(), legacy);
  if (named !== null) {
    const lines = editor.getValue().split('\n');
    const outside = outsideFences(lines);
    lines.forEach((line, at) => {
      if (!outside[at]) return; // a fence shows an id, and names none
      // The id closes the line it belongs to, so what it names is what
      // stands in front of it — read off rather than matched, an id being
      // made of whatever a version folder is named. The links naming it are
      // renamed with it, or every reference already written to this quote
      // would be left pointing at nothing.
      const ended = line.trimEnd();
      const renamed =
        at === named
          ? ended.slice(0, ended.length - legacy.length) + passage.id
          : renamedLinks(line, legacy, passage.id);
      if (renamed === line) return;
      editor.replaceRange(
        renamed,
        { line: at, ch: 0 },
        { line: at, ch: line.length },
      );
    });
    return null;
  }

  const at = quotePlacement(
    editor.getValue(),
    quoteHeadings(plugin.settings.language),
    passage.callout,
  );
  editor.replaceRange(at.text, { line: at.line, ch: at.ch });
  return { line: at.line, lines: at.text.split('\n').length - 1 };
}

/**
 * `line` with the links naming the block id `from` naming `to` instead.
 *
 * An id is made of whatever a version folder is named, so it is read off the
 * line rather than matched as a pattern — and only where it ends there: an id
 * a longer one opens with, `nvi-gen-1-1-2` inside `nvi-gen-1-1-20`, names some
 * other quote and is left as it is.
 *
 * A link naming a file names a block of that file, and this note's quote is the
 * only one being renamed, so only the links that name no file — `[[#^id]]` —
 * are renamed with it.
 */
function renamedLinks(line: string, from: string, to: string): string {
  const mark = `[[#^${from}`;
  let out = '';
  let rest = line;
  for (;;) {
    const at = rest.indexOf(mark);
    if (at === -1) return out + rest;
    const after = rest[at + mark.length];
    out +=
      rest.slice(0, at) +
      (after && /[A-Za-z0-9-]/.test(after) ? mark : `[[#^${to}`);
    rest = rest.slice(at + mark.length);
  }
}
