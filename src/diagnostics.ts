/**
 * What can be wrong with a Bible version, said in one shape.
 *
 * A version is a set of files a machine reads: a copy of it walks the chapters
 * the index found, reads the verses out of each and points at them by the
 * block id each verse closes on. Every one of those steps has a way of going
 * quietly wrong — a verse nobody anchored, two files claiming one chapter, an
 * id naming a chapter it is not written in — and none of them looks wrong in
 * the note itself, which is what makes them worth reporting rather than
 * leaving to be met later as a broken link.
 *
 * The rows are data, not sentences. What a reader is shown is the view's to
 * write, in the language the vault is read in; the model only says what was
 * found, where, and whether it is bad enough to stop a copy.
 */

import type { TFile } from 'obsidian';

import type KingdoneChapelPlugin from './main';
import { sourceOf } from './sources';
import type { VerseLine } from './utils';
import { parseChapterName, verseInId } from './utils';

/** What a row says about a version, and what each of them means. */
export type DiagnosticKind =
  /** A verse the chapter writes, that no block id names. */
  | 'unanchored-verse'
  /** Two files claiming one chapter of one version. */
  | 'chapter-conflict'
  /** Two notes claiming one book of one version. */
  | 'book-conflict'
  /** A block id naming a chapter other than the one it is written in. */
  | 'foreign-block-id'
  /** A chapter file holding no verses at all. */
  | 'empty-chapter'
  /** A folder declared a version, holding no chapter. */
  | 'empty-version';

/**
 * How much a row weighs.
 *
 * The line is drawn at what a copy can survive: an error is something a new
 * version written from this one would carry across wrong — a verse quoted
 * under another verse's number, a chapter silently left out — so a copy is
 * refused. A warning is a version that reads oddly and copies faithfully.
 */
export type Severity = 'error' | 'warning';

/** The weight of each row, which is the kind's own and not the finder's. */
export const SEVERITIES: Record<DiagnosticKind, Severity> = {
  'unanchored-verse': 'error',
  'chapter-conflict': 'error',
  'book-conflict': 'error',
  'foreign-block-id': 'warning',
  'empty-chapter': 'warning',
  'empty-version': 'warning',
};

/** One thing found wrong, wherever it was found. */
export interface Diagnostic {
  kind: DiagnosticKind;
  severity: Severity;
  /** Code of the version it belongs to, which is what the view filters by. */
  version: string;
  /**
   * The files it is about: one for most, and every one of them for a clash,
   * which is a problem no single file has.
   */
  paths: string[];
  /** The verse it names, null for a row about a whole file or folder. */
  verse: number | null;
}

/** Where a chapter row was found, which is all the model knows of the file. */
export interface ChapterAt {
  version: string;
  path: string;
  chapter: number;
}

/**
 * Everything wrong inside one chapter file, read from its verses and its ids.
 *
 * The two are read from the file rather than derived from each other because
 * neither answers for the other: `parseVerses` reads what the chapter writes,
 * ids and written numbers alike, and the ids are what a link to a verse is
 * actually made of. A verse is anchored when some id names it, and where the
 * id names another chapter it is that, and not the missing anchor, that is
 * reported — one thing is wrong with the line, not two.
 */
export function chapterDiagnostics(
  at: ChapterAt,
  verses: VerseLine[],
  ids: string[],
): Diagnostic[] {
  const row = (kind: DiagnosticKind, verse: number | null): Diagnostic => ({
    kind,
    severity: SEVERITIES[kind],
    version: at.version,
    paths: [at.path],
    verse,
  });

  if (!verses.length) return [row('empty-chapter', null)];

  const out: Diagnostic[] = [];
  const named = new Map<number, number[]>();
  for (const id of ids) {
    const verse = verseInId(id);
    if (verse === null) continue; // an id naming something that is no verse
    const chapter = chapterInId(id);
    const chapters = named.get(verse) || [];
    named.set(verse, chapters);
    if (chapter !== null) chapters.push(chapter);
  }

  for (const verse of verses) {
    if (!named.has(verse.verse)) out.push(row('unanchored-verse', verse.verse));
  }
  for (const [verse, chapters] of named) {
    if (chapters.some((c) => c !== at.chapter)) {
      out.push(row('foreign-block-id', verse));
    }
  }
  return out;
}

/** The chapter a block id names, in the number before the verse it ends on. */
function chapterInId(id: string): number | null {
  const named = /-(\d+)-\d+$/.exec(id);
  return named ? Number(named[1]) : null;
}

