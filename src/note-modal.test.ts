// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TFile } from 'obsidian';

import { clearNotices, notices } from '../test/obsidian';
import {
  FakeEditor,
  chapter,
  chapterPath,
  editorOf,
  harness,
  pane,
} from '../test/harness';
import type { Harness } from '../test/harness';
import { WriteNoteModal } from './note-modal';
import type { NoteTarget } from './main';

const vault = {
  ...chapter('NVI', 1, 'GEN', 1, ['No princípio', 'Era a terra']),
};

/** A chapter of a version, as the generator writes one, with a note in it. */
const CHAPTER =
  '# Gênesis 1 - NVI\n\n' +
  '![[ARA-01-GEN-001#^ara-gen-1-1|flat]]\n^nvi-gen-1-1\n\n' +
  '## Notas\n\n' +
  '<!-- prettier-ignore -->\n> [!note]+ Nota 4\n^nvi-gen-1-n4\n';

let world: Harness;

/** The chapter the command would have handed the modal, cursor on verse 1. */
function target(): NoteTarget {
  const view = pane(world.app, {
    file: world.vault.getAbstractFileByPath(
      chapterPath('NVI', 1, 'GEN', 1),
    ) as TFile,
    editor: new FakeEditor(CHAPTER),
  });
  editorOf(view).at(3);
  const found = world.plugin.noteTarget(view);
  if (!found) throw new Error('no note could be written there');
  return found;
}

function opened(): WriteNoteModal {
  const modal = new WriteNoteModal(world.app, world.plugin, target());
  modal.open();
  return modal;
}

/** A control of the modal, found by the name written above it. */
function control<T extends HTMLElement>(
  modal: WriteNoteModal,
  name: string,
  selector: string,
): T {
  const item = Array.from(
    modal.contentEl.querySelectorAll<HTMLElement>('.setting-item'),
  ).find((el) => el.querySelector('.setting-item-name')?.textContent === name);
  const el = item?.querySelector<T>(selector);
  if (!el) throw new Error(`${name} has no ${selector}`);
  return el;
}

/** Change a control the way the app does: set the value, then say so. */
function change(el: HTMLElement, event: 'change' | 'input') {
  el.dispatchEvent(new Event(event));
}

beforeEach(() => {
  clearNotices();
  world = harness(vault, { language: 'pt' });
});

describe('the note being written', () => {
  it('offers every kind the vault writes, its own first', () => {
    const modal = opened();
    const drop = control<HTMLSelectElement>(modal, 'Kind', 'select');
    expect(Array.from(drop.options).map((o) => o.text)).toEqual([
      'Nota',
      'Nótula Homilética',
      'Nota dos Revisores',
    ]);
    expect(modal.kind.callout).toBe('note');
  });

  it('opens on the number the chapter has going spare', () => {
    const modal = opened();
    expect(control<HTMLInputElement>(modal, 'Number', 'input').value).toBe('5');
  });

  it('asks the chapter again for the kind that is picked', () => {
    const modal = opened();
    const drop = control<HTMLSelectElement>(modal, 'Kind', 'select');
    drop.value = '1';
    change(drop, 'change');

    expect(modal.kind.callout).toBe('homiletica');
    expect(modal.number).toBe(1);
    expect(control<HTMLInputElement>(modal, 'Number', 'input').value).toBe('1');
  });

  it('leaves a number that was typed where it was typed', () => {
    const modal = opened();
    const input = control<HTMLInputElement>(modal, 'Number', 'input');
    input.value = '26';
    change(input, 'input');

    const drop = control<HTMLSelectElement>(modal, 'Kind', 'select');
    drop.value = '1';
    change(drop, 'change');

    expect(modal.number).toBe(26);
    expect(input.value).toBe('26');
  });

  it('names a kind by its callout where the language has no name for it', () => {
    world.plugin.settings.noteKinds = [
      { callout: 'marginalia', letter: 'm', title: '' },
    ];
    const modal = opened();
    expect(
      Array.from(control<HTMLSelectElement>(modal, 'Kind', 'select').options)[0]
        .text,
    ).toBe('marginalia');
  });

  it('writes the note it was told to and closes', () => {
    const modal = opened();
    const wrote = vi
      .spyOn(world.plugin, 'writeNote')
      .mockImplementation(() => {});
    modal.write();

    expect(wrote).toHaveBeenCalledWith(modal.target, modal.kind, 5);
    expect(modal.contentEl.childElementCount).toBe(0);
  });

  it('is written by the button the modal closes with', () => {
    const modal = opened();
    const wrote = vi
      .spyOn(world.plugin, 'writeNote')
      .mockImplementation(() => {});
    const button = modal.contentEl.querySelector('button');
    button?.dispatchEvent(new Event('click'));
    expect(wrote).toHaveBeenCalled();
  });

  it('refuses a number that is not one', () => {
    const modal = opened();
    const wrote = vi
      .spyOn(world.plugin, 'writeNote')
      .mockImplementation(() => {});
    const input = control<HTMLInputElement>(modal, 'Number', 'input');
    input.value = 'segunda';
    change(input, 'input');
    modal.write();

    expect(wrote).not.toHaveBeenCalled();
    expect(notices[notices.length - 1].message).toContain('numbered from 1 up');
  });

  it('refuses a number below the first one', () => {
    const modal = opened();
    const input = control<HTMLInputElement>(modal, 'Number', 'input');
    input.value = '0';
    change(input, 'input');
    modal.write();

    expect(notices[notices.length - 1].message).toContain('numbered from 1 up');
  });
});

