import { EditorSuggest } from 'obsidian';
import type {
  Editor,
  EditorPosition,
  EditorSuggestContext,
  EditorSuggestTriggerInfo,
  Instruction,
  TFile,
} from 'obsidian';

import {
  abbrLabel,
  bookName,
  langsFor,
  matchBooks,
  nameLang,
  plain,
} from './books';
import { parseBookless, parseReference, referenceLabels } from './reference';
import { parseChapterName } from './utils';
import type { BookMatch } from './books';
import type { BooklessRef, ParsedRef } from './reference';
import type { ChapterTarget } from './types';
import type { ChapterName } from './utils';
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

/**
 * The reference a new one carries on from: a link this plugin wrote, closed by
 * the semicolon that separates one reference from the next. References are
 * chained that way on paper — `Jn 2.9; Ap 7.10` — and the second of a pair
 * names its book only when it is a different one, so `Jn 2.9; 3.1` is John
 * again. Only the link right before the semicolon is read: it is the reference
 * being carried on from, and anything earlier on the line was left behind by
 * the one that already replaced it.
 *
 * A link inside a table writes its label after an escaped pipe (`\|`), since a
 * bare one would end the cell, so both forms are read here.
 */
const CARRIED =
  /\[\[([^[\]|#\\]+)(?:#[^[\]|\\]*)?(?:\\?\|[^[\]]*)?\]\]\s*;\s*$/;

/** The line under the rows, saying what else a reference may carry. */
const INSTRUCTIONS: Instruction[] = [
  { command: 'Jo 1', purpose: 'book and chapter' },
  { command: '.1', purpose: 'verse' },
  { command: ',2-4', purpose: 'more verses' },
  { command: '-nvi', purpose: 'version' },
  { command: ';@3.1', purpose: 'same book again' },
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

export class ReferenceSuggest extends EditorSuggest<RefSuggestion> {
  plugin: KingdoneChapelPlugin;

  constructor(plugin: KingdoneChapelPlugin) {
    super(plugin.app);
    this.plugin = plugin;
    // Everything the popup understands, written the way it is typed. None of
    // it is discoverable from the rows themselves — a reader who never learns
    // the dash simply never asks for another version.
    this.setInstructions(INSTRUCTIONS);
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
   * A reference written after a semicolon may leave its book out and carry it
   * on from the one before, the way the second of a pair is written by hand.
   * The books still answer under those rows: `;@3` is verse 3 of the chapter
   * being carried as much as it is the start of `3 João`, and one costs
   * nothing to show beside the other.
   */
  async getSuggestions(ctx: EditorSuggestContext): Promise<RefSuggestion[]> {
    const embed = ctx.query.startsWith('!');
    const query = embed ? ctx.query.slice(1) : ctx.query;

    const out: RefSuggestion[] = [];
    const bookless = parseBookless(query);
    if (bookless) {
      const here = this.carriedFrom(ctx);
      if (here) {
        out.push(
          ...(await this.carriedSuggestions(here, bookless, embed, ctx.file)),
        );
      }
    }
    out.push(...(await this.bookSuggestions(query, embed, ctx.file)));
    return out.slice(0, MAX_ROWS);
  }

  /** The reference as it was written out in full: a book, and what follows it. */
  async bookSuggestions(
    query: string,
    embed: boolean,
    from: TFile | null,
  ): Promise<RefSuggestion[]> {
    const parsed = parseReference(
      query,
      (word) => this.plugin.findVersion(word) !== null,
    );
    if (!parsed) return [];

    const versions = this.versionsFor(parsed, from);
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

        const found = this.chapterTargets(
          version,
          match.book.index,
          parsed.chapters,
        );
        if (!found.length) continue;

        const name = match.book.names[match.lang];
        const chapters = found
          .map((f) => f.chapter)
          .filter((c): c is number => c !== null);
        try {
          // The anchors and the opening verse are the passage, not the wording,
          // so both forms of the same book share the one read. Verses all sit
          // in the one chapter, and a run of chapters is previewed by where it
          // opens, so either way the read is of the first target the run found.
          // A chapter with no file yet has nothing to read: no anchors, and
          // nothing to show.
          const head = found[0];
          const anchors = head.file
            ? await this.plugin.findAnchors(
                head.file,
                head.chapter,
                parsed.verses,
              )
            : parsed.verses.map(() => null);
          const preview = head.file
            ? await this.previewOf(head.file, head.chapter, parsed.verses)
            : '';

          if (embed) {
            // An embed writes no label, so the version cannot be named in what
            // it writes; the row names it, which is what the choice is between
            // when a half-written version matched more than one.
            const labels = referenceLabels(
              name,
              chapters,
              parsed.verses,
              named ? version : null,
            );
            const base = { ref: labels.join(','), book: name, preview };
            for (const row of await this.embeds(found, parsed, anchors, from)) {
              out.push({ ...base, ...row });
            }
            continue;
          }

          for (const form of this.forms(match, name)) {
            const labels = referenceLabels(
              form,
              chapters,
              parsed.verses,
              named ? version : null,
            );
            // A run of verses is the one file over and over, each link stopping
            // at a different anchor in it. A run of chapters is a file each, and
            // a chapter link points at the file rather than into it, so it has
            // no anchor to stop at.
            const links = labels.map((label, i) =>
              parsed.verses.length
                ? this.link(found[0], anchors[i] || null, label, from)
                : this.link(found[i], null, label, from),
            );
            out.push({
              ref: labels.join(','),
              book: name,
              preview,
              markdown: links.join(','),
            });
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
   * The reference the query carries its book on from: the link written right
   * before the semicolon the query follows, read back into the passage it
   * points at. A link to anything that is not a chapter of a version the vault
   * still holds carries nothing, and the numbers are left to the books.
   */
  carriedFrom(ctx: EditorSuggestContext): ChapterName | null {
    const before = ctx.editor.getLine(ctx.start.line).slice(0, ctx.start.ch);
    const m = before.match(CARRIED);
    if (!m) return null;

    const file = this.app.metadataCache.getFirstLinkpathDest(
      m[1].trim(),
      ctx.file ? ctx.file.path : '',
    );
    const name = file ? parseChapterName(file.basename) : null;
    if (!name) return null;
    // The file names the version the way the file is named; the vault names it
    // the way the folder is. Take the vault's, since that is what everything
    // else here is looked up by.
    const version = this.plugin.findVersion(name.version);
    return version ? { ...name, version } : null;
  }

  /**
   * The carried passage, under both labels it could be written with: the
   * numbers as they were typed, and the reference spelled out. The typed one
   * leads — someone writing `Jn 2.9; 3.1` wants the note to go on saying
   * `3.1`, and the whole point of the semicolon is that the book is already
   * said. The version goes unnamed for the same reason: it is the one the
   * reference before it was already in.
   */
  async carriedSuggestions(
    here: ChapterName,
    bookless: BooklessRef,
    embed: boolean,
    from: TFile | null,
  ): Promise<RefSuggestion[]> {
    const chapter = bookless.chapter === null ? here.chapter : bookless.chapter;
    const file = this.plugin.referenceFile(
      here.version,
      here.bookIndex,
      chapter,
    );
    if (!file) return [];

    // A carried reference names the one chapter, so there is the one file to
    // link into, written the way the vault already holds it.
    const target: ChapterTarget = { chapter, file, path: file.path };
    // The file name holds the book's code, which names a book this table never
    // heard of as well as one it did — better in a label than the number is.
    const name = bookName(here.book, nameLang(this.plugin.settings.language));
    try {
      // The anchors and the opening verse are the passage, not the wording, so
      // both labellings share the one read.
      const anchors = await this.plugin.findAnchors(
        file,
        chapter,
        bookless.verses,
      );
      const preview = await this.previewOf(file, chapter, bookless.verses);
      const full = referenceLabels(name, [chapter], bookless.verses);

      if (embed) {
        // An embed carries no label, so both labellings write the same thing
        // and the row names the passage instead. What it may still be asked
        // in is the same as anywhere else: a chapter whole, or verse by verse.
        const parsed: ParsedRef = {
          version: null,
          versionPrefix: false,
          book: name,
          chapters: [chapter],
          verses: bookless.verses,
        };
        const base = { ref: full.join(','), book: name, preview };
        return (await this.embeds([target], parsed, anchors, from)).map(
          (row) => ({ ...base, ...row }),
        );
      }

      const row = (labels: string[]): RefSuggestion => ({
        ref: labels.join(','),
        book: name,
        preview,
        markdown: labels
          .map((label, i) => this.link(target, anchors[i] || null, label, from))
          .join(','),
      });
      return [row(this.carriedLabels(bookless, chapter)), row(full)];
    } catch (e) {
      // The read goes to the file the index named, which may have gone away
      // since it was indexed. Leave the passage out rather than taking the
      // whole popup down with it.
      return [];
    }
  }

  /**
   * The carried reference written as the numbers alone, the way it was typed:
   * `3.1,2` keeps its chapter, `9,10` stays verses of the chapter it was
   * counted from, and a chapter still missing its verse is the number itself.
   */
  carriedLabels(bookless: BooklessRef, chapter: number): string[] {
    if (!bookless.verses.length) return [String(chapter)];
    if (bookless.chapter === null) return bookless.verses.map(String);
    return bookless.verses.map((v, i) =>
      i === 0 ? `${chapter}.${v}` : String(v),
    );
  }

  /**
   * Versions to offer the reference in. A version still being written stands
   * for every version that begins with it, and the rows finish the word —
   * `@Gn 1 -n` offers Genesis 1 in NTLH and in NVI, and picking one writes the
   * whole reference rather than only the version name. Anything else names at
   * most one version, or leaves it to the default.
   */
  versionsFor(parsed: ParsedRef, from: TFile | null): string[] {
    if (parsed.versionPrefix) {
      const wanted = (parsed.version || '').toLowerCase();
      return this.plugin
        .listVersions()
        .filter((v) => v.toLowerCase().startsWith(wanted));
    }
    const named = parsed.version
      ? this.plugin.findVersion(parsed.version)
      : this.plugin.defaultVersion(from);
    return named ? [named] : [];
  }

  /**
   * Where each chapter the reference asked for is linked, in the order it asked
   * for them. The run stays the length that was typed: a chapter the version
   * has not written is still a chapter that was asked for, and it links to the
   * name it would be written under rather than dropping out of the run with
   * nothing in the finished links to show it was ever there.
   *
   * Asking for no chapter asks for the book, which is a file of its own and
   * never written into being by a link, so it is looked up rather than named.
   */
  chapterTargets(
    version: string,
    bookIndex: number,
    chapters: number[],
  ): ChapterTarget[] {
    if (chapters.length) {
      return this.plugin.chapterTargets(version, bookIndex, chapters);
    }
    const file = this.plugin.referenceFile(version, bookIndex, null);
    return file ? [{ chapter: null, file, path: file.path }] : [];
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
    found: ChapterTarget[],
    parsed: ParsedRef,
    anchors: (string | null)[],
    from: TFile | null,
  ): Promise<Pick<RefSuggestion, 'note' | 'markdown'>[]> {
    // The verses that were asked for by number, all of them in the one chapter.
    if (parsed.verses.length) {
      return [{ markdown: this.embedLines(found[0], anchors, from) }];
    }
    // A book, or a run of chapters: the whole of every file the run named. A run
    // verse by verse would be a page of embeds for each chapter in it, which is
    // not something anyone reaches for by typing a dash.
    if (!parsed.chapters.length || found.length > 1) {
      return [
        {
          markdown: found.map((f) => this.embed(f, null, from)).join('\n'),
        },
      ];
    }

    const target = found[0];
    const rows = [
      { note: 'whole file', markdown: this.embed(target, null, from) },
    ];
    // A chapter asked for bare can also come in a verse at a time, which needs
    // the verse numbers the chapter actually carries rather than a count — so a
    // chapter with no file yet has the one row, there being nothing to count.
    if (!target.file) return rows;
    const verses = (await this.plugin.chapterVerses(target.file)).map(
      (v) => v.verse,
    );
    const ids = (
      await this.plugin.findAnchors(target.file, target.chapter, verses)
    ).filter((id): id is string => id !== null);
    if (ids.length)
      rows.push({
        note: 'verse by verse',
        markdown: this.embedLines(target, ids, from),
      });
    return rows;
  }

  /**
   * One embed per line, and one line per anchor. Versions that merge verses
   * answer two verse numbers with the one anchor, and a file carrying no
   * anchors at all answers every one of them with none; either way the same
   * embed is written once, not once per verse asked for.
   */
  embedLines(
    target: ChapterTarget,
    anchors: (string | null)[],
    from: TFile | null,
  ): string {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const anchor of anchors.length ? anchors : [null]) {
      if (seen.has(anchor || '')) continue;
      seen.add(anchor || '');
      out.push(this.embed(target, anchor, from));
    }
    return out.join('\n');
  }

  /** `![[NVI-43-JHN-001#^nvi-jhn-1-1]]` — an embed, which needs no label. */
  embed(
    target: ChapterTarget,
    anchor: string | null,
    from: TFile | null,
  ): string {
    return `![[${this.linktext(target, from)}${anchor ? '#^' + anchor : ''}]]`;
  }

  /** `[[NVI-43-JHN-001#^nvi-jhn-1-1|João 1.1]]`, with the link the vault expects. */
  link(
    target: ChapterTarget,
    anchor: string | null,
    label: string,
    from: TFile | null,
  ): string {
    return `[[${this.linktext(target, from)}${anchor ? '#^' + anchor : ''}|${label}]]`;
  }

  /**
   * How the target is written inside the brackets. A file the vault knows is
   * shortened as far as it can be from where the link is written; a chapter
   * that has no file yet is written by name, which is the whole of what there
   * is to say about it.
   */
  linktext(target: ChapterTarget, from: TFile | null): string {
    if (!target.file) return target.path;
    return this.app.metadataCache.fileToLinktext(
      target.file,
      from ? from.path : '',
      true,
    );
  }

  /** First verse of the passage. A book index file holds none, so it shows bare. */
  async previewOf(
    file: TFile,
    chapter: number | null,
    verses: number[],
  ): Promise<string> {
    if (chapter === null) return '';
    const match = await this.plugin.verseIn(
      file,
      verses.length ? verses[0] : null,
    );
    return match ? match.text : '';
  }

  renderSuggestion(item: RefSuggestion, el: HTMLElement) {
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

  selectSuggestion(item: RefSuggestion) {
    const ctx = this.context;
    if (!ctx) return;
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
