import { describe, expect, it } from 'vitest';

// `collectSources` asks `instanceof TFolder` to tell a folder from a note, so
// these run against the stand-in `obsidian` resolves to under test. The rest
// of a vault reaches them as the plain shapes below.
import { TFolder } from 'obsidian';
import type { App, TAbstractFile } from 'obsidian';

import { collectSources, sortSources, sourceOf } from './sources';
import type { Source } from './sources';

type Folder = TFolder;
type Note = {
  path: string;
  parent: Folder | null;
  front?: Record<string, unknown>;
};

/**
 * A folder at `path`, filed under `parent` the way a vault files one. The
 * app's own is built empty and filled in by the vault, so this fills it.
 */
function folder(path: string, parent: Folder | null = null): Folder {
  const made = new TFolder();
  made.path = path;
  made.name = path.split('/').pop() as string;
  made.parent = parent;
  if (parent) parent.children.push(made);
  return made;
}

/** A note in `parent`, with the frontmatter it was written with, if any. */
function note(
  path: string,
  parent: Folder | null,
  front?: Record<string, unknown>,
): Note {
  const made: Note = { path, parent, front };
  // A note is only ever read for its path, its folder and its frontmatter, so
  // it is written as those three rather than as the whole of a `TFile`.
  if (parent) parent.children.push(made as unknown as TAbstractFile);
  return made;
}

/** Just enough of an app for the two things these functions ask a vault. */
function vault(notes: Note[], root: Folder | null = null): App {
  return {
    vault: {
      getMarkdownFiles: () => notes,
      getAbstractFileByPath: (path: string) =>
        root && root.path === path ? root : null,
    },
    metadataCache: {
      getFileCache: (file: Note) =>
        file.front ? { frontmatter: file.front } : null,
    },
  } as unknown as App;
}

/**
 * `collectSources`, under a fixed heading for the translations folder — which
 * language names it is the plugin's to decide, and not what these are about.
 */
function collect(app: App, translationsFolder: string) {
  return collectSources(app, translationsFolder, 'Translations');
}

function source(over: Partial<Source> = {}): Source {
  return {
    path: 'p',
    code: 'c',
    label: 'c',
    group: '',
    declaredBy: '',
    ...over,
  };
}

describe('collectSources', () => {
  it('takes the folder of a note that declares one', () => {
    const shedd = folder('Igreja/Comentarios/Shedd');
    const found = collect(
      vault([
        note('Igreja/Comentarios/Shedd/Shedd.md', shedd, {
          'bible-group': 'Editions',
        }),
      ]),
      'Igreja/Biblias',
    );

    expect(found.get('Igreja/Comentarios/Shedd')).toEqual({
      path: 'Igreja/Comentarios/Shedd',
      code: 'Shedd',
      label: 'Shedd',
      group: 'Editions',
      declaredBy: 'Igreja/Comentarios/Shedd/Shedd.md',
    });
  });

  it('reads the name and code a declaring note gives', () => {
    const ara = folder('Bibles/Almeida Revista e Atualizada');
    const found = collect(
      vault([
        note('Bibles/Almeida Revista e Atualizada/index.md', ara, {
          'bible-group': ' Translations ',
          'bible-code': ' ARA ',
          'bible-name': ' Almeida Revista e Atualizada ',
        }),
      ]),
      'Bibles',
    );

    expect(found.get('Bibles/Almeida Revista e Atualizada')).toMatchObject({
      code: 'ARA',
      label: 'Almeida Revista e Atualizada',
      group: 'Translations',
    });
  });

  it('leaves a version that names no heading without one', () => {
    const shedd = folder('Notes/Shedd');
    const found = collect(
      vault([
        note('Notes/Shedd/Shedd.md', shedd, {
          'bible-name': 'Shedd',
        }),
      ]),
      'Bibles',
    );

    expect(found.get('Notes/Shedd')).toMatchObject({ group: '' });
  });

  it('ignores a note that says nothing, and one with no frontmatter at all', () => {
    const plain = folder('Journal');
    const found = collect(
      vault([
        note('Journal/monday.md', plain),
        note('Journal/tuesday.md', plain, { tags: ['prayer'] }),
      ]),
      'Bibles',
    );

    expect(found.size).toBe(0);
  });

  it('ignores a declaring note that is in no folder at all', () => {
    const found = collect(
      vault([note('loose.md', null, { 'bible-group': 'Editions' })]),
      'Bibles',
    );

    expect(found.size).toBe(0);
  });

  it('keeps the first of two notes declaring the one folder', () => {
    const shedd = folder('Notes/Shedd');
    const found = collect(
      vault([
        note('Notes/Shedd/Shedd.md', shedd, { 'bible-group': 'Editions' }),
        note('Notes/Shedd/also.md', shedd, { 'bible-group': 'Notes' }),
      ]),
      'Bibles',
    );

    expect(found.get('Notes/Shedd')).toMatchObject({ group: 'Editions' });
  });

  it("heads the translations folder's own subfolders as translations", () => {
    const bibles = folder('Bibles');
    folder('Bibles/ARA', bibles);
    folder('Bibles/NVI', bibles);
    const found = collect(vault([], bibles), 'Bibles');

    expect([...found.keys()]).toEqual(['Bibles/ARA', 'Bibles/NVI']);
    expect(found.get('Bibles/ARA')).toEqual({
      path: 'Bibles/ARA',
      code: 'ARA',
      label: 'ARA',
      group: 'Translations',
      declaredBy: '',
    });
  });

  it('skips a loose note sitting in the translations folder itself', () => {
    const bibles = folder('Bibles');
    const readme = note('Bibles/README.md', bibles);
    const found = collect(vault([readme], bibles), 'Bibles');

    expect(found.size).toBe(0);
  });

  it('lets a folder inside the translations folder still name itself', () => {
    const bibles = folder('Bibles');
    const ara = folder('Bibles/ARA', bibles);
    const found = collect(
      vault(
        [note('Bibles/ARA/ARA.md', ara, { 'bible-group': 'Translations' })],
        bibles,
      ),
      'Bibles',
    );

    expect(found.get('Bibles/ARA')).toMatchObject({ group: 'Translations' });
  });

  it('finds nothing where the translations folder is not a folder', () => {
    expect(collect(vault([]), 'Bibles').size).toBe(0);
  });
});

