/**
 * The `~sub~` and `^sup^` syntax: subscript and superscript without the tags.
 *
 * Notes want the two often enough — a verse number beside a word, a footnote
 * marker of one's own, `H~2~O` — and Obsidian offers no Markdown for either,
 * only raw `<sub>` and `<sup>` written into the note. A CSS snippet cannot add
 * the syntax: nothing in the rendered output marks the passage, so there is
 * nothing for a rule to select. The marking is what this does.
 *
 * The delimiters are the ones Pandoc and markdown-it use, so a note carrying
 * them still reads as intended outside this vault. A single `~` is free in
 * Obsidian — strikethrough takes two — and a lone `^` only means anything at
 * the end of a line, where it names a block.
 *
 * The delimiters are dropped rather than hidden: reading view is finished
 * text, with no cursor that could ever want them back.
 */

/**
 * One run of either kind: `~text~` in group 1, `^text^` in group 2.
 *
 * Both are read the same way. Neither end of a run may be a space, which is
 * what keeps `a ~ b ~ c` — a tilde written as itself — from being read as one;
 * neither may the run hold its own delimiter, which is what stops `~a~ e ~b~`
 * from closing on the last tilde rather than the first. The tilde is barred
 * from touching another tilde besides, so `~~riscado~~` stays strikethrough.
 */
const RUN =
  /(?<!~)~([^~\s](?:[^~]*?[^~\s])?)~(?!~)|\^([^^\s](?:[^^]*?[^^\s])?)\^/g;

/**
 * Elements whose text is not prose and must be left exactly as written: code,
 * inline and fenced alike, and rendered maths, where `^` is an exponent and a
 * `~` is the author's own. A run inside any of them is part of what is quoted.
 */
function verbatim(el: Element): boolean {
  return (
    el.tagName === 'CODE' ||
    el.tagName === 'PRE' ||
    el.classList.contains('math')
  );
}

/** Rewrite one text node in place, if it holds any runs. */
function markRuns(text: Text) {
  const value = text.data;
  RUN.lastIndex = 0;
  let match = RUN.exec(value);
  if (!match) return;

  const doc = text.ownerDocument;
  const out = doc.createDocumentFragment();
  let at = 0;
  while (match) {
    if (match.index > at) {
      out.appendChild(doc.createTextNode(value.slice(at, match.index)));
    }
    const tag = match[1] === undefined ? 'sup' : 'sub';
    const mark = doc.createElement(tag);
    // Its own class as well as the tag, so the plugin's styling stays off the
    // `<sub>` and `<sup>` a note writes by hand.
    mark.className = `kcp-${tag}`;
    mark.textContent = match[1] === undefined ? match[2] : match[1];
    out.appendChild(mark);
    at = match.index + match[0].length;
    match = RUN.exec(value);
  }
  if (at < value.length) out.appendChild(doc.createTextNode(value.slice(at)));

  text.replaceWith(out);
}

/**
 * Mark every `~sub~` and `^sup^` under `el`, as a markdown post-processor.
 *
 * Runs are read one text node at a time, which is also what bounds them: a
 * pair spanning the end of a link and the start of the text after it was never
 * one run to the reader either, and is left alone.
 */
export function renderSubSup(el: HTMLElement) {
  // A live child list would be walked into the fragments this leaves behind.
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) markRuns(node as Text);
    else if (
      node.nodeType === Node.ELEMENT_NODE &&
      !verbatim(node as Element)
    ) {
      renderSubSup(node as HTMLElement);
    }
  }
}
