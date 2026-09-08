/**
 * Reading the whole vault for what is wrong with it, without stopping it.
 *
 * `Diagnostics` answers about a chapter it is handed and never goes looking:
 * every rule that matters needs the file's own text, and a vault of six
 * thousand notes read in one turn is an interface that stops responding while
 * it happens. This is what goes looking, in chunks, giving the turn back
 * between them, so what is found arrives while the reader carries on.
 *
 * It runs once a session, started when the metadata cache first settles. That
 * is a decision about honesty rather than about cost: what is found is never
 * written down, because a vault edited while the plugin was unloaded — a sync,
 * a pull — tells nobody it changed, and a saved answer would be wrong exactly
 * where it would be trusted. Read again each launch, and it cannot lie.
 */

import type { TFile } from 'obsidian';

import type { Diagnostic } from './diagnostics';
import type KingdoneChapelPlugin from './main';

/** How far along a sweep is, out of a total known before it starts. */
export interface SweepProgress {
  /** Chapters read so far. */
  done: number;
  /** Chapters there are to read, counted from the index before the first. */
  total: number;
}

/** How many chapters are read before the interface is given a turn. */
const CHUNK = 25;

/** One pass over every chapter the vault's versions hold. */
export class Sweep {
  /** Whether it was called off, which is asked before every file. */
  private cancelled = false;

  constructor(
    private plugin: KingdoneChapelPlugin,
    private chunk = CHUNK,
  ) {}

  /**
   * Read every chapter, a chunk at a time, and answer with what is known.
   *
   * The total comes from the index, which is built from file names alone, so
   * it is known before a single file is read and a progress bar has something
   * to draw from the start rather than filling in as it goes.
   *
   * What comes back is everything the model holds, not only what this pass
   * read: a sweep that is called off half way still answers, with the half it
   * got to, and that is the answer the sidebar shows either way.
   */
  async run(onProgress?: (at: SweepProgress) => void): Promise<Diagnostic[]> {
    const files = this.files();
    const total = files.length;
    let done = 0;
    onProgress?.({ done, total });

    for (const file of files) {
      if (this.cancelled) break;
      // A file that cannot be read is a file with nothing to say about it: one
      // unreadable chapter is no reason to leave the rest of the vault unread.
      await this.plugin.diagnostics.ofChapter(file).catch(() => []);
      done += 1;
      onProgress?.({ done, total });
      if (done % this.chunk === 0) await turn();
    }

    return this.plugin.diagnostics.all();
  }

  /** Stop before the next file, for an unload or a sweep started over. */
  cancel() {
    this.cancelled = true;
  }

  /**
   * Whether it was called off, which is what its answer is worth knowing by.
   *
   * A cancelled sweep answers like any other, with what the model holds, and
   * nothing in the rows says how much of the vault they were read from. This
   * is what says it: a count named over half a vault names fewer problems
   * than the vault has, which is worse than naming none.
   */
  get stopped(): boolean {
    return this.cancelled;
  }

  /**
   * Every chapter to read, the version in front of the reader first.
   *
   * Which version that is decides what is answered first and nothing else:
   * the whole vault is read either way. It is the note on screen that a reader
   * is about to copy, or is reading a broken verse of, so its answer is the
   * one worth having in the first second rather than the sixtieth.
   */
  private files(): TFile[] {
    const first = this.versionInFront();
    const wanted: TFile[] = [];
    const rest: TFile[] = [];
    for (const [version, chapters] of this.plugin.index()) {
      const into = version === first ? wanted : rest;
      into.push(...chapters.values());
    }
    return [...wanted, ...rest];
  }

  /** The version of the note in front, or null when it is in none. */
  private versionInFront(): string | null {
    const file = this.plugin.app.workspace.getActiveFile();
    const source = file ? this.plugin.sourceFor(file) : null;
    return source ? source.code : null;
  }
}

/** A turn given back to the interface, which draws before the next chunk. */
function turn(): Promise<void> {
  return new Promise((done) => window.setTimeout(done, 0));
}
