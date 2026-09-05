/**
 * Writing a note on a verse of a version.
 *
 * A version generated from a translation is a chapter of embeds, each carrying
 * a block id of its own so that whatever is written about a verse can point at
 * it. The writing itself is what this file is for: a commentary note, a
 * homiletic outline, a reviewer's remark — each of them a callout at the foot
 * of the chapter, under `## Notas`, and a link up in the verse's own aside
 * saying it is there.
 *
 * Doing it by hand is four steps — find the next free number, write the
 * callout, write the anchor, go back up and mark the verse — and every one of
 * them is easy to get subtly wrong. So the shape is written here, as functions
 * over the chapter's text: the command reads the verse, asks which kind of
 * note and which number, and applies what these hand back.
 */
import { outsideFences } from './utils';

/** A range of the chapter to be replaced, in the editor's own terms. */
export interface At {
  line: number;
  ch: number;
}

/** One edit the command makes: `text` in place of everything `from` to `to`. */
export interface Write {
  from: At;
  to: At;
  text: string;
}

/** One kind of note: what it is called, what it is written as, how it is named. */
export interface NoteKind {
  /** Obsidian callout the note is written as: `note`, `homiletica`. */
  callout: string;
  /** Letter its anchors carry, which is what tells one kind's numbers apart. */
  letter: string;
  /**
   * What it is called, in the title of every note written as it: `Nota`.
   *
   * One name rather than one per language. A kind is a vault's own — the
   * callout is drawn by its own stylesheet, and the notes are written in
   * whatever the commentary is written in — so the name is written once, the
   * way it is to be read, rather than translated by a setting.
   */
  title: string;
}

/**
 * The kinds a note may be written as, as they stand in a vault that has said
 * nothing: the three the Shedd commentary is written with.
 *
 * They are settings rather than a fixed list because the callouts are a
 * vault's own — `homiletica` and `revisores` are named in this vault's
 * stylesheet and nowhere else — and a commentary keeping some other set of
 * notes has no way of writing them otherwise.
 */
export const DEFAULT_NOTE_KINDS: NoteKind[] = [
  { callout: 'note', letter: 'n', title: 'Nota' },
  { callout: 'homiletica', letter: 'h', title: 'Nótula Homilética' },
  { callout: 'revisores', letter: 'r', title: 'Nota dos Revisores' },
];

/** The block ids a chapter's verses carry, up to the verse number itself. */
export function chapterPrefix(
  version: string,
  book: string,
  chapter: number,
): string {
  return `${version}-${book}-${chapter}`.toLowerCase();
}

/** Everything a note is written from, once the reader has answered. */
export interface Note {
  callout: string;
  /** The callout's title: `Nota 2 - Salmos 1.1`. */
  title: string;
  /** Block ids of the verses it covers, in the order they are read. */
  verses: string[];
  /** The note's own block id. */
  anchor: string;
  /** What the marker links read as: `n2`. */
  label: string;
  /** The word a marker list opens with; the first is the one written. */
  markers: string[];
  /** The headings the notes are kept under; the first is the one written. */
  headings: string[];
  /** The headings the quotes are kept under, which the notes go in front of. */
  quotes: string[];
}

/** The note's own line, left empty for the comment and for the cursor. */
const COMMENT = '> ';

/** The heading level a section of a chapter is opened at, and the one above it. */
const SECTION = /^#{1,2}\s/;
/** A second-level heading, whatever it is named. */
const HEADING = /^##\s+(.+?)\s*$/;
/** The comment that keeps Prettier off the block under it. */
const IGNORE = /^<!--\s*prettier-ignore\s*-->$/;
/** The comment that closes the run of verses Prettier is kept out of. */
const IGNORE_END = /^<!--\s*prettier-ignore-end\s*-->$/;
/** The aside a verse carries its refs and its notes in: `,,…,,`. */
const ASIDE = /^(.*),,([^]*),,(\s*)$/;

