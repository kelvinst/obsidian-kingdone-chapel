/**
 * A runtime `obsidian` module, for the tests.
 *
 * The real package ships type declarations and no code — the app itself
 * provides the classes at runtime — so a module that imports from `obsidian`
 * has nothing to import under Vitest. `resolve.alias` points the name here
 * instead, at just enough of the API for the plugin to run: the classes it
 * extends, the ones it asks `instanceof` about, and the handful of helpers it
 * calls.
 *
 * Only the runtime shape lives here. Source files keep type-checking against
 * the real declarations, which is what keeps this stub from quietly drifting
 * into an API Obsidian does not have.
 */

import { StateField } from '@codemirror/state';

export type EventRef = { off: () => void };

/**
 * Whether an editor is drawing live preview rather than the source.
 *
 * The app fills this in; a state built by a test carries it only when the test
 * says which of the two it is standing in for.
 */
export const editorLivePreviewField = StateField.define<boolean>({
  create: () => true,
  update: (value) => value,
});

export class Component {
  _loaded = false;
  _children: Component[] = [];
  _cleanups: (() => void)[] = [];

  load() {
    this._loaded = true;
    this.onload();
    for (const child of this._children) child.load();
  }

  onload() {}

  unload() {
    this._loaded = false;
    for (const child of this._children.splice(0)) child.unload();
    for (const off of this._cleanups.splice(0)) off();
    this.onunload();
  }

  onunload() {}

  addChild<T extends Component>(child: T): T {
    this._children.push(child);
    if (this._loaded) child.load();
    return child;
  }

  removeChild<T extends Component>(child: T): T {
    const at = this._children.indexOf(child);
    if (at >= 0) this._children.splice(at, 1);
    return child;
  }

  register(cb: () => void) {
    this._cleanups.push(cb);
  }

  registerEvent(ref: EventRef) {
    if (ref && typeof ref.off === 'function') this.register(() => ref.off());
  }

  registerDomEvent(
    el: Document | Window | HTMLElement,
    type: string,
    handler: (evt: never) => void,
  ) {
    const listener = handler as EventListener;
    el.addEventListener(type, listener);
    this.register(() => el.removeEventListener(type, listener));
  }

  registerInterval(id: number): number {
    this.register(() => clearInterval(id));
    return id;
  }
}

export class TAbstractFile {
  path = '';
  name = '';
  parent: TFolder | null = null;
}

export class TFile extends TAbstractFile {
  basename = '';
  extension = 'md';
  stat = { ctime: 0, mtime: 0, size: 0 };
}

export class TFolder extends TAbstractFile {
  children: TAbstractFile[] = [];

  isRoot() {
    return this.path === '/';
  }
}

export class WorkspaceLeaf {
  view: unknown = null;
}

export class View extends Component {
  app: unknown;
  containerEl: HTMLElement;
  contentEl: HTMLElement;

  constructor(public leaf: { app?: unknown }) {
    super();
    this.app = leaf ? leaf.app : null;
    this.containerEl = document.createElement('div');
    this.contentEl = document.createElement('div');
    this.containerEl.append(this.contentEl);
  }

  getViewType(): string {
    return '';
  }

  getDisplayText(): string {
    return '';
  }

  getIcon(): string {
    return 'document';
  }
}

export class ItemView extends View {}

/**
 * Enough of a chapter pane to be handed round: the file it holds, the editor
 * or the rendered page it shows it in, and which of the two that is. Tests
 * fill those in; nothing here reads them.
 */
export class MarkdownView extends ItemView {
  file: TFile | null = null;
  editor: unknown = null;
  previewMode: { containerEl: HTMLElement } | null = null;
  mode: 'source' | 'preview' = 'source';

  getViewType(): string {
    return 'markdown';
  }

  getMode(): 'source' | 'preview' {
    return this.mode;
  }
}

/** Every notice raised since the last reset, newest last. */
export const notices: { message: string; timeout?: number }[] = [];

export function clearNotices() {
  notices.length = 0;
}

export class Notice {
  noticeEl: HTMLElement | null = null;

