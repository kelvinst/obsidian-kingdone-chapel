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
  quoteHeadings,
} from './books';
import {
  booklessLabels,
  booklessPassageLabel,
  fitsChapters,
  parseBookless,
  parseContextRef,
  parseReference,
  passageId,
  passageLabel,
  referenceLabels,
  shortReference,
} from './reference';
import { hasBlockId, parseChapterName, quotePlacement } from './utils';
import type { BookMatch } from './books';
import type { BooklessRef, ParsedContextRef, ParsedRef } from './reference';
import type { ChapterTarget, Location } from './types';
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
  { command: '⇥', purpose: 'to insert and rename' },
];

/** Rows a whole popup may hold, so a query naming no version and matching
 * every book cannot read the vault for a page nobody will scroll to. */
const MAX_ROWS = 12;

/** Books one version is offered under. A query reaching for several versions
 * splits this between them rather than growing the popup. */
const MAX_BOOKS = 6;

/**
 * The quote a passage link points at, and the name it is filed under. A run of
 * verses is written as one link to a quote at the end of the note rather than
 * as a link per verse, so the row carries the quote it will need alongside the
 * link that reads it.
 */
export interface Passage {
  /** Block id the link points at, and the one the quote is closed with. */
  id: string;
  /** The whole callout, written out, ready to sit at the end of the note. */
  callout: string;
}

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

/** One way the query could be linked: a book the reader may have meant, in one
 * version, under one of the names they may want it written as. */
export interface RefSuggestion {
  /**
   * `João 1.1-3 - NVI` — the reference as the note will read it once the links
   * are rendered, so a row that links is a sample of the line it writes. An
   * embed writes no label of its own, and the row names the passage instead.
   */
  ref: string;
  /**
   * What `ref` points at, spelled out, for the rows where reading it does not
   * say: the book an abbreviation stands for, the passage a bare number is
   * counted against.
   */
  book: string;
  /** What this row writes, where the reference alone does not say. */
  note?: string;
  /** First verse of the passage, as a taste of what the link points at. */
  preview: string;
  /** The links to insert, ready to go. */
  markdown: string;
  /** The quote `markdown` points at, for a row that writes one. */
  passage?: Passage;
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
  /**
   * More than one when the passage can be written more than one way: a chapter
   * embeds as the whole file or a verse at a time, and those are different
   * enough on the page to be worth choosing between.
   */
  full: RefSuggestion[];
}

/** A passage the vault could not answer for. */
const NO_ROWS: ContextRows = { bare: null, full: [] };

/**
 * Said when numbers were written on their own in a note holding no passage to
 * read them against. The books still answer below it, but nothing there
 * explains why the number alone found nothing, and a row that only closes
 * reads as a plugin that broke.
 */
const NO_CONTEXT: HintSuggestion = {
  hint: 'No link in this note to read a book from — write one',
};

/**
 * Said when the numbers written reach for more verses than one reference may
 * carry. They are refused rather than cut short, and no book answers a query
 * of numbers either, so the popup would otherwise close on nothing.
 */
const TOO_MANY: HintSuggestion = {
  hint: 'More verses than one reference can carry — ask for fewer',
};

/**
 * Said when a run of numbers is short enough to be verses and too long to be
 * chapters, so only the one reading answered. The rows below say verses
 * without saying they are only verses, and a reading dropped in silence
 * answers something other than what was asked.
 */
