// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { MarkdownPostProcessorContext } from 'obsidian';

import { renderMarks } from './marks';

/** A section of a note: what it rendered as, and the lines it came from. */
interface Section {
  html: string;
  from: number;
  to: number;
}

/**
 * Render a note section by section, the way reading view hands them over.
 *
 * Every section is its own call, and each is told the whole source and the
 * lines it covers — which is all a fence has to go on.
 */
function note(source: string, sections: Section[]): HTMLElement[] {
  const info = new Map<
    HTMLElement,
    { text: string; lineStart: number; lineEnd: number }
  >();
  const els = sections.map((section) => {
    const el = document.createElement('div');
    el.innerHTML = section.html;
    info.set(el, {
      text: source,
      lineStart: section.from,
      lineEnd: section.to,
    });
    return el;
  });
  const ctx = {
    getSectionInfo: (el: HTMLElement) => info.get(el) ?? null,
  } as unknown as MarkdownPostProcessorContext;
  for (const el of els) renderMarks(el, ctx);
  return els;
}

/** A rendered block of a note nothing is known about — an embed, a card. */
function rendered(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  const ctx = {
    getSectionInfo: () => null,
  } as unknown as MarkdownPostProcessorContext;
  renderMarks(el, ctx);
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

  it('shrinks a run written between exclamations', () => {
    const el = rendered('<p>Um verso !!uma nota!! e o resto.</p>');
    expect(marks(el)).toEqual(['span:uma nota']);
    expect(el.textContent).toBe('Um verso uma nota e o resto.');
  });

  it('keeps a single exclamation inside a run', () => {
    const el = rendered('<p>!!Que verso! E que salmo!!</p>');
    expect(marks(el)).toEqual(['span:Que verso! E que salmo']);
  });

  it('leaves a sentence that only ends in exclamations alone', () => {
    const el = rendered('<p>Que verso!! Que salmo!!</p>');
    expect(marks(el)).toEqual([]);
  });

  it('no longer reads a dash pair as a run', () => {
    const el = rendered('<p>Um verso --uma nota-- e o resto.</p>');
    expect(marks(el)).toEqual([]);
  });

  it('reads every kind in the order they were written', () => {
    const el = rendered('<p>x^2^, H~2~O e !!uma nota!!</p>');
    expect(marks(el)).toEqual(['sup:2', 'sub:2', 'span:uma nota']);
  });

  it('marks a run that is the whole of the text', () => {
    const el = rendered('<p>!!tudo!!</p>');
    expect(marks(el)).toEqual(['span:tudo']);
    expect(el.textContent).toBe('tudo');
  });

  it('closes each run on its own delimiter, not the last one', () => {
    const el = rendered('<p>~um~ e ~dois~</p>');
    expect(marks(el)).toEqual(['sub:um', 'sub:dois']);
    expect(el.textContent).toBe('um e dois');
  });

  it('carries a run across a soft line break', () => {
    const el = rendered('<p>!!Refs: Sl 26.4<br>Notas: n1!!</p>');
    expect(marks(el)).toEqual(['span:Refs: Sl 26.4', 'span:Notas: n1']);
    expect(el.querySelector('br')).not.toBeNull();
  });

  it('carries a run through the middle of an emphasis', () => {
    const el = rendered('<p>!!uma <em>nota</em> inteira!!</p>');
    expect(marks(el)).toEqual(['span:uma ', 'span:nota', 'span: inteira']);
    expect(el.textContent).toBe('uma nota inteira');
  });

  it('marks a run nested in another element', () => {
    const el = rendered('<p>Veja <strong>H~2~O</strong> ali.</p>');
    expect(marks(el)).toEqual(['sub:2']);
    expect(el.querySelector('strong .kcp-sub')).not.toBeNull();
  });

  it('does not carry a run out of its paragraph', () => {
    const el = rendered('<p>!!Refs: Sl 26.4</p><p>Notas: n1!!</p>');
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
    const el = rendered('<p>De ~ a ~, e de ! a ! também.</p>');
    expect(marks(el)).toEqual([]);
  });

  it('leaves an unclosed delimiter alone', () => {
    const el = rendered('<p>Veja o bloco ^abc</p>');
    expect(marks(el)).toEqual([]);
    expect(el.innerHTML).toBe('<p>Veja o bloco ^abc</p>');
  });

  it('leaves inline code alone, and reads a run across it', () => {
    const el = rendered('<p>!!rode <code>a ~b~ c</code> agora!!</p>');
    expect(marks(el)).toEqual(['span:rode ', 'span: agora']);
    expect(el.querySelector('code')?.textContent).toBe('a ~b~ c');
  });

  it('leaves a code block alone', () => {
    const el = rendered('<pre><code>a ~b~ c^d^ e!!f!!g</code></pre>');
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

describe('the !!! fence', () => {
  const source = [
    'Um verso.',
    '',
    '!!!',
    'Uma nota.',
    '',
    'E outra.',
    '!!!',
  ].join('\n');
  const sections: Section[] = [
    { html: '<p>Um verso.</p>', from: 0, to: 0 },
    { html: '<p>!!!</p>', from: 2, to: 2 },
    { html: '<p>Uma nota.</p>', from: 3, to: 3 },
    { html: '<p>E outra.</p>', from: 5, to: 5 },
    { html: '<p>!!!</p>', from: 6, to: 6 },
  ];

  it('shrinks every block between a pair, paragraphs and all', () => {
    const [, , first, second] = note(source, sections);
    expect(first.classList.contains('kcp-small')).toBe(true);
    expect(second.classList.contains('kcp-small')).toBe(true);
  });

  it('empties the lines the fence is written on', () => {
    const [, open, , , close] = note(source, sections);
    expect(open.innerHTML).toBe('');
    expect(close.innerHTML).toBe('');
  });

  it('leaves what lies outside the fence alone', () => {
    const [before] = note(source, sections);
    expect(before.classList.contains('kcp-small')).toBe(false);
    expect(before.textContent).toBe('Um verso.');
  });

  it('reads a note it has already read without reading it again', () => {
    const [, , first] = note(source, sections);
    const [, , again] = note(source, sections);
    expect(first.classList.contains('kcp-small')).toBe(true);
    expect(again.classList.contains('kcp-small')).toBe(true);
  });

  it('finds the pair a block lies in, and not an earlier one', () => {
    const twice = ['!!!', 'Uma.', '!!!', '', '!!!', 'Outra.', '!!!'].join('\n');
    const [, , , inner] = note(twice, [
      { html: '<p>!!!</p>', from: 0, to: 0 },
      { html: '<p>Uma.</p>', from: 1, to: 1 },
      { html: '<p>!!!</p>', from: 2, to: 2 },
      { html: '<p>!!!</p>', from: 4, to: 4 },
      { html: '<p>Outra.</p>', from: 5, to: 5 },
      { html: '<p>!!!</p>', from: 6, to: 6 },
    ]);
    expect(inner.textContent).toBe('');
  });

  it('leaves a fence that was never closed as it was written', () => {
    const open = ['!!!', 'Uma nota.'].join('\n');
    const [fence, after] = note(open, [
      { html: '<p>!!!</p>', from: 0, to: 0 },
      { html: '<p>Uma nota.</p>', from: 1, to: 1 },
    ]);
    expect(fence.textContent).toBe('!!!');
    expect(after.classList.contains('kcp-small')).toBe(false);
  });

  it('still marks the runs inside a fenced block', () => {
    const inner = ['!!!', 'Água é H~2~O.', '!!!'].join('\n');
    const [, block] = note(inner, [
      { html: '<p>!!!</p>', from: 0, to: 0 },
      { html: '<p>Água é H~2~O.</p>', from: 1, to: 1 },
      { html: '<p>!!!</p>', from: 2, to: 2 },
    ]);
    expect(marks(block)).toEqual(['sub:2']);
  });
});
