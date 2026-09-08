import { EditorSuggest } from 'obsidian';
import type {
  Editor,
  EditorPosition,
  EditorSuggestContext,
  EditorSuggestTriggerInfo,
  Instruction,
  TFile,
} from 'obsidian';

import { quoteHeadings } from './books';
import { ReferenceRows } from './suggest-rows';
import { hasBlockId, quotePlacement } from './utils';
import type { BookMatch } from './books';
import type { ParsedRef } from './reference';
import type { Passage, Row } from './suggest-rows';
import type { ChapterTarget, Location } from './types';
import type KingdoneChapelPlugin from './main';

export { ReferenceRows } from './suggest-rows';
export type { Passage, RefSuggestion, RowContext } from './suggest-rows';

/**
 * `@` followed by a reference, or `!@` for the same passage embedded rather
 * than linked. The reference itself may hold spaces (`1 Joao 1.1`), so the
 * popup stays open across them and closes by finding no book rather than by
 * hitting a separator. Capped so a whole paragraph after a stray `@` is not
 * re-parsed on every keystroke.
 *
 * A bare `@` has to start a word, or every email address in the vault would
 * open the popup. `!@` is a pair and reads as one, so it needs nothing in
 * front of it: `Que texto!@Joao 1.1` embeds, and a space between the two
 * (`Que texto! @Joao 1.1`) is how a reference right after an exclamation mark
 * asks to be linked instead.
 */
const TRIGGER = /(?:(!)@|(?:^|[^\p{L}\p{N}_@!])@)([\p{L}\p{N} .,:-]{0,40})$/u;

/** The line under the rows, saying what else a reference may carry. */
const INSTRUCTIONS: Instruction[] = [
  { command: 'Jo 1', purpose: 'book and chapter' },
  { command: '.1', purpose: 'verse' },
  { command: ',2-4', purpose: 'more verses' },
  { command: '-nvi', purpose: 'version' },
  { command: ';@3.1', purpose: 'same book again' },
  { command: '!@', purpose: 'to embed' },
  { command: '↵', purpose: 'to insert' },
  { command: '⇥', purpose: 'to insert and rename' },
];

/** Where a quote was written, for the cursor to be read back against. */
interface QuoteWrite {
  /** Line the quote was written at the end of. */
  line: number;
  /** Lines it added there. */
  lines: number;
}

/**
 * The popup's own list of rows, which holds which of them is highlighted.
 * Obsidian does not expose it, but Tab has to reach the very row Enter would.
 */
interface SuggestionList {
  useSelectedItem(evt: KeyboardEvent): boolean;
}

export class ReferenceSuggest extends EditorSuggest<Row> {
  plugin: KingdoneChapelPlugin;
  /** The rows themselves, which know nothing of an editor. */
  rows: ReferenceRows;

  constructor(plugin: KingdoneChapelPlugin) {
    super(plugin.app);
    this.plugin = plugin;
    this.rows = new ReferenceRows(plugin);
    // Everything the popup understands, written the way it is typed. None of
    // it is discoverable from the rows themselves — a reader who never learns
    // the dash simply never asks for another version.
    this.setInstructions(INSTRUCTIONS);
    // Enter takes the row as it reads; Tab takes the same row and leaves its
    // label selected, for when the wording wants a word of your own. Only a
    // Tab that took a row answers false — the key goes on indenting the line
    // when the popup had nothing to give it, which is what Obsidian's own
    // link popup does with it.
    this.scope.register([], 'Tab', (evt) => {
      const list = (this as unknown as { suggestions?: SuggestionList })
        .suggestions;
      if (!evt.isComposing && list?.useSelectedItem(evt)) return false;
    });
  }

  onTrigger(
    cursor: EditorPosition,
    editor: Editor,
  ): EditorSuggestTriggerInfo | null {
    const line = editor.getLine(cursor.line).slice(0, cursor.ch);
    const m = line.match(TRIGGER);
    if (!m || !m[2].trim()) return null;
    // Only the `!@` branch captures the `!`; the bare `@` leaves it unset.
    const bang = m[1] || '';
    return {
      start: {
        line: cursor.line,
        ch: cursor.ch - bang.length - m[2].length - 1,
      },
      end: cursor,
      // The `!` rides along in the query so the rows can be read out of it
      // alone, the way the popup hands it back.
      query: bang + m[2],
    };
  }

  /**
   * The rows for what was typed, read off the line the popup opened on: the
   * query as the popup hands it back, the note it is being written in, and
   * what stands in front of the `@` for a book to be carried on from.
   */
  async getSuggestions(ctx: EditorSuggestContext): Promise<Row[]> {
    return this.rows.getSuggestions({
      query: ctx.query,
      file: ctx.file,
      before: ctx.editor.getLine(ctx.start.line).slice(0, ctx.start.ch),
    });
  }

  // The rest of the popup's reading is the core's, reached through the shell
  // so that the suggester goes on answering for the whole of what it shows.

