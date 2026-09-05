import { runsIn } from './syntax';
import { softLinksIn } from './softlink';

/** A chapter file name, split into its parts. */
export interface ChapterName {
  version: string;
  /** Book number, without leading zeros (Genesis = 1). */
  bookIndex: number;
  /** Book code, as written in the file name. */
  book: string;
  chapter: number;
}

/**
 * Parse a chapter file name: `<VERSION>-<NN>-<CODE>-<CCC>`, where `CODE` is
 * the book's USFM code (`GEN`, `1SA`, `REV`). See `bookName` to display it.
 *
 * Folders are never part of it, so every version is free to organise its books
 * however it likes (flat, by testament, by category...). When `version` is
 * given (the version folder the file lives in), the name must start with it:
 * chapter files always carry their version, so anything else is an ordinary
 * note that happens to live under a version folder, and is not a chapter.
 */
export function parseChapterName(
  basename: string,
  version?: string,
): ChapterName | null {
  if (version) {
    const prefix = version.toLowerCase() + '-';
    if (!basename.toLowerCase().startsWith(prefix)) return null;
    const rest = splitBook(basename.slice(prefix.length));
    return rest ? { version, ...rest } : null;
  }

  const m = basename.match(/^(.+?)-(\d+)-(.+)-(\d+)$/);
  if (!m) return null;
  return {
    version: m[1],
    bookIndex: parseInt(m[2], 10),
    book: m[3],
    chapter: parseInt(m[4], 10),
  };
}

/** `<NN>-<CODE>-<CCC>` — the part of a chapter name after the version. */
function splitBook(rest: string): Omit<ChapterName, 'version'> | null {
  const m = rest.match(/^(\d+)-(.+)-(\d+)$/);
  if (!m) return null;
  return {
    bookIndex: parseInt(m[1], 10),
    book: m[2],
    chapter: parseInt(m[3], 10),
  };
}

/**
 * The name a chapter of the same book would be filed under, read off one the
 * version already wrote. It is the inverse of `parseChapterName`, and it works
 * from an example rather than from the parts because the parts do not carry how
 * the version writes them — whether it cases its prefix `NVI` or `nvi`, how
 * wide it pads its numbers. Only the chapter changes; everything before it is
 * copied across untouched, and the new number is padded to the width the
 * example used.
 */
export function chapterFileName(
  example: string,
  chapter: number,
): string | null {
  const m = example.match(/^(.*-)(\d+)$/);
  return m ? m[1] + String(chapter).padStart(m[2].length, '0') : null;
}

/** Key a chapter is indexed and looked up by, across versions. */
export function chapterKey(bookIndex: number, chapter: number): string {
  return `${bookIndex}:${chapter}`;
}

/**
 * Parse a book index file name: `<VERSION>-<NN>-<Name>` — the note that lists a
 * book's chapters (`NVI-43-Joao`). It is named after the book, not its USFM
 * code, and carries no chapter, which is what tells it apart from a chapter
 * file; try `parseChapterName` first.
 */
export function parseBookName(
  basename: string,
  version: string,
): number | null {
  const prefix = version.toLowerCase() + '-';
  if (!basename.toLowerCase().startsWith(prefix)) return null;
  const m = basename.slice(prefix.length).match(/^(\d+)-(.+)$/);
  return m ? parseInt(m[1], 10) : null;
}

/** A verse line of a chapter file, split into its number and its text. */
export interface VerseLine {
  verse: number;
  text: string;
}

/** The block id closing a verse line: `^nvi-gen-1-1`, ending in chapter and verse. */
const BLOCK_ID = /\s*\^([A-Za-z0-9-]+)\s*$/;
/** A Markdown heading, which names a section rather than writing a verse. */
const VERSE_HEADING = /^#{1,6}\s/;
/** How a verse line opens: an ordered list item now, a bolded number in older chapters. */
const VERSE_MARKER = /^\s*(?:\*\*(\d+)\*\*|(\d+)\.)\s*/;
/** The verse a block id names, in the number it ends on. */
const VERSE_ID = /-(\d+)$/;

/**
 * Read a verse line, taking its number from the block id that closes it.
 *
 * The number a line opens with is presentation, and there are two ways to
 * write it — `1. No princípio` now, `**1** No princípio` in older chapters —
 * neither of which can be trusted: a version that merges verses labels the
 * whole run with the first of them, and a Markdown list renumbers itself from
 * its opening item regardless. The block id is the verse's own name, and it
 * ends in the chapter and verse it belongs to. Fall back to the written number
 * only for a chapter that carries no ids at all.
 */
/**
 * The verse a block id names, or null where it names something else.
 *
 * Only an id ending in a number names a verse. One ending anywhere else
 * belongs to something that is not a verse, and one left mid-edit, ending on
 * the dash itself, names nothing at all.
 */
export function verseInId(id: string): number | null {
  const named = VERSE_ID.exec(id);
  return named ? Number(named[1]) : null;
}

