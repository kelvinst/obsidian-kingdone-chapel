import { EditorSuggest } from 'obsidian';
import type { Editor, EditorPosition, EditorSuggestContext, EditorSuggestTriggerInfo, TFile } from 'obsidian';

import { abbrLabel, langsFor, matchBooks, plain } from './books';
import { parseNumbers, parseReference, verseLabels } from './reference';
import type { BookMatch } from './books';
import type { Location } from './types';
import type KingdoneChapelPlugin from './main';

/**
 * `@` followed by a reference. The reference itself may hold spaces (`1 Joao
 * 1.1`), so the popup stays open across them and closes by finding no book
 * rather than by hitting a separator. Capped so a whole paragraph after a
 * stray `@` is not re-parsed on every keystroke.
 */
const TRIGGER = /(?:^|[^\p{L}\p{N}_@])@([\p{L}\p{N} .,:-]{0,40})$/u;

/** One way the query could be linked: a book the reader may have meant, under
 * one of the names they may want it written as. */
export interface RefSuggestion {
  version: string;
  /** `João 1.1-3` — the reference as the note will read it, and the popup row. */
  ref: string;
  /** Book `ref` points at, for the rows where an abbreviation hides it. */
  book: string;
  /** First verse of the passage, as a taste of what the link points at. */
  preview: string;
  /** The links to insert, ready to go. */
  markdown: string;
}

/** A row saying why a query could not be read, rather than one that links. */
export interface HintSuggestion {
  hint: string;
}

/** What the popup lists: something to link, or a word about why there is not. */
type Row = RefSuggestion | HintSuggestion;

/**
 * Said when numbers were written on their own in a note holding no passage to
 * read them against. The books still answer below it, but nothing there
 * explains why the number alone found nothing, and a row that only closes
 * reads as a plugin that broke.
 */
const NO_CONTEXT: HintSuggestion = {
  hint: 'No link in this note to read a book from — write one',
};

export class ReferenceSuggest extends EditorSuggest<Row> {
  plugin: KingdoneChapelPlugin;

  constructor(plugin: KingdoneChapelPlugin) {
    super(plugin.app);
    this.plugin = plugin;
  }

  onTrigger(cursor: EditorPosition, editor: Editor): EditorSuggestTriggerInfo | null {
    const line = editor.getLine(cursor.line).slice(0, cursor.ch);
    const m = line.match(TRIGGER);
    if (!m || !m[1].trim()) return null;
    return {
      start: { line: cursor.line, ch: cursor.ch - m[1].length - 1 },
      end: cursor,
      query: m[1],
    };
  }

  /**
   * Numbers on their own are read against the passage the note is about, and
   * the books answer under them either way: `@1` is a chapter of the book at
   * hand as much as it is the start of `1 Samuel`, and one suggestion costs
   * nothing to show next to the other.
   */
  async getSuggestions(ctx: EditorSuggestContext): Promise<Row[]> {
    const out: Row[] = [];
    const numbers = parseNumbers(ctx.query);
    if (numbers && numbers.length) {
      const here = this.plugin.linkContext(ctx.file);
      out.push(...(here ? await this.contextSuggestions(here, numbers, ctx.file) : [NO_CONTEXT]));
    }
    out.push(...(await this.bookSuggestions(ctx)));
    return out;
  }

  /** The reference as it was written out in full: a book, and what follows it. */
  async bookSuggestions(ctx: EditorSuggestContext): Promise<RefSuggestion[]> {
    const parsed = parseReference(ctx.query, (word) => this.plugin.findVersion(word) !== null);
    if (!parsed) return [];

    const version =
      (parsed.version && this.plugin.findVersion(parsed.version)) ||
      this.plugin.defaultVersion(ctx.file);
    if (!version) return [];

    const out: RefSuggestion[] = [];
    const langs = langsFor(this.plugin.settings.language);
    for (const match of matchBooks(parsed.book, 6, langs)) {
      const file = this.plugin.referenceFile(version, match.book.index, parsed.chapter);
      if (!file) continue;

      const name = match.book.names[match.lang];
      try {
        // The anchors and the opening verse are the passage, not the wording,
        // so both forms of the same book share the one read.
        const anchors = await this.plugin.findAnchors(file, parsed.chapter, parsed.verses);
        const preview = await this.previewOf(file, parsed.chapter, parsed.verses);

        for (const form of this.forms(match, name)) {
          const labels = verseLabels(form, parsed.chapter, parsed.verses);
          const links = labels.map((label, i) => this.link(file, anchors[i] || null, label, ctx.file));
          out.push({ version, ref: labels.join(','), book: name, preview, markdown: links.join(',') });
        }
      } catch (e) {
        // Both reads go to the file the index named, which may have gone away
        // since it was indexed. Leave that book out rather than taking the
        // whole popup down with it.
        continue;
      }
    }
    return out;
  }

