/**
 * What `obsidian` is at test time. The published package ships types and no
 * code, so a module importing anything from it by value cannot be loaded
 * outside the app at all — this stands in for the app, and holds only the
 * parts of it the plugin's own code reaches for.
 */

/** Keys a popup asked to be told about, in the order they were registered. */
export interface Registered {
  modifiers: string[] | null;
  key: string;
  handler: (evt: KeyboardEvent) => boolean | void;
}

/**
 * The base every editor popup extends. Obsidian's own does the popup — the
 * element, the rows, the keys — and none of that is what the plugin's code
 * says, so it is left out and only what that code touches is kept.
 */
export class EditorSuggest<T> {
  app: unknown;
  context: unknown = null;
  limit = 0;
  instructions: unknown[] = [];
  scope = {
    register: (
      modifiers: string[] | null,
      key: string,
      handler: (evt: KeyboardEvent) => boolean | void,
    ) => {
      this.registered.push({ modifiers, key, handler });
    },
  };
  /** Every key the popup registered, for a test to press one of them. */
  registered: Registered[] = [];

  constructor(app: unknown) {
    this.app = app;
  }

  setInstructions(instructions: unknown[]) {
    this.instructions = instructions;
  }
}