  constructor(
    public message: string | DocumentFragment,
    public timeout?: number,
  ) {
    notices.push({ message: String(message), timeout });
  }

  setMessage(message: string) {
    this.message = message;
  }

  hide() {}
}

/** Icons are drawn as an attribute, so a test can read back which one it is. */
export function setIcon(el: HTMLElement, icon: string) {
  el.setAttribute('data-icon', icon);
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

/**
 * The file part of a link, without the heading or block it goes on to name:
 * `NVI-43-JHN-001#^nvi-jhn-1-1` points at the chapter, and it is the chapter
 * that has to be looked up.
 */
export function getLinkpath(linktext: string): string {
  return linktext.split('#')[0];
}

/**
 * Whether a click asked for a new pane. The app reads the platform's own
 * modifier; a test says which one it pressed and this believes it.
 */
export class Keymap {
  static isModEvent(evt?: MouseEvent | KeyboardEvent | null): boolean | 'tab' {
    return !!evt && (evt.ctrlKey || evt.metaKey);
  }
}

export class MarkdownRenderer {
  /** Every render since the last reset, so a test can see what was drawn. */
  static rendered: { markdown: string; path: string }[] = [];

  static async render(
    _app: unknown,
    markdown: string,
    el: HTMLElement,
    path: string,
    _component: unknown,
  ) {
    MarkdownRenderer.rendered.push({ markdown, path });
    el.textContent = markdown;
  }
}

export class Modal {
  containerEl: HTMLElement;
  modalEl: HTMLElement;
  contentEl: HTMLElement;
  titleEl: HTMLElement;
  opened = false;

  constructor(public app: unknown) {
    this.containerEl = document.createElement('div');
    this.modalEl = document.createElement('div');
    this.titleEl = document.createElement('div');
    this.contentEl = document.createElement('div');
    this.containerEl.append(this.modalEl);
    this.modalEl.append(this.titleEl, this.contentEl);
  }

  open() {
    this.opened = true;
    this.onOpen();
  }

  close() {
    this.opened = false;
    this.onClose();
  }

  onOpen() {}

  onClose() {}
}

export interface Instruction {
  command: string;
  purpose: string;
}

export class SuggestModal<T> extends Modal {
  placeholder = '';
  instructions: Instruction[] = [];
  limit = 100;

  setPlaceholder(placeholder: string) {
    this.placeholder = placeholder;
  }

  setInstructions(instructions: Instruction[]) {
    this.instructions = instructions;
  }

  getSuggestions(_query: string): T[] | Promise<T[]> {
    return [];
  }

  renderSuggestion(_value: T, _el: HTMLElement) {}

  onChooseSuggestion(_item: T, _evt: MouseEvent | KeyboardEvent) {}
}

/** Keys a popup asked to be told about, in the order they were registered. */
export interface Registered {
  modifiers: string[] | null;
  key: string;
  handler: (evt: KeyboardEvent) => boolean | void;
}

export class EditorSuggest<T> extends Component {
  context: unknown = null;
  instructions: Instruction[] = [];
  limit = 100;
  /**
   * Obsidian's own popup owns the keyboard, and none of that is what the
   * plugin's code says. Only the registering is kept, so a test can find the
   * key a popup asked for and press it.
   */
  scope = {
    register: (
      modifiers: string[] | null,
      key: string,
      handler: (evt: KeyboardEvent) => boolean | void,
    ) => {
      this.registered.push({ modifiers, key, handler });
    },
  };
  /** Every key the popup registered, for a test to press one of them. */
  registered: Registered[] = [];

  constructor(public app: unknown) {
    super();
  }

  setInstructions(instructions: Instruction[]) {
    this.instructions = instructions;
  }

  getSuggestions(_ctx: unknown): T[] | Promise<T[]> {
    return [];
  }

  renderSuggestion(_value: T, _el: HTMLElement) {}

  selectSuggestion(_value: T, _evt: MouseEvent | KeyboardEvent) {}
}

export class PluginSettingTab {
  containerEl: HTMLElement;

  constructor(
    public app: unknown,
    public plugin: unknown,
  ) {
    this.containerEl = document.createElement('div');
  }

  display() {}

  hide() {}
}

export interface Command {
  id: string;
  name: string;
  callback?: () => void;
  checkCallback?: (checking: boolean) => boolean | void;
}

export class Plugin extends Component {
  /** What `onload` wired up, for a test to call back into. */
  commands: Command[] = [];
  views = new Map<string, (leaf: unknown) => unknown>();
  settingTabs: PluginSettingTab[] = [];
  suggests: unknown[] = [];
  /** What `onload` gave the renderer, for a test to run over an element. */
  postProcessors: ((el: HTMLElement, ctx: never) => unknown)[] = [];
  /** What `onload` gave the editor, so a test can see one was. */
  editorExtensions: unknown[] = [];
  ribbons: { icon: string; title: string; callback: () => void }[] = [];
  /** What `saveData` last wrote, which is what `loadData` reads back. */
  data: unknown = null;

  constructor(
    public app: unknown,
    public manifest: unknown = { id: 'test', version: '0.0.0' },
  ) {
    super();
  }

  addCommand(command: Command): Command {
    const at = this.commands.findIndex((c) => c.id === command.id);
    if (at >= 0) this.commands[at] = command;
    else this.commands.push(command);
    return command;
  }

  addRibbonIcon(
    icon: string,
    title: string,
    callback: () => void,
  ): HTMLElement {
    this.ribbons.push({ icon, title, callback });
    const el = document.createElement('div');
    el.addEventListener('click', () => callback());
    return el;
  }

  addSettingTab(tab: PluginSettingTab) {
    this.settingTabs.push(tab);
  }

  registerView(type: string, factory: (leaf: unknown) => unknown) {
    this.views.set(type, factory);
  }

  registerEditorSuggest(suggest: unknown) {
    this.suggests.push(suggest);
  }

  registerMarkdownPostProcessor<T>(
    processor: (el: HTMLElement, ctx: T) => unknown,
  ): (el: HTMLElement, ctx: T) => unknown {
    this.postProcessors.push(
      processor as (el: HTMLElement, ctx: never) => unknown,
    );
    return processor;
  }

  registerEditorExtension(extension: unknown) {
    this.editorExtensions.push(extension);
  }

  async loadData(): Promise<unknown> {
    return this.data;
  }

  async saveData(data: unknown): Promise<void> {
    this.data = data;
  }
}

class ValueComponent<T, V> {
  protected changed: ((value: V) => unknown) | null = null;

  onChange(cb: (value: V) => unknown): T {
    this.changed = cb;
    return this as unknown as T;
  }

  setDisabled(_disabled: boolean): T {
    return this as unknown as T;
  }

  setTooltip(_tooltip: string): T {
    return this as unknown as T;
  }
}

export class DropdownComponent extends ValueComponent<
  DropdownComponent,
  string
> {
  selectEl: HTMLSelectElement;

  constructor(container: HTMLElement) {
    super();
    this.selectEl = document.createElement('select');
    container.append(this.selectEl);
    this.selectEl.addEventListener('change', () => {
      if (this.changed) this.changed(this.selectEl.value);
    });
  }

  addOption(value: string, display: string): DropdownComponent {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = display;
    this.selectEl.append(option);
    return this;
  }

  addOptions(options: Record<string, string>): DropdownComponent {
    for (const [value, display] of Object.entries(options)) {
      this.addOption(value, display);
    }
    return this;
  }

  getValue(): string {
    return this.selectEl.value;
  }

  setValue(value: string): DropdownComponent {
    this.selectEl.value = value;
    return this;
  }

  /** What choosing an entry does, as the app would do it. */
  choose(value: string) {
    this.selectEl.value = value;
    this.selectEl.dispatchEvent(new Event('change'));
  }
}

export class TextComponent extends ValueComponent<TextComponent, string> {
  inputEl: HTMLInputElement;

  constructor(container: HTMLElement) {
    super();
    this.inputEl = document.createElement('input');
    this.inputEl.type = 'text';
    container.append(this.inputEl);
    this.inputEl.addEventListener('input', () => {
      if (this.changed) this.changed(this.inputEl.value);
    });
  }

  getValue(): string {
    return this.inputEl.value;
  }

  setValue(value: string): TextComponent {
    this.inputEl.value = value;
    return this;
  }

  setPlaceholder(placeholder: string): TextComponent {
    this.inputEl.placeholder = placeholder;
    return this;
  }

  /** What typing into the field does, as the app would do it. */
  type(value: string) {
    this.inputEl.value = value;
    this.inputEl.dispatchEvent(new Event('input'));
  }
}

export class ToggleComponent extends ValueComponent<ToggleComponent, boolean> {
  toggleEl: HTMLInputElement;

  constructor(container: HTMLElement) {
    super();
    this.toggleEl = document.createElement('input');
    this.toggleEl.type = 'checkbox';
    container.append(this.toggleEl);
    this.toggleEl.addEventListener('change', () => {
      if (this.changed) this.changed(this.toggleEl.checked);
    });
  }

  getValue(): boolean {
    return this.toggleEl.checked;
  }

  setValue(value: boolean): ToggleComponent {
    this.toggleEl.checked = value;
    return this;
  }

  /** What flipping the switch does, as the app would do it. */
  flip(value: boolean) {
    this.toggleEl.checked = value;
    this.toggleEl.dispatchEvent(new Event('change'));
  }
}

export class ButtonComponent {
  buttonEl: HTMLButtonElement;

  constructor(container: HTMLElement) {
    this.buttonEl = document.createElement('button');
    container.append(this.buttonEl);
  }

  setButtonText(text: string): ButtonComponent {
    this.buttonEl.textContent = text;
    return this;
  }

  setIcon(icon: string): ButtonComponent {
    setIcon(this.buttonEl, icon);
    return this;
  }

  setTooltip(tooltip: string): ButtonComponent {
    this.buttonEl.setAttribute('aria-label', tooltip);
    return this;
  }

  setCta(): ButtonComponent {
    this.buttonEl.addClass('mod-cta');
    return this;
  }

  onClick(cb: (evt: MouseEvent) => unknown): ButtonComponent {
    this.buttonEl.addEventListener('click', (evt) => cb(evt));
    return this;
  }
}

export class Setting {
  settingEl: HTMLElement;
  infoEl: HTMLElement;
  nameEl: HTMLElement;
  descEl: HTMLElement;
  controlEl: HTMLElement;
  components: unknown[] = [];

  constructor(container: HTMLElement) {
    this.settingEl = document.createElement('div');
    this.settingEl.className = 'setting-item';
    container.append(this.settingEl);
    this.infoEl = document.createElement('div');
    this.nameEl = document.createElement('div');
    this.nameEl.className = 'setting-item-name';
    this.descEl = document.createElement('div');
    this.descEl.className = 'setting-item-description';
    this.controlEl = document.createElement('div');
    this.controlEl.className = 'setting-item-control';
    this.infoEl.append(this.nameEl, this.descEl);
    this.settingEl.append(this.infoEl, this.controlEl);
  }

  setName(name: string): Setting {
    this.nameEl.textContent = name;
    return this;
  }

  setDesc(desc: string): Setting {
    this.descEl.textContent = desc;
    return this;
  }

  setHeading(): Setting {
    this.settingEl.className += ' setting-item-heading';
    return this;
  }

  setClass(cls: string): Setting {
    this.settingEl.className += ' ' + cls;
    return this;
  }

  addDropdown(cb: (component: DropdownComponent) => unknown): Setting {
    const component = new DropdownComponent(this.controlEl);
    this.components.push(component);
    cb(component);
    return this;
  }

  addText(cb: (component: TextComponent) => unknown): Setting {
    const component = new TextComponent(this.controlEl);
    this.components.push(component);
    cb(component);
    return this;
  }

  addToggle(cb: (component: ToggleComponent) => unknown): Setting {
    const component = new ToggleComponent(this.controlEl);
    this.components.push(component);
    cb(component);
    return this;
  }

  addButton(cb: (component: ButtonComponent) => unknown): Setting {
    const component = new ButtonComponent(this.controlEl);
    this.components.push(component);
    cb(component);
    return this;
  }
}
