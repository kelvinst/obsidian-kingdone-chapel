import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
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
      reporter: [['text', { skipFull: false }], ['html', {}]],
    },
  },
});
