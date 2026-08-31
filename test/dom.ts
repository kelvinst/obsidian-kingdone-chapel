/**
 * The DOM helpers Obsidian bolts onto the document at runtime.
 *
 * They are not part of the `obsidian` module — the app installs them on the
 * prototypes before a plugin is loaded — so a stub for the module alone leaves
 * `el.createDiv()` undefined. This is loaded as a setup file, once per test
 * environment, and does nothing at all under `node`, where there is no DOM to
 * extend.
 */

/** The subset of Obsidian's `DomElementInfo` the plugin actually writes. */
interface ElementInfo {
  cls?: string | string[];
  text?: string;
  attr?: Record<string, string | number | boolean | null>;
  title?: string;
  value?: string;
  type?: string;
  placeholder?: string;
  href?: string;
  prepend?: boolean;
}

function dress(el: HTMLElement, info?: ElementInfo | string): HTMLElement {
  if (!info) return el;
  if (typeof info === 'string') {
    el.className = info;
    return el;
  }
  if (info.cls) {
    el.className = Array.isArray(info.cls) ? info.cls.join(' ') : info.cls;
  }
  if (info.text !== undefined) el.textContent = info.text;
  if (info.type !== undefined) el.setAttribute('type', info.type);
  if (info.value !== undefined) (el as HTMLInputElement).value = info.value;
  if (info.placeholder !== undefined) {
    el.setAttribute('placeholder', info.placeholder);
  }
  if (info.href !== undefined) el.setAttribute('href', info.href);
  if (info.title !== undefined) el.setAttribute('title', info.title);
  if (info.attr) {
    for (const [name, value] of Object.entries(info.attr)) {
      if (value !== null && value !== undefined) {
        el.setAttribute(name, String(value));
      }
    }
  }
  return el;
}

function make(
  doc: Document,
  parent: HTMLElement | null,
  tag: string,
  info?: ElementInfo | string,
  callback?: (el: never) => void,
): HTMLElement {
  const el = dress(doc.createElement(tag), info);
  if (parent) {
    const prepend = typeof info === 'object' && info && info.prepend;
    if (prepend) parent.prepend(el);
    else parent.append(el);
  }
  if (callback) callback(el as never);
  return el;
}

export function installObsidianDom(target: typeof globalThis) {
  const win = target as unknown as Window & typeof globalThis;
  if (typeof win.HTMLElement === 'undefined') return;

  const element = win.Element.prototype as unknown as Record<string, unknown>;
  const html = win.HTMLElement.prototype as unknown as Record<string, unknown>;
  const doc = win.document;

  element.addClass = function (this: Element, ...classes: string[]) {
    this.classList.add(...classes);
  };
  element.removeClass = function (this: Element, ...classes: string[]) {
    this.classList.remove(...classes);
  };
  element.toggleClass = function (
    this: Element,
    classes: string | string[],
    value: boolean,
  ) {
    for (const cls of Array.isArray(classes) ? classes : [classes]) {
      this.classList.toggle(cls, value);
    }
  };
  element.hasClass = function (this: Element, cls: string) {
    return this.classList.contains(cls);
  };
  element.empty = function (this: Element) {
    while (this.firstChild) this.removeChild(this.firstChild);
  };
  element.detach = function (this: Element) {
    this.remove();
  };
  element.setText = function (this: Element, text: string) {
    this.textContent = text;
  };

  html.createEl = function (
    this: HTMLElement,
    tag: string,
    info?: ElementInfo | string,
    callback?: (el: never) => void,
  ) {
    return make(this.ownerDocument, this, tag, info, callback);
  };
  html.createDiv = function (
    this: HTMLElement,
    info?: ElementInfo | string,
    callback?: (el: never) => void,
  ) {
    return make(this.ownerDocument, this, 'div', info, callback);
  };
  html.createSpan = function (
    this: HTMLElement,
    info?: ElementInfo | string,
    callback?: (el: never) => void,
  ) {
    return make(this.ownerDocument, this, 'span', info, callback);
  };

  const globals = target as unknown as Record<string, unknown>;
  globals.createEl = (
    tag: string,
    info?: ElementInfo | string,
    callback?: (el: never) => void,
  ) => make(doc, null, tag, info, callback);
  globals.createDiv = (info?: ElementInfo | string, cb?: (el: never) => void) =>
    make(doc, null, 'div', info, cb);
  globals.createSpan = (
    info?: ElementInfo | string,
    cb?: (el: never) => void,
  ) => make(doc, null, 'span', info, cb);

  // jsdom lays nothing out, and implements neither of these; the plugin only
  // ever asks them to happen, never what came of them.
  if (!win.Element.prototype.scrollIntoView) {
    element.scrollIntoView = function () {};
  }
  if (!win.navigator.clipboard) {
    Object.defineProperty(win.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => {} },
    });
  }
}

installObsidianDom(globalThis);
