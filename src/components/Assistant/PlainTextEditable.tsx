import React, { useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react';

/** The slice of the textarea API the composer relies on. */
export interface PlainTextEditableHandle {
  focus: () => void;
  getSelectionStart: () => number;
  setSelectionRange: (start: number, end?: number) => void;
}

interface PlainTextEditableProps {
  value: string;
  onChange: (value: string, selectionStart: number) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  /** Runs before the default plain-text paste; call `preventDefault()` to take over the paste. */
  onPaste?: (event: React.ClipboardEvent<HTMLDivElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  enterKeyHint?: React.HTMLAttributes<HTMLDivElement>['enterKeyHint'];
  className?: string;
  placeholderClassName?: string;
  editorRef?: React.Ref<PlainTextEditableHandle>;
}

const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DIV', 'DL', 'DT', 'FIGURE', 'FOOTER',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE',
  'SECTION', 'TABLE', 'TR', 'UL',
]);

const BLOCKED_INPUT_TYPES = new Set([
  'insertFromDrop',
  'insertHorizontalRule',
  'insertLink',
  'insertOrderedList',
  'insertUnorderedList',
]);

const PLAIN_PASTE_INPUT_TYPES = new Set(['insertFromPaste', 'insertFromPasteAsQuotation', 'insertFromYank']);

/**
 * Reads the text a subtree renders under `white-space: pre-wrap`: text nodes verbatim, `<br>` as a
 * newline and block elements on lines of their own. A trailing newline is kept here because it
 * only shows up as a line once something follows it; `readValue` drops it.
 */
function serialize(root: Node): string {
  let text = '';
  let pendingBreak = false;

  const append = (chunk: string) => {
    if (pendingBreak && text && !text.endsWith('\n')) text += '\n';
    pendingBreak = false;
    text += chunk;
  };

  const walk = (node: Node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        if (child.nodeValue) append(child.nodeValue);
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;

      const tag = (child as Element).tagName;
      if (tag === 'BR') {
        append('\n');
        return;
      }

      const isBlock = BLOCK_TAGS.has(tag);
      if (isBlock) {
        if (text && !text.endsWith('\n')) text += '\n';
        pendingBreak = false;
      }
      walk(child);
      if (isBlock) pendingBreak = true;
    });
  };

  walk(root);
  return text;
}

function readValue(root: HTMLElement) {
  const text = serialize(root);
  return text.endsWith('\n') ? text.slice(0, -1) : text;
}

function writeValue(root: HTMLElement, value: string) {
  // A lone trailing newline does not render as a line, so pad it the way the browser does.
  root.textContent = value.endsWith('\n') ? `${value}\n` : value;
}

/** Text offset of a DOM boundary point inside `root`. */
function textOffset(root: HTMLElement, node: Node, offset: number) {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return serialize(range.cloneContents()).length;
}

/** DOM boundary point for a text offset inside `root`. */
function domPosition(root: HTMLElement, offset: number): { node: Node; offset: number } {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) {
      const start = textOffset(root, node, 0);
      const length = node.nodeValue?.length ?? 0;
      if (offset >= start && offset <= start + length) return { node, offset: offset - start };
    } else if ((node as Element).tagName === 'BR' && node.parentNode) {
      const index = Array.prototype.indexOf.call(node.parentNode.childNodes, node);
      if (textOffset(root, node.parentNode, index) === offset) return { node: node.parentNode, offset: index };
    }
  }
  return { node: root, offset: root.childNodes.length };
}

function selectTextRange(root: HTMLElement, start: number, end = start) {
  const selection = window.getSelection();
  if (!selection) return;
  const length = readValue(root).length;
  const from = domPosition(root, Math.max(0, Math.min(start, length)));
  const to = domPosition(root, Math.max(0, Math.min(end, length)));
  const range = document.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  selection.removeAllRanges();
  selection.addRange(range);
}

function selectionInside(root: HTMLElement) {
  const selection = window.getSelection();
  return Boolean(selection && selection.rangeCount > 0 && root.contains(selection.getRangeAt(0).startContainer));
}

