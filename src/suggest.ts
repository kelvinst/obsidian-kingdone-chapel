import { EditorSuggest } from 'obsidian';
import type { Editor, EditorPosition, EditorSuggestContext, EditorSuggestTriggerInfo, Instruction, TFile } from 'obsidian';

import { abbrLabel, langsFor, matchBooks, plain } from './books';
import { nameVersion, parseBookless, parseReference, verseLabels } from './reference';
import type { BookMatch } from './books';
import type { ParsedBookless, ParsedRef } from './reference';
import type { Location } from './types';
import type KingdoneChapelPlugin from './main';

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
  { command: '!@', purpose: 'to embed' },
  { command: '↵', purpose: 'to insert' },
];

/** Rows a whole popup may hold, so a query naming no version and matching
 * every book cannot read the vault for a page nobody will scroll to. */
const MAX_ROWS = 12;

/** Books one version is offered under. A query reaching for several versions
 * splits this between them rather than growing the popup. */
const MAX_BOOKS = 6;

/** One way the query could be linked: a book the reader may have meant, in one
 * version, under one of the names they may want it written as. */
export interface RefSuggestion {
  /**
   * `João 1.1-3 - NVI` — the reference as the note will read it once the links
   * are rendered, so a row that links is a sample of the line it writes. An
   * embed writes no label of its own, and the row names the passage instead.
   */
  ref: string;
  /** Book `ref` points at, for the rows where an abbreviation hides it. */
  book: string;
  /** What this row writes, where the reference alone does not say. */
  note?: string;
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
 * One passage read against the note's own, offered under both labels it could
 * be written with: the numbers as they were typed, and the reference spelled
 * out. Either may be missing — an embed carries no label to choose, and a
 * passage the vault has no file for has no row at all.
 */
interface ContextRows {
  bare: RefSuggestion | null;
  full: RefSuggestion | null;
}

/** A passage the vault could not answer for. */
const NO_ROWS: ContextRows = { bare: null, full: null };

/**
 * Said when a reference was written with no book in it, in a note holding no
 * passage to read it against. The books still answer below it, but nothing
 * there explains why the number alone found nothing, and a row that only
 * closes reads as a plugin that broke.
 */
const NO_CONTEXT: HintSuggestion = {
  hint: 'No link in this note to read a book from — write one',
};

export class ReferenceSuggest extends EditorSuggest<Row> {
  plugin: KingdoneChapelPlugin;

  constructor(plugin: KingdoneChapelPlugin) {
    super(plugin.app);
    this.plugin = plugin;
    // Everything the popup understands, written the way it is typed. None of
    // it is discoverable from the rows themselves — a reader who never learns
    // the dash simply never asks for another version.
    this.setInstructions(INSTRUCTIONS);
  }

  onTrigger(cursor: EditorPosition, editor: Editor): EditorSuggestTriggerInfo | null {
    const line = editor.getLine(cursor.line).slice(0, cursor.ch);
    const m = line.match(TRIGGER);
    if (!m || !m[2].trim()) return null;
    // Only the `!@` branch captures the `!`; the bare `@` leaves it unset.
    const bang = m[1] || '';
    return {
      start: { line: cursor.line, ch: cursor.ch - bang.length - m[2].length - 1 },
      end: cursor,
      // The `!` rides along in the query so the rows can be read out of it
      // alone, the way the popup hands it back.
      query: bang + m[2],
    };
  }

  /**
   * A reference with no book in it (`@1`, `@1.1`, `@ARA 1`) is read against the
   * passage the note is about, and the books answer under it either way: `@1`
   * is a chapter of the book at hand as much as it is the start of `1 Samuel`,
   * and one suggestion costs nothing to show next to the other.
   */
  async getSuggestions(ctx: EditorSuggestContext): Promise<Row[]> {
    const embed = ctx.query.startsWith('!');
    const query = embed ? ctx.query.slice(1) : ctx.query;

    const out: Row[] = [];
    const bookless = parseBookless(query, (word) => this.plugin.findVersion(word) !== null);
    if (bookless) {
      const here = this.plugin.linkContext(ctx.file);
      const rows = here ? await this.contextSuggestions(here, bookless, embed, ctx.file) : [NO_CONTEXT];
      out.push(...rows);
    }
    // A half-written version fills the popup with the passage read against the
    // note's own, and the books would only be read out of the vault to be cut
    // off the end of it.
    if (out.length < MAX_ROWS) {
      out.push(...(await this.bookSuggestions(query, embed, ctx.file)));
    }
    return out.slice(0, MAX_ROWS);
  }

