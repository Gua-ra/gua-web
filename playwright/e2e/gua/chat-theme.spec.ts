/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { test, expect } from "../../element-web-test";
import { SettingLevel } from "../../../src/settings/SettingLevel";
import { Layout } from "../../../src/settings/enums/Layout";

test.describe("Chat themes", () => {
    test.use({
        displayName: "Helena",
        labsFlags: ["feature_gua_chat_themes"],
    });

    test("keeps the composer's suggestions visible and clickable over a wallpaper", async ({ page, app, bot }) => {
        await app.settings.setValue("layout", null, SettingLevel.DEVICE, Layout.Bubble);
        const roomId = await app.client.createRoom({ name: "Themed", invite: [bot.credentials.userId] });
        await app.client.sendStateEvent(
            roomId,
            "global.gua.room.background",
            { v: 1, kind: "preset", preset: "mint", bubble: "green" },
            "",
        );
        await app.viewRoomByName("Themed");
        await expect(page.locator(".mx_RoomView_timeline > .mx_GuaChatWallpaper")).toBeVisible();

        await page.getByRole("textbox", { name: "Send an unencrypted message…" }).pressSequentially("@");
        const suggestion = page.locator(".mx_Autocomplete .mx_Autocomplete_Completion").first();
        await expect(suggestion).toBeVisible();
        // A trial click fails unless the suggestion itself is what a click at its centre would hit.
        await suggestion.click({ trial: true });
    });
});