describe('sourceOf', () => {
  const sources = new Map<string, Source>([
    ['Bibles/ARA', source({ path: 'Bibles/ARA', code: 'ARA' })],
    ['Bibles/ARA/Study', source({ path: 'Bibles/ARA/Study', code: 'Study' })],
  ]);

  /** A file, however deep, as the walk up from it sees it. */
  function at(...names: string[]): TAbstractFile {
    let dir: Folder | null = null;
    for (const name of names)
      dir = folder(dir ? `${dir.path}/${name}` : name, dir);
    return { parent: dir } as unknown as TAbstractFile;
  }

  it('finds the version a file is filed under, however deep', () => {
    expect(sourceOf(sources, at('Bibles', 'ARA', '1-OT-Law'))).toMatchObject({
      code: 'ARA',
    });
  });

  it('takes the nearest version rather than the one holding it', () => {
    expect(sourceOf(sources, at('Bibles', 'ARA', 'Study'))).toMatchObject({
      code: 'Study',
    });
  });

  it('answers with nothing for a file in no version', () => {
    expect(sourceOf(sources, at('Journal'))).toBeNull();
  });
});

describe('sortSources', () => {
  const codes = (sorted: Source[]) => sorted.map((s) => s.code);

  it('names the headings apart', () => {
    const sorted = sortSources([
      source({ code: 'Shedd', group: 'Editions' }),
      source({ code: 'Kelvin', group: 'Comentários' }),
    ]);

    expect(codes(sorted)).toEqual(['Kelvin', 'Shedd']);
  });

  it('lists versions with no heading first', () => {
    const sorted = sortSources([
      source({ code: 'Shedd', group: 'Editions' }),
      source({ code: 'ARA' }),
    ]);

    expect(codes(sorted)).toEqual(['ARA', 'Shedd']);
  });

  it('orders the versions under one heading by their code', () => {
    const sorted = sortSources([
      source({ code: 'NVI', group: 'Translations' }),
      source({ code: 'ARA', group: 'Translations' }),
    ]);

    expect(codes(sorted)).toEqual(['ARA', 'NVI']);
  });

  it('leaves what it was given alone', () => {
    const given = [source({ code: 'NVI' }), source({ code: 'ACF' })];
    sortSources(given);

    expect(codes(given)).toEqual(['NVI', 'ACF']);
  });
});
