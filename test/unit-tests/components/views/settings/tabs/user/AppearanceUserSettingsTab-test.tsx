/*
Copyright 2024 New Vector Ltd.
Copyright 2023 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { fireEvent, render, screen } from "jest-matrix-react";
import React from "react";
import { type MatrixClient } from "matrix-js-sdk/src/matrix";

import AppearanceUserSettingsTab from "../../../../../../../src/components/views/settings/tabs/user/AppearanceUserSettingsTab";
import { withClientContextRenderOptions, stubClient } from "../../../../../../test-utils";
import { overrideSettings } from "../../../../../gua/chatTheme/overrideSettings";

describe("AppearanceUserSettingsTab", () => {
    let client: MatrixClient;

    beforeEach(() => {
        client = stubClient();
    });

    it("should render", () => {
        const { asFragment } = render(<AppearanceUserSettingsTab />, withClientContextRenderOptions(client));
        expect(asFragment()).toMatchSnapshot();
    });

    describe("with chat themes", () => {
        afterEach(() => jest.restoreAllMocks());

        it("shows the default chat theme only with chat themes", async () => {
            const { unmount } = render(<AppearanceUserSettingsTab />, withClientContextRenderOptions(client));
            expect(screen.queryByRole("heading", { name: "Chat theme" })).not.toBeInTheDocument();
            unmount();

            overrideSettings(() => ({ feature_gua_chat_themes: true }));
            render(<AppearanceUserSettingsTab />, withClientContextRenderOptions(client));
            expect(await screen.findByRole("heading", { name: "Chat theme" })).toBeInTheDocument();
            expect(screen.getByText("Classic")).toBeInTheDocument();
        });

        it("changes the default in place rather than in another dialog", async () => {
            overrideSettings(() => ({ feature_gua_chat_themes: true }));
            render(<AppearanceUserSettingsTab />, withClientContextRenderOptions(client));
            const change = await screen.findByRole("button", { name: "Change" });
            expect(change).toHaveAttribute("aria-expanded", "false");
            fireEvent.click(change);
            expect(screen.getByRole("button", { name: "Done" })).toHaveAttribute("aria-expanded", "true");
            expect(screen.getByRole("radio", { name: "Classic" })).toBeChecked();
        });
    });
});
