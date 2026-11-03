/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React from "react";
import { render, screen } from "jest-matrix-react";
import userEvent from "@testing-library/user-event";

import { CopyGuestLinkButton } from "../../../../src/gua/calls/CopyGuestLinkButton";
import * as strings from "../../../../src/utils/strings";

const LINK = "https://call.example.org/room/#/stand-up?roomId=!aB3-dE_fG9hIjK&viaServers=example.org";

describe("CopyGuestLinkButton", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("copies the link and confirms it", async () => {
        const copy = jest.spyOn(strings, "copyPlaintext").mockResolvedValue(true);
        render(<CopyGuestLinkButton link={LINK} />);

        await userEvent.click(screen.getByRole("button", { name: "Copy guest link" }));

        expect(copy).toHaveBeenCalledWith(LINK);
        expect(await screen.findByRole("button", { name: "Copied!" })).toBeInTheDocument();
    });

    it("says when the copy failed", async () => {
        jest.spyOn(strings, "copyPlaintext").mockResolvedValue(false);
        render(<CopyGuestLinkButton link={LINK} />);

        await userEvent.click(screen.getByRole("button", { name: "Copy guest link" }));

        expect(await screen.findByRole("button", { name: "Failed to copy" })).toBeInTheDocument();
    });
});