/**
 * Everything found wrong across the vault, and what it cost to find it.
 *
 * The rows come from two places, and they are kept apart because they are
 * bought at two prices. The structural ones — a chapter claimed twice, a
 * version holding nothing — fall out of the index, which is built from file
 * names alone and can be rebuilt over a whole vault without blocking. The rest
 * need the opposite: a chapter's verses and its block ids, which means reading
 * the file. So those are cached by path and modification time, the way parsed
 * verses already are, and never stored on the index, which is thrown away and
 * rebuilt on every note created, renamed or deleted and on every keystroke in
 * the settings.
 *
 * Nothing here sweeps the vault of its own accord. What has been read is what
 * has been asked for, and `all()` says what is known rather than what is true.
 */
export class Diagnostics {
  /** path -> { mtime, the rows that file's contents produced }. */
  private results = new Map<string, { mtime: number; found: Diagnostic[] }>();

  constructor(private plugin: KingdoneChapelPlugin) {}

  /**
   * Everything wrong inside one chapter file, read once per version of it.
   *
   * A note that is no chapter of a version answers with nothing and is not
   * remembered: it has no chapter to be measured against, and asking again
   * costs nothing.
   */
  async ofChapter(file: TFile): Promise<Diagnostic[]> {
    const hit = this.results.get(file.path);
    if (hit && hit.mtime === file.stat.mtime) return hit.found;

    const at = this.chapterAt(file);
    if (!at) return [];
    const verses = await this.plugin.chapterVerses(file);
    const ids = await this.plugin.blockIds(file);
    const found = chapterDiagnostics(at, verses, ids);
    this.results.set(file.path, { mtime: file.stat.mtime, found });
    return found;
  }

  /**
   * Read a chapter again, but only one already read.
   *
   * This is what the metadata cache's `changed` tops the results up through,
   * and it is deliberately not a way in: a vault of six thousand files would
   * otherwise be read into memory by the first edit made in it. What was never
   * asked for stays unasked until the sweep asks for it.
   */
  async refresh(file: TFile): Promise<void> {
    if (!this.results.has(file.path)) return;
    await this.ofChapter(file);
  }

  /** Everything the index alone knows: what two files claim, and what holds nothing. */
  structural(): Diagnostic[] {
    const index = this.plugin.index(); // named versions, and their conflicts
    const out: Diagnostic[] = [];

    for (const [key, files] of this.plugin.chapterConflicts) {
      // The last slash, not the first: what a version is called is written in
      // a note, and the chapter part after it is always one segment.
      const at = key.lastIndexOf('/');
      out.push({
        kind: key.slice(at + 1).startsWith('book:')
          ? 'book-conflict'
          : 'chapter-conflict',
        severity: 'error',
        version: key.slice(0, at),
        paths: files.map((file) => file.path),
        verse: null,
      });
    }

    for (const source of this.plugin.sourceCodes.values()) {
      if (index.has(source.code)) continue;
      out.push({
        kind: 'empty-version',
        severity: SEVERITIES['empty-version'],
        version: source.code,
        // The note that declared it, so the reader is sent to what they wrote
        // rather than to a folder; one that is a version by where it sits
        // wrote nothing, and the folder is the whole of it.
        paths: [source.declaredBy || source.path],
        verse: null,
      });
    }

    return out;
  }

  /**
   * The structural rows, and every chapter read so far.
   *
   * A chapter is read under the version that held it, and which folders are
   * versions is decided by the settings and by notes that can be written like
   * any other. So a row naming a code the vault has stopped using is dropped
   * here rather than shown: it was true of a vault that is no longer this one.
   *
   * A row is dropped where the file it names has gone, and where the version
   * it was read under is one the vault no longer holds. One file at a time,
   * and not by emptying the results whenever the index is rebuilt: the index
   * goes on every note created, renamed or deleted, and a sweep of six
   * thousand files is not worth throwing away for a note written in a folder
   * that is no version at all.
   */
  all(): Diagnostic[] {
    const out = this.structural(); // names the versions the vault holds now
    for (const [path, held] of this.results) {
      // Gone, or found under a version the vault has stopped using. A path
      // goes without ever being forgotten: a folder renamed in the explorer
      // is said of the folder, and not of each note under it.
      if (
        !this.plugin.app.vault.getAbstractFileByPath(path) ||
        held.found.some((row) => !this.plugin.sourceCodes.has(row.version))
      ) {
        this.results.delete(path);
        continue;
      }
      out.push(...held.found);
    }
    return out;
  }

  /** Drop what was held about a file, for one edited away, renamed or deleted. */
  forget(path: string) {
    this.results.delete(path);
  }

  /** Where a file sits in its version, or null for a note that is no chapter. */
  private chapterAt(file: TFile): ChapterAt | null {
    const source = sourceOf(this.plugin.sources(), file);
    if (!source) return null;
    const parsed = parseChapterName(file.basename, source.code);
    if (!parsed) return null;
    return { version: source.code, path: file.path, chapter: parsed.chapter };
  }
}