/**
 * Every verse a chapter file holds.
 *
 * A verse is usually a line that carries its own number and its own block id,
 * and reading the file a line at a time finds it. But an id may also sit on a
 * line of its own under what it names, which is how a version writes verses
 * that are more than a line long — an embed of the translation it answers, and
 * whatever has been written beside it. Read that way an id alone would name a
 * verse with nothing in it, so what stands above it, back to the blank line,
 * is the verse.
 *
 * A line that writes its own number is a verse written on one line and is
 * taken as it is: whatever came before belongs to a heading or to the verse
 * before, not to this one. A line closing on an id without writing a number is
 * the end of what stands above it, whether or not it writes anything itself.
 */
export function parseVerses(content: string): VerseLine[] {
  const out: VerseLine[] = [];
  let above: string[] = [];

  for (const line of content.split('\n')) {
    const parsed = parseVerseLine(line);
    if (parsed) {
      // A line writing its own number is a verse written on one line, and what
      // stands above it belongs to a heading or to the verse before. A line
      // that carries only the id is the end of what stands above it, however
      // much of the verse it writes itself: a version answering a translation
      // writes the embed on one line and whatever it has to say beside it on
      // the next, closing on the id.
      out.push(
        VERSE_MARKER.test(line)
          ? parsed
          : {
              verse: parsed.verse,
              text: [...above, parsed.text].join('\n').trim(),
            },
      );
      above = [];
      continue;
    }
    // A blank line ends what stands above, and so does a heading: a verse is
    // written under one, never out of it.
    if (line.trim() === '' || VERSE_HEADING.test(line)) above = [];
    else above.push(line);
  }

  return out;
}

export function parseVerseLine(line: string): VerseLine | null {
  const id = line.match(BLOCK_ID);
  const marker = line.match(VERSE_MARKER);

  // Only an id ending in a number names a verse. A block id that ends anywhere
  // else belongs to something other than a verse, and one left mid-edit, ending
  // on the dash itself, names nothing at all — both fall back to what the line
  // writes rather than being read as a number.
  const named = id ? verseInId(id[1]) : null;
  const verse =
    named !== null ? named : marker ? Number(marker[1] || marker[2]) : NaN;
  if (!Number.isInteger(verse)) return null;

  // The id sits at the end of the line, so drop it before the opening marker
  // shifts everything left.
  let text = id ? line.slice(0, line.length - id[0].length) : line;
  if (marker) text = text.slice(marker[0].length);
  return { verse, text: text.trim() };
}

/**
 * Whether `text` already carries the block id `id` — whether, that is, some
 * line of it ends in `^id`.
 *
 * Read line by line rather than by a pattern built around the id: an id is
 * made of whatever a version folder is named, and a name is not a pattern.
 *
 * An id inside a fenced code block is an id being shown, and names nothing:
 * Obsidian reads no block ids in there, so a note holding an example of one is
 * a note that does not carry it.
 */
export function hasBlockId(text: string, id: string): boolean {
  const lines = text.split('\n');
  const outside = outsideFences(lines);
  return lines.some(
    (line, i) => outside[i] && line.trimEnd().endsWith(`^${id}`),
  );
}

/** Where a quote goes in a note, and what has to be written there. */
export interface QuotePlacement {
  line: number;
  ch: number;
  /** The quote, with the blank lines — and the heading — it needs around it. */
  text: string;
}

/** A heading of the level the quotes are kept under, or of the one above it. */
const SECTION = /^#{1,2}\s/;
/** The name a second-level heading carries, whatever it is. */
const HEADING = /^##\s+(.+?)\s*$/;
/** The line that opens a fenced code block, and the one that closes it. */
const FENCE = /^\s*(```|~~~)/;

/**
 * Where the next quote belongs in `text`, and what to write there for it to
 * land under the heading a note keeps its quotes under.
 *
 * The quotes are a section of their own, at the foot of the note, so that a
 * reference written in the middle of a sentence leaves the sentence alone. A
 * note that has the section already gets the quote at the end of it — before
 * whatever section follows, which is someone else's writing and not the place
 * for it — and one that has not gets the section itself, written after
 * everything else the note says.
 *
 * `headings` names the section: any of them is recognised as the one already
 * there, and the first is the one written when there is none.
 */
export function quotePlacement(
  text: string,
  headings: string[],
  quote: string,
): QuotePlacement {
  const lines = text.split('\n');
  const wanted = headings.map((heading) => heading.toLowerCase());
  // A heading inside a fenced code block is a heading being shown, not one the
  // note is written under — a note explaining how the quotes are kept would
  // otherwise have its own quotes filed into the example.
  const outside = outsideFences(lines);
  const at = lines.findIndex((line, i) => {
    if (!outside[i]) return false;
    const named = line.match(HEADING);
    return named !== null && wanted.includes(named[1].toLowerCase());
  });

  if (at < 0) {
    const last = beforeFence(outside, lines.length - 1);
    return {
      line: last,
      ch: lines[last].length,
      text: `${gapAt(lines, last)}## ${headings[0]}\n\n${quote}${tailAt(lines, last)}`,
    };
  }

  // The section runs to the heading that ends it, and the blank lines in front
  // of that heading separate the two rather than belonging to the section.
  let end = lines.length - 1;
  for (let i = at + 1; i < lines.length; i++) {
    if (outside[i] && SECTION.test(lines[i])) {
      end = i - 1;
      break;
    }
  }
  while (end > at && !lines[end].trim()) end--;
  end = beforeFence(outside, end);

  return {
    line: end,
    ch: lines[end].length,
    text: `${gapAt(lines, end)}${quote}${tailAt(lines, end)}`,
  };
}

