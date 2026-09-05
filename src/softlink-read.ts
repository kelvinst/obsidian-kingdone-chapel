import { Keymap, getLinkpath } from 'obsidian';
import type { App, MarkdownPostProcessorContext } from 'obsidian';

import { softLinksIn } from './softlink';
import type { SoftLink } from './softlink';

/**
 * The links a rendered note draws for itself.
 *
 * `softlink.ts` reads the tokens; here they are cut into the page as anchors.
 * The delimiters are dropped rather than hidden: reading view is finished text,
 * with no cursor that could ever want them back.
 *
 * What is built is a real `<a class="internal-link">` — it opens the note, it
 * takes a modifier for a new pane, it shows the page preview on hover, and it
 * greys out where nothing answers to the target. What it is not is a link
 * Obsidian knows about: nothing was written that its scanner could read, so
 * nothing entered the cache, and the note draws no edge.
 */

/** Elements whose text is the note's own literal writing, tokens and all. */
function verbatim(el: Element): boolean {
  return (
    el.tagName === 'CODE' ||
    el.tagName === 'PRE' ||
    el.tagName === 'A' ||
    el.classList.contains('math')
  );
}

/**
 * The anchor a link is drawn as, in either view.
 *
 * `data-href` as well as the class, because that is where Obsidian's own
 * internal links keep their target and what its hover preview reads back. The
 * default action is stopped: an anchor with no `href` would do nothing, and one
 * with a vault path would ask the browser to leave the page.
 */
export function linkEl(
  doc: Document,
  app: App,
  link: SoftLink,
  sourcePath: string,
): HTMLAnchorElement {
  const el = doc.createElement('a');
  const resolved = app.metadataCache.getFirstLinkpathDest(
    getLinkpath(link.path),
    sourcePath,
  );
  el.className = resolved ? 'internal-link' : 'internal-link is-unresolved';
  el.dataset.href = link.path;
  el.textContent = link.text;
  el.addEventListener('click', (evt) => {
    evt.preventDefault();
    app.workspace.openLinkText(link.path, sourcePath, Keymap.isModEvent(evt));
  });
  el.addEventListener('mouseover', (evt) => {
    app.workspace.trigger('hover-link', {
      event: evt,
      source: 'preview',
      hoverParent: el.parentElement,
      targetEl: el,
      linktext: link.path,
      sourcePath,
    });
  });
  return el;
}

/** Rebuild one text node as its links and the plain text between them. */
function rewrite(node: Text, app: App, sourcePath: string) {
  const links = softLinksIn(node.data);
  if (!links.length) return;

  const doc = node.ownerDocument;
  const out = doc.createDocumentFragment();
  let at = 0;
  for (const link of links) {
    if (link.from > at) {
      out.appendChild(doc.createTextNode(node.data.slice(at, link.from)));
    }
    out.appendChild(linkEl(doc, app, link, sourcePath));
    at = link.to;
  }
  if (at < node.data.length) {
    out.appendChild(doc.createTextNode(node.data.slice(at)));
  }
  node.replaceWith(out);
}

/** Every text node under `el` that is prose rather than literal writing. */
function prose(el: HTMLElement): Text[] {
  const found: Text[] = [];
  const walk = (parent: Element) => {
    for (const node of Array.from(parent.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) found.push(node as Text);
      else if (
        node.nodeType === Node.ELEMENT_NODE &&
        !verbatim(node as Element)
      ) {
        walk(node as Element);
      }
    }
  };
  walk(el);
  return found;
}

/**
 * Draw every token under `el`, as a markdown post-processor.
 *
 * A token never reaches past its line, so unlike a mark it needs no block
 * gathered around it: each text node is read on its own, and the nodes are
 * collected before any is rewritten, a walk over a list that is being replaced
 * as it goes being a walk into the fragments it just built.
 */
export function softLinkRenderer(app: App) {
  return (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
    for (const node of prose(el)) rewrite(node, app, ctx.sourcePath);
  };
}
