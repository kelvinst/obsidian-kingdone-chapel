import { EditorSuggest } from 'obsidian';
import type { Editor, EditorPosition, EditorSuggestContext, EditorSuggestTriggerInfo, TFile } from 'obsidian';

import { matchBooks } from './books';
import { parseReference, verseLabels } from './reference';
import type KingdoneChapelPlugin from './main';

/**
 * `@` followed by a reference. The reference itself may hold spaces (`1 Joao
 * 1.1`), so the popup stays open across them and closes by finding no book
 * rather than by hitting a separator. Capped so a whole paragraph after a
 * stray `@` is not re-parsed on every keystroke.
 */
const TRIGGER = /(?:^|[^\p{L}\p{N}_@])@([\p{L}\p{N} .,:-]{0,40})$/u;

/** One book the query could have meant, already resolved to a file. */
export interface RefSuggestion {
  version: string;
  /** `João 1.1-3`, for the popup row. */
  ref: string;
  /** First verse of the passage, as a taste of what the link points at. */
  preview: string;
  /** The links to insert, ready to go. */
  markdown: string;
}

export class ReferenceSuggest extends EditorSuggest<RefSuggestion> {
  plugin: KingdoneChapelPlugin;

  constructor(plugin: KingdoneChapelPlugin) {
    super(plugin.app);
    this.plugin = plugin;
  }

  onTrigger(cursor: EditorPosition, editor: Editor): EditorSuggestTriggerInfo | null {
    const line = editor.getLine(cursor.line).slice(0, cursor.ch);
    const m = line.match(TRIGGER);
    if (!m || !m[1].trim()) return null;
    return {
      start: { line: cursor.line, ch: cursor.ch - m[1].length - 1 },
      end: cursor,
      query: m[1],
    };
  }

  async getSuggestions(ctx: EditorSuggestContext): Promise<RefSuggestion[]> {
    const parsed = parseReference(ctx.query, (word) => this.plugin.findVersion(word) !== null);
    if (!parsed) return [];

    const version =
      (parsed.version && this.plugin.findVersion(parsed.version)) ||
      this.plugin.defaultVersion(ctx.file);
    if (!version) return [];

    const out: RefSuggestion[] = [];
    for (const match of matchBooks(parsed.book, 6)) {
      const file = this.plugin.referenceFile(version, match.book.index, parsed.chapter);
      if (!file) continue;

      const name = match.book.names[match.lang];
      const labels = verseLabels(name, parsed.chapter, parsed.verses);
      const anchors = await this.plugin.findAnchors(file, parsed.chapter, parsed.verses);
      const links = labels.map((label, i) => this.link(file, anchors[i] || null, label, ctx.file));

      out.push({
        version,
        ref: labels.join(','),
        preview: await this.previewOf(file, parsed.chapter, parsed.verses),
        markdown: links.join(','),
      });
    }
    return out;
  }

  /** `[[NVI-43-JHN-001#^nvi-jhn-1-1|João 1.1]]`, with the link the vault expects. */
  link(file: TFile, anchor: string | null, label: string, from: TFile | null): string {
    const path = this.app.metadataCache.fileToLinktext(file, from ? from.path : '', true);
    return `[[${path}${anchor ? '#^' + anchor : ''}|${label}]]`;
  }

  /** First verse of the passage. A book index file holds none, so it shows bare. */
  async previewOf(file: TFile, chapter: number | null, verses: number[]): Promise<string> {
    if (chapter === null) return '';
    const match = await this.plugin.verseIn(file, verses.length ? verses[0] : null);
    return match ? match.text : '';
  }

  renderSuggestion(item: RefSuggestion, el: HTMLElement) {
    const head = el.createDiv({ cls: 'kcp-suggest-head' });
    head.createSpan({ cls: 'kcp-suggest-ref', text: item.ref });
    head.createSpan({ cls: 'kcp-version', text: item.version });
    if (item.preview) el.createEl('small', { text: item.preview, cls: 'kcp-preview' });
  }

  selectSuggestion(item: RefSuggestion) {
    const ctx = this.context;
    if (!ctx) return;
    ctx.editor.replaceRange(item.markdown, ctx.start, ctx.end);
    ctx.editor.setCursor({ line: ctx.start.line, ch: ctx.start.ch + item.markdown.length });
  }
}
