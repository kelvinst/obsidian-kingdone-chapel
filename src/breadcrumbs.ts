import { MarkdownView, setIcon } from 'obsidian';
import type { PaneType } from 'obsidian';

import { fold } from './books';
import type { ChapterRef, Location } from './types';
import type KingdoneChapelPlugin from './main';

/** Chapters per row in the chapter dropdown — a page of a book at a glance. */
const CHAPTERS_PER_ROW = 5;

/**
 * How many entries a dropdown needs before it gets a search field. A vault with
 * three versions is read faster than it is typed, and a box over two rows is
 * only something else to look past; sixty-six books are not.
 */
const SEARCH_FROM = 8;

/**
 * The bar naming the passage a pane is reading: `ARA › João › ‹ 3 ›`.
 *
 * Every part of it is a way out of the chapter: the version to the same
 * chapter and verse elsewhere, the book to another book, the chapter to
 * another chapter — with the arrows walking the version straight through,
 * from the last chapter of a book into the first of the next.
 *
 * The bars are not tracked between refreshes. A pane can be split, moved,
 * closed or replaced without saying so, and the one thing that always knows
 * whether a bar is still on screen is the pane itself: each refresh looks for
 * the bar it left there, and unloading sweeps up whatever is left.
 */
export class Breadcrumbs {
  plugin: KingdoneChapelPlugin;
  /** The dropdown on screen — only ever one, whichever crumb opened it. */
  menu: CrumbMenu | null = null;
  /**
   * The crumb whose dropdown was just dismissed by clicking it again. Held
   * only until that crumb's own click arrives, so the click that closed a
   * dropdown does not reopen it.
   */
  dismissed: HTMLElement | null = null;

  constructor(plugin: KingdoneChapelPlugin) {
    this.plugin = plugin;
  }

  /** Give every pane reading a chapter its bar, and take it off the rest. */
  refresh() {
    for (const leaf of this.plugin.app.workspace.getLeavesOfType('markdown')) {
      const view = leaf.view;
      // A tab that has never been opened carries a placeholder rather than a
      // markdown view; it gets its bar when it is finally loaded.
      if (!(view instanceof MarkdownView)) continue;

      const bar = view.containerEl.querySelector<HTMLElement>('.kcp-crumbs');
      const loc =
        this.plugin.settings.showBreadcrumbs && view.file
          ? this.plugin.locationOf(view.file, null)
          : null;
      if (!loc) {
        if (bar) bar.remove();
        continue;
      }

      const prev = this.plugin.stepChapter(loc.version, loc.bookIndex, loc.chapter, -1);
      const next = this.plugin.stepChapter(loc.version, loc.bookIndex, loc.chapter, 1);
      const key = [
        loc.file.path,
        this.plugin.label(loc.version),
        loc.book,
        loc.chapter,
        stepKey(prev),
        stepKey(next),
      ].join('|');
      if (bar && bar.dataset.kcpKey === key) continue;
      if (bar) bar.remove();
      this.mount(view, loc, key, prev, next);
    }
  }

  /** Drop every bar and any dropdown, for when the plugin is unloaded. */
  clear() {
    this.close();
    document.querySelectorAll('.kcp-crumbs').forEach((el) => el.remove());
  }

  mount(
    view: MarkdownView,
    loc: Location,
    key: string,
    prev: ChapterRef | null,
    next: ChapterRef | null
  ) {
    const bar = createDiv({ cls: 'kcp-crumbs' });
    bar.dataset.kcpKey = key;

    const version = crumb(bar, this.plugin.label(loc.version), 'Open this chapter in another version');
    version.onclick = (evt) => this.versionMenu(version, view, loc, evt);

    separator(bar);

    const book = crumb(bar, loc.book, 'Go to another book');
    book.onclick = (evt) => this.bookMenu(book, view, loc, evt);

    separator(bar);

    const group = bar.createSpan({ cls: 'kcp-crumb-chapter' });
    this.arrow(group, 'arrow-left', 'Previous chapter', view, loc, prev);
    const chapter = crumb(group, String(loc.chapter), 'Go to another chapter');
    chapter.onclick = (evt) => this.chapterMenu(chapter, view, loc, evt);
    this.arrow(group, 'arrow-right', 'Next chapter', view, loc, next);

    // The bar belongs to the pane, not to the note: it sits between the tab's
    // own header and the note itself, so it stays put while the note scrolls.
    const content = view.contentEl;
    const parent = content.parentElement || view.containerEl;
    parent.insertBefore(bar, content);
  }

