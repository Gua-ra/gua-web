/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { type IContent, MsgType, RelationType } from "matrix-js-sdk/src/matrix";

export const GUA_ACTIONS_KEY = "global.gua.actions";

const MAX_ACTIONS = 3;
const MAX_LABEL_LENGTH = 40;
const MAX_URL_LENGTH = 2048;
const MAX_BODY_LENGTH = 4096;
const MAX_PORT = 65535;
const MAX_WRAPPER_DESCENTS = 100;
const WRAPPER_TAGS = new Set(["P", "DIV", "SPAN"]);

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

const NO_ACTIONS: readonly GuaAction[] = Object.freeze([]);

const actionsCache = new WeakMap<IContent, readonly GuaAction[]>();
const strippedCache = new WeakMap<IContent, { actions: readonly GuaAction[]; content: IContent }>();

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const scalarLength = (value: string): number => Array.from(value).length;

// UTF-16 length is at least the scalar count and at most twice it, so only the middle range is counted.
const isBodyTooLong = (html: string): boolean =>
    html.length > MAX_BODY_LENGTH && (html.length > 2 * MAX_BODY_LENGTH || scalarLength(html) > MAX_BODY_LENGTH);

function trimWhiteSpace(value: string): string {
    let start = 0;
    let end = value.length;
    while (start < end && WHITE_SPACE.has(value[start])) start++;
    while (end > start && WHITE_SPACE.has(value[end - 1])) end--;
    return value.slice(start, end);
}

function parseHtml(html: string): Document {
    // The <body> prefix keeps leading head-only tags (title, style) in the body. A DOMParser
    // document has no browsing context, so nothing in it runs or loads.
    return new DOMParser().parseFromString(`<body>${html}`, "text/html");
}

function isAllowedUrl(url: string): boolean {
    // Only ASCII passes the pattern, so UTF-16 length equals the scalar count for any URL that can pass.
    const match = url.length <= MAX_URL_LENGTH ? URL_PATTERN.exec(url) : null;
    if (!match) return false;
    const port = match[1];
    return (port === undefined || Number(port) <= MAX_PORT) && url.indexOf("#") === url.lastIndexOf("#");
}

function readActions(content: IContent): readonly GuaAction[] {
    // Content that is still an edit renders its top-level fallback, not the m.new_content the actions belong to.
    if (content["m.relates_to"]?.rel_type === RelationType.Replace) return NO_ACTIONS;
    if (content.msgtype !== MsgType.Text && content.msgtype !== MsgType.Notice) return NO_ACTIONS;
    const html = content.formatted_body;
    const raw = content[GUA_ACTIONS_KEY];
    if (content.format !== "org.matrix.custom.html" || typeof html !== "string" || !Array.isArray(raw)) {
        return NO_ACTIONS;
    }
    if (isBodyTooLong(html)) return NO_ACTIONS;

    const candidates: GuaAction[] = [];
    for (const item of raw.slice(0, MAX_ACTIONS)) {
        if (!isObject(item) || item.type !== "open_url") continue;
        if (typeof item.label !== "string" || typeof item.url !== "string") continue;
        const label = trimWhiteSpace(item.label);
        const labelLength = scalarLength(label);
        if (labelLength < 1 || labelLength > MAX_LABEL_LENGTH || !isAllowedUrl(item.url)) continue;
        candidates.push({ label, url: item.url });
    }
    if (!candidates.length) return NO_ACTIONS;

    const hrefs = new Set(Array.from(parseHtml(html).querySelectorAll("a[href]"), (a) => a.getAttribute("href")));
    const seen = new Set<string>();
    const actions = candidates.filter(({ url }) => {
        if (!hrefs.has(url) || seen.has(url)) return false;
        seen.add(url);
        return true;
    });
    return actions.length ? actions : NO_ACTIONS;
}

/**
 * `content` must be the displayed content, as MatrixEvent.getContent() returns it: an edit is already
 * resolved to its m.new_content, so it is never unwrapped here.
 */
export function getGuaActions(content: IContent): readonly GuaAction[] {
    let actions = actionsCache.get(content);
    if (!actions) {
        actions = readActions(content);
        actionsCache.set(content, actions);
    }
    return actions;
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
    for (let descents = 0; node && WRAPPER_TAGS.has(node.nodeName); descents++) {
        if (descents === MAX_WRAPPER_DESCENTS) return null;
        node = lastContent(node);
    }
    return node?.nodeName === "A" ? (node as Element) : null;
}

/** Removes `node`, the line breaks and whitespace before it, and everything after it (only space by construction). */
function removeWithSpace(node: ChildNode): void {
    while (node.nextSibling) node.nextSibling.remove();
    while (node.previousSibling && isSpace(node.previousSibling)) node.previousSibling.remove();
    node.remove();
}

function withoutTrailingLink(html: string, actions: readonly GuaAction[]): string | undefined {
    const doc = parseHtml(html);
    const link = trailingLink(doc.body);
    if (!link) return undefined;

    const href = link.getAttribute("href");
    const text = trimWhiteSpace(link.textContent ?? "");
    if (!actions.some((action) => action.url === href && action.label === text)) return undefined;

    let removed: ChildNode = link;
    for (;;) {
        const parent = removed.parentElement!;
        removeWithSpace(removed);
        if (parent === doc.body || lastContent(parent)) break;
        removed = parent;
    }
    return doc.body.innerHTML;
}

/**
 * A display-only copy of `content` without the trailing fallback link of one of `actions`. Copy, edit
 * and reply previews keep reading the event itself.
 */
export function withoutTrailingActionLinks(content: IContent, actions: readonly GuaAction[]): IContent {
    if (!actions.length || typeof content.formatted_body !== "string") return content;
    const cached = strippedCache.get(content);
    if (cached?.actions === actions) return cached.content;

    const stripped = withoutTrailingLink(content.formatted_body, actions);
    // EventContentBody falls back to the plain body when the formatted one renders empty, and that body has the link.
    const result = stripped === undefined ? content : { ...content, formatted_body: stripped, body: "" };
    strippedCache.set(content, { actions, content: result });
    return result;
}