  /** The reference as it was written out in full: a book, and what follows it. */
  async bookSuggestions(query: string, embed: boolean, from: TFile | null): Promise<RefSuggestion[]> {
    const parsed = parseReference(query, (word) => this.plugin.findVersion(word) !== null);
    if (!parsed) return [];

    const versions = this.versionsFor(parsed, this.plugin.defaultVersion(from));
    if (!versions.length) return [];
    // A version nobody asked for is the one already in force, and naming it in
    // the label would only be the setting read back. One that was asked for is
    // named there, where it has to be read to be of any use.
    const named = parsed.versionPrefix || parsed.version !== null;

    const out: RefSuggestion[] = [];
    const langs = langsFor(this.plugin.settings.language);
    // A half-written `-n` matches several versions, and each of them wants to
    // show the books the query matched. Every version gets a share of the
    // popup rather than the first one filling it.
    const books = Math.max(1, Math.ceil(MAX_BOOKS / versions.length));
    for (const version of versions) {
      for (const match of matchBooks(parsed.book, books, langs)) {
        if (out.length >= MAX_ROWS) return out.slice(0, MAX_ROWS);

        const file = this.plugin.referenceFile(version, match.book.index, parsed.chapter);
        if (!file) continue;

        const name = match.book.names[match.lang];
        try {
          // The anchors and the opening verse are the passage, not the wording,
          // so both forms of the same book share the one read.
          const anchors = await this.plugin.findAnchors(file, parsed.chapter, parsed.verses);
          const preview = await this.previewOf(file, parsed.chapter, parsed.verses);

          if (embed) {
            // An embed writes no label, so the version cannot be named in what
            // it writes; the row names it, which is what the choice is between
            // when a half-written version matched more than one.
            const labels = verseLabels(name, parsed.chapter, parsed.verses, named ? version : null);
            const base = { ref: labels.join(','), book: name, preview };
            for (const row of await this.embeds(file, parsed, anchors, from)) {
              out.push({ ...base, ...row });
            }
            continue;
          }

          for (const form of this.forms(match, name)) {
            const labels = verseLabels(form, parsed.chapter, parsed.verses, named ? version : null);
            const links = labels.map((label, i) => this.link(file, anchors[i] || null, label, from));
            out.push({ ref: labels.join(','), book: name, preview, markdown: links.join(',') });
          }
        } catch (e) {
          // Both reads go to the file the index named, which may have gone away
          // since it was indexed. Leave that book out rather than taking the
          // whole popup down with it.
          continue;
        }
      }
    }
    return out.slice(0, MAX_ROWS);
  }

  /**
   * Versions to offer the reference in. A version still being written stands
   * for every version that begins with it, and the rows finish the word —
   * `@Gn 1 -n` offers Genesis 1 in NTLH and in NVI, and picking one writes the
   * whole reference rather than only the version name. Anything else names at
   * most one version, or falls back to `unasked`: the setting for a reference
   * written out, the note's own version for one read against its passage.
   */
  versionsFor(parsed: { version: string | null; versionPrefix: boolean }, unasked: string | null): string[] {
    if (parsed.versionPrefix) {
      const wanted = (parsed.version || '').toLowerCase();
      return this.plugin.listVersions().filter((v) => v.toLowerCase().startsWith(wanted));
    }
    const named = parsed.version ? this.plugin.findVersion(parsed.version) : unasked;
    return named ? [named] : [];
  }