  /**
   * One end of the chapter crumb. A missing neighbour — either end of the
   * version — leaves the arrow in place and unclickable, so the bar keeps its
   * shape rather than shifting under the pointer at Genesis and Revelation.
   */
  arrow(
    into: HTMLElement,
    icon: string,
    label: string,
    view: MarkdownView,
    loc: Location,
    to: ChapterRef | null
  ) {
    const el = into.createEl('button', {
      cls: 'kcp-crumb-arrow clickable-icon' + (to ? '' : ' is-disabled'),
      attr: { 'aria-label': label },
    });
    setIcon(el, icon);
    if (!to) return;
    el.onclick = (evt) => {
      this.close();
      this.plugin.openChapter(loc.version, to.bookIndex, to.chapter, view.file, paneFor(evt));
    };
  }

  /** Every version, jumping to the verse being read rather than the chapter's top. */
  versionMenu(anchor: HTMLElement, view: MarkdownView, loc: Location, evt: MouseEvent) {
    this.open(anchor, 'kcp-crumb-list', 'Search versions', (body, close) => {
      for (const version of this.plugin.listVersions()) {
        // A version that skips this chapter still shows, greyed: what it is
        // missing is worth seeing, and choosing it says why.
        const missing = !this.plugin.targetFile(version, loc);
        const item = this.item(body, this.plugin.label(version), version === loc.version);
        if (missing) item.addClass('is-missing');
        item.onclick = (click) => {
          close();
          // The verse is read now, not when the bar was drawn: the reader may
          // have moved down the chapter since.
          const at = (view.file && this.plugin.locationOf(view.file, view)) || loc;
          this.plugin.jumpTo(version, at, paneFor(click));
        };
      }
    }, evt);
  }

  /** Every book the version has, landing on its first chapter. */
  bookMenu(anchor: HTMLElement, view: MarkdownView, loc: Location, evt: MouseEvent) {
    this.open(anchor, 'kcp-crumb-list', 'Search books', (body, close) => {
      for (const book of this.plugin.booksIn(loc.version)) {
        const item = this.item(body, book.name, book.index === loc.bookIndex);
        item.onclick = (click) => {
          close();
          this.plugin.openChapter(loc.version, book.index, 1, view.file, paneFor(click));
        };
      }
    }, evt);
  }

  /** Every chapter of the book, laid out in rows rather than in one long column. */
  chapterMenu(anchor: HTMLElement, view: MarkdownView, loc: Location, evt: MouseEvent) {
    this.open(anchor, 'kcp-crumb-grid', 'Search chapters', (body, close) => {
      for (const chapter of this.plugin.chaptersIn(loc.version, loc.bookIndex)) {
        const item = this.item(body, String(chapter), chapter === loc.chapter);
        item.onclick = (click) => {
          close();
          this.plugin.openChapter(loc.version, loc.bookIndex, chapter, view.file, paneFor(click));
        };
      }
    }, evt);
  }

  item(into: HTMLElement, text: string, current: boolean): HTMLElement {
    return into.createDiv({ cls: 'kcp-crumb-item' + (current ? ' is-current' : ''), text });
  }

