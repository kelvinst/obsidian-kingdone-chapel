import { Modal, Setting } from 'obsidian';
import type { App } from 'obsidian';

import { passageLabel } from './reference';
import { ReferenceInputSuggest } from './suggest-input';
import type { RefSuggestion } from './suggest-rows';
import type { ChapterPane } from './main';
import type KingdoneChapelPlugin from './main';

/**
 * Asking which reference goes on a selection of verses.
 *
 * A refs aside is written into the verse it belongs to, so a reference meant
 * for three of them has nowhere in the chapter to be typed: there is no one
 * line that is all three. It is asked here instead, once, in a field that
 * works the way typing `@` in the chapter does — the same rows, the same text
 * written — and the answer goes into every verse of the selection.
 */
export class WriteRefsModal extends Modal {
  plugin: KingdoneChapelPlugin;
  target: ChapterPane;
  verses: number[];
  /** The popup on the field, which is the whole of what the modal asks. */
  suggest: ReferenceInputSuggest | null = null;

  constructor(
    app: App,
    plugin: KingdoneChapelPlugin,
    target: ChapterPane,
    verses: number[],
  ) {
    super(app);
    this.plugin = plugin;
    this.target = target;
    this.verses = verses;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h3', {
      text: `Write the refs on ${passageLabel(
        this.target.book,
        this.target.chapter,
        this.verses,
      )}`,
    });

    new Setting(contentEl)
      .setName('Reference')
      .setDesc(
        'The reference every verse of the selection is given. Type it the ' +
          'way you would after an `@` in the chapter, and pick the row that ' +
          'writes what you meant.',
      )
      .addText((text) => {
        text.setPlaceholder('João 14.12');
        this.suggest = new ReferenceInputSuggest(
          this.app,
          this.plugin,
          text.inputEl,
          this.target.view.file,
          (item) => this.write(item),
        );
        // The field is the only thing here to answer, so it is where the
        // typing starts: the modal opens straight into the question.
        text.inputEl.focus();
      });
  }

  onClose() {
    this.contentEl.empty();
  }

  /** The row picked, written on every verse the selection covered. */
  write(item: RefSuggestion) {
    this.close();
    this.plugin.writeRefsOn(this.target, this.verses, item);
  }
}
