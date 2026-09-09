// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { TFile } from 'obsidian';

import { clearNotices } from '../test/obsidian';
import {
  FakeEditor,
  chapter,
  chapterPath,
  editorOf,
  harness,
  pane,
} from '../test/harness';
import type { Harness } from '../test/harness';
import { WriteRefsModal } from './refs-modal';
import type { ChapterPane } from './main';
import type { RefSuggestion } from './suggest-rows';

const vault = {
  ...chapter('NVI', 1, 'GEN', 1, ['No princípio', 'Era a terra', 'Haja luz']),
  ...chapter('NVI', 43, 'JHN', 14, ['Não se turbe o coração de vocês']),
};

/** A chapter of a version, as the generator writes one. */
const CHAPTER =
  '# Gênesis 1 - NVI\n\n' +
  '![[ARA-01-GEN-001#^ara-gen-1-1|flat]]\n^nvi-gen-1-1\n\n' +
  '![[ARA-01-GEN-001#^ara-gen-1-2|flat]]\n^nvi-gen-1-2\n';

const LINK = '[[NVI-43-JHN-014#^nvi-jhn-14-1|João 14.1]]';

let world: Harness;
let editor: FakeEditor;

/** The chapter the command would have handed the modal. */
function target(): ChapterPane {
  const view = pane(world.app, {
    file: world.vault.getAbstractFileByPath(
      chapterPath('NVI', 1, 'GEN', 1),
    ) as TFile,
    editor: new FakeEditor(CHAPTER),
  });
  editor = editorOf(view);
  const found = world.plugin.chapterPane(view);
  if (!found) throw new Error('no chapter is being written there');
  return found;
}

function opened(verses = [1, 2]): WriteRefsModal {
  const modal = new WriteRefsModal(world.app, world.plugin, target(), verses);
  modal.open();
  return modal;
}

/** A row as the popup hands one over. */
function row(extra: Partial<RefSuggestion> = {}): RefSuggestion {
  return {
    ref: 'João 14.1 - NVI',
    book: 'João',
    preview: 'Não se turbe o coração de vocês',
    markdown: LINK,
    ...extra,
  };
}

beforeEach(() => {
  clearNotices();
  world = harness(vault, { language: 'pt' });
});

describe('asking for the refs of a selection', () => {
  it('names the passage it is asking about', () => {
    const modal = opened([1, 2]);
    expect(modal.contentEl.querySelector('h3')?.textContent).toBe(
      'Write the refs on Gênesis 1.1,2',
    );
  });

  it('asks in one field, and hangs the popup off it', () => {
    const modal = opened();
    const inputs = modal.contentEl.querySelectorAll('input');
    expect(inputs).toHaveLength(1);
    // The popup reads and writes the field it was put on, which is what says
    // it is on this one.
    inputs[0].value = 'Jo 14.1';
    expect(modal.suggest!.getValue()).toBe('Jo 14.1');
  });

  it('offers the field the rows an `@` in the chapter offers', async () => {
    const modal = opened();
    const rows = await modal.suggest!.getSuggestions('Jo 14.1');
    expect(rows.some((r) => 'markdown' in r && r.markdown === LINK)).toBe(true);
  });

  it('writes the row picked on every verse of the selection', () => {
    const modal = opened();
    modal.suggest!.selectSuggestion(row(), new MouseEvent('click'));

    expect(modal.opened).toBe(false);
    expect(editor.text).toContain(`,,**Refs**: ${LINK}.,,\n^nvi-gen-1-1`);
    expect(editor.text).toContain(`,,**Refs**: ${LINK}.,,\n^nvi-gen-1-2`);
  });

  it('empties itself when it closes', () => {
    const modal = opened();
    modal.close();
    expect(modal.contentEl.childElementCount).toBe(0);
  });
});