  /**
   * Show a dropdown under `anchor`, replacing whatever was open. Clicking the
   * crumb a dropdown belongs to closes it instead of opening it again.
   */
  open(
    anchor: HTMLElement,
    cls: string,
    placeholder: string,
    build: (body: HTMLElement, close: () => void) => void,
    evt: MouseEvent
  ) {
    evt.preventDefault();
    if (this.dismissed === anchor) {
      this.dismissed = null;
      return;
    }
    this.close();
    this.menu = new CrumbMenu(anchor, cls, (from) => {
      this.menu = null;
      this.dismissed = from;
    });
    build(this.menu.body, () => this.close());
    this.menu.finish(placeholder);
  }

  close() {
    if (this.menu) this.menu.destroy();
    this.menu = null;
    this.dismissed = null;
  }
}

/** How a step reads in the bar's key, so a changed neighbour redraws the arrows. */
function stepKey(to: ChapterRef | null): string {
  return to ? `${to.bookIndex}:${to.chapter}` : '';
}

/** Ctrl/Cmd-clicking a crumb opens the passage beside the pane it came from. */
function paneFor(evt: MouseEvent): PaneType | boolean {
  return evt.ctrlKey || evt.metaKey ? 'tab' : false;
}

function crumb(into: HTMLElement, text: string, label: string): HTMLElement {
  return into.createEl('button', { cls: 'kcp-crumb', text, attr: { 'aria-label': label } });
}

function separator(into: HTMLElement) {
  const el = into.createSpan({ cls: 'kcp-crumb-sep' });
  setIcon(el, 'chevron-right');
}

/**
 * A dropdown hanging off a crumb.
 *
 * Obsidian's own menu is a column of rows, and the chapters want a grid, so
 * this is the plugin's own — built out of the same variables so it still
 * reads as part of the app. It closes the way a menu does: on Escape, on a
 * click anywhere else, and on anything that moves it away from its crumb.
 *
 * Past a handful of entries it opens with a search field, and then it is
 * driven by the keyboard as much as by the pointer: typing narrows the list,
 * the arrows move through what is left, and Enter takes it.
 */
class CrumbMenu {
  anchor: HTMLElement;
  /** The dropdown itself: the search field, when there is one, over the list. */
  el: HTMLElement;
  /** Where the entries go — the part that scrolls, so the field stays put. */
  body: HTMLElement;
  /** Called with the crumb clicked to dismiss it, when that is what closed it. */
  onClose: (from: HTMLElement | null) => void;

  private search: HTMLElement;
  private empty: HTMLElement;
  /** Every entry, with the text a query is matched against. */
  private rows: { el: HTMLElement; text: string }[] = [];
  /** The entries a query left showing, in the order they are walked. */
  private shown: HTMLElement[] = [];
  /** Which of `shown` Enter would take. */
  private at = 0;
  private detach: (() => void)[] = [];

  constructor(anchor: HTMLElement, cls: string, onClose: (from: HTMLElement | null) => void) {
    this.anchor = anchor;
    this.onClose = onClose;
    this.el = document.body.createDiv({ cls: 'kcp-crumb-menu' });
    this.search = this.el.createDiv({ cls: 'kcp-crumb-search' });
    this.body = this.el.createDiv({ cls: cls });
    this.body.style.setProperty('--kcp-crumb-columns', String(CHAPTERS_PER_ROW));
    this.empty = this.el.createDiv({ cls: 'kcp-crumb-empty is-hidden', text: 'Nothing matches.' });

    // Capture, so a click reaches this before whatever it landed on: a link in
    // the note behind the dropdown should navigate and close it, not one or
    // the other.
    this.listen(document, 'mousedown', (evt) => {
      const target = evt.target instanceof Node ? evt.target : null;
      if (target && this.el.contains(target)) return;
      this.close(target && anchor.contains(target) ? anchor : null);
    });
    this.listen(document, 'keydown', (evt) => {
      if ((evt as KeyboardEvent).key === 'Escape') this.close(null);
    });
    // Anchored to a rectangle that scrolling and resizing move out from under it.
    // Its own scrolling is how a reader reaches the end of a long book, though,
    // and that has to leave it open.
    this.listen(window, 'resize', () => this.close(null));
    this.listen(window, 'scroll', (evt) => {
      const target = evt.target instanceof Node ? evt.target : null;
      if (target && this.el.contains(target)) return;
      this.close(null);
    });
  }