/** The block id a note carries: the chapter it is in, its kind and its number. */
export function noteAnchor(
  prefix: string,
  letter: string,
  number: number,
): string {
  return `${prefix}-${letter}${number}`;
}

/**
 * The number the next note of a kind takes: one past the highest already
 * written, or one where the chapter carries none.
 *
 * Past the highest rather than into the first gap, because the numbers are
 * only ever this chapter's own where the version was written here. A
 * commentary printed with its own numbering — Marcos 14 opening at 26, because
 * that is where the book's notes had got to — has to go on from where it is,
 * and a gap left in the middle of such a run is a note that is yet to be
 * copied in rather than a number going spare.
 */
export function nextNoteNumber(
  text: string,
  prefix: string,
  letter: string,
): number {
  const lines = text.split('\n');
  const outside = outsideFences(lines);
  const named = new RegExp(`\\^${escape(prefix)}-${escape(letter)}(\\d+)$`);
  let highest = 0;
  lines.forEach((line, i) => {
    if (!outside[i]) return;
    const found = line.trimEnd().match(named);
    if (found) highest = Math.max(highest, Number(found[1]));
  });
  return highest + 1;
}

/**
 * The note itself, as it is written under the heading: the callout, a
 * collapsed quote of every verse it is about, a line for the comment, and the
 * anchor the markers point at.
 *
 * `<!-- prettier-ignore -->` opens it because the callout is written the way it
 * is read — the blank quote lines, the nesting, the anchor under the block
 * rather than inside it — and Prettier would tidy every one of those away.
 *
 * The verses are embedded by their own ids alone, without the file in front of
 * them: a note lives in the chapter whose verses it quotes, so the shorter form
 * says the same thing and goes on saying it if the chapter is ever renamed.
 */
export function noteBlock(
  callout: string,
  title: string,
  verses: string[],
  anchor: string,
): string {
  const quoted = verses.map((id) => `![[#^${id}]]`).join(' ');
  return (
    '<!-- prettier-ignore -->\n' +
    `> [!${callout}]+ ${title}\n` +
    '>\n' +
    '> > [!quote]-\n' +
    '> >\n' +
    `> > ${quoted}\n` +
    '>\n' +
    // The line the comment is typed into, left with the space the cursor lands
    // after so that typing carries straight on from the quote.
    `${COMMENT}\n` +
    `^${anchor}\n`
  );
}

/**
 * Where `block` goes in `text`, and what has to be written there for it to land
 * under the heading the chapter keeps its notes under.
 *
 * The section sits between the verses and the quotes: the verses are what the
 * notes are about, and the quotes are what the notes refer to, so a note
 * written between the two reads in the order it was written in. A chapter that
 * has the section already gets the note at the end of it; one that has not gets
 * the section too.
 *
 * Where the verses are wrapped in `prettier-ignore-start`/`-end`, the heading
 * goes inside that wrapper, immediately before the marker that closes it: the
 * heading closes the verses, and the notes below it are each ignored on their
 * own.
 */
export function notePlacement(
  text: string,
  headings: string[],
  quotes: string[],
  block: string,
): Write {
  const lines = text.split('\n');
  const outside = outsideFences(lines);
  const body = block.replace(/\n$/, '');
  const at = headingAt(lines, outside, headings);

  if (at >= 0) {
    const end = sectionEnd(lines, outside, at);
    return {
      from: { line: end, ch: lines[end].length },
      to: { line: end, ch: lines[end].length },
      text: `${gapAt(lines, end)}${body}${tailAt(lines, end)}`,
    };
  }

  const quoted = headingAt(lines, outside, quotes);
  const closes = lastIgnoreEnd(lines, outside, quoted);
  const heading = `## ${headings[0]}`;

  // The verses close with the heading, so the marker that ends the ignored run
  // is written again under it rather than left above the section.
  if (closes >= 0) {
    return {
      from: { line: closes, ch: 0 },
      to: { line: closes, ch: lines[closes].length },
      text: `${heading}\n${lines[closes]}\n\n${body}${tailAt(lines, closes)}`,
    };
  }

  const last = quoted < 0 ? lines.length - 1 : lastBefore(lines, quoted);
  const line = beforeFence(outside, last);
  return {
    from: { line, ch: lines[line].length },
    to: { line, ch: lines[line].length },
    text: `${gapAt(lines, line)}${heading}\n\n${body}${tailAt(lines, line)}`,
  };
}

