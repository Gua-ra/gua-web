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

const shownContent = (content: IContent): IContent => withoutTrailingActionLinks(content, getGuaActions(content));

const linkCount = (html: unknown): number => {
    if (typeof html !== "string") return 0;
    const doc = new DOMParser().parseFromString("<!DOCTYPE html>", "text/html");
    doc.body.innerHTML = html;
    return doc.body.querySelectorAll("a").length;
};

const message = (formattedBody: string, actions: unknown = [{ type: "open_url", label: "Open", url: ACTION_URL }]) => ({
    msgtype: "m.text",
    body: "x",
    format: "org.matrix.custom.html",
    formatted_body: formattedBody,
    [GUA_ACTIONS_KEY]: actions,
});

const actionsFor = (url: string, label = "Open"): readonly GuaAction[] =>
    getGuaActions(message(`<a href="${url}">Open</a>`, [{ type: "open_url", label, url }]));

describe("message actions", () => {
    describe.each(fixtures.map((fixture) => [fixture.name, fixture] as const))(
        "shared fixture: %s",
        (_name, { content, expect: expected }) => {
            const displayed = displayedContent(content);

            it("keeps the expected actions", () => {
                expect(getGuaActions(displayed)).toEqual(expected.actions);
            });

            it("hides the trailing fallback link only when expected", () => {
                const shown = shownContent(displayed);
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

    it("parses the body in a no-quirks document", () => {
        const parse = jest.spyOn(DOMParser.prototype, "parseFromString");
        try {
            getGuaActions(message(`<a href="${ACTION_URL}">Open</a>`));
            expect(parse.mock.results.map(({ value }) => (value as Document).compatMode)).toEqual(["CSS1Compat"]);
        } finally {
            parse.mockRestore();
        }
    });

    describe("the strict form of rule 1", () => {
        const LINK = `<a href="${ACTION_URL}">Open</a>`;
        // Every element name but li, which needs a list as its parent.
        const NAMES = "a b blockquote code del div em h1 h2 h3 h4 h5 h6 i ol p s span strong sub sup u ul".split(" ");
        // li is left out: it needs a list as its parent, and no list may open inside a paragraph.
        const NOT_IN_P = "blockquote div h1 h2 h3 h4 h5 h6 ol p ul".split(" ");
        const MIXED = "b i em strong s u sub sup code del span div blockquote".split(" ");

        const actionsOf = (html: string): readonly GuaAction[] => getGuaActions(message(html));
        // Opens `names` in order, outermost first, around `inner`.
        const nest = (names: string[], inner = LINK): string =>
            names.reduceRight((html, name) => `<${name}>${html}</${name}>`, inner);
        const mixed = (count: number): string[] =>
            Array.from({ length: count }, (_, index) => MIXED[index % MIXED.length]);
        // A list may hold only items, so ul and ol get one instead of text.
        const element = (name: string): string =>
            `<${name}>${name === "ul" || name === "ol" ? "<li>x</li>" : "x"}</${name}>`;

        it.each([
            ["every element name", `${NAMES.map(element).join("")}${LINK}`],
            ["a single-quoted href", `<a href='${ACTION_URL}'>Open</a>`],
            ["a tab before href", `<a\thref="${ACTION_URL}">Open</a>`],
            ["a line feed before href", `<a\nhref="${ACTION_URL}">Open</a>`],
            ["a form feed before href", `<a\fhref="${ACTION_URL}">Open</a>`],
            ["a carriage return before href", `<a\rhref="${ACTION_URL}">Open</a>`],
            ["two spaces before href", `<a  href="${ACTION_URL}">Open</a>`],
            ["a CRLF before href", `<a\r\nhref="${ACTION_URL}">Open</a>`],
            [
                "the other quote inside an href",
                `<a href="https://example.org/'">x</a><a href='https://example.org/"'>x</a>${LINK}`,
            ],
            ["a link without an href", `<a>x</a>${LINK}`],
            ["each line break spelling", `x<br>y<br/>z<br />${LINK}`],
            ["text with > \" ' = and /", `1 > 0 "a" 'b' c=d e/f${LINK}`],
            ["20 open elements", nest(mixed(19))],
            ["3 open elements with the same name between others", nest(["b", "i", "b", "i", "b"])],
            ["a list item directly inside each kind of list", `<ul><li>x</li></ul>${nest(["ol", "li"])}`],
            ["nested lists", `<ul><li><ol><li>x</li></ol></li></ul>${LINK}`],
            ["a paragraph inside other elements", `<b><p>x</p></b><div><p>x</p></div>${nest(["p", "b"])}`],
            ["headings side by side", `<h1>x</h1><h2><b>x</b></h2>${LINK}`],
        ])("keeps %s", (_name, html) => {
            expect(actionsOf(html)).toHaveLength(1);
        });

        it.each([
            ["a comment", `${LINK}<!-- x -->`],
            ["a CDATA section", `${LINK}<![CDATA[x]]>`],
            ["a processing instruction", `${LINK}<?BR>`],
            ["a cut-off processing instruction", `${LINK}<?`],
            ["a doctype", `<!DOCTYPE html>${LINK}`],
            ["an upper-case start tag", `<B>x</b>${LINK}`],
            ["an upper-case end tag", `<b>x</B>${LINK}`],
            ["an upper-case link", `<A href="${ACTION_URL}">Open</A>`],
            ["an upper-case href", `<a HREF="${ACTION_URL}">Open</a>`],
            ["a tag name with a Kelvin sign", `<bloc\u212Aquote>x</bloc\u212Aquote>${LINK}`],
            ["an unquoted href", `<a href=${ACTION_URL}>Open</a>`],
            ["a space before the equals sign", `<a href ="${ACTION_URL}">Open</a>`],
            ["a space after the equals sign", `<a href= "${ACTION_URL}">Open</a>`],
            ["a line tabulation before href", `<a\vhref="${ACTION_URL}">Open</a>`],
            ["a space and no href", `<a >x</a>${LINK}`],
            ["a repeated href", `<a href="${ACTION_URL}" href="${ACTION_URL}">Open</a>`],
            ["a title after href", `<a href="${ACTION_URL}" title="x">Open</a>`],
            ["a title before href", `<a title="x" href="${ACTION_URL}">Open</a>`],
            ["a class on strong", `<strong class="x">x</strong>${LINK}`],
            ["a payment details span", `<span data-msc4286-external-payment-details>${LINK}</span>`],
            ["a greater-than sign inside an href", `<a href="https://example.org/>">x</a>${LINK}`],
            ["a less-than sign inside an href", `<a href="https://example.org/<">x</a>${LINK}`],
            ["a slash in a start tag", `<strong/>x${LINK}`],
            ["a slash and spaces in a start tag", `<span / >x</span>${LINK}`],
            ["a space before the end of a start tag", `<strong >x</strong>${LINK}`],
            ["a space before the end of an end tag", `<strong>x</strong >${LINK}`],
            ["a space after an href", `<a href="${ACTION_URL}" >Open</a>`],
            ["a slash after an href", `<a href="${ACTION_URL}"/>Open</a>`],
            ["a br end tag", `${LINK}</br>`],
            ["another br spelling", `x<br  />${LINK}`],
            ["an element outside the list", `<img src="x">${LINK}`],
            ["an h7 element", `<h7>x</h7>${LINK}`],
            ["a name that starts like an allowed one", `<bdi>x</bdi>${LINK}`],
            ["a tag name that runs into the next tag", `<b<br>${LINK}`],
            ["a literal less-than sign", `1 < 2${LINK}`],
            ["a less-than sign at the end", `${LINK}<`],
            ["an end tag cut off at the end", `${LINK}</`],
            ["a link cut off after its href", `${LINK}<a href="x"`],
            ["an unterminated href", `${LINK}<a href="x`],
            ["misnested end tags", `<b><i>x</b></i>${LINK}`],
            ["an element left open", `<b>x${LINK}`],
            ["a stray end tag", `${LINK}</p>`],
            ["an end tag that was never opened", `<b>x</i></b>${LINK}`],
            ["a list item outside a list", `<li>x</li>${LINK}`],
            ["a list item inside bold inside a list item", `<ul><li><b><li>x</li></b></li></ul>${LINK}`],
            ["a list item directly inside a list item", `<ul><li><li>x</li></li></ul>${LINK}`],
            ["a heading inside a heading", `<h1><h2>x</h2></h1>${LINK}`],
            ["a heading inside bold inside a heading", `<h3><b><h6>x</h6></b></h3>${LINK}`],
            ["a link inside a link", `<a>x${LINK}</a>`],
            ["a link inside bold inside a link", `<a><b>${LINK}</b></a>`],
            ["21 open elements", nest(mixed(20))],
            ["4 open elements with the same name between others", nest(["b", "i", "b", "i", "b", "i", "b"])],
        ])("rejects %s", (_name, html) => {
            expect(actionsOf(html)).toEqual([]);
        });

        it.each(NOT_IN_P)("rejects %s anywhere inside a paragraph", (name) => {
            expect(actionsOf(`${LINK}<p>x<b>${element(name)}</b></p>`)).toEqual([]);
        });

        it.each([
            ["4096 characters outside the BMP", 4096, 1],
            ["4097 characters outside the BMP", 4097, 0],
        ])("counts %s in Unicode scalar values", (_name, length, kept) => {
            expect(actionsOf(`${"\u{1D11E}".repeat(length - LINK.length)}${LINK}`)).toHaveLength(kept);
        });

        it.each([
            ["200 start tags", 99, 1],
            ["201 start tags", 100, 0],
        ])("counts %s, line breaks and the link included and end tags not", (_name, breaks, kept) => {
            expect(actionsOf(`${"<b></b>".repeat(100)}${"<br>".repeat(breaks)}${LINK}`)).toHaveLength(kept);
        });

        it.each([
            ["tab, line feed, form feed and carriage return", "\t\n\f\r", 1],
            ["a no-break space", "\u00A0", 1],
            ["a NUL", "\0", 0],
            ["a start of heading", "\u0001", 0],
            ["a line tabulation", "\v", 0],
            ["a delete", "\u007F", 0],
            ["a next line", "\u0085", 0],
            ["an application program command", "\u009F", 0],
            ["a start of heading inside an href", `<a href="https://example.org/\u0001">x</a>`, 0],
        ])("checks the raw body for %s", (_name, extra, kept) => {
            expect(actionsOf(`Ready${extra}<br>${LINK}`)).toHaveLength(kept);
        });

        it.each([
            ["every allowed named reference", "&amp;&lt;&gt;&quot;&apos;&nbsp;", 1],
            ["decimal and hex references", "&#65;&#0000065;&#x41;&#X1d11e;&#x10FFFD;&#160;", 1],
            ["an upper-case named reference", "&AMP;", 0],
            ["a named reference outside the allowed set", "&times;", 0],
            ["a named reference without a semicolon", "&amp x", 0],
            ["a bare ampersand", "R&D", 0],
            ["a numeric reference without digits", "&#;&#x;", 0],
            ["a numeric reference without a semicolon", "&#65 x", 0],
            ["eight decimal digits", "&#00000065;", 0],
            ["eight decimal digits whose first seven name a character", "&#10000065;", 0],
            ["seven hex digits", "&#x0000041;", 0],
            ["seven hex digits whose first six name a character", "&#x1000041;", 0],
            ["a reference to NUL", "&#0;", 0],
            ["a reference to a tab", "&#9;", 0],
            ["a reference to a delete", "&#x7f;", 0],
            ["a reference to a C1 control", "&#x80;", 0],
            ["a reference to a surrogate", "&#xDFFF;", 0],
            ["a reference past U+10FFFF", "&#1114112;", 0],
            ["a bare ampersand inside an href", `<a href="https://example.org/?a&b">x</a>`, 0],
            [
                "a named reference outside the allowed set inside an href",
                `<a href="https://example.org/&copy;">x</a>`,
                0,
            ],
        ])("checks the character references of %s", (_name, extra, kept) => {
            expect(actionsOf(`Ready${extra}<br>${LINK}`)).toHaveLength(kept);
        });

        it.each(
            [
                [0xfdcf, 1],
                [0xfdd0, 0],
                [0xfdef, 0],
                [0xfdf0, 1],
                [0xfffd, 1],
                [0xfffe, 0],
                [0xffff, 0],
                [0x1fffe, 0],
                [0x1ffff, 0],
                [0x10fffd, 1],
                [0x10fffe, 0],
                [0x10ffff, 0],
            ].flatMap(([code, kept]) => {
                const name = `U+${code.toString(16).toUpperCase()}`;
                return [
                    [name, "as is", String.fromCodePoint(code), kept],
                    [name, "as a decimal reference", `&#${code};`, kept],
                    [name, "as a hex reference", `&#x${code.toString(16).toUpperCase()};`, kept],
                ] as const;
            }),
        )("checks %s written %s in text and inside an href", (_name, _spelling, written, kept) => {
            expect(actionsOf(`Ready${written}<br>${LINK}`)).toHaveLength(kept);
            expect(actionsOf(`<a href="https://example.org/${written}">x</a>${LINK}`)).toHaveLength(kept);
        });

        describe.each(["ul", "ol"])("directly inside %s", (list) => {
            it.each([
                ["a tab", "\t"],
                ["a line feed", "\n"],
                ["a form feed", "\f"],
                ["a carriage return", "\r"],
                ["a space", " "],
                ["a CRLF", "\r\n"],
            ])("keeps %s around the items", (_name, space) => {
                const html = `<${list}>${space}<li>x</li>${space}<li>${LINK}</li>${space}</${list}>`;
                expect(actionsOf(html)).toHaveLength(1);
            });

            it("keeps text and a nested list inside an item", () => {
                const html = `<${list}><li>x<ul><li>x</li></ul></li><li>${nest(["ol", "li"])}</li></${list}>`;
                expect(actionsOf(html)).toHaveLength(1);
            });

            it.each([
                ["text", "x"],
                ["a reference to a space", "&#32;"],
                ["a no-break space", "\u00A0"],
                ["a reference to a no-break space", "&nbsp;"],
                ["a line break", "<br>"],
                ["a link", LINK],
                ["bold text", "<b>x</b>"],
                ["a paragraph", "<p>x</p>"],
                ["another list", "<ul><li>x</li></ul>"],
            ])("rejects %s", (_name, child) => {
                expect(actionsOf(`<${list}><li>x</li>${child}</${list}>${LINK}`)).toEqual([]);
            });
        });

        it("decodes the references in an href", () => {
            const url = `${ACTION_URL}?a=1&b=2&c=3`;
            const html = `<a href="${ACTION_URL}?a=1&amp;b=2&#38;c=3">Open</a>`;
            expect(getGuaActions(message(html, [{ type: "open_url", label: "Open", url }]))).toEqual([
                { label: "Open", url },
            ]);
        });
    });

    describe("withoutTrailingActionLinks", () => {
        it.each([
            ["a link after a line break", `Ready<br><a href="${ACTION_URL}">Open</a>`, "Ready"],
            ["a link with trailing breaks", `Ready<br><br><a href="${ACTION_URL}">Open</a><br> \n`, "Ready"],
            [
                "a link between no-break spaces",
                `Ready<br>&nbsp;<a href="${ACTION_URL}">&#160;Open\u3000</a>&#xA0;`,
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
            expect(shownContent(message(formattedBody)).formatted_body).toBe(expected);
        });

        it.each([
            ["a link followed by a zero-width no-break space", `Ready<br><a href="${ACTION_URL}">Open</a>\ufeff`],
            ["a link that is not the last content", `<a href="${ACTION_URL}">Open</a><br><em>Thanks</em>`],
            ["a link inside a block quote", `Ready<blockquote><a href="${ACTION_URL}">Open</a></blockquote>`],
            ["a link followed by an empty span", `Ready<br><a href="${ACTION_URL}">Open</a><span></span>`],
        ])("leaves %s", (_name, formattedBody) => {
            const content = message(formattedBody);
            expect(getGuaActions(content)).toHaveLength(1);
            expect(shownContent(content)).toBe(content);
        });

        it("reads CR and CRLF as LF", () => {
            const content = message(`Ready\r\n<br>\r<a href="${ACTION_URL}">Op\ren</a>`, [
                { type: "open_url", label: "Op\nen", url: ACTION_URL },
            ]);
            expect(shownContent(content).formatted_body).toBe("Ready\n");
        });

        it("blanks the plain body so it cannot show the hidden link instead", () => {
            const content = { ...message(`<p><a href="${ACTION_URL}">Open</a></p>`), body: `Open: ${ACTION_URL}` };
            expect(shownContent(content)).toMatchObject({ formatted_body: "", body: "" });
            expect(content.body).toBe(`Open: ${ACTION_URL}`);
        });

        it("returns the same content object for the same input", () => {
            const content = message(`Ready<br><a href="${ACTION_URL}">Open</a>`);
            expect(shownContent(content)).toBe(shownContent(content));
        });

        it("does not touch content without actions", () => {
            const content = message(`Ready<br><a href="${ACTION_URL}">Open</a>`, []);
            expect(shownContent(content)).toBe(content);
        });
    });
});
