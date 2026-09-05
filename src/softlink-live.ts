import { Decoration, ViewPlugin, WidgetType } from '@codemirror/view';
import type {
  DecorationSet,
  EditorView,
  PluginValue,
  ViewUpdate,
} from '@codemirror/view';
import type { EditorState, Extension, Range } from '@codemirror/state';
import { editorInfoField } from 'obsidian';
import type { App } from 'obsidian';

import { softLinksIn } from './softlink';
import type { SoftLink } from './softlink';
import { linkEl } from './softlink-read';

/**
 * The links a note draws while it is being written.
 *
 * A markdown post-processor never runs in live preview — what is on screen
 * there is the source itself, drawn by CodeMirror — so `softlink-read.ts`
 * leaves the editor showing every token raw. This puts the same anchor on the
 * page in its place, and hands the token back the moment the cursor arrives,
 * which is the moment it is wanted: a link nobody can put their cursor into is
 * a link nobody can edit.
 *
 * The anchor is `softlink-read.ts`'s, click and hover and all. One link is
 * built one way, so the two views can never drift into behaving differently.
 */

/** A line opening or closing a code block, where a token is only text. */
const CODE_BLOCK = /^\s*(?:```|~~~)/;

/** What a line says once its quote markers are taken off. */
function unquoted(text: string): string {
  return text.replace(/^(\s*>)+\s?/, '');
}

/**
 * Blank out inline code, keeping every other character where it was.
 *
 * The stand-in is as long as what it replaces, so a token's place in the line is
 * still its place after masking, and `` `((a|1))` `` is a token the note is
 * showing rather than one it is drawing.
 */
function mask(text: string): string {
  return text.replace(/`[^`\n]*`/g, (found) => '￼'.repeat(found.length));
}

/** Whether anything is selected, or the cursor sits, within `from`-`to`. */
function touched(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some((r) => r.from <= to && r.to >= from);
}

/** The anchor standing in for a token, drawn where the token was written. */
export class SoftLinkWidget extends WidgetType {
  constructor(
    readonly link: SoftLink,
    readonly app: App,
    readonly sourcePath: string,
  ) {
    super();
  }

  /**
   * Two widgets are the same where they would draw the same link in the same
   * note. Without this the editor rebuilds every anchor on every keystroke,
   * and a preview open over one is dismissed as its element is replaced.
   */
  eq(other: SoftLinkWidget): boolean {
    return (
      other.link.path === this.link.path &&
      other.link.text === this.link.text &&
      other.sourcePath === this.sourcePath
    );
  }

  toDOM(view: EditorView): HTMLElement {
    return linkEl(view.dom.ownerDocument, this.app, this.link, this.sourcePath);
  }

  /** A click is the link's business, not the editor's cursor placement. */
  ignoreEvent(): boolean {
    return false;
  }
}

/**
 * Every decoration the tokens ask for, over what `visible` covers.
 *
 * A token is one line's business — it cannot reach past a newline — so unlike a
 * mark this walks lines rather than blocks, and needs no notion of where a
 * paragraph ends. A quote's markers are taken off before the line is read, so a
 * token written three callouts deep in a book note is read like any other.
 */
export function build(
  state: EditorState,
  visible: readonly { from: number; to: number }[],
  app: App,
  sourcePath: string,
): DecorationSet {
  const into: Range<Decoration>[] = [];
  let code = false;
  let codeDepth = 0;

  for (let number = 1; number <= state.doc.lines; number++) {
    const line = state.doc.line(number);
    const said = unquoted(line.text);
    const quoted = (
      line.text.slice(0, line.text.length - said.length).match(/>/g) ?? []
    ).length;

    // A code block ends on a fence written as deep as the one that opened it.
    if (CODE_BLOCK.test(said) && (!code || quoted === codeDepth)) {
      code = !code;
      codeDepth = quoted;
      continue;
    }
    if (code) continue;
    // A note is drawn a screenful at a time; the rest of it is not worth
    // reading. The fences above are, a block opening off screen still holding
    // what is on it.
    if (
      !visible.some((range) => range.from <= line.to && range.to >= line.from)
    ) {
      continue;
    }

    for (const link of softLinksIn(mask(line.text), line.from)) {
      // Inside the token, the token is what is being edited.
      if (touched(state, link.from, link.to)) continue;
      into.push(
        Decoration.replace({
          widget: new SoftLinkWidget(link, app, sourcePath),
        }).range(link.from, link.to),
      );
    }
  }

  return Decoration.set(into, true);
}

/** What the editor is given: the decorations, kept up with what it shows. */
export class LiveSoftLinks implements PluginValue {
  decorations: DecorationSet;

  constructor(
    readonly view: EditorView,
    readonly app: App,
  ) {
    this.decorations = build(view.state, view.visibleRanges, app, this.path());
  }

  /**
   * The note being written, which is what a relative target is resolved
   * against and what a preview is opened from. An editor detached from any
   * file — one built by a test, or a pane still loading — resolves from the
   * vault root, which is where a link with nowhere to start looks first.
   */
  path(): string {
    return this.view.state.field(editorInfoField, false)?.file?.path ?? '';
  }

  update(update: ViewUpdate) {
    // The selection among them: a token comes back when the cursor arrives and
    // is drawn again when it leaves.
    if (update.docChanged || update.selectionSet || update.viewportChanged) {
      this.decorations = build(
        update.view.state,
        update.view.visibleRanges,
        this.app,
        this.path(),
      );
    }
  }
}

export function liveSoftLinks(app: App): Extension {
  return ViewPlugin.define((view) => new LiveSoftLinks(view, app), {
    decorations: (links) => links.decorations,
  });
}
