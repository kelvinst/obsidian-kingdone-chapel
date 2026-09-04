import { Modal, Notice, Setting } from 'obsidian';
import type { App } from 'obsidian';

import { nameLang } from './books';
import { nextNoteNumber } from './notes';
import type { NoteKind } from './notes';
import type { NoteTarget } from './main';
import type KingdoneChapelPlugin from './main';

/**
 * Asking which note is being written, and which number it takes.
 *
 * Two answers, and only one of them is ever typed. The kind is picked from the
 * list the vault keeps; the number is offered — one past the highest of that
 * kind the chapter carries — and stands unless the note being copied in has a
 * number of its own, which is the case a printed commentary brings.
 */
export class WriteNoteModal extends Modal {
  plugin: KingdoneChapelPlugin;
  target: NoteTarget;
  kind: NoteKind;
  number: number;
  /** Whether the number has been typed, and so stopped following the kind. */
  numbered = false;
  numberField: HTMLInputElement | null = null;

  constructor(app: App, plugin: KingdoneChapelPlugin, target: NoteTarget) {
    super(app);
    this.plugin = plugin;
    this.target = target;
    this.kind = plugin.noteKinds()[0];
    this.number = this.next(this.kind);
  }

  /**
   * The number the chapter has going spare for a kind, read off the chapter as
   * it stands: the command may have been offered long before it was run.
   */
  next(kind: NoteKind): number {
    const editor = this.target.view.editor;
    return nextNoteNumber(editor.getValue(), this.target.prefix, kind.letter);
  }

  /** What a kind is called, in the language the plugin writes. */
  title(kind: NoteKind): string {
    return kind.titles[nameLang(this.plugin.settings.language)] || kind.callout;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h3', { text: 'Write a note' });

    new Setting(contentEl)
      .setName('Kind')
      .setDesc('Which note this is, of the ones this vault writes.')
      .addDropdown((drop) => {
        for (const [at, kind] of this.plugin.noteKinds().entries()) {
          drop.addOption(String(at), this.title(kind));
        }
        drop.setValue('0').onChange((value) => {
          this.kind = this.plugin.noteKinds()[Number(value)];
          // The number follows the kind until it is written over: each kind
          // numbers its own notes, so picking another kind asks another
          // question of the chapter.
          if (!this.numbered && this.numberField) {
            this.number = this.next(this.kind);
            this.numberField.value = String(this.number);
          }
        });
      });

    new Setting(contentEl)
      .setName('Number')
      .setDesc(
        'What the note is numbered, in its title and in its anchor. The next ' +
          'one free, until you say otherwise — a commentary copied in keeps ' +
          'the numbering it was printed with.',
      )
      .addText((text) => {
        this.numberField = text.inputEl;
        text.setValue(String(this.number)).onChange((value) => {
          this.number = Number(value.trim());
          this.numbered = value.trim() !== '';
        });
      });

    new Setting(contentEl).addButton((button) =>
      button
        .setButtonText('Write')
        .setCta()
        .onClick(() => this.write()),
    );

    // Two fields and a button, both fields answered before the modal opened:
    // Enter is what a reader presses next, wherever the focus happens to be.
    // A key still being composed is part of typing the number, not an answer.
    contentEl.addEventListener('keydown', (evt) => {
      if (evt.key !== 'Enter' || evt.isComposing) return;
      evt.preventDefault();
      this.write();
    });
  }

  onClose() {
    this.contentEl.empty();
  }

  write() {
    if (!Number.isInteger(this.number) || this.number < 1) {
      new Notice('A note is numbered from 1 up.');
      return;
    }
    this.close();
    this.plugin.writeNote(this.target, this.kind, this.number);
  }
}
