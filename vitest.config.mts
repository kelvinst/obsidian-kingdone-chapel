import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // `obsidian` publishes types and no code, so anything importing it by
    // value — every module that extends one of the app's classes — cannot be
    // loaded outside the app. Point it at a stand-in holding the parts of the
    // app that the plugin's own code touches.
    alias: {
      obsidian: fileURLToPath(new URL('./test/obsidian.ts', import.meta.url)),
    },
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
        // What the modules under test have to hold. They are fully covered,
        // and a change that stops covering one of them is the thing worth
        // hearing about — the whole-project numbers below are too small a
        // fraction to move when a tested file slips.
        'src/{books,reference,utils}.ts': {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        // And what the project as a whole has to hold, which is low because
        // most of it has no tests yet. It is here to be climbed.
        statements: 17.28,
        branches: 22.87,
        functions: 16.25,
        lines: 16.52,
      },
    },
  },
});
