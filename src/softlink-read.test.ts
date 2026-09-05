// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import { softLinkRenderer } from './softlink-read';

/** An app that knows one note and remembers what it was asked to open. */
function stub(known = ['Shedd-19-PSA-023']) {
  return {
    metadataCache: {
      getFirstLinkpathDest: (path: string) =>
        known.includes(path) ? { path: `${path}.md` } : null,
    },
    workspace: { openLinkText: vi.fn(), trigger: vi.fn() },
  };
}

/** A rendered block, run through the post-processor. */
function rendered(html: string, app = stub()): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  softLinkRenderer(app as any)(el, {
    sourcePath: 'Shedd-19-PSA-000.md',
  } as any);
  return el;
}

/** Every link drawn under `el`, as `class|href-ish>text`. */
function links(el: HTMLElement): string[] {
  return Array.from(el.querySelectorAll('a')).map(
    (a) => `${a.className}|${a.dataset.href}>${a.textContent}`,
  );
}

describe('softLinkRenderer', () => {
  it('draws a token as an internal link', () => {
    const el = rendered('<p>Veja ((Shedd-19-PSA-023|23)).</p>');
    expect(links(el)).toEqual(['internal-link|Shedd-19-PSA-023>23']);
    expect(el.textContent).toBe('Veja 23.');
  });

  it('marks a target no note answers to', () => {
    const el = rendered('<p>((Shedd-19-PSA-999|999))</p>');
    expect(links(el)).toEqual([
      'internal-link is-unresolved|Shedd-19-PSA-999>999',
    ]);
  });

  it('resolves a same-note anchor, which names no other file', () => {
    const el = rendered('<p>((#^shedd-psa-103-10|Sl 103.10))</p>');
    expect(links(el)).toEqual(['internal-link|#^shedd-psa-103-10>Sl 103.10']);
  });

  it('opens the note a click names, in this pane', () => {
    const app = stub();
    const el = rendered('<p>((Shedd-19-PSA-023|23))</p>', app);
    const evt = new MouseEvent('click', { bubbles: true, cancelable: true });
    el.querySelector('a')!.dispatchEvent(evt);
    expect(app.workspace.openLinkText).toHaveBeenCalledWith(
      'Shedd-19-PSA-023',
      'Shedd-19-PSA-000.md',
      false,
    );
    // `data-href` on `.internal-link` is what Obsidian's own delegated click
    // handler reads; without `preventDefault()` it would open the same note a
    // second time on top of the `openLinkText` call above.
    expect(evt.defaultPrevented).toBe(true);
  });

  it('opens it in a new pane where the click asked for one', () => {
    const app = stub();
    const el = rendered('<p>((Shedd-19-PSA-023|23))</p>', app);
    el.querySelector('a')!.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
      }),
    );
    expect(app.workspace.openLinkText).toHaveBeenCalledWith(
      'Shedd-19-PSA-023',
      'Shedd-19-PSA-000.md',
      true,
    );
  });

  it('asks for the page preview when the pointer arrives', () => {
    const app = stub();
    const el = rendered('<p>((Shedd-19-PSA-023|23))</p>', app);
    el.querySelector('a')!.dispatchEvent(
      new MouseEvent('mouseover', { bubbles: true }),
    );
    expect(app.workspace.trigger).toHaveBeenCalledWith(
      'hover-link',
      expect.objectContaining({
        source: 'preview',
        linktext: 'Shedd-19-PSA-023',
        sourcePath: 'Shedd-19-PSA-000.md',
      }),
    );
  });

  it('hands the anchor to the app and keeps it off the page', () => {
    const app = stub(['Shedd-19-PSA-103']);
    const el = rendered(
      '<p>((Shedd-19-PSA-103#^shedd-psa-103-10|Sl 103.10))</p>',
      app,
    );
    expect(links(el)).toEqual([
      'internal-link|Shedd-19-PSA-103#^shedd-psa-103-10>Sl 103.10',
    ]);
    el.querySelector('a')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    expect(app.workspace.openLinkText).toHaveBeenCalledWith(
      'Shedd-19-PSA-103#^shedd-psa-103-10',
      'Shedd-19-PSA-000.md',
      false,
    );
  });

  it('leaves a token inside code exactly as written', () => {
    const el = rendered('<p><code>((Shedd-19-PSA-023|23))</code></p>');
    expect(links(el)).toEqual([]);
    expect(el.textContent).toBe('((Shedd-19-PSA-023|23))');
  });

  it('leaves a token inside a fenced block alone', () => {
    const el = rendered('<pre><code>((a|1))</code></pre>');
    expect(links(el)).toEqual([]);
  });

  it('leaves a token inside a link alone', () => {
    const el = rendered('<p><a href="#">((a|1))</a></p>');
    expect(el.querySelectorAll('.internal-link').length).toBe(0);
  });

  it('keeps the prose either side of a link', () => {
    const el = rendered('<p>a ((x|1)) b ((y|2)) c</p>', stub(['x', 'y']));
    expect(el.textContent).toBe('a 1 b 2 c');
    expect(links(el).length).toBe(2);
  });

  it('draws links written inside a callout', () => {
    const el = rendered(
      '<div class="callout"><div class="callout-content">' +
        '<p>((Shedd-19-PSA-023|23))</p></div></div>',
    );
    expect(links(el).length).toBe(1);
  });

  it('draws nothing for a display holding markup, pinned as current behaviour', () => {
    // `((a|**1**))` is a token the grammar accepts, its display being prose —
    // but markdown has already rendered `**1**` into a `<strong>` by the time
    // this runs, so the text node reading the token is split into three:
    // `((a|` and `))` either side of the element. Neither piece names a
    // complete token, so nothing is drawn. Node-joining across an inline
    // element is not chased here; this only pins what happens today.
    const el = rendered('<p>((a|<strong>1</strong>))</p>');
    expect(links(el)).toEqual([]);
    expect(el.querySelector('strong')?.textContent).toBe('1');
  });

  it('leaves a note with no token untouched', () => {
    const el = rendered('<p>Um verso qualquer.</p>');
    expect(el.innerHTML).toBe('<p>Um verso qualquer.</p>');
  });
});
