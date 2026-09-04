/**
 * What counts as a version, and where the plugin is allowed to find one.
 *
 * A version used to be a direct subfolder of one folder, which said that every
 * version had to be filed beside every other one. That is fine while they are
 * all translations, and wrong as soon as they are not: a study Bible is a
 * version verse for verse, but it belongs with the commentaries, not with the
 * translation it is based on.
 *
 * So a folder says so itself, in the note it already keeps. Any note sitting
 * directly in a folder, saying `bible` in its frontmatter and naming a `code`,
 * makes that folder a version, wherever in the vault it is and however deeply
 * it is buried:
 *
 *     ---
 *     bible: true
 *     code: Shedd
 *     group: Editions
 *     name: Bíblia Shedd
 *     ---
 *
 * The `code` is the whole of what makes a file the version's own: a note under
 * that folder belongs to Shedd when it is named `Shedd-41-MRK-014`, and is an
 * ordinary note when it is named anything else. So the folder holds the
 * version without having to hold only the version, and a code has to be
 * written rather than read off the folder's name — a folder can be called what
 * it likes, and the vault root is called nothing at all.
 *
 * `group` is the heading it is listed under, so the grouping is the vault's to
 * name — `Translations`, `Editions`, `Comentários`, anything — rather than a
 * set of kinds this plugin decides on.
 *
 * `complete` says whether the version answers for the whole Bible, and that is
 * the one thing this plugin holds a version back from: a partial one can be
 * read beside every other and walked through like every other, but no link is
 * written to it, because a link to a chapter nobody has written yet is a link
 * to nothing.
 *
 * Left out, where the folder sits answers for it — a translation is the whole
 * of a Bible, and a commentary filed elsewhere is written a book at a time —
 * so the key is only ever written by the folder that is the exception to the
 * company it keeps: `complete: true` on a study Bible that does run end to
 * end, `complete: false` on a draft translation that does not yet.
 *
 * Declaring is not required. The direct subfolders of the translations folder
 * are still versions on their own, headed as translations, so a vault that only
 * holds translations needs none of this and still reads as one list.
 */

import { TFolder } from 'obsidian';
import type { App, TAbstractFile, TFile } from 'obsidian';

/**
 * The key that does the declaring, and the only one this plugin looks for
 * before it has decided a folder is a version at all.
 *
 * It is a key of its own rather than one of the three that describe the
 * version, because every note in the vault is asked and presence is the whole
 * of the question: `code`, `name` and `group` are among the most written keys
 * there are, and reading any of them as the marker would have vaults growing
 * versions they never asked for. One key that means nothing else says it once.
 */
export const SOURCE_KEY = 'bible';

/**
 * The key saying whether the version answers for the whole Bible.
 *
 * Left out, where the folder sits answers for it: one filed in the
 * translations folder is a translation, and a translation is the whole of a
 * Bible; one declared anywhere else is a commentary, a study Bible or a set of
 * notes, and those are written a book at a time. So the common case writes
 * nothing either way, and the key is for the folder that is the exception to
 * the company it keeps.
 */
export const COMPLETE_KEY = 'complete';

/**
 * Whether a note's frontmatter says the folder it sits in is a version.
 *
 * Two things said, and both are needed. `bible` written at all is enough for
 * the first — `bible: true` reads best and is what the create command writes,
 * but a key on its own is a key someone meant, and `bible: false` is the one
 * way to write it and mean no, so a note can turn itself off without the key
 * having to be deleted and remembered.
 *
 * The second is `code`, which the folder cannot answer for. A version is known
 * by what its files are named, and a folder that names no code is a folder
 * with no way of saying which files under it are its own — the vault root
 * above all, whose name is nothing at all, and which would otherwise take
 * every note in the vault for a chapter of a version called ``.
 */
export function declaresSource(front: Record<string, unknown>): boolean {
  return (
    SOURCE_KEY in front &&
    front[SOURCE_KEY] !== false &&
    text(front.code) !== ''
  );
}

