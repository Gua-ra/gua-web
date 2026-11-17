/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { type IContent, MsgType } from "matrix-js-sdk/src/matrix";

export const GUA_ACTIONS_KEY = "global.gua.actions";

const MAX_ACTIONS = 3;
const MAX_LABEL_LENGTH = 40;
const MAX_URL_LENGTH = 2048;
const MAX_BODY_LENGTH = 4096;
const MAX_START_TAGS = 200;
const MAX_OPEN_ELEMENTS = 20;
const MAX_OPEN_WITH_SAME_NAME = 3;
const MAX_PORT = 65535;
const MAX_CODE_POINT = 0x10ffff;
const WRAPPER_TAGS = new Set(["P", "DIV", "SPAN"]);

// Compared as written, never lowered: "<B>" is not an allowed tag.
const ELEMENT_NAMES = new Set(
    "a b blockquote code del div em h1 h2 h3 h4 h5 h6 i li ol p s span strong sub sup u ul".split(" "),
);
const HEADINGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
const NOT_IN_P = new Set(["blockquote", "div", ...HEADINGS, "li", "ol", "p", "ul"]);
const LISTS = new Set(["ul", "ol"]);
const BR_TAGS = ["<br>", "<br/>", "<br />"];
const NAME_CHARS = new Set("abcdefghijklmnopqrstuvwxyz0123456789");
const TAG_SPACE = new Set("\t\n\f\r ");
const ALLOWED_CONTROLS = new Set("\t\n\f\r");
const NAMED_REFERENCES = ["&amp;", "&lt;", "&gt;", "&quot;", "&apos;", "&nbsp;"];
const DECIMAL_DIGITS = new Set("0123456789");
const HEX_DIGITS = new Set("0123456789abcdefABCDEF");

// Unicode White_Space. String.prototype.trim differs: it keeps U+0085 and removes U+FEFF.
const WHITE_SPACE = new Set(
    "\t\n\v\f\r \u0085\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000",
);

const HOST_LABEL = String.raw`[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?`;
const URL_TAIL_CHAR = String.raw`(?:[-A-Za-z0-9._~:/?#@!$&'()*+,;=]|%[0-9A-Fa-f]{2})`;
// Checked on the raw string because URL parsers normalise input and disagree with each other.
const URL_PATTERN = new RegExp(
    String.raw`^https://${HOST_LABEL}(?:\.${HOST_LABEL})*(?::([1-9][0-9]{0,4}))?(?:[/?#]${URL_TAIL_CHAR}*)?$`,
);

export interface GuaAction {
    label: string;
    url: string;
}

export interface GuaMessage {
    readonly actions: readonly GuaAction[];
    /** Display only, for the tile that shows `actions`: the input itself when there are none. */
    readonly shown: IContent;
}

const NO_ACTIONS: readonly GuaAction[] = Object.freeze([]);

const messageCache = new WeakMap<IContent, GuaMessage>();

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const scalarLength = (value: string): number => Array.from(value).length;

// UTF-16 length is at least the scalar count and at most twice it, so only the middle range is counted.
const isBodyTooLong = (html: string): boolean =>
    html.length > MAX_BODY_LENGTH && (html.length > 2 * MAX_BODY_LENGTH || scalarLength(html) > MAX_BODY_LENGTH);

const isControl = (code: number): boolean => code <= 0x1f || (code >= 0x7f && code <= 0x9f);

// jsoup reads a literal U+FFFF as the end of its input.
const isNoncharacter = (code: number): boolean => (code >= 0xfdd0 && code <= 0xfdef) || (code & 0xfffe) === 0xfffe;

/** The index after the allowed character reference at `start`, or -1. */
function referenceEnd(html: string, start: number): number {
    const named = NAMED_REFERENCES.find((reference) => html.startsWith(reference, start));
    if (named) return start + named.length;
    if (html[start + 1] !== "#") return -1;
    const hex = html[start + 2] === "x" || html[start + 2] === "X";
    const digits = hex ? HEX_DIGITS : DECIMAL_DIGITS;
    const maxDigits = hex ? 6 : 7;
    const first = start + (hex ? 3 : 2);
    let end = first;
    while (end - first < maxDigits && digits.has(html[end])) end++;
    if (end === first || html[end] !== ";") return -1;
    const value = parseInt(html.slice(first, end), hex ? 16 : 10);
    const isScalar = value <= MAX_CODE_POINT && (value < 0xd800 || value > 0xdfff);
    return isScalar && !isControl(value) && !isNoncharacter(value) ? end + 1 : -1;
}

