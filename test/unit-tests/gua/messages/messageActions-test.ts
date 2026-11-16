/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { type IContent } from "matrix-js-sdk/src/matrix";

import {
    GUA_ACTIONS_KEY,
    type GuaAction,
    getGuaActions,
    withoutTrailingActionLinks,
} from "../../../../src/gua/messages/messageActions";
import fixtureFile from "./fixtures/message-actions.json";

interface Fixture {
    name: string;
    content: IContent;
    expect: { actions: GuaAction[]; fallback_hidden: boolean };
}

const ACTION_URL = "https://example.org/statement/1";

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const hasExactKeys = (value: Record<string, unknown>, keys: string[]): boolean =>
    Object.keys(value).sort().join() === [...keys].sort().join();

const isAction = (value: unknown): value is GuaAction =>
    isRecord(value) &&
    hasExactKeys(value, ["label", "url"]) &&
    typeof value.label === "string" &&
    typeof value.url === "string";

function decodeFixtures(value: unknown): Fixture[] {
    if (!Array.isArray(value) || value.length === 0) throw new Error("message-actions.json is not a list of cases");
    return value.map((item: unknown, index) => {
        const expected = isRecord(item) ? item.expect : undefined;
        const decodable =
            isRecord(item) &&
            hasExactKeys(item, ["name", "content", "expect"]) &&
            typeof item.name === "string" &&
            isRecord(item.content) &&
            isRecord(expected) &&
            hasExactKeys(expected, ["actions", "fallback_hidden"]) &&
            Array.isArray(expected.actions) &&
            expected.actions.every(isAction) &&
            typeof expected.fallback_hidden === "boolean";
        if (!decodable) throw new Error(`message-actions.json case ${index} cannot be decoded`);
        return item as unknown as Fixture;
    });
}

const fixtures = decodeFixtures(fixtureFile);

// MatrixEvent.getContent() resolves an edit to its m.new_content, which is what TextualBody renders.
const displayedContent = (content: IContent): IContent =>
    content["m.relates_to"]?.rel_type === "m.replace" ? (content["m.new_content"] ?? {}) : content;

const linkCount = (html: unknown): number =>
    typeof html === "string" ? new DOMParser().parseFromString(html, "text/html").querySelectorAll("a").length : 0;

const message = (formattedBody: string, actions: unknown = [{ type: "open_url", label: "Open", url: ACTION_URL }]) => ({
    msgtype: "m.text",
    body: "x",
    format: "org.matrix.custom.html",
    formatted_body: formattedBody,
    [GUA_ACTIONS_KEY]: actions,
});

const actionsFor = (url: string, label = "Open"): readonly GuaAction[] =>
    getGuaActions(message(`<a href="${url}">${label}</a>`, [{ type: "open_url", label, url }]));