  /**
   * The two things numbers can mean against the passage a note is about: those
   * verses of its chapter, or those chapters of its book. Verses come first —
   * a note about a chapter cites verses of it far more often than it moves on
   * to another chapter.
   *
   * Either row reads a file the index named, which may have gone away since;
   * one that fails is left out, the same way a book is above.
   */
  async contextSuggestions(
    here: Location,
    numbers: number[],
    from: TFile | null
  ): Promise<RefSuggestion[]> {
    const rows = await Promise.all([
      this.verseRow(here, numbers, from).catch(() => null),
      this.chapterRow(here, numbers, from).catch(() => null),
    ]);
    return rows.filter((row): row is RefSuggestion => row !== null);
  }

  /** `João 1.1,2,3` — the numbers as verses of the chapter the note is about. */
  async verseRow(
    here: Location,
    verses: number[],
    from: TFile | null
  ): Promise<RefSuggestion | null> {
    const file = this.plugin.referenceFile(here.version, here.bookIndex, here.chapter);
    if (!file) return null;

    const anchors = await this.plugin.findAnchors(file, here.chapter, verses);
    const labels = verseLabels(here.book, here.chapter, verses);
    const links = labels.map((label, i) => this.link(file, anchors[i] || null, label, from));
    return {
      version: here.version,
      ref: labels.join(','),
      book: here.book,
      preview: await this.previewOf(file, here.chapter, verses),
      markdown: links.join(','),
    };
  }

  /**
   * `João 1, João 2` — the same numbers read as chapters of the book instead.
   * Every one of them has to be there: a run quietly cut short points at
   * something other than what was typed, which is why a reference reaching too
   * far is refused rather than trimmed. Each link says its whole reference,
   * since a bare `2` beside a chapter link would not say what it is.
   */
  async chapterRow(
    here: Location,
    chapters: number[],
    from: TFile | null
  ): Promise<RefSuggestion | null> {
    const files: TFile[] = [];
    for (const chapter of chapters) {
      const file = this.plugin.referenceFile(here.version, here.bookIndex, chapter);
      if (!file) return null;
      files.push(file);
    }

    const labels = chapters.map((chapter) => `${here.book} ${chapter}`);
    const links = files.map((file, i) => this.link(file, null, labels[i], from));
    return {
      version: here.version,
      ref: labels.join(', '),
      book: here.book,
      preview: await this.previewOf(files[0], chapters[0], []),
      markdown: links.join(', '),
    };
  }

  /**
   * The names to offer one book under. Someone who wrote `@Jn 1.1` wants the
   * note to go on saying `Jn 1.1`, so the abbreviation they typed comes first;
   * the full name follows for when they meant it spelled out. Writing the name
   * itself leaves nothing to choose between, and offers only the one row.
   */
  forms(match: BookMatch, name: string): string[] {
    const abbr = match.abbr ? abbrLabel(match.abbr) : null;
    return abbr && plain(abbr) !== plain(name) ? [abbr, name] : [name];
  }

  /** `[[NVI-43-JHN-001#^nvi-jhn-1-1|João 1.1]]`, with the link the vault expects. */
  link(file: TFile, anchor: string | null, label: string, from: TFile | null): string {
    const path = this.app.metadataCache.fileToLinktext(file, from ? from.path : '', true);
    return `[[${path}${anchor ? '#^' + anchor : ''}|${label}]]`;
  }

  /** First verse of the passage. A book index file holds none, so it shows bare. */
  async previewOf(file: TFile, chapter: number | null, verses: number[]): Promise<string> {
    if (chapter === null) return '';
    const match = await this.plugin.verseIn(file, verses.length ? verses[0] : null);
    return match ? match.text : '';
  }

  renderSuggestion(item: Row, el: HTMLElement) {
    if ('hint' in item) {
      el.createSpan({ cls: 'kcp-suggest-hint', text: item.hint });
      return;
    }

    const head = el.createDiv({ cls: 'kcp-suggest-head' });
    head.createSpan({ cls: 'kcp-suggest-ref', text: item.ref });
    // The row reads as the reference it will write. An abbreviation does not
    // say which book that is — `Jn` is Jonas in Portuguese and John in English —
    // so name the book behind it, and leave it off when the row already says it.
    if (!item.ref.startsWith(item.book)) {
      head.createSpan({ cls: 'kcp-suggest-book', text: item.book });
    }
    head.createSpan({ cls: 'kcp-version', text: item.version });
    if (item.preview) el.createEl('small', { text: item.preview, cls: 'kcp-preview' });
  }

  selectSuggestion(item: Row) {
    const ctx = this.context;
    // A hint has nothing to insert. Picking it leaves the line as it was typed.
    if (!ctx || 'hint' in item) return;
    ctx.editor.replaceRange(item.markdown, ctx.start, ctx.end);
    ctx.editor.setCursor({ line: ctx.start.line, ch: ctx.start.ch + item.markdown.length });
  }
}