/**
 * The line to write at, backed out of a code block someone left open: a quote
 * written inside a fence is a quote nothing reads, since Obsidian keeps no
 * block ids in there. So a line that landed in one retreats to the last line
 * before the fence opened.
 */
function beforeFence(outside: boolean[], line: number): number {
  let at = line;
  while (at > 0 && !outside[at]) at--;
  return at;
}

/**
 * Which lines sit outside a fenced code block — the lines, that is, where a
 * `#` opens a heading rather than being part of what the fence is showing.
 *
 * A fence that opens one belongs to what follows it and is inside; the one
 * that closes it is the end of the block and is out again, so that a quote may
 * be written after a block without being written into it.
 */
function outsideFences(lines: string[]): boolean[] {
  let fenced = false;
  return lines.map((line) => {
    if (!FENCE.test(line)) return !fenced;
    fenced = !fenced;
    return !fenced;
  });
}

/**
 * The blank line a quote needs behind it. A quote written at the very end
 * closes the file; one written into the middle of a note is followed by what
 * was already there, and needs a line of its own only where the note leaves
 * none — which is what a quote backed out of an open fence, with the fence
 * itself next in line, is written against.
 */
function tailAt(lines: string[], line: number): string {
  if (line === lines.length - 1) return '\n';
  return lines[line + 1].trim() ? '\n' : '';
}

/** The blank line a quote needs in front of it, however the note reads there. */
function gapAt(lines: string[], line: number): string {
  if (lines[line].trim()) return '\n\n';
  return line > 0 && lines[line - 1].trim() ? '\n' : '';
}

/** An embed of one verse of another version, and where in the text it sits. */
export interface VerseEmbed {
  path: string;
  block: string;
  at: number;
  length: number;
}

/**
 * Every verse another version is embedded from, in the order the text writes
 * them.
 *
 * A generated version holds no words of its own: a verse is an embed of the
 * translation it answers, carrying a label and standing over the version's own
 * block id — and whatever else the version has to say may be written beside
 * it. Read as it stands the verse is markup, which is honest but unreadable,
 * so name what each embed points at and where it sits, and let the caller put
 * the words in its place.
 *
 * Only an embed naming a block names a verse: one embedding a whole file names
 * a chapter, and a plain link is not an embed at all.
 */
export function verseEmbeds(text: string): VerseEmbed[] {
  const pattern = /!\[\[([^[\]|#]+)#\^([^[\]|#]+)(?:\|[^[\]]*)?\]\]/g;
  return Array.from(text.matchAll(pattern), (found) => ({
    path: found[1],
    block: found[2],
    at: found.index,
    length: found[0].length,
  }));
}

/** A wiki link, the bang that would make it an embed, and any label it has. */
const LINK = /(!?)\[\[([^[\]|]+)(?:\|([^[\]]*))?\]\]/g;

/**
 * The words a verse says, for somewhere with room for one line of it.
 *
 * A verse is written for the page it sits on: Shedd hangs its refs and its
 * notes off one in an aside, and writes them as links. Rendered, that is the
 * verse and its apparatus; written into a preview as plain text, it is markup
 * standing where the words should be, and the reader picking a reference is
 * being shown what says nothing about which row is the right one.
 *
 * So an aside goes, delimiters and content both, while every other mark keeps
 * what it holds. A link that survives reads as the label it was given, or as
 * what it names where it was given none — a soft link the note draws itself
 * reads as what it draws, for the same reason. An embed goes with it: one naming a
 * verse has been answered by the words already, and one naming anything else —
 * a whole chapter, a picture — has no words to read out. Whatever the verse is
 * written over is one line by the end of it.
 */
export function verseWords(text: string): string {
  let out = '';
  let at = 0;
  for (const run of runsIn(text)) {
    // A run inside one already read belongs to it, not to the text.
    if (run.from < at) continue;
    out += text.slice(at, run.from);
    if (run.mark.cls !== 'kcp-small')
      out += verseWords(text.slice(run.contentFrom, run.contentTo));
    at = run.to;
  }
  out += text.slice(at);

  // A soft link is read where it sits rather than by a pattern of its own:
  // `softLinksIn` already answers which tokens are links and what each draws.
  let drawn = '';
  let from = 0;
  for (const link of softLinksIn(out)) {
    drawn += out.slice(from, link.from) + link.text;
    from = link.to;
  }
  drawn += out.slice(from);

  return drawn
    .replace(LINK, (_, bang, target, label) => (bang ? '' : (label ?? target)))
    .replace(/\s+/g, ' ')
    .trim();
}