function execInsertLineBreak() {
  try {
    if (document.execCommand('insertLineBreak')) return true;
  } catch {
    // Not every engine exposes insertLineBreak to execCommand.
  }
  return document.execCommand('insertText', false, '\n');
}

/**
 * Inserts plain text at the caret through editing commands, so it fires `input` and lands on the
 * undo stack. Newlines go in as line breaks: inserting them as text would split the editor into
 * `<div>` paragraphs.
 */
function insertPlainText(text: string) {
  text.replace(/\r\n?/g, '\n').split('\n').forEach((line, index) => {
    if (index > 0) execInsertLineBreak();
    if (line) document.execCommand('insertText', false, line);
  });
}

/**
 * A plain-text, textarea-like editor built on `contenteditable="true"`.
 *
 * Chrome on Android only lets the keyboard insert media (Gboard clipboard images, GIFs, stickers)
 * into richly editable elements — `<textarea>` and `contenteditable="plaintext-only"` don't
 * qualify. Chrome then delivers the image as a `paste` event carrying the file, which `onPaste`
 * receives like any other pasted image. Everything else is kept to plain text.
 */
export function PlainTextEditable({
  value,
  onChange,
  onKeyDown,
  onPaste,
  placeholder,
  disabled = false,
  enterKeyHint,
  className = '',
  placeholderClassName = '',
  editorRef,
}: PlainTextEditableProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  const getSelectionStart = () => {
    const root = rootRef.current;
    if (!root) return value.length;
    const length = readValue(root).length;
    if (!selectionInside(root)) return length;
    const range = window.getSelection()!.getRangeAt(0);
    return Math.min(textOffset(root, range.startContainer, range.startOffset), length);
  };

  useImperativeHandle(editorRef, () => ({
    focus: () => {
      const root = rootRef.current;
      if (!root) return;
      const hadSelection = selectionInside(root);
      root.focus();
      if (!hadSelection) selectTextRange(root, readValue(root).length);
    },
    getSelectionStart,
    setSelectionRange: (start: number, end?: number) => {
      if (rootRef.current) selectTextRange(rootRef.current, start, end);
    },
  }));

  // Uncontrolled while typing (rewriting the DOM would break IME composition); only programmatic
  // value changes are written back, moving the caret to the end like a textarea does.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || readValue(root) === value) return;
    writeValue(root, value);
    if (document.activeElement === root) selectTextRange(root, value.length);
  }, [value]);

  // React's onBeforeInput is a polyfill without `inputType`, so listen to the native event.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const handleBeforeInput = (event: InputEvent) => {
      const { inputType } = event;
      if (inputType === 'insertParagraph') {
        event.preventDefault();
        execInsertLineBreak();
      } else if (PLAIN_PASTE_INPUT_TYPES.has(inputType)) {
        event.preventDefault();
        insertPlainText(event.dataTransfer?.getData('text/plain') ?? event.data ?? '');
      } else if (inputType.startsWith('format') || BLOCKED_INPUT_TYPES.has(inputType)) {
        event.preventDefault();
      }
    };

    root.addEventListener('beforeinput', handleBeforeInput);
    return () => root.removeEventListener('beforeinput', handleBeforeInput);
  }, []);

  const handleInput = () => {
    const root = rootRef.current;
    if (root) onChange(readValue(root), getSelectionStart());
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    onPaste?.(event);
    if (event.defaultPrevented) return;
    event.preventDefault();
    insertPlainText(event.clipboardData.getData('text/plain'));
  };

  return (
    <div className={`relative ${disabled ? 'opacity-50' : ''}`}>
      {!value && placeholder && (
        <span aria-hidden="true" className={`pointer-events-none absolute inset-x-0 top-0 truncate ${placeholderClassName}`}>
          {placeholder}
        </span>
      )}
      <div
        ref={rootRef}
        contentEditable={!disabled}
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder}
        aria-placeholder={placeholder}
        aria-disabled={disabled || undefined}
        enterKeyHint={enterKeyHint}
        onInput={handleInput}
        onKeyDown={onKeyDown}
        onPaste={handlePaste}
        className={`whitespace-pre-wrap break-words select-text ${className}`}
      />
    </div>
  );
}