/**
 * The marker a note leaves on one verse, or null where the chapter carries no
 * such verse — a note over a range asked for more verses than were written.
 *
 * The marker goes in the verse's aside, alongside the refs when there are any:
 * the aside is what a verse says about itself, and a second note on the same
 * verse joins the list rather than opening one of its own.
 *
 * Both layouts the vault holds are answered. A verse written as an embed, its
 * aside and its id one under the other gets the marker on its own line; one
 * written all on the one line keeps it there.
 */
export function markerWrite(
  text: string,
  verse: string,
  anchor: string,
  label: string,
  markers: string[],
): Write | null {
  const lines = text.split('\n');
  const outside = outsideFences(lines);
  const at = lines.findIndex(
    (line, i) => outside[i] && line.trimEnd().endsWith(`^${verse}`),
  );
  if (at < 0) return null;

  const link = `[[#^${anchor}|${label}]]`;
  const held = lines[at].trimEnd();
  const written = held.slice(0, held.length - verse.length - 1).trimEnd();

  // The id closes the line the verse is written on: the aside is on that line,
  // in front of it, or there is none and one is written there.
  if (written) {
    const from = asideFrom(lines, at, written);
    const said = [...lines.slice(from, at), written].join('\n');
    return span(from, at, lines, `${marked(said, link, markers)} ^${verse}`);
  }

  // The id is on a line of its own, so the aside is the line above it — where
  // that line is one at all, and not the embed the id belongs to.
  if (at > 0) {
    const from = asideFrom(lines, at - 1, lines[at - 1]);
    const said = lines.slice(from, at).join('\n');
    if (ASIDE.test(said)) {
      return span(from, at - 1, lines, marked(said, link, markers));
    }
  }

  return line(at, lines, `,,${opened(link, markers[0])},,\n${lines[at]}`);
}

/**
 * Where the aside closing at `at` opens, which may be further up the chapter
 * than the line it closes on.
 *
 * An aside is written as one thing and read as one, but it is wrapped by
 * Prettier like any other prose, so a verse carrying refs and notes both may
 * have its `,,` opened three lines above the `,,` that closes it. Reading only
 * the closing line would find no aside there and write a second one beside it.
 *
 * The count says where it opened: every line up to the one that balances the
 * marks belongs to the aside. A blank line ends the search, since an aside
 * never crosses one, and so does a count that never balances — an unclosed
 * `,,` left mid-edit is not an aside to write into.
 */
function asideFrom(lines: string[], at: number, held: string): number {
  let marks = quiets(held);
  if (marks % 2 === 0) return at;

  for (let i = at - 1; i >= 0 && lines[i].trim(); i--) {
    marks += quiets(lines[i]);
    if (marks % 2 === 0) return i;
  }
  return at;
}

/** How many `,,` a line carries, which is what says whether one is left open. */
function quiets(line: string): number {
  return (line.match(/,,/g) || []).length;
}

/** A note as it goes in: the edits it makes, and where it leaves the cursor. */
export interface WrittenNote {
  /** Last in the chapter first, so that each still lands where it was measured. */
  writes: Write[];
  /** The note's own empty line, which is what the reader types the comment into. */
  comment: At;
  /**
   * The verses the note was written about: the ones the chapter turned out to
   * carry, which is what the note quotes and what it was marked on.
   */
  verses: string[];
}

/**
 * Everything one note writes, and where the writing goes on from.
 *
 * The verses are asked of the chapter before the note is written, because a
 * verse the chapter never wrote is a verse the note cannot be about: a version
 * that merges two verses under one id has no id for the second, and quoting it
 * would write an embed that resolves to nothing. So the note quotes what it
 * marked, and says so.
 */
