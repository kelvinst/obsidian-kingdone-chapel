import type { TFile } from 'obsidian';

import type { Lang } from './books';
import { DEFAULT_NOTE_KINDS } from './notes';
import type { NoteKind } from './notes';

export const VIEW_TYPE = 'kingdone-chapel-view';

export interface KingdoneChapelSettings {
  translationsFolder: string;
  /** Version `@` references link to when they do not name one. Empty = pick one. */
  defaultVersion: string;
  /**
   * Language book names are read and written in, throughout the plugin. Empty
   * reads every language, and writes the first of them.
   */
  language: Lang | '';
  openInNewTab: boolean;
  labels: Record<string, string>;
  showCurrentVersion: boolean;
  followCursor: boolean;
  openSidebarOnStart: boolean;
  /** Whether a chapter pane gets the `Version > Book > Chapter` bar. */
  showBreadcrumbs: boolean;
  /** Whether the book dropdown breaks the testaments down into their divisions. */
  bookCategories: boolean;
  /**
   * The kinds of note a verse may be given, in the order they are offered. The
   * first is the one a note is written as unless another is picked.
   */
  noteKinds: NoteKind[];
}

export const DEFAULT_SETTINGS: KingdoneChapelSettings = {
  translationsFolder: 'Bibles',
  defaultVersion: '',
  language: '',
  openInNewTab: false,
  labels: {},
  showCurrentVersion: false,
  followCursor: true,
  openSidebarOnStart: false,
  showBreadcrumbs: true,
  bookCategories: false,
  noteKinds: DEFAULT_NOTE_KINDS,
};

/** Where the reader is: a chapter file, plus the verse under the cursor. */
export interface Location {
  version: string;
  /** Book number from the file name — the key books are matched by. */
  bookIndex: number;
  /** Readable book name, resolved from the code in the file name. */
  book: string;
  chapter: number;
  verse: number | null;
  file: TFile;
}

/** One chapter a version holds, as the breadcrumbs walk them. */
export interface ChapterRef {
  bookIndex: number;
  chapter: number;
  /** Book code from the file name, which is what names the book. */
  code: string;
}

/**
 * Where a link to one chapter points: the file the version wrote it in, or, for
 * a chapter it never wrote, only the name that file would carry. A link may be
 * written to either — the second lands unresolved, which the reader may click
 * to write the chapter into being.
 */
export interface ChapterTarget {
  /** Null for the book itself, which is asked for by naming no chapter. */
  chapter: number | null;
  file: TFile | null;
  /** What the link is written against, whether or not a file answers to it. */
  path: string;
}

export interface Verse {
  verse: number;
  text: string;
}

/** One version's take on the current passage, for the sidebar and the picker. */
export interface VersionItem {
  version: string;
  label: string;
  /**
   * Heading the version is listed under, empty for none. Carried on the item
   * rather than looked up again, so the list is drawn from one answer: the
   * order the versions came in is what decides where a heading opens, and a
   * second lookup could disagree with it.
   */
  group: string;
  file: TFile;
  text: string;
  matchedVerse: number | null;
  isCurrent: boolean;
}
