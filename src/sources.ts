/**
 * What counts as a version, and where the plugin is allowed to find one.
 *
 * A version used to be a direct subfolder of the Bible folder, which said that
 * every version had to be filed beside every other one. That is fine while they
 * are all translations, and wrong as soon as they are not: a study Bible is a
 * version verse for verse, but it belongs with the commentaries, not with the
 * translations it is based on.
 *
 * So a folder says so itself, in the note it already keeps. Any note sitting
 * directly in a folder with `bible-source` in its frontmatter makes that folder
 * a version, wherever in the vault it is and however deeply it is buried:
 *
 *     ---
 *     bible-source: Editions
 *     code: Shedd
 *     name: Bíblia Shedd
 *     order: 20
 *     ---
 *
 * The key's own value is the heading the version is listed under, so the
 * grouping is the vault's to name — `Translations`, `Editions`, `Comentários`,
 * anything — rather than a set of kinds this plugin decides on.
 *
 * Declaring is not required. The direct subfolders of the Bible folder are
 * still versions on their own, so a vault that only holds translations needs
 * none of this, and one that declares a folder somewhere else keeps them.
 */

import { TFolder } from 'obsidian';
import type { App, TAbstractFile, TFile } from 'obsidian';

/** Frontmatter key a note uses to say the folder it sits in is a version. */
export const SOURCE_KEY = 'bible-source';

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
  /** Where it sits among the versions sharing its heading. */
  order: number;
}

/**
 * Every version folder in the vault, by its path: the ones that declare
 * themselves, wherever they are, and then the direct subfolders of the Bible
 * folder, which are versions by where they sit.
 *
 * Declared ones come first so that a folder inside the Bible folder can still
 * name and group itself rather than being taken as a plain one.
 */
export function collectSources(
  app: App,
  bibleFolder: string,
  files: TFile[] = app.vault.getMarkdownFiles(),
): Map<string, Source> {
  const out = new Map<string, Source>();

  for (const file of files) {
    const front = app.metadataCache.getFileCache(file)?.frontmatter;
    if (!front || !(SOURCE_KEY in front)) continue;
    const folder = file.parent;
    if (!folder || out.has(folder.path)) continue;
    out.set(folder.path, declared(folder, front));
  }

  const root = app.vault.getAbstractFileByPath(bibleFolder);
  if (root instanceof TFolder) {
    for (const child of root.children) {
      if (!(child instanceof TFolder) || out.has(child.path)) continue;
      out.set(child.path, {
        path: child.path,
        code: child.name,
        label: child.name,
        group: '',
        order: 0,
      });
    }
  }

  return out;
}

/** Read a declaring note's frontmatter, filling in what it leaves out. */
function declared(folder: TFolder, front: Record<string, unknown>): Source {
  // `bible-source: true` is a folder that says it is a version and nothing
  // more; anything written out is the heading it wants to be listed under.
  const code = text(front.code) || folder.name;
  return {
    path: folder.path,
    code,
    label: text(front.name) || code,
    group: text(front[SOURCE_KEY]),
    order: typeof front.order === 'number' ? front.order : 0,
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
 * Versions in the order they are listed in: by heading, then within it.
 *
 * A heading sits where its earliest version puts it, so `order` alone arranges
 * both — numbering the versions numbers the headings they fall under, and a
 * vault that numbers nothing gets them alphabetically. Versions with no heading
 * come first, which is where a vault that declares none of them leaves every
 * version it has.
 */
export function sortSources(sources: Source[]): Source[] {
  const first = new Map<string, number>();
  for (const source of sources) {
    const at = first.get(source.group);
    if (at === undefined || source.order < at)
      first.set(source.group, source.order);
  }
  const rank = (source: Source) => first.get(source.group) ?? 0;

  return sources
    .slice()
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        a.group.localeCompare(b.group) ||
        a.order - b.order ||
        a.code.localeCompare(b.code),
    );
}