export function noteWrites(text: string, note: Note): WrittenNote {
  const markers: Write[] = [];
  const verses: string[] = [];
  for (const verse of note.verses) {
    const write = markerWrite(
      text,
      verse,
      note.anchor,
      note.label,
      note.markers,
    );
    if (!write) continue;
    // Every marker is measured against the chapter as it stands, so two of
    // them over the same lines would be two answers to one question, and the
    // one written second would throw the first away. It happens where one
    // aside is read as covering two verses — a blank line missing between
    // them, a `,,` left open above. The first stands, and the verse the second
    // was for is left out and said to be.
    if (markers.some((held) => overlaps(held, write))) continue;
    markers.push(write);
    verses.push(verse);
  }

  const block = noteBlock(note.callout, note.title, verses, note.anchor);
  const placed = notePlacement(text, note.headings, note.quotes, block);

  // The markers above the note push it that much further down the chapter,
  // each of them that opens a line of its own. A marker written into an aside
  // already there leaves the count where it was, however many lines that aside
  // was wrapped over, and one written below the note moves nothing above it.
  const pushed = markers.reduce(
    (lines, write) =>
      write.from.line >= placed.from.line
        ? lines
        : lines +
          write.text.split('\n').length -
          1 -
          (write.to.line - write.from.line),
    0,
  );
  const written = placed.text.split('\n');
  const at = written.lastIndexOf(COMMENT);

  return {
    writes: [placed, ...markers].sort((a, b) => b.from.line - a.from.line),
    comment: { line: placed.from.line + at + pushed, ch: COMMENT.length },
    verses,
  };
}

/** Whether two writes are over any of the same lines, and so cannot both go in. */
function overlaps(one: Write, other: Write): boolean {
  return one.from.line <= other.to.line && other.from.line <= one.to.line;
}

/** A run of whole lines replaced by `text`, which is as many lines as it likes. */
function span(from: number, to: number, lines: string[], text: string): Write {
  return {
    from: { line: from, ch: 0 },
    to: { line: to, ch: lines[to].length },
    text,
  };
}

/** One whole line replaced by `text`, which may itself be more than one line. */
function line(at: number, lines: string[], text: string): Write {
  return span(at, at, lines, text);
}

/** `held`, with the note's link in its aside — or with an aside, where it has none. */
function marked(held: string, link: string, markers: string[]): string {
  const aside = held.match(ASIDE);
  if (!aside) return `${held.trimEnd()} ,,${opened(link, markers[0])},,`;

  const [, before, inside, after] = aside;
  return `${before},,${joined(inside, link, markers)},,${after}`;
}

/** What a marker list reads as when the verse is being marked for the first time. */
function opened(link: string, marker: string): string {
  return `**${marker}**: ${link}.`;
}

/**
 * `inside`, an aside's contents, with the link added: onto the end of the note
 * list where the verse already carries one, and as a list of its own after
 * whatever else the aside says where it does not.
 *
 * The list is the marker's own, not the whole aside: an aside says its notes
 * and its refs in whichever order it was written in, and a link added after
 * the last link of the lot would be filed under the wrong one where the notes
 * come first.
 */
function joined(inside: string, link: string, markers: string[]): string {
  const listed = markerList(inside, markers);
  if (!listed) {
    // The refs before it close with a full stop, which is what separates the
    // two lists. One left without it is closed here rather than run into.
    const said = inside.trimEnd();
    return `${said}${said.endsWith('.') ? '' : '.'} ${opened(link, markers[0])}`;
  }

  const [from, to] = listed;
  const said = inside.slice(from, to);
  const found = said.lastIndexOf(']]');
  // A list naming no note yet — one whose link was deleted, or a placeholder
  // written by hand — has nothing to add to, so the link goes at the end of
  // what it does say, in front of the full stop that closes it.
  const end = from + (found < 0 ? closing(said) : found + 2);
  return `${inside.slice(0, end)}; ${link}${inside.slice(end)}`;
}

