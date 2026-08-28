import type { TFile } from 'obsidian';

import type { Lang } from './books';

export const VIEW_TYPE = 'kingdone-chapel-view';

export interface KingdoneChapelSettings {
  bibleFolder: string;
  /** Version `@` references link to when they do not name one. Empty = pick one. */
  defaultVersion: string;
  /**
   * Language book names are read and written in, throughout the plugin. Empty
   * reads every language, and writes the first of them.
   */
  language: Lang | '';
  openInNewTab: boolean;
  hiddenVersions: string[];
  labels: Record<string, string>;
  showCurrentVersion: boolean;
  followCursor: boolean;
  openSidebarOnStart: boolean;
}

export const DEFAULT_SETTINGS: KingdoneChapelSettings = {
  bibleFolder: 'Bibles',
  defaultVersion: '',
  language: '',
  openInNewTab: false,
  hiddenVersions: [],
  labels: {},
  showCurrentVersion: false,
  followCursor: true,
  openSidebarOnStart: false,
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

export interface Verse {
  verse: number;
  text: string;
}

/** One version's take on the current passage, for the sidebar and the picker. */
export interface VersionItem {
  version: string;
  label: string;
  file: TFile;
  text: string;
  matchedVerse: number | null;
  isCurrent: boolean;
}