  private listen(on: Document | Window, type: string, run: (evt: Event) => void) {
    on.addEventListener(type, run, true);
    this.detach.push(() => on.removeEventListener(type, run, true));
  }

  /** Take stock of what was built, put a field over it if it earns one, and show it. */
  finish(placeholder: string) {
    this.rows = Array.from(this.body.querySelectorAll<HTMLElement>('.kcp-crumb-item')).map(
      (el) => ({ el, text: fold(el.textContent || '') })
    );
    if (this.rows.length > SEARCH_FROM) this.field(placeholder);
    else this.search.remove();

    // Placed first: the entries are scrolled into view below, and doing that
    // to a dropdown still sitting at the corner of the window scrolls the
    // window instead.
    this.place();
    this.filter('');
  }

  /** The search field, focused so the dropdown can be typed at straight away. */
  private field(placeholder: string) {
    const input = this.search.createEl('input', {
      type: 'text',
      cls: 'kcp-crumb-input',
      attr: { placeholder, spellcheck: 'false' },
    });
    input.addEventListener('input', () => this.filter(input.value));
    input.addEventListener('keydown', (evt) => {
      if (evt.key === 'ArrowDown') this.activate(this.at + 1);
      else if (evt.key === 'ArrowUp') this.activate(this.at - 1);
      else if (evt.key === 'Enter') {
        const pick = this.shown[this.at];
        if (pick) pick.click();
      } else return;
      // Only the keys handled above: the rest go on typing into the field, and
      // the arrows would otherwise walk the caret instead of the list.
      evt.preventDefault();
    });
    // The field is in the document by now, but the dropdown is not yet placed,
    // and focusing something off screen scrolls the window under it.
    window.setTimeout(() => input.focus());
  }

  /**
   * Show the entries `query` matches. Folded on both sides, so `joao` finds
   * João — the accents are the first thing anyone skips while typing — and
   * matched anywhere in the name rather than only at its start, which is what
   * lets `sam` reach 1 Samuel.
   */
  private filter(query: string) {
    const wanted = fold(query);
    this.shown = [];
    for (const row of this.rows) {
      const hit = !wanted || row.text.includes(wanted);
      row.el.toggleClass('is-hidden', !hit);
      if (hit) this.shown.push(row.el);
    }
    this.empty.toggleClass('is-hidden', this.shown.length > 0);

    // Untouched, the dropdown opens on the passage already being read; narrowed,
    // it opens on the best thing left, because that is what Enter takes.
    const current = this.shown.findIndex((el) => el.hasClass('is-current'));
    this.activate(wanted || current < 0 ? 0 : current);
  }

  /** Move what Enter would take, keeping it on screen. */
  private activate(index: number) {
    for (const el of this.shown) el.removeClass('is-active');
    if (!this.shown.length) return;
    this.at = Math.max(0, Math.min(index, this.shown.length - 1));
    const el = this.shown[this.at];
    el.addClass('is-active');
    el.scrollIntoView({ block: 'nearest' });
  }

  /** Under the crumb, flipped above it and pulled back on screen as it has to be. */
  place() {
    const rect = this.anchor.getBoundingClientRect();
    const width = this.el.offsetWidth;
    const height = this.el.offsetHeight;
    const margin = 8;

    const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin));
    let top = rect.bottom + 4;
    if (top + height > window.innerHeight - margin) {
      const above = rect.top - 4 - height;
      top = above >= margin ? above : Math.max(margin, window.innerHeight - height - margin);
    }
    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
  }

  close(from: HTMLElement | null) {
    this.destroy();
    this.onClose(from);
  }

  destroy() {
    for (const off of this.detach) off();
    this.detach = [];
    this.el.remove();
  }
}
