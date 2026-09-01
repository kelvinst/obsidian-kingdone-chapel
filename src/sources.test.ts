import { describe, expect, it, vi } from 'vitest';

// `collectSources` asks `instanceof TFolder` to tell a folder from a note, so
// it needs a TFolder to measure against. That is the whole of Obsidian these
// functions touch — the rest of a vault reaches them as the plain shapes below.
vi.mock('obsidian', () => {
  class TFolder {
    children: unknown[] = [];
    parent: TFolder | null = null;
    path: string;
    name: string;
    constructor(path: string) {
      this.path = path;
      this.name = path.split('/').pop() as string;
    }
  }
  return { TFolder };
});

import { TFolder } from 'obsidian';
import type { App, TAbstractFile } from 'obsidian';

import { SOURCE_KEY, collectSources, sortSources, sourceOf } from './sources';
import type { Source } from './sources';

type Folder = TFolder & { children: unknown[]; parent: Folder | null };
type Note = {
  path: string;
  parent: Folder | null;
  front?: Record<string, unknown>;
};

const Ctor = TFolder as unknown as new (path: string) => Folder;

/** A folder at `path`, filed under `parent` the way a vault files one. */
function folder(path: string, parent: Folder | null = null): Folder {
  const made = new Ctor(path);
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
  if (parent) parent.children.push(made);
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

function source(over: Partial<Source> = {}): Source {
  return {
    path: 'p',
    code: 'c',
    label: 'c',
    group: '',
    order: 0,
    declaredBy: '',
    ...over,
  };
}

describe('collectSources', () => {
  it('takes the folder of a note that declares one', () => {
    const shedd = folder('Igreja/Comentarios/Shedd');
    const found = collectSources(
      vault([
        note('Igreja/Comentarios/Shedd/Shedd.md', shedd, {
          [SOURCE_KEY]: 'Editions',
        }),
      ]),
      'Igreja/Biblias',
    );

    expect(found.get('Igreja/Comentarios/Shedd')).toEqual({
      path: 'Igreja/Comentarios/Shedd',
      code: 'Shedd',
      label: 'Shedd',
      group: 'Editions',
      order: 0,
      declaredBy: 'Igreja/Comentarios/Shedd/Shedd.md',
    });
  });

  it('reads the name, code and order a declaring note gives', () => {
    const ara = folder('Bibles/Almeida Revista e Atualizada');
    const found = collectSources(
      vault([
        note('Bibles/Almeida Revista e Atualizada/index.md', ara, {
          [SOURCE_KEY]: ' Translations ',
          code: ' ARA ',
          name: ' Almeida Revista e Atualizada ',
          order: 10,
        }),
      ]),
      'Bibles',
    );

    expect(found.get('Bibles/Almeida Revista e Atualizada')).toMatchObject({
      code: 'ARA',
      label: 'Almeida Revista e Atualizada',
      group: 'Translations',
      order: 10,
    });
  });

  it('leaves a version that names no heading without one', () => {
    const shedd = folder('Notes/Shedd');
    const found = collectSources(
      vault([
        note('Notes/Shedd/Shedd.md', shedd, {
          [SOURCE_KEY]: true,
          order: 'soon',
        }),
      ]),
      'Bibles',
    );

    expect(found.get('Notes/Shedd')).toMatchObject({ group: '', order: 0 });
  });

  it('ignores a note that says nothing, and one with no frontmatter at all', () => {
    const plain = folder('Journal');
    const found = collectSources(
      vault([
        note('Journal/monday.md', plain),
        note('Journal/tuesday.md', plain, { tags: ['prayer'] }),
      ]),
      'Bibles',
    );

    expect(found.size).toBe(0);
  });

  it('ignores a declaring note that is in no folder at all', () => {
    const found = collectSources(
      vault([note('loose.md', null, { [SOURCE_KEY]: 'Editions' })]),
      'Bibles',
    );

    expect(found.size).toBe(0);
  });

  it('keeps the first of two notes declaring the one folder', () => {
    const shedd = folder('Notes/Shedd');
    const found = collectSources(
      vault([
        note('Notes/Shedd/Shedd.md', shedd, { [SOURCE_KEY]: 'Editions' }),
        note('Notes/Shedd/also.md', shedd, { [SOURCE_KEY]: 'Notes' }),
      ]),
      'Bibles',
    );

    expect(found.get('Notes/Shedd')).toMatchObject({ group: 'Editions' });
  });

  it('takes the direct subfolders of the Bible folder as versions too', () => {
    const bibles = folder('Bibles');
    folder('Bibles/ARA', bibles);
    folder('Bibles/NVI', bibles);
    const found = collectSources(vault([], bibles), 'Bibles');

    expect([...found.keys()]).toEqual(['Bibles/ARA', 'Bibles/NVI']);
    expect(found.get('Bibles/ARA')).toEqual({
      path: 'Bibles/ARA',
      code: 'ARA',
      label: 'ARA',
      group: '',
      order: 0,
      declaredBy: '',
    });
  });

  it('skips a loose note sitting in the Bible folder itself', () => {
    const bibles = folder('Bibles');
    const readme = note('Bibles/README.md', bibles);
    const found = collectSources(vault([readme], bibles), 'Bibles');

    expect(found.size).toBe(0);
  });

  it('lets a folder inside the Bible folder still name itself', () => {
    const bibles = folder('Bibles');
    const ara = folder('Bibles/ARA', bibles);
    const found = collectSources(
      vault(
        [note('Bibles/ARA/ARA.md', ara, { [SOURCE_KEY]: 'Translations' })],
        bibles,
      ),
      'Bibles',
    );

    expect(found.get('Bibles/ARA')).toMatchObject({ group: 'Translations' });
  });

  it('finds nothing where the Bible folder is not a folder', () => {
    expect(collectSources(vault([]), 'Bibles').size).toBe(0);
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

  it('puts a heading where its earliest version puts it', () => {
    const sorted = sortSources([
      source({ code: 'Shedd', group: 'Editions', order: 20 }),
      source({ code: 'ARA', group: 'Translations', order: 10 }),
    ]);

    expect(codes(sorted)).toEqual(['ARA', 'Shedd']);
  });

  it('names the headings apart when they start level', () => {
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

  it('orders the versions under one heading by their own number', () => {
    const sorted = sortSources([
      source({ code: 'NVI', group: 'Translations', order: 2 }),
      source({ code: 'ARA', group: 'Translations', order: 1 }),
    ]);

    expect(codes(sorted)).toEqual(['ARA', 'NVI']);
  });

  it('falls back to the name where nothing is numbered', () => {
    const sorted = sortSources([
      source({ code: 'NVI' }),
      source({ code: 'ACF' }),
    ]);

    expect(codes(sorted)).toEqual(['ACF', 'NVI']);
  });

  it('leaves what it was given alone', () => {
    const given = [source({ code: 'NVI' }), source({ code: 'ACF' })];
    sortSources(given);

    expect(codes(given)).toEqual(['NVI', 'ACF']);
  });
});