  versionsFor(
    parsed: Pick<ParsedRef, 'version' | 'versionPrefix'>,
    from: TFile | null,
  ): string[] {
    return this.rows.versionsFor(parsed, from);
  }

  passageRows(
    here: Location,
    chapters: number[],
    verses: number[],
    bare: string[],
    embed: boolean,
    from: TFile | null,
    name: string | null,
  ) {
    return this.rows.passageRows(
      here,
      chapters,
      verses,
      bare,
      embed,
      from,
      name,
    );
  }

  forms(match: BookMatch, name: string): string[] {
    return this.rows.forms(match, name);
  }

  embedLines(
    target: ChapterTarget,
    anchors: (string | null)[],
    from: TFile | null,
  ): string {
    return this.rows.embedLines(target, anchors, from);
  }

  linktext(target: ChapterTarget, from: TFile | null): string {
    return this.rows.linktext(target, from);
  }

  previewOf(
    file: TFile,
    chapter: number | null,
    verses: number[],
  ): Promise<string> {
    return this.rows.previewOf(file, chapter, verses);
  }

  renderSuggestion(item: Row, el: HTMLElement) {
    if ('hint' in item) {
      el.createSpan({ cls: 'kcp-suggest-hint', text: item.hint });
      return;
    }

    const head = el.createDiv({ cls: 'kcp-suggest-head' });
    // The row is the finished line, so it is dressed as one: what it says and
    // how it will look are both answered by reading it.
    head.createSpan({ cls: 'kcp-suggest-ref', text: item.ref });
    // The row reads as the reference it will write. An abbreviation does not
    // say which book that is — `Jn` is Jonas in Portuguese and John in English —
    // so name the book behind it, and leave it off when the row already says it.
    if (!item.ref.startsWith(item.book)) {
      head.createSpan({ cls: 'kcp-suggest-book', text: item.book });
    }
    // Two rows writing the same chapter differently are told apart by this.
    if (item.note)
      head.createSpan({ cls: 'kcp-suggest-note', text: item.note });
    if (item.preview)
      el.createEl('small', { text: item.preview, cls: 'kcp-preview' });
  }

  selectSuggestion(item: Row, evt: MouseEvent | KeyboardEvent) {
    const ctx = this.context;
    // A hint has nothing to insert. Picking it leaves the line as it was typed.
    if (!ctx || 'hint' in item) return;
    ctx.editor.replaceRange(item.markdown, ctx.start, ctx.end);
    // A passage link points at a quote, which is written into the note as
    // well. A note whose quotes are not the last thing in it takes that quote
    // above the line the reference was written on, which moves that line down
    // — and everything read off it with it.
    const wrote = item.passage
      ? this.appendPassage(ctx.editor, item.passage)
      : null;
    const start =
      wrote && wrote.line < ctx.start.line
        ? { line: ctx.start.line + wrote.lines, ch: ctx.start.ch }
        : ctx.start;
    // Tab asks to rename what it just wrote, so it leaves the label selected
    // and the next thing typed replaces it. Markdown carrying no label —
    // every embed — has nothing to rename, and lands the cursor as Enter does.
    // Read off the event rather than its class: a popped-out window carries a
    // `KeyboardEvent` of its own, which is not this window's.
    const label =
      'key' in evt && evt.key === 'Tab' ? this.labelSpan(item.markdown) : null;
    if (label) {
      ctx.editor.setSelection(
        this.at(item.markdown, label[0], start),
        this.at(item.markdown, label[1], start),
      );
      return;
    }
    ctx.editor.setCursor(this.at(item.markdown, item.markdown.length, start));
  }

  /**
   * Where the label of the first link sits in the markdown, as offsets into
   * it. A run of verses writes a link each, and only the first of them carries
   * the reference spelled out — the rest are the bare verse numbers under it —
   * so the first label is the one worth handing over to be rewritten.
   */
  labelSpan(markdown: string): [number, number] | null {
    const m = markdown.match(/\[\[[^\]\n]*\|([^\]\n]*)\]\]/);
    if (!m || m.index === undefined) return null;
    const start = m.index + m[0].indexOf('|') + 1;
    return [start, start + m[1].length];
  }

  /**
   * Where an offset into the written markdown lands in the note. Embeds run a
   * line per verse, so anything past the first line sits at its own start
   * rather than that far along the line the reference was typed on.
   */
  at(markdown: string, offset: number, start: EditorPosition): EditorPosition {
    const lines = markdown.slice(0, offset).split('\n');
    const last = lines[lines.length - 1];
    return {
      line: start.line + lines.length - 1,
      ch: lines.length > 1 ? last.length : start.ch + last.length,
    };
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
   */
  appendPassage(editor: Editor, passage: Passage): QuoteWrite | null {
    if (hasBlockId(editor.getValue(), passage.id)) return null;

    const at = quotePlacement(
      editor.getValue(),
      quoteHeadings(this.plugin.settings.language),
      passage.callout,
    );
    editor.replaceRange(at.text, { line: at.line, ch: at.ch });
    return { line: at.line, lines: at.text.split('\n').length - 1 };
  }
}