/** The index after the text character or allowed character reference at `start`, or -1. */
function textEnd(html: string, start: number): number {
    if (html[start] === "&") return referenceEnd(html, start);
    const code = html.codePointAt(start)!;
    if ((isControl(code) && !ALLOWED_CONTROLS.has(html[start])) || isNoncharacter(code)) return -1;
    return start + (code > 0xffff ? 2 : 1);
}

function nameEnd(html: string, start: number): number {
    let end = start;
    while (NAME_CHARS.has(html[end])) end++;
    return end;
}

/** The index after the quoted href that "<a" may carry at `start`, `start` itself when it has none, or -1. */
function hrefEnd(html: string, start: number): number {
    let i = start;
    while (TAG_SPACE.has(html[i])) i++;
    if (i === start) return start;
    if (!html.startsWith("href=", i)) return -1;
    const quote = html[i + 5];
    if (quote !== '"' && quote !== "'") return -1;
    i += 6;
    while (html[i] !== quote) {
        if (i === html.length || html[i] === "<" || html[i] === ">") return -1;
        i = textEnd(html, i);
        if (i < 0) return -1;
    }
    return i + 1;
}

/** Whether `name` may open inside `open`, innermost last, so that every HTML parser nests it as written. */
function mayOpen(open: readonly string[], name: string): boolean {
    const parent = open[open.length - 1];
    if (name === "li" && !LISTS.has(parent)) return false;
    if (name === "a" && open.includes("a")) return false;
    if (HEADINGS.has(name) && open.some((element) => HEADINGS.has(element))) return false;
    if (NOT_IN_P.has(name) && open.includes("p")) return false;
    return open.filter((element) => element === name).length < MAX_OPEN_WITH_SAME_NAME;
}

/** Rule 1: the strict form, read from the raw string in one pass with a stack of the open element names. */
function failsRawChecks(html: string): boolean {
    if (isBodyTooLong(html)) return true;
    const open: string[] = [];
    let startTags = 0;
    let i = 0;
    while (i < html.length) {
        // Some renderers keep only the li children of a list, so only raw space may sit beside them.
        const inList = LISTS.has(open[open.length - 1]);
        if (html[i] !== "<") {
            if (inList && !TAG_SPACE.has(html[i])) return true;
            i = textEnd(html, i);
            if (i < 0) return true;
            continue;
        }
        if (html[i + 1] === "/") {
            const end = nameEnd(html, i + 2);
            // Only element names other than br are ever open, so this also rejects "</br>" and unknown names.
            if (html[end] !== ">" || open.pop() !== html.slice(i + 2, end)) return true;
            i = end + 1;
            continue;
        }
        if (++startTags > MAX_START_TAGS) return true;
        const end = nameEnd(html, i + 1);
        const name = html.slice(i + 1, end);
        if (inList && name !== "li") return true;
        const br = BR_TAGS.find((tag) => html.startsWith(tag, i));
        if (br) {
            i += br.length;
            continue;
        }
        const close = name === "a" ? hrefEnd(html, end) : end;
        if (!ELEMENT_NAMES.has(name) || close < 0 || html[close] !== ">" || !mayOpen(open, name)) return true;
        open.push(name);
        if (open.length > MAX_OPEN_ELEMENTS) return true;
        i = close + 1;
    }
    return open.length > 0;
}

function trimWhiteSpace(value: string): string {
    let start = 0;
    let end = value.length;
    while (start < end && WHITE_SPACE.has(value[start])) start++;
    while (end > start && WHITE_SPACE.has(value[end - 1])) end--;
    return value.slice(start, end);
}

function parseHtml(html: string): HTMLElement {
    // Without the doctype the document is in quirks mode, which the fragment parse inherits. A DOMParser
    // document has no browsing context, so nothing in it runs or loads.
    const doc = new DOMParser().parseFromString("<!DOCTYPE html>", "text/html");
    doc.body.innerHTML = html;
    return doc.body;
}

