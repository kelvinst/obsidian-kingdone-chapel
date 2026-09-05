/**
 * What the stub keeps on top of Obsidian's own API, so a test can read it back.
 *
 * The source is type-checked against the real declarations, and the tests hold
 * the same objects — so anything the stub records for a test to assert on is
 * invisible to them. Rather than casting at every use, the additions are named
 * here once. Nothing in `src` may reach for them: they exist only where the
 * app itself would otherwise have to be watched.
 */
import 'obsidian';

declare module 'obsidian' {
  interface Component {
    /** What `register` was handed, which unloading runs. */
    _cleanups: (() => void)[];
  }

  interface Plugin {
    /** Everything `addCommand` was given, newest last. */
    commands: Command[];
    views: Map<string, (leaf: unknown) => unknown>;
    settingTabs: PluginSettingTab[];
    suggests: unknown[];
    ribbons: { icon: string; title: string; callback: () => void }[];
    /** What `saveData` last wrote, which `loadData` reads back. */
    data: unknown;
    /** Every markdown post-processor `registerMarkdownPostProcessor` was given. */
    postProcessors: ((el: HTMLElement, ctx: never) => unknown)[];
    /** Every CodeMirror extension `registerEditorExtension` was given. */
    editorExtensions: unknown[];
  }

  interface Modal {
    opened: boolean;
  }

  interface SuggestModal<T> {
    placeholder: string;
    instructions: Instruction[];
  }

  interface EditorSuggest<T> {
    instructions: Instruction[];
  }

  interface MarkdownView {
    /** Which of the two the pane is showing, as `getMode` reports it. */
    mode: 'source' | 'preview';
  }
}