describe('the key that writes it', () => {
  /** A key pressed in the modal, wherever the focus is. */
  function press(
    modal: WriteNoteModal,
    key: string,
    over: KeyboardEventInit = {},
  ) {
    const evt = new KeyboardEvent('keydown', {
      key,
      cancelable: true,
      bubbles: true,
      ...over,
    });
    modal.contentEl.dispatchEvent(evt);
    return evt;
  }

  it('writes the note on Enter, wherever the field was left', () => {
    const modal = opened();
    const wrote = vi
      .spyOn(world.plugin, 'writeNote')
      .mockImplementation(() => {});
    const evt = press(modal, 'Enter');

    expect(wrote).toHaveBeenCalledWith(modal.target, modal.kind, 5);
    expect(evt.defaultPrevented).toBe(true);
  });

  it('writes it from the number field as it was typed', () => {
    const modal = opened();
    const wrote = vi
      .spyOn(world.plugin, 'writeNote')
      .mockImplementation(() => {});
    const input = control<HTMLInputElement>(modal, 'Number', 'input');
    input.value = '26';
    change(input, 'input');
    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        cancelable: true,
        bubbles: true,
      }),
    );

    expect(wrote).toHaveBeenCalledWith(modal.target, modal.kind, 26);
  });

  it('leaves every other key to the field it was typed into', () => {
    const modal = opened();
    const wrote = vi
      .spyOn(world.plugin, 'writeNote')
      .mockImplementation(() => {});
    press(modal, '7');

    expect(wrote).not.toHaveBeenCalled();
  });

  it('waits for a key still being composed', () => {
    const modal = opened();
    const wrote = vi
      .spyOn(world.plugin, 'writeNote')
      .mockImplementation(() => {});
    press(modal, 'Enter', { isComposing: true });

    expect(wrote).not.toHaveBeenCalled();
  });
});

describe('the number it opens on', () => {
  it('is read off the chapter as it stands when the modal opens', () => {
    const target = world.plugin.noteTarget(
      pane(world.app, {
        file: world.vault.getAbstractFileByPath(
          chapterPath('NVI', 1, 'GEN', 1),
        ) as TFile,
        editor: Object.assign(new FakeEditor(CHAPTER), {
          cursor: { line: 3, ch: 0 },
          anchor: { line: 3, ch: 0 },
        }),
      }),
    )!;
    // Written into after the command was offered, the way a chapter is while
    // the palette is open.
    const editor = target.view.editor as unknown as FakeEditor;
    editor.lines.push('^nvi-gen-1-n9');

    const modal = new WriteNoteModal(world.app, world.plugin, target);
    modal.open();
    expect(modal.number).toBe(10);
  });
});