  /**
   * The passage a bookless reference points at, with everything it left unsaid
   * taken from the one the note is about. What it does say wins: a chapter
   * written in front of the numbers stands in for the note's chapter, and a
   * version written anywhere in it for the note's version.
   *
   * Numbers on their own can mean two things — those verses of its chapter, or
   * those chapters of its book — so both answer. Verses come first: a note
   * about a chapter cites verses of it far more often than it moves on to
   * another chapter.
   *
   * Both come twice over, under the label the reader typed and under the one
   * spelling the reference out, and the typed one leads: someone who wrote
   * `@1` was writing a sentence with a `1` in it, the same way someone who
   * wrote `@Jn` meant the note to go on saying `Jn`.
   *
   * Either passage reads a file the index named, which may have gone away
   * since; one that fails is left out, the same way a book is above.
   */
  async contextSuggestions(
    here: Location,
    parsed: ParsedBookless,
    embed: boolean,
    from: TFile | null
  ): Promise<RefSuggestion[]> {
    const out: RefSuggestion[] = [];
    // The version the note was already linking is the one nobody asked for, so
    // it goes unnamed in the label for the same reason the default version does
    // when a book is written out: it would only be reading the note back to
    // itself. One that was asked for is named, where it has to be read to be of
    // any use — and a half-written one asks for every version it begins.
    const named = parsed.versionPrefix || parsed.version !== null;

    for (const version of this.versionsFor(parsed, here.version)) {
      if (out.length >= MAX_ROWS) break;

      const at: Location = {
        ...here,
        version,
        chapter: parsed.chapter === null ? here.chapter : parsed.chapter,
      };
      const label = named ? version : null;

      const verses = await this.verseRows(at, parsed, label, embed, from).catch(() => NO_ROWS);
      // Only bare numbers are open to being chapters as well: a chapter written
      // in front of them has already said they are verses, and a reference with
      // no numbers at all (`@ARA`) is the note's own chapter, which the verse
      // rows already offer.
      const chapters =
        parsed.chapter === null && parsed.numbers.length
          ? await this.chapterRows(at, parsed.numbers, label, embed, from).catch(() => NO_ROWS)
          : NO_ROWS;

      const rows = [verses.bare, chapters.bare, verses.full, chapters.full];
      out.push(...rows.filter((row): row is RefSuggestion => row !== null));
    }
    return out.slice(0, MAX_ROWS);
  }

  /**
   * `João 1.1,2,3`, and the same links under the numbers as they were typed —
   * with a chapter written in front of them, the way it was written (`1.1,2`).
   *
   * With no numbers to place there the passage is the chapter whole (`João 1`),
   * which is what a reference naming only a version asks for. There is nothing
   * the reader typed to label that one with, so it comes spelled out alone.
   */
  async verseRows(
    here: Location,
    parsed: ParsedBookless,
    name: string | null,
    embed: boolean,
    from: TFile | null
  ): Promise<ContextRows> {
    const verses = parsed.numbers;
    const file = this.plugin.referenceFile(here.version, here.bookIndex, here.chapter);
    if (!file) return NO_ROWS;

    // The anchors and the opening verse are the passage, not the wording, so
    // both labellings share the one read.
    const anchors = await this.plugin.findAnchors(file, here.chapter, verses);
    const preview = await this.previewOf(file, here.chapter, verses);
    const row = (labels: string[]): RefSuggestion => ({
      ref: labels.join(','),
      book: here.book,
      preview,
      markdown: embed
        ? this.embedLines(file, anchors, from)
        : labels.map((label, i) => this.link(file, anchors[i] || null, label, from)).join(','),
    });

    const typed = verses.map((v, i) =>
      i === 0 && parsed.chapter !== null ? `${parsed.chapter}.${v}` : String(v)
    );

    return {
      bare: embed || !verses.length ? null : row(nameVersion(typed, name)),
      full: row(verseLabels(here.book, here.chapter, verses, name)),
    };
  }

