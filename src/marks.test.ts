// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { renderMarks } from './marks';

/** A rendered block, as the post-processor is handed one. */
function rendered(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  renderMarks(el);
  return el;
}

/** Every mark under `el`, as `tag:text`, in the order they were written. */
function marks(el: HTMLElement): string[] {
  return Array.from(el.querySelectorAll('.kcp-sub, .kcp-sup, .kcp-small')).map(
    (m) => `${m.tagName.toLowerCase()}:${m.textContent}`,
  );
}

describe('renderMarks', () => {
  it('lowers a run written between tildes', () => {
    const el = rendered('<p>Água é H~2~O.</p>');
    expect(marks(el)).toEqual(['sub:2']);
    expect(el.textContent).toBe('Água é H2O.');
  });

  it('raises a run written between carets', () => {
    const el = rendered('<p>2^10^ = 1024.</p>');
    expect(marks(el)).toEqual(['sup:10']);
    expect(el.textContent).toBe('210 = 1024.');
  });

  it('shrinks a run written between dashes', () => {
    const el = rendered('<p>Um verso --uma nota-- e o resto.</p>');
    expect(marks(el)).toEqual(['span:uma nota']);
    expect(el.textContent).toBe('Um verso uma nota e o resto.');
  });

  it('reads every kind in the order they were written', () => {
    const el = rendered('<p>x^2^, H~2~O e --uma nota--</p>');
    expect(marks(el)).toEqual(['sup:2', 'sub:2', 'span:uma nota']);
  });

  it('marks a run that is the whole of the text', () => {
    const el = rendered('<p>--tudo--</p>');
    expect(marks(el)).toEqual(['span:tudo']);
    expect(el.textContent).toBe('tudo');
  });

  it('closes each run on its own delimiter, not the last one', () => {
    const el = rendered('<p>~um~ e ~dois~</p>');
    expect(marks(el)).toEqual(['sub:um', 'sub:dois']);
    expect(el.textContent).toBe('um e dois');
  });

  it('carries a run across a soft line break', () => {
    const el = rendered('<p>--Refs: Sl 26.4<br>Notas: n1--</p>');
    expect(marks(el)).toEqual(['span:Refs: Sl 26.4', 'span:Notas: n1']);
    expect(el.querySelector('br')).not.toBeNull();
  });

  it('carries a run through the middle of an emphasis', () => {
    const el = rendered('<p>--uma <em>nota</em> inteira--</p>');
    expect(marks(el)).toEqual(['span:uma ', 'span:nota', 'span: inteira']);
    expect(el.textContent).toBe('uma nota inteira');
  });

  it('marks a run nested in another element', () => {
    const el = rendered('<p>Veja <strong>H~2~O</strong> ali.</p>');
    expect(marks(el)).toEqual(['sub:2']);
    expect(el.querySelector('strong .kcp-sub')).not.toBeNull();
  });

  it('does not carry a run out of its paragraph', () => {
    const el = rendered('<p>--Refs: Sl 26.4</p><p>Notas: n1--</p>');
    expect(marks(el)).toEqual([]);
  });

  it('marks a run in each block of its own', () => {
    const el = rendered('<ul><li>H~2~O</li><li>2^10^</li></ul>');
    expect(marks(el)).toEqual(['sub:2', 'sup:10']);
  });

  it('leaves strikethrough alone', () => {
    const el = rendered('<p>Um <del>~~riscado~~</del> verso.</p>');
    expect(marks(el)).toEqual([]);
    expect(el.textContent).toBe('Um ~~riscado~~ verso.');
  });

  it('leaves a delimiter written as itself alone', () => {
    const el = rendered('<p>De ~ a ~, e de -- a -- também.</p>');
    expect(marks(el)).toEqual([]);
  });

  it('leaves an unclosed delimiter alone', () => {
    const el = rendered('<p>Veja o bloco ^abc</p>');
    expect(marks(el)).toEqual([]);
    expect(el.innerHTML).toBe('<p>Veja o bloco ^abc</p>');
  });

  it('leaves inline code alone, and reads a run across it', () => {
    const el = rendered('<p>--rode <code>a ~b~ c</code> agora--</p>');
    expect(marks(el)).toEqual(['span:rode ', 'span: agora']);
    expect(el.querySelector('code')?.textContent).toBe('a ~b~ c');
  });

  it('leaves a code block alone', () => {
    const el = rendered('<pre><code>a ~b~ c^d^ e--f--g</code></pre>');
    expect(marks(el)).toEqual([]);
  });

  it('leaves rendered maths alone', () => {
    const el = rendered('<p><span class="math">x^2^ + y~1~</span></p>');
    expect(marks(el)).toEqual([]);
  });

  it('walks past what is neither text nor an element', () => {
    const el = rendered('<p><!-- um comentário -->H~2~O</p>');
    expect(marks(el)).toEqual(['sub:2']);
  });

  it('leaves a block holding no text at all alone', () => {
    const el = rendered('<p><img src="a.png"></p>');
    expect(el.innerHTML).toBe('<p><img src="a.png"></p>');
  });
});
