import { EditorSuggest } from 'obsidian';
import type { Editor, EditorPosition, EditorSuggestContext, EditorSuggestTriggerInfo, TFile } from 'obsidian';

import { abbrLabel, langsFor, matchBooks, plain } from './books';
import { parseReference, verseLabels } from './reference';
import type { BookMatch } from './books';
import type KingdoneChapelPlugin from './main';

/**
 * `@` followed by a reference. The reference itself may hold spaces (`1 Joao
 * 1.1`), so the popup stays open across them and closes by finding no book
 * rather than by hitting a separator. Capped so a whole paragraph after a
 * stray `@` is not re-parsed on every keystroke.
 */
const TRIGGER = /(?:^|[^\p{L}\p{N}_@])@([\p{L}\p{N} .,:-]{0,40})$/u;

/** One way the query could be linked: a book the reader may have meant, under
 * one of the names they may want it written as. */
export interface RefSuggestion {
  version: string;
  /** `João 1.1-3` — the reference as the note will read it, and the popup row. */
  ref: string;
  /** Book `ref` points at, for the rows where an abbreviation hides it. */
  book: string;
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
    const langs = langsFor(this.plugin.settings.language);
    for (const match of matchBooks(parsed.book, 6, langs)) {
      const file = this.plugin.referenceFile(version, match.book.index, parsed.chapter);
      if (!file) continue;

      const name = match.book.names[match.lang];
      try {
        // The anchors and the opening verse are the passage, not the wording,
        // so both forms of the same book share the one read.
        const anchors = await this.plugin.findAnchors(file, parsed.chapter, parsed.verses);
        const preview = await this.previewOf(file, parsed.chapter, parsed.verses);

        for (const form of this.forms(match, name)) {
          const labels = verseLabels(form, parsed.chapter, parsed.verses);
          const links = labels.map((label, i) => this.link(file, anchors[i] || null, label, ctx.file));
          out.push({ version, ref: labels.join(','), book: name, preview, markdown: links.join(',') });
        }
      } catch (e) {
        // Both reads go to the file the index named, which may have gone away
        // since it was indexed. Leave that book out rather than taking the
        // whole popup down with it.
        continue;
      }
    }
    return out;
  }

  /**
   * The names to offer one book under. Someone who wrote `@Jn 1.1` wants the
   * note to go on saying `Jn 1.1`, so the abbreviation they typed comes first;
   * the full name follows for when they meant it spelled out. Writing the name
   * itself leaves nothing to choose between, and offers only the one row.
   */
  forms(match: BookMatch, name: string): string[] {
    const abbr = match.abbr ? abbrLabel(match.abbr) : null;
    return abbr && plain(abbr) !== plain(name) ? [abbr, name] : [name];
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
    // The row reads as the reference it will write. An abbreviation does not
    // say which book that is — `Jn` is Jonas in Portuguese and John in English —
    // so name the book behind it, and leave it off when the row already says it.
    if (!item.ref.startsWith(item.book)) {
      head.createSpan({ cls: 'kcp-suggest-book', text: item.book });
    }
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