  /**
   * `João 1, João 2` — the same numbers read as chapters of the book instead,
   * and the same links under the numbers alone. Every chapter has to be there:
   * a run quietly cut short points at something other than what was typed,
   * which is why a reference reaching too far is refused rather than trimmed.
   *
   * Spelled out, each link says its whole reference, since a bare `2` next to
   * `João 1` would read as a verse of it. Written as the numbers alone there
   * is nothing to tell the row from the verses of the same name, so it says
   * which it is.
   */
  async chapterRows(
    here: Location,
    chapters: number[],
    name: string | null,
    embed: boolean,
    from: TFile | null
  ): Promise<ContextRows> {
    const files: TFile[] = [];
    for (const chapter of chapters) {
      const file = this.plugin.referenceFile(here.version, here.bookIndex, chapter);
      if (!file) return NO_ROWS;
      files.push(file);
    }

    const preview = await this.previewOf(files[0], chapters[0], []);
    const row = (labels: string[], join: string, note?: string): RefSuggestion => ({
      ref: labels.join(join),
      book: here.book,
      note,
      preview,
      // A chapter embeds as the file it is, one to a line, the way a run of
      // verses does. Which of the two `!@1` meant is the choice the rows are
      // already offering.
      markdown: embed
        ? files.map((file) => this.embed(file, null, from)).join('\n')
        : files.map((file, i) => this.link(file, null, labels[i], from)).join(join),
    });

    return {
      bare: embed ? null : row(nameVersion(chapters.map(String), name), ',', 'chapter'),
      full: row(nameVersion(chapters.map((chapter) => `${here.book} ${chapter}`), name), ', '),
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

  /**
   * What `!@` writes, as the rows to choose between. An embed carries no
   * label, so a book's abbreviation and its spelled-out name come to the same
   * markdown and to the one row — but a whole chapter can be embedded either
   * as the chapter file or as its verses, and those are different enough on
   * the page to be worth choosing between.
   */
  async embeds(
    file: TFile,
    parsed: ParsedRef,
    anchors: (string | null)[],
    from: TFile | null
  ): Promise<Pick<RefSuggestion, 'note' | 'markdown'>[]> {
    // A book, or the verses that were asked for by number.
    if (parsed.chapter === null || parsed.verses.length) {
      return [{ markdown: this.embedLines(file, anchors, from) }];
    }

    const rows = [{ note: 'whole file', markdown: this.embed(file, null, from) }];
    // A chapter asked for bare can also come in a verse at a time, which needs
    // the verse numbers the chapter actually carries rather than a count.
    const verses = (await this.plugin.chapterVerses(file)).map((v) => v.verse);
    const ids = (await this.plugin.findAnchors(file, parsed.chapter, verses)).filter(
      (id): id is string => id !== null
    );
    if (ids.length) rows.push({ note: 'verse by verse', markdown: this.embedLines(file, ids, from) });
    return rows;
  }

  /**
   * One embed per line, and one line per anchor. Versions that merge verses
   * answer two verse numbers with the one anchor, and a file carrying no
   * anchors at all answers every one of them with none; either way the same
   * embed is written once, not once per verse asked for.
   */
  embedLines(file: TFile, anchors: (string | null)[], from: TFile | null): string {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const anchor of anchors.length ? anchors : [null]) {
      if (seen.has(anchor || '')) continue;
      seen.add(anchor || '');
      out.push(this.embed(file, anchor, from));
    }
    return out.join('\n');
  }

  /** `![[NVI-43-JHN-001#^nvi-jhn-1-1]]` — an embed, which needs no label. */
  embed(file: TFile, anchor: string | null, from: TFile | null): string {
    const path = this.app.metadataCache.fileToLinktext(file, from ? from.path : '', true);
    return `![[${path}${anchor ? '#^' + anchor : ''}]]`;
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
    if (item.note) head.createSpan({ cls: 'kcp-suggest-note', text: item.note });
    if (item.preview) el.createEl('small', { text: item.preview, cls: 'kcp-preview' });
  }

  selectSuggestion(item: Row) {
    const ctx = this.context;
    // A hint has nothing to insert. Picking it leaves the line as it was typed.
    if (!ctx || 'hint' in item) return;
    ctx.editor.replaceRange(item.markdown, ctx.start, ctx.end);
    // Embeds run a line per verse, so the cursor lands at the end of the last
    // of them rather than that far along the line it started on.
    const lines = item.markdown.split('\n');
    const last = lines[lines.length - 1];
    ctx.editor.setCursor({
      line: ctx.start.line + lines.length - 1,
      ch: lines.length > 1 ? last.length : ctx.start.ch + last.length,
    });
  }
}