/**
 * Where a marker list ends: past everything it says, but in front of the
 * whitespace and the full stop that close it, which belong to the list as a
 * whole rather than to its last entry.
 */
function closing(said: string): number {
  const end = said.trimEnd().length;
  return end > 0 && said[end - 1] === '.' ? end - 1 : end;
}

/**
 * Where the note list of an aside opens and ends, or null where the aside
 * keeps none. It runs from its own label to the next one — `**Refs**`, or
 * anything else the aside names — and to the end of the aside where it is the
 * last thing said.
 */
function markerList(
  inside: string,
  markers: string[],
): [number, number] | null {
  for (const marker of markers) {
    const label = `**${marker}**`;
    const at = inside.indexOf(label);
    if (at < 0) continue;
    const next = inside.indexOf('**', at + label.length);
    return [at, next < 0 ? inside.length : next];
  }
  return null;
}

/**
 * The last `prettier-ignore-end` before the quotes, or -1 for none.
 *
 * The last rather than the first: a chapter may keep Prettier off something
 * well before its verses — a table above them, say — and the marker that ends
 * that has nothing to do with the verses. The one the notes close is the last
 * before the quotes, which is the one the verses are wrapped in.
 */
function lastIgnoreEnd(
  lines: string[],
  outside: boolean[],
  quoted: number,
): number {
  const from = (quoted < 0 ? lines.length : quoted) - 1;
  for (let i = from; i >= 0; i--) {
    if (outside[i] && IGNORE_END.test(lines[i])) return i;
  }
  return -1;
}

/** Where a section named by any of `headings` opens, or -1 for none. */
function headingAt(
  lines: string[],
  outside: boolean[],
  headings: string[],
): number {
  const wanted = headings.map((heading) => heading.toLowerCase());
  return lines.findIndex((line, i) => {
    if (!outside[i]) return false;
    const named = line.match(HEADING);
    return named !== null && wanted.includes(named[1].toLowerCase());
  });
}

/**
 * The last line of the section opening at `at` — the last one a note of its own
 * is written after.
 *
 * The blank lines before the next heading separate the two rather than
 * belonging to the section, and so does a `prettier-ignore` left standing in
 * front of that heading: it is the heading's own, and a note written under it
 * would be written between the comment and what it was there for.
 */
function sectionEnd(lines: string[], outside: boolean[], at: number): number {
  let end = lines.length - 1;
  for (let i = at + 1; i < lines.length; i++) {
    if (outside[i] && SECTION.test(lines[i])) {
      end = i - 1;
      break;
    }
  }
  while (end > at && !lines[end].trim()) end--;
  if (end > at && IGNORE.test(lines[end].trim())) end--;
  while (end > at && !lines[end].trim()) end--;
  return beforeFence(outside, end);
}

/** The last line saying anything before `at`, which is what a section follows. */
function lastBefore(lines: string[], at: number): number {
  let end = at - 1;
  while (end > 0 && !lines[end].trim()) end--;
  return end;
}

/**
 * The line to write at, backed out of a code block someone left open: a note
 * written inside a fence carries no block id, so a line that landed in one
 * retreats to the last line before the fence opened.
 */
function beforeFence(outside: boolean[], at: number): number {
  let line = at;
  while (line > 0 && !outside[line]) line--;
  return line;
}

/** The blank line a note needs behind it, where the chapter leaves none. */
function tailAt(lines: string[], line: number): string {
  if (line === lines.length - 1) return '\n';
  return lines[line + 1].trim() ? '\n' : '';
}

/** The blank line a note needs in front of it, however the chapter reads there. */
function gapAt(lines: string[], line: number): string {
  if (lines[line].trim()) return '\n\n';
  return line > 0 && lines[line - 1].trim() ? '\n' : '';
}

/** A name written into a pattern, with whatever it carries taken literally. */
function escape(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
}