const TOO_MANY_CHAPTERS: HintSuggestion = {
  hint: 'More chapters than one reference can carry — read as verses',
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
   * A reference written after a semicolon may leave its book out and carry it
   * on from the one before, the way the second of a pair is written by hand.
   * With no semicolon in front of them, numbers on their own are read against
   * the passage the note is about instead — the same reference, counted from
   * what the note already says rather than from what the line already wrote.
   *
   * The books answer under either of them: `@1` is a chapter of the book at
   * hand as much as it is the start of `1 Samuel`, and one suggestion costs
   * nothing to show next to the other.
   */
  async getSuggestions(ctx: EditorSuggestContext): Promise<Row[]> {
    const embed = ctx.query.startsWith('!');
    const query = embed ? ctx.query.slice(1) : ctx.query;

    const out: Row[] = [];
    // A hint is not a row anyone can pick, so it goes below every row that is:
    // the popup opens on its first one, and Enter has to write something.
    const hints: Row[] = [];
    const bookless = parseBookless(query);
    const carried = bookless ? this.carriedFrom(ctx) : null;
    if (bookless && carried) {
      out.push(
        ...(await this.carriedSuggestions(carried, bookless, embed, ctx.file)),
      );
    } else {
      const asked = parseContextRef(
        query,
        (word) => this.plugin.findCompleteVersion(word) !== null,
      );
      if (asked && asked.numbers === null) {
        // Numbers, and nothing wrong with them but how many they came to.
        hints.push(TOO_MANY);
      } else if (asked) {
        const here = this.plugin.linkContext(ctx.file);
        if (!here) hints.push(NO_CONTEXT);
        else {
          // A version nobody named is the note's own, which the labels leave
          // unsaid; one that was asked for is offered in every version it could
          // still be finished as, and said in what the row writes.
          const named = asked.versionPrefix || asked.version !== null;
          const versions = named
            ? this.versionsFor(asked, ctx.file)
            : [here.version];
          // A half-written version stands for every version starting with it,
          // and a lone dash for every version there is — each of them reading
          // the vault for rows the popup has no room to show. Stop at the room
          // there is, rather than filling it several times over.
          const room = MAX_ROWS - hints.length;
          for (const version of versions) {
            if (out.length >= room) break;
            out.push(
              ...(await this.contextSuggestions(
                { ...here, version },
                asked,
                embed,
                ctx.file,
                named ? version : null,
              )),
            );
          }
          // The numbers were read as verses alone, the run being longer than
          // a run of chapters may be. A chapter of 0 numbers no verses, so
          // there was no verse reading either and nothing to say they were
          // read as.
          if (
            here.chapter !== 0 &&
            asked.chapter === null &&
            asked.numbers &&
            !fitsChapters(asked.numbers)
          ) {
            hints.push(TOO_MANY_CHAPTERS);
          }
        }
      }
    }
    // The hint is what the popup is there to say when the rows run out, so the
    // room for it comes off the rows rather than the other way about, and the
    // books are told what room is left rather than filling the popup twice
    // over and having the surplus read from the vault and then dropped.
    out.push(
      ...(await this.bookSuggestions(
        query,
        embed,
        ctx.file,
        MAX_ROWS - out.length - hints.length,
      )),
    );
    return [...out.slice(0, MAX_ROWS - hints.length), ...hints];
  }

  /**
   * The reference as it was written out in full: a book, and what follows it.
   * `limit` is the room left in the popup, which is also the point at which
   * reading the vault for another book stops being worth it.
   */
  async bookSuggestions(
    query: string,
    embed: boolean,
    from: TFile | null,
    limit: number,
  ): Promise<RefSuggestion[]> {
    if (limit <= 0) return [];
    const parsed = parseReference(
      query,
      (word) => this.plugin.findCompleteVersion(word) !== null,
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
        if (out.length >= limit) return out.slice(0, limit);

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

          // A run of verses reads as one reference and is written as one
          // link, to a quote of the whole passage kept at the end of the note.
          // The verse-by-verse links are still there, inside the quote, as the
          // embeds it is made of. Verses all sit in the one chapter, so the
          // passage is the first target the run found.
          if (head.chapter !== null && parsed.verses.length > 1) {
            const id = passageId(
              version,
              match.book.code,
              head.chapter,
              parsed.verses,
            );
            // The quote stands on its own at the foot of the note, so it names
            // the version it quotes whether or not the reference asked for one,
            // and names the book in full however the reference was written.
            const title = passageLabel(
              name,
              head.chapter,
              parsed.verses,
              version,
            );
            const callout = this.callout(
              title,
              this.embedLines(head, anchors, from),
              id,
            );
            for (const form of this.forms(match, name)) {
              const label = passageLabel(
                form,
                head.chapter,
                parsed.verses,
                named ? version : null,
              );
              out.push({
                ref: label,
                book: passageLabel(name, head.chapter, parsed.verses, version),
                note: 'quote at the end',
                preview,
                markdown: `[[#^${id}|${label}]]`,
                passage: { id, callout },
              });
            }
            continue;
          }

          // What the row points at, spelled out under the book's own name: an
          // abbreviation says the reference short, and this says it whole.
          const spelled = shortReference(
            name,
            chapters,
            parsed.verses,
            named ? version : null,
          );

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
              // The row written under the book's own name already says the
              // whole reference; only an abbreviation leaves something to name.
              book: form === name ? labels.join(',') : spelled,
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
    return out.slice(0, limit);
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
    const version = this.plugin.findCompleteVersion(name.version);
    if (!version) return null;

    // A name is not a chapter: an ordinary note called `NVI-2-Notas-3` reads
    // as one. The index is what says which files are chapters, so the passage
    // only carries when the index answers this very file.
    return this.plugin.referenceFile(version, name.bookIndex, name.chapter) ===
      file
      ? { ...name, version }
      : null;
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
    // A commentary keeps one file for the whole book, indexed as chapter zero,
    // and there is no chapter there for a bare verse number to be counted in.
    // Such a reference has to name its own chapter, and one that does not is
    // left to the books below.
    if (bookless.chapter === null && here.chapter === 0) return [];

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

      // A carried run of verses is one reference as much as a spelled-out one
      // is, and is written the same way: one link, to a quote of the passage
      // kept under the note's own heading.
      if (bookless.verses.length > 1) {
        const id = passageId(here.version, here.book, chapter, bookless.verses);
        const callout = this.callout(
          passageLabel(name, chapter, bookless.verses, here.version),
          this.embedLines(target, anchors, from),
          id,
        );
        const quoted = (label: string): RefSuggestion => ({
          ref: label,
          book: name,
          note: 'quote at the end',
          preview,
          markdown: `[[#^${id}|${label}]]`,
          passage: { id, callout },
        });
        return [
          quoted(booklessPassageLabel(bookless, chapter)),
          quoted(passageLabel(name, chapter, bookless.verses)),
        ];
      }

      const row = (labels: string[]): RefSuggestion => ({
        ref: labels.join(','),
        book: name,
        preview,
        markdown: labels
          .map((label, i) => this.link(target, anchors[i] || null, label, from))
          .join(','),
      });
      return [row(booklessLabels(bookless, chapter)), row(full)];
    } catch (e) {
      // The read goes to the file the index named, which may have gone away
      // since it was indexed. Leave the passage out rather than taking the
      // whole popup down with it.
      return [];
    }
  }

  /**
   * Versions to offer the reference in. A version still being written stands
   * for every version that begins with it, and the rows finish the word —
   * `@Gn 1 -n` offers Genesis 1 in NTLH and in NVI, and picking one writes the
   * whole reference rather than only the version name. Anything else names at
   * most one version, or leaves it to the default.
   */
  versionsFor(
    parsed: Pick<ParsedRef, 'version' | 'versionPrefix'>,
    from: TFile | null,
  ): string[] {
    if (parsed.versionPrefix) {
      const wanted = (parsed.version || '').toLowerCase();
      return this.plugin
        .completeVersions()
        .filter((v) => v.toLowerCase().startsWith(wanted));
    }
    const named = parsed.version
      ? this.plugin.findCompleteVersion(parsed.version)
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
   * The rows a bookless reference comes to, read against the passage the note
   * is about. A chapter said outright (`@1.1`) leaves nothing to choose: it is
   * that chapter of the book at hand. Numbers alone can be two things — those
   * verses of its chapter, or those chapters of its book — and verses come
   * first, a note about a chapter citing verses of it far more often than it
   * moves on to another chapter. A reference that says only a version asks for
   * the note's own passage, in that version.
   *
   * Each comes twice over, under the label the reader typed and under the one
   * spelling the reference out, and the typed one leads: someone who wrote
   * `@1` was writing a sentence with a `1` in it, the same way someone who
   * wrote `@Jn` meant the note to go on saying `Jn`.
   *
   * Either reading walks files the index named, which may have gone away
   * since; one that fails is left out, the same way a book is above.
   */
  async contextSuggestions(
    here: Location,
    asked: ParsedContextRef,
    embed: boolean,
    from: TFile | null,
    name: string | null,
  ): Promise<RefSuggestion[]> {
    // `getSuggestions` answers a null run with `TOO_MANY` and never gets
    // here, so the fallback is for the type rather than for a caller.
    /* v8 ignore next */
    const numbers = asked.numbers || [];
    const rows = (chapters: number[], verses: number[], bare: string[]) =>
      this.passageRows(here, chapters, verses, bare, embed, from, name).catch(
        () => NO_ROWS,
      );

    if (asked.chapter !== null) {
      const said = [asked.chapter];
      const one = await rows(said, numbers, this.bareLabels(said, numbers));
      return [one.bare, ...one.full].filter(
        (row): row is RefSuggestion => row !== null,
      );
    }

    if (!numbers.length) {
      // A version and nothing else. The note's own passage is the reference,
      // and its book alone when what the note is about is a book — which is
      // what a chapter of 0, a book's introduction, says.
      //
      // What was typed is the version's name, and that is a label worth having
      // on its own: a note already saying which passage it is about says the
      // rest by naming the version, `as NVI has it`.
      const said = here.chapter ? [here.chapter] : [];
      // Nothing but a version can leave the numbers empty, and a version
      // that was written is a version to name, so the label is always there.
      /* v8 ignore next */
      const one = await rows(said, [], name ? [name] : []);
      return [one.bare, ...one.full].filter(
        (row): row is RefSuggestion => row !== null,
      );
    }

    const typed = numbers.map(String);
    const [verses, chapters] = await Promise.all([
      // Chapter 0 is the introduction a book opens with, and a commentary
      // keeping one file for the whole book is that introduction — neither
      // numbers its verses, so a number counted against it would be pointing
      // at a verse of nothing.
      here.chapter === 0 ? NO_ROWS : rows([here.chapter], numbers, typed),
      // The same numbers as chapters, so long as there are not more of them
      // than a run of chapters may carry.
      fitsChapters(numbers) ? rows(numbers, [], typed) : NO_ROWS,
    ]);
    return [
      verses.bare,
      chapters.bare,
      ...verses.full,
      ...chapters.full,
    ].filter((row): row is RefSuggestion => row !== null);
  }

  /**
   * The reference as the reader typed it, with the book they never wrote left
   * out: `1.1,2` for `@1.1,2`, `1` for `@ARA`. It is `referenceLabels` under a
   * book with no name, which is what a bookless reference is.
   */
  bareLabels(chapters: number[], verses: number[]): string[] {
    return referenceLabels('', chapters, verses).map((label) => label.trim());
  }

  /**
   * A passage of the book the note is about. `name` is the version to write,
   * which is set only when the reader asked for one: the note's own version
   * goes unnamed for the same reason the default version does — it would only
   * be reading the note back to itself.
   *
   * The links are the same either way, so the two labellings share the one
   * read of the file behind them.
   */
  async passageRows(
    here: Location,
    chapters: number[],
    verses: number[],
    bare: string[],
    embed: boolean,
    from: TFile | null,
    name: string | null,
  ): Promise<ContextRows> {
    const found = this.chapterTargets(here.version, here.bookIndex, chapters);
    if (!found.length) return NO_ROWS;

    const head = found[0];
    const anchors = head.file
      ? await this.plugin.findAnchors(head.file, head.chapter, verses)
      : verses.map(() => null);
    const preview = head.file
      ? await this.previewOf(head.file, head.chapter, verses)
      : '';
    const asked = found
      .map((f) => f.chapter)
      .filter((c): c is number => c !== null);
    const spelled = referenceLabels(here.book, asked, verses, name);
    // Every shape the passage embeds as, which is the choice `!@` offers in
    // place of the labels it does not write.
    const shapes = embed
      ? await this.embeds(
          found,
          {
            version: null,
            versionPrefix: false,
            book: here.book,
            chapters,
            verses,
          },
          anchors,
          from,
        )
      : null;

    const said = shortReference(here.book, asked, verses, name);
    const row = (labels: string[]): RefSuggestion => ({
      ref: labels.join(','),
      // Numbers on their own do not say what they point at, so the row says it
      // for them, in the reference they would have been written as. It is also
      // what tells the two bare rows apart, which are the same numbers read
      // two ways: `João 1.2` beside `João 2`.
      book: said,
      preview,
      markdown: labels
        .map((label, i) =>
          verses.length
            ? this.link(found[0], anchors[i] || null, label, from)
            : this.link(found[i], null, label, from),
        )
        .join(','),
    });

    if (shapes) {
      // An embed row reads as the passage it writes, so it says what it points
      // at already and has nothing to name beside it.
      const base = { ref: spelled.join(','), book: spelled.join(','), preview };
      return {
        bare: null,
        full: shapes.map((shape) => ({ ...base, ...shape })),
      };
    }

    return {
      // What the reader typed, which is how the sentence around it reads: `as
      // verse 2 says`, not `as João 1.2 says`.
      bare: bare.length ? row(bare) : null,
      // Spelled out, the row is the reference, so it names itself and the
      // chip beside it stays away.
      full: [{ ...row(spelled), book: spelled.join(',') }],
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

  /**
   * The quote a passage link points at: the passage under its own name, made
   * of the same one-embed-per-verse the `!@` form writes, and closed with the
   * block id the link reads it by. The id sits at the end of the last line so
   * that it names the callout as a whole, which is what makes the link show
   * the whole passage at once — on hover as much as when it is followed.
   */
  callout(title: string, embeds: string, id: string): string {
    const lines = embeds.split('\n');
    lines[lines.length - 1] += ` ^${id}`;
    return [`> [!quote]+ ${title}`, ...lines.map((line) => `> ${line}`)].join(
      '\n',
    );
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