/** A folder holding one version's notes, and how it is named and listed. */
export interface Source {
  /** The folder itself, which is what an ancestor walk matches a file against. */
  path: string;
  /**
   * Name the version's files are prefixed with, and the key it is known by
   * everywhere else.
   *
   * It is what says which files under the folder are the version's, so a
   * folder may be called `Almeida Revista e Atualizada` and still hold
   * `ARA-01-GEN-001.md`, and a note under it called anything else is a note
   * rather than a chapter. A declaring note has to write it; a folder that is
   * a version by sitting in the translations folder is named by the folder.
   */
  code: string;
  /** Name to show wherever the version is named. */
  label: string;
  /** Heading it is listed under, empty for none. */
  group: string;
  /**
   * Whether the version answers for the whole Bible, and so whether a link may
   * be written to it.
   *
   * A set of notes covering the four chapters someone has got to is worth
   * reading beside a translation and worth walking through, but it is not
   * worth linking into: `@Sl 1.1` against it writes a link to a file that was
   * never written and may never be. So the two are separated — everything can
   * be read, only a complete version can be pointed at — and a partial one
   * says so once rather than being kept out of the vault's own lists.
   *
   * Where the folder sits decides it unless a note says otherwise: a folder in
   * the translations folder is a translation, and a translation is the whole
   * of a Bible; one declared anywhere else is the sort of thing that is
   * written a book at a time, and is taken as partial until it says it is not.
   */
  complete: boolean;
  /**
   * The note that declared this folder a version, empty for one that is a
   * version by where it sits. It is what says whether a note being edited
   * could have changed the answer, which every other note in the folder —
   * a chapter file in a flat layout, above all — could not.
   */
  declaredBy: string;
}

/**
 * Every version folder in the vault, by its path: the ones that declare
 * themselves, wherever they are, and then the direct subfolders of the
 * translations folder, which are versions by where they sit.
 *
 * Those are headed by `translations` without being asked to say so: the folder
 * they sit in is what says what they are, and having named it once in the
 * settings there is nothing left for each of them to add.
 *
 * Declared ones come first so that a folder inside the translations folder can
 * still name and group itself rather than being taken as a plain one.
 */
export function collectSources(
  app: App,
  translationsFolder: string,
  translations: string,
  files: TFile[] = app.vault.getMarkdownFiles(),
): Map<string, Source> {
  const out = new Map<string, Source>();
  // Read before the notes are, because where a folder sits is what a note in
  // it leaves unsaid: a translation does not have to call itself complete.
  const root = app.vault.getAbstractFileByPath(translationsFolder);
  const children =
    root instanceof TFolder
      ? root.children.filter((c): c is TFolder => c instanceof TFolder)
      : [];
  const filed = new Set(children.map((c) => c.path));

  for (const file of files) {
    const front = app.metadataCache.getFileCache(file)?.frontmatter;
    if (!front || !declaresSource(front)) continue;
    const folder = file.parent;
    if (!folder || out.has(folder.path)) continue;
    out.set(folder.path, declared(folder, front, file.path, filed));
  }

  for (const child of children) {
    if (out.has(child.path)) continue;
    out.set(child.path, {
      path: child.path,
      code: child.name,
      label: child.name,
      group: translations,
      complete: true,
      declaredBy: '',
    });
  }

  return out;
}

/**
 * Read a declaring note's frontmatter, filling in what it leaves out.
 *
 * `bible` and `code` are what a note has to say; the rest it may leave out. A
 * code is a label, so a version naming no `name` is shown as its code, and a
 * folder naming no `group` is listed under no heading, the same as one in no
 * folder the settings name.
 *
 * `complete` is the one key read against where the folder sits rather than
 * against a default: `filed` is the translations folder's own subfolders, and
 * a folder among them is a whole Bible without being asked to say so.
 */
function declared(
  folder: TFolder,
  front: Record<string, unknown>,
  declaredBy: string,
  filed: Set<string>,
): Source {
  const code = text(front.code);
  return {
    path: folder.path,
    code,
    label: text(front.name) || code,
    group: text(front.group),
    complete:
      COMPLETE_KEY in front
        ? front[COMPLETE_KEY] !== false
        : filed.has(folder.path),
    declaredBy,
  };
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * The version a file belongs to: the nearest folder above it that is one.
 *
 * Nearest rather than outermost, so a version filed inside another folder that
 * is itself a version — a translation and the editions built on it, say — is
 * read as its own and not as part of the one holding it.
 */
export function sourceOf(
  sources: Map<string, Source>,
  file: TAbstractFile,
): Source | null {
  for (let dir = file.parent; dir; dir = dir.parent) {
    const source = sources.get(dir.path);
    if (source) return source;
  }
  return null;
}

/**
 * Versions in the order they are listed in: by heading, then by code inside it.
 *
 * Alphabetical both times, which needs nothing written down and reads the way
 * a list of names is expected to. Versions naming no heading sort under the
 * empty one, which is before every other, so they are listed first.
 */
export function sortSources(sources: Source[]): Source[] {
  return sources
    .slice()
    .sort(
      (a, b) => a.group.localeCompare(b.group) || a.code.localeCompare(b.code),
    );
}
