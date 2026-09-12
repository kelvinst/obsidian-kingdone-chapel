import { AbstractInputSuggest } from 'obsidian';
import type { App, TFile } from 'obsidian';

import { ReferenceRows, renderRow } from './suggest-rows';
import type { RefSuggestion, Row } from './suggest-rows';
import type KingdoneChapelPlugin from './main';

/** Said when a reference is asked for embedded, which a refs aside never is. */
const NO_EMBEDS: Row = {
  hint: 'A refs aside names a passage rather than embedding it — drop the `!`',
};

/** What picking a row does, for whoever put the field on the page. */
export type Chose = (
  item: RefSuggestion,
  evt: MouseEvent | KeyboardEvent,
) => void;

/**
 * The reference popup hosted on a plain input, for asking a reference away
 * from the line it will be written on.
 *
 * The same rows the editor's `@` offers, read the same way and drawn the same:
 * the field *is* the reference, so what would be typed after the `@` is the
 * whole of what is typed here. Nothing stands in front of it, so a book is
 * never carried on from the line before — the numbers fall to the books, which
 * is what `RowContext.before` being empty says.
 */
export class ReferenceInputSuggest extends AbstractInputSuggest<Row> {
  rows: ReferenceRows;
  /** The note the reference goes into, which links are shortened against. */
  file: TFile | null;
  chose: Chose;

  constructor(
    app: App,
    plugin: KingdoneChapelPlugin,
    input: HTMLInputElement,
    file: TFile | null,
    chose: Chose,
  ) {
    super(app, input);
    this.rows = new ReferenceRows(plugin);
    this.file = file;
    this.chose = chose;
  }

  getSuggestions(query: string): Promise<Row[]> {
    // An empty field is not half a reference, it is no question yet: the
    // editor's popup opens on the first letter after the `@` and this opens on
    // the first letter typed at all.
    if (!query.trim()) return Promise.resolve([]);
    // The one row the editor offers that a refs aside has no use for. A refs
    // list names what a verse refers to; the passage itself belongs where it
    // was written, and a verse embedded into the aside of another is the
    // chapter saying itself twice. Said rather than silently read as a link:
    // the `!` was typed on purpose.
    if (query.trimStart().startsWith('!')) return Promise.resolve([NO_EMBEDS]);
    return this.rows.getSuggestions({ query, file: this.file, before: '' });
  }

  renderSuggestion(item: Row, el: HTMLElement) {
    renderRow(item, el);
  }

  selectSuggestion(item: Row, evt: MouseEvent | KeyboardEvent) {
    // A hint says why a query found nothing. There is nothing to take from it,
    // so the field is left as it was typed and the popup stays open.
    if ('hint' in item) return;
    this.close();
    this.chose(item, evt);
  }
}
