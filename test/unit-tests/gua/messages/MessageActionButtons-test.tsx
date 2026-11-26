/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React from "react";
import { render, screen } from "jest-matrix-react";

import { MessageActionButtons } from "../../../../src/gua/messages/MessageActionButtons";

describe("MessageActionButtons", () => {
    it("renders each action as a link that opens outside the app", () => {
        render(
            <MessageActionButtons
                actions={[
                    { label: "Open statement", url: "https://example.org/statement/1" },
                    { label: "Pay now", url: "https://example.org/pay?id=1&ref=2" },
                ]}
            />,
        );

        const links = screen.getAllByRole("link");
        expect(links.map((link) => link.getAttribute("href"))).toEqual([
            "https://example.org/statement/1",
            "https://example.org/pay?id=1&ref=2",
        ]);

        const [first, second] = links;
        expect(first).toHaveAccessibleName("Open statement");
        expect(second).toHaveAccessibleName("Pay now");
        for (const link of links) {
            expect(link).toHaveAttribute("target", "_blank");
            expect(link).toHaveAttribute("rel", "noreferrer noopener");
        }
        expect(first).toHaveAttribute("data-kind", "primary");
        expect(second).toHaveAttribute("data-kind", "secondary");
    });
});
