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
 * directly in a folder and saying `bible` in its frontmatter makes that folder
 * a version, wherever in the vault it is and however deeply it is buried:
 *
 *     ---
 *     bible: true
 *     group: Editions
 *     code: Shedd
 *     name: Bíblia Shedd
 *     ---
 *
 * `group` is the heading it is listed under, so the grouping is the vault's to
 * name — `Translations`, `Editions`, `Comentários`, anything — rather than a
 * set of kinds this plugin decides on.
 *
 * `complete: false` says the version does not answer for the whole Bible, and
 * that is the one thing this plugin holds a version back from: it can be read
 * beside every other and walked through like every other, but no link is
 * written to it, because a link to a chapter nobody has written yet is a link
 * to nothing. Left out it is complete, a version normally being the whole of
 * one.
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
 * Whether a note's frontmatter says the folder it sits in is a version.
 *
 * Written at all is enough — `bible: true` reads best and is what the create
 * command writes, but a key on its own is a key someone meant. `bible: false`
 * is the one way to write it and mean no, so a note can turn itself off
 * without the key having to be deleted and remembered.
 */
export function declaresSource(front: Record<string, unknown>): boolean {
  return SOURCE_KEY in front && front[SOURCE_KEY] !== false;
}

/** A folder holding one version's notes, and how it is named and listed. */
export interface Source {
  /** The folder itself, which is what an ancestor walk matches a file against. */
  path: string;
  /**
   * Name the version's files are prefixed with, and the key it is known by
   * everywhere else. The folder's name unless `code` says otherwise, so a
   * folder may be called `Almeida Revista e Atualizada` and still hold
   * `ARA-01-GEN-001.md`.
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
   * True unless a note says otherwise, because a version is normally the whole
   * of one and the exception is the thing worth writing down.
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

  for (const file of files) {
    const front = app.metadataCache.getFileCache(file)?.frontmatter;
    if (!front || !declaresSource(front)) continue;
    const folder = file.parent;
    if (!folder || out.has(folder.path)) continue;
    out.set(folder.path, declared(folder, front, file.path));
  }

  const root = app.vault.getAbstractFileByPath(translationsFolder);
  if (root instanceof TFolder) {
    for (const child of root.children) {
      if (!(child instanceof TFolder) || out.has(child.path)) continue;
      out.set(child.path, {
        path: child.path,
        code: child.name,
        label: child.name,
        group: translations,
        complete: true,
        declaredBy: '',
      });
    }
  }

  return out;
}

/**
 * Read a declaring note's frontmatter, filling in what it leaves out.
 *
 * Every key is optional — the folder's own name is a code, and a code is a
 * label — so the least a folder can say is `bible` and nothing else, and be
 * read entirely off where it sits and what it is called. A folder naming no
 * `group` is listed under no heading, the same as one in no folder the
 * settings name. `complete: false` is the one that has to be written to be
 * true of a folder, since a version is normally the whole of one.
 */
function declared(
  folder: TFolder,
  front: Record<string, unknown>,
  declaredBy: string,
): Source {
  const code = text(front.code) || folder.name;
  return {
    path: folder.path,
    code,
    label: text(front.name) || code,
    group: text(front.group),
    complete: front.complete !== false,
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
