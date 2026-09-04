import { fileURLToPath } from 'node:url';

import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // `obsidian` publishes types and no code, so anything importing it by
    // value — every module that extends one of the app's classes — cannot be
    // loaded outside the app. Point it at a stand-in holding the parts of the
    // app that the plugin's own code touches.
    alias: {
      obsidian: fileURLToPath(new URL('./test/obsidian.ts', import.meta.url)),
    },
    // And the DOM helpers Obsidian installs on the prototypes, which are no
    // part of the module and so cannot come from the stand-in. A no-op under
    // `node`, where the pure modules are tested and there is no DOM to extend.
    setupFiles: ['./test/dom.ts'],
    // A git worktree checked out under the repo is another copy of this
    // project, with its own tests answering to its own source. Running them
    // from here reads as this suite failing, which is a branch nobody is on.
    exclude: [...configDefaults.exclude, '**/worktrees/**', '**/.worktrees/**'],
    coverage: {
      provider: 'v8',
      // Every source file, not only the ones a test happened to import — a
      // module nothing covers reads as 0%, rather than as nothing at all.
      include: ['src/**/*.ts'],
      // Type-only modules compile to nothing, so they have no lines to cover
      // and would sit at 0% forever.
      exclude: ['src/types.ts'],
      // A file at 100% is left out of the table by default when the suite is
      // run by an AI agent, which reads the same as a file with no tests at
      // all. Both belong in it. The option has to be the reporter's own: the
      // one on `coverage` is the loser of that override.
      reporter: [
        ['text', { skipFull: false }],
        ['html', {}],
      ],
      thresholds: {
        // The numbers below are raised to whatever the run reached whenever it
        // reaches higher, so coverage is a floor that only ever goes up. A run
        // that improves them rewrites this file: commit that with the tests
        // that earned it.
        autoUpdate: true,
        // What the parsing the plugin is built on has to hold. It is named on
        // its own so that a change stopping covering one of these three is
        // answered for by the file it is in, rather than by a whole-project
        // number that any other file could just as well have moved.
        'src/{books,create,reference,sources,utils}.ts': {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        // And what the project as a whole has to hold. Every module is covered
        // now, so this is close to the ceiling: what the branches still fall
        // short of are the fallbacks guarding states a stubbed Obsidian cannot
        // be put into.
        statements: 100,
        branches: 98.89,
        functions: 100,
        lines: 100,
      },
    },
  },
});