describe("message actions", () => {
    describe.each(fixtures.map((fixture) => [fixture.name, fixture] as const))(
        "shared fixture: %s",
        (_name, { content, expect: expected }) => {
            const displayed = displayedContent(content);

            it("keeps the expected actions", () => {
                expect(getGuaActions(displayed)).toEqual(expected.actions);
            });

            it("hides the trailing fallback link only when expected", () => {
                const shown = withoutTrailingActionLinks(displayed, getGuaActions(displayed));
                const hiddenLinks = linkCount(displayed.formatted_body) - linkCount(shown.formatted_body);
                expect(hiddenLinks).toBe(expected.fallback_hidden ? 1 : 0);
                expect(shown !== displayed).toBe(expected.fallback_hidden);
            });
        },
    );

    it("counts label length in Unicode scalar values", () => {
        const label = "\u{1F9FE}".repeat(40);
        const content = message(`<a href="${ACTION_URL}">x</a>`, [{ type: "open_url", label, url: ACTION_URL }]);
        expect(getGuaActions(content)).toEqual([{ label, url: ACTION_URL }]);
    });

    it("trims labels of Unicode White_Space only", () => {
        expect(actionsFor(ACTION_URL, "\u0085Open\u3000")).toEqual([{ label: "Open", url: ACTION_URL }]);
        expect(actionsFor(ACTION_URL, "\ufeffOpen")).toEqual([{ label: "\ufeffOpen", url: ACTION_URL }]);
    });

    it("keeps a URL of 2048 characters and rejects a longer one", () => {
        const url = `${ACTION_URL}?q=${"a".repeat(2048 - ACTION_URL.length - 3)}`;
        expect(actionsFor(url)).toEqual([{ label: "Open", url }]);
        expect(actionsFor(`${url}a`)).toEqual([]);
    });

    it.each([
        [4096, 1],
        [4097, 0],
        [9000, 0],
    ])("checks an ASCII formatted_body of %i characters", (length, kept) => {
        const link = `<a href="${ACTION_URL}">Open</a>`;
        const html = "x".repeat(length - link.length) + link;
        expect(getGuaActions(message(html))).toHaveLength(kept);
    });

    it.each([
        "https://xn--caf-dma.example.org",
        "https://localhost:1/",
        "https://example.org:65535?a=1",
        "https://example.org#top",
        "https://a-b.example.org/~x/;p=1/(c)*!$+,'@:?q=a/b?c#f/g?h",
    ])("accepts %s", (url) => {
        expect(actionsFor(url)).toEqual([{ label: "Open", url }]);
    });

    it.each([
        " https://example.org/",
        "https://example.org/ ",
        "https:example.org/",
        "https:/example.org/",
        "Https://example.org/",
        "https://",
        "https://example.org./",
        "https://.example.org/",
        "https://a..example.org/",
        "https://-a.example.org/",
        "https://exa_mple.org/",
        "https://[::1]/",
        "https://:@example.org/",
        "https://example.org:/",
        "https://example.org:0/",
        "https://example.org:0443/",
        "https://example.org:123456/",
        "https://example.org/a b",
        "https://example.org/a%zz",
        "https://example.org/a|b",
        "https://example.org/\u{1F9FE}",
    ])("rejects %j", (url) => {
        expect(actionsFor(url)).toEqual([]);
    });

    it("returns the same actions for the same content", () => {
        const content = message(`<a href="${ACTION_URL}">Open</a>`);
        expect(getGuaActions(content)).toBe(getGuaActions(content));
    });

    it("has no actions for content that is still an edit", () => {
        const edit = {
            ...message(`* Ready<br><a href="${ACTION_URL}">Open</a>`),
            "m.new_content": message(`Ready<br><a href="${ACTION_URL}">Open</a>`),
            "m.relates_to": { rel_type: "m.replace", event_id: "$original" },
        };
        expect(getGuaActions(edit)).toEqual([]);
    });

    describe("withoutTrailingActionLinks", () => {
        it.each([
            ["a link after a line break", `Ready<br><a href="${ACTION_URL}">Open</a>`, "Ready"],
            ["a link with trailing breaks", `Ready<br><br><a href="${ACTION_URL}">Open</a><br> \n`, "Ready"],
            [
                "a link after a next-line character",
                `Ready<br>\u0085<a href="${ACTION_URL}">\u0085Open</a>\u0085`,
                "Ready",
            ],
            ["a link alone in a paragraph", `<p>Ready</p>\n<p><a href="${ACTION_URL}">Open</a></p>`, "<p>Ready</p>"],
            ["a link at the end of a paragraph", `<p>Ready: <a href="${ACTION_URL}">Open</a></p>`, "<p>Ready: </p>"],
            [
                "a link nested in a span and a div",
                `Ready<div><span><a href="${ACTION_URL}"> Open </a></span></div>`,
                "Ready",
            ],
        ])("removes %s", (_name, formattedBody, expected) => {
            const content = message(formattedBody);
            expect(withoutTrailingActionLinks(content, getGuaActions(content)).formatted_body).toBe(expected);
        });

        it("leaves a link followed by a zero-width no-break space", () => {
            const content = message(`Ready<br><a href="${ACTION_URL}">Open</a>\ufeff`);
            expect(withoutTrailingActionLinks(content, getGuaActions(content))).toBe(content);
        });

        it("leaves a link nested in 101 wrappers", () => {
            const content = message(`Ready<br>${"<span>".repeat(101)}<a href="${ACTION_URL}">Open</a>`);
            expect(withoutTrailingActionLinks(content, getGuaActions(content))).toBe(content);
        });

        it("leaves a link that is not the last content", () => {
            const content = message(`<a href="${ACTION_URL}">Open</a><br><img src="mxc://example.org/a" alt="x">`);
            expect(withoutTrailingActionLinks(content, getGuaActions(content))).toBe(content);
        });

        it("leaves a link inside a block quote", () => {
            const content = message(`Ready<blockquote><a href="${ACTION_URL}">Open</a></blockquote>`);
            expect(withoutTrailingActionLinks(content, getGuaActions(content))).toBe(content);
        });

        it("blanks the plain body so it cannot show the hidden link instead", () => {
            const content = { ...message(`<p><a href="${ACTION_URL}">Open</a></p>`), body: `Open: ${ACTION_URL}` };
            const shown = withoutTrailingActionLinks(content, getGuaActions(content));
            expect(shown).toMatchObject({ formatted_body: "", body: "" });
            expect(content.body).toBe(`Open: ${ACTION_URL}`);
        });

        it("returns the same content object for the same input", () => {
            const content = message(`Ready<br><a href="${ACTION_URL}">Open</a>`);
            const actions = getGuaActions(content);
            expect(withoutTrailingActionLinks(content, actions)).toBe(withoutTrailingActionLinks(content, actions));
        });

        it("does not touch content without actions", () => {
            const content = message(`Ready<br><a href="${ACTION_URL}">Open</a>`, []);
            expect(withoutTrailingActionLinks(content, getGuaActions(content))).toBe(content);
        });
    });
});
