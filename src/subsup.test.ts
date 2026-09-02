// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { renderSubSup } from './subsup';

/** A rendered block, as the post-processor is handed one. */
function rendered(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  renderSubSup(el);
  return el;
}

/** Every run marked under `el`, as `sub:text` and `sup:text`. */
function runs(el: HTMLElement): string[] {
  return Array.from(el.querySelectorAll('.kcp-sub, .kcp-sup')).map(
    (m) => `${m.tagName.toLowerCase()}:${m.textContent}`,
  );
}

describe('renderSubSup', () => {
  it('lowers a run written between tildes', () => {
    const el = rendered('<p>Água é H~2~O.</p>');
    expect(runs(el)).toEqual(['sub:2']);
    expect(el.textContent).toBe('Água é H2O.');
  });

  it('raises a run written between carets', () => {
    const el = rendered('<p>2^10^ = 1024.</p>');
    expect(runs(el)).toEqual(['sup:10']);
    expect(el.textContent).toBe('210 = 1024.');
  });

  it('reads both kinds in the order they were written', () => {
    const el = rendered('<p>x^2^ e H~2~O</p>');
    expect(runs(el)).toEqual(['sup:2', 'sub:2']);
  });

  it('marks a run that is the whole of the text', () => {
    const el = rendered('<p>~tudo~</p>');
    expect(runs(el)).toEqual(['sub:tudo']);
    expect(el.textContent).toBe('tudo');
  });

  it('marks a run of several words', () => {
    const el = rendered('<p>Veja ^uma nota inteira^ ali.</p>');
    expect(runs(el)).toEqual(['sup:uma nota inteira']);
  });

  it('closes each run on its own delimiter, not the last one', () => {
    const el = rendered('<p>~um~ e ~dois~</p>');
    expect(runs(el)).toEqual(['sub:um', 'sub:dois']);
    expect(el.textContent).toBe('um e dois');
  });

  it('reaches runs nested in other elements', () => {
    const el = rendered('<p>Veja <strong>H~2~O</strong> ali.</p>');
    expect(runs(el)).toEqual(['sub:2']);
    expect(el.querySelector('strong .kcp-sub')).not.toBeNull();
  });

  it('leaves strikethrough alone', () => {
    const el = rendered('<p>Um <del>~~riscado~~</del> verso.</p>');
    expect(runs(el)).toEqual([]);
    expect(el.textContent).toBe('Um ~~riscado~~ verso.');
  });

  it('leaves a delimiter written as itself alone', () => {
    const el = rendered('<p>De ~ a ~ é um intervalo.</p>');
    expect(runs(el)).toEqual([]);
  });

  it('leaves an unclosed delimiter alone', () => {
    const el = rendered('<p>Veja o bloco ^abc</p>');
    expect(runs(el)).toEqual([]);
    expect(el.innerHTML).toBe('<p>Veja o bloco ^abc</p>');
  });

  it('leaves inline code alone', () => {
    const el = rendered('<p>Rode <code>a ~b~ c^d^</code> ali.</p>');
    expect(runs(el)).toEqual([]);
  });

  it('leaves a code block alone', () => {
    const el = rendered('<pre><code>a ~b~ c^d^</code></pre>');
    expect(runs(el)).toEqual([]);
  });

  it('leaves rendered maths alone', () => {
    const el = rendered('<p><span class="math">x^2^ + y~1~</span></p>');
    expect(runs(el)).toEqual([]);
  });

  it('walks past what is neither text nor an element', () => {
    const el = rendered('<p><!-- um comentário -->H~2~O</p>');
    expect(runs(el)).toEqual(['sub:2']);
  });

  it('does not read a run across the end of an element', () => {
    const el = rendered('<p>Veja <em>~isto</em> aqui~ ali.</p>');
    expect(runs(el)).toEqual([]);
  });
});