function isAllowedUrl(url: string): boolean {
    // Only ASCII passes the pattern, so UTF-16 length equals the scalar count for any URL that can pass.
    const match = url.length <= MAX_URL_LENGTH ? URL_PATTERN.exec(url) : null;
    if (!match) return false;
    const port = match[1];
    return (port === undefined || Number(port) <= MAX_PORT) && url.indexOf("#") === url.lastIndexOf("#");
}

const isSpace = (node: Node): boolean =>
    node.nodeName === "BR" || (node.nodeType === Node.TEXT_NODE && trimWhiteSpace(node.textContent ?? "") === "");

function lastContent(parent: Node): ChildNode | null {
    let node = parent.lastChild;
    while (node && isSpace(node)) node = node.previousSibling;
    return node;
}

function trailingLink(body: HTMLElement): Element | null {
    let node = lastContent(body);
    while (node && WRAPPER_TAGS.has(node.nodeName)) node = lastContent(node);
    return node?.nodeName === "A" ? (node as Element) : null;
}

/** Removes `node`, the line breaks and whitespace before it, and everything after it (only space by construction). */
function removeWithSpace(node: ChildNode): void {
    while (node.nextSibling) node.nextSibling.remove();
    while (node.previousSibling && isSpace(node.previousSibling)) node.previousSibling.remove();
    node.remove();
}

/** Removes the trailing link of one of `actions` and the wrappers it leaves empty. */
function removeFallbackLink(body: HTMLElement, actions: readonly GuaAction[]): boolean {
    const link = trailingLink(body);
    if (!link) return false;

    const href = link.getAttribute("href");
    const text = trimWhiteSpace(link.textContent ?? "");
    if (!actions.some((action) => action.url === href && action.label === text)) return false;

    let removed: ChildNode = link;
    for (;;) {
        const parent = removed.parentElement!;
        removeWithSpace(removed);
        if (parent === body || lastContent(parent)) break;
        removed = parent;
    }
    return true;
}

function readMessage(content: IContent): GuaMessage {
    const none: GuaMessage = { actions: NO_ACTIONS, shown: content };
    if (content.msgtype !== MsgType.Text && content.msgtype !== MsgType.Notice) return none;
    const html = content.formatted_body;
    const raw = content[GUA_ACTIONS_KEY];
    if (content.format !== "org.matrix.custom.html" || typeof html !== "string" || !Array.isArray(raw)) return none;
    if (failsRawChecks(html)) return none;

    const candidates: GuaAction[] = [];
    for (const item of raw.slice(0, MAX_ACTIONS)) {
        if (!isObject(item) || item.type !== "open_url") continue;
        if (typeof item.label !== "string" || typeof item.url !== "string") continue;
        const label = trimWhiteSpace(item.label);
        const labelLength = scalarLength(label);
        if (labelLength < 1 || labelLength > MAX_LABEL_LENGTH || !isAllowedUrl(item.url)) continue;
        candidates.push({ label, url: item.url });
    }
    if (!candidates.length) return none;

    const body = parseHtml(html);
    const hrefs = new Set(Array.from(body.querySelectorAll("a[href]"), (link) => link.getAttribute("href")));
    const seen = new Set<string>();
    const actions = candidates.filter(({ url }) => {
        if (!hrefs.has(url) || seen.has(url)) return false;
        seen.add(url);
        return true;
    });
    if (!actions.length) return none;

    const removed = removeFallbackLink(body, actions);
    // Serialized from the tree the hrefs came from, so the bubble shows the links the actions were checked against.
    const shown: IContent = { ...content, formatted_body: body.innerHTML };
    // EventContentBody falls back to the plain body when the formatted one renders empty, and that body has the link.
    if (removed) shown.body = "";
    return { actions, shown };
}

/**
 * `content` must be the displayed content, as MatrixEvent.getContent() returns it: an edit is already resolved
 * to its m.new_content, so it is never unwrapped here and an m.relates_to inside it is ignored.
 */
export function getGuaMessage(content: IContent): GuaMessage {
    let message = messageCache.get(content);
    if (!message) {
        message = readMessage(content);
        messageCache.set(content, message);
    }
    return message;
}
