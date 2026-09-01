// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import { harness } from '../test/harness';
import { VersionSuggestModal } from './modal';
import type { Location, VersionItem } from './types';

let modal: VersionSuggestModal;
let jumpTo: MockInstance;
let loc: Location;

beforeEach(() => {
  const { plugin, app, vault } = harness();
  const here = vault.write('Bibles/ARA/ARA-43-JHN-003.md');
  loc = {
    version: 'ARA',
    bookIndex: 43,
    book: 'João',
    chapter: 3,
    verse: 16,
    file: here,
  };
  const item = (version: string, label: string, text: string): VersionItem => ({
    version,
    label,
    group: '',
    file: vault.write(`Bibles/${version}/${version}-43-JHN-003.md`),
    text,
    matchedVerse: 16,
    isCurrent: false,
  });

  jumpTo = vi.spyOn(plugin, 'jumpTo').mockResolvedValue();
  modal = new VersionSuggestModal(app, plugin, loc, [
    item('NVI', 'Nova Versão Internacional', 'Porque Deus tanto amou'),
    item('ACF', 'Almeida Corrigida Fiel', ''),
  ]);
});

describe('the placeholder', () => {
  it('names the passage the picker is for', () => {
    expect(modal.placeholder).toBe('João 3.16 — pick a version');
  });

  it('leaves the verse off when there is none', () => {
    const { plugin, app } = harness();
    const bare = new VersionSuggestModal(
      app,
      plugin,
      { ...loc, verse: null },
      [],
    );
    expect(bare.placeholder).toBe('João 3 — pick a version');
  });

  it('says what Enter and Ctrl-Enter do', () => {
    expect(modal.instructions.map((i) => i.purpose)).toEqual([
      'open',
      'open in new tab',
    ]);
  });
});

describe('getSuggestions', () => {
  it('offers every version for an empty query', () => {
    expect(modal.getSuggestions('').map((i) => i.version)).toEqual([
      'NVI',
      'ACF',
    ]);
  });

  it('matches the label, whatever case it is typed in', () => {
    expect(modal.getSuggestions('NoVa').map((i) => i.version)).toEqual(['NVI']);
  });

  it('matches the version name too', () => {
    expect(modal.getSuggestions('acf').map((i) => i.version)).toEqual(['ACF']);
  });

  it('offers nothing for a query no version answers', () => {
    expect(modal.getSuggestions('vulgata')).toEqual([]);
  });
});

describe('renderSuggestion', () => {
  it('writes the label over the opening verse', () => {
    const el = document.createElement('div');
    modal.renderSuggestion(modal.getSuggestions('nvi')[0], el);
    expect(el.querySelector('.kcp-version')?.textContent).toBe(
      'Nova Versão Internacional',
    );
    expect(el.querySelector('.kcp-preview')?.textContent).toBe(
      'Porque Deus tanto amou',
    );
  });

  it('leaves the preview off a version with no text for the verse', () => {
    const el = document.createElement('div');
    modal.renderSuggestion(modal.getSuggestions('acf')[0], el);
    expect(el.querySelector('.kcp-preview')).toBeNull();
  });
});

describe('onChooseSuggestion', () => {
  it('opens the chosen version in place', () => {
    modal.onChooseSuggestion(
      modal.getSuggestions('nvi')[0],
      new MouseEvent('click'),
    );
    expect(jumpTo).toHaveBeenCalledWith('NVI', loc, undefined);
  });

  it('opens it in a new tab when the click carried Ctrl or Cmd', () => {
    const chosen = modal.getSuggestions('nvi')[0];
    modal.onChooseSuggestion(
      chosen,
      new MouseEvent('click', { ctrlKey: true }),
    );
    expect(jumpTo).toHaveBeenLastCalledWith('NVI', loc, 'tab');
    modal.onChooseSuggestion(
      chosen,
      new MouseEvent('click', { metaKey: true }),
    );
    expect(jumpTo).toHaveBeenLastCalledWith('NVI', loc, 'tab');
  });
});
