/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { type APIRequestContext, type Browser, type Locator, type Page } from "@playwright/test";
import { CONFIG_JSON } from "@element-hq/element-web-playwright-common";
import { type StartedHomeserverContainer } from "@element-hq/element-web-playwright-common/lib/testcontainers/HomeserverContainer";

import { test, expect } from "../../element-web-test";
import { type Credentials } from "../../plugins/homeserver";
import { SettingLevel } from "../../../src/settings/SettingLevel";
import { Layout } from "../../../src/settings/enums/Layout";

const THEME_EVENT = "global.gua.room.background";
const WALLPAPER = ".mx_RoomView_timeline > .mx_GuaChatWallpaper";

async function roomTheme(
    request: APIRequestContext,
    homeserver: StartedHomeserverContainer,
    credentials: Credentials,
    roomId: string,
): Promise<unknown> {
    const response = await request.get(
        `${homeserver.baseUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/${THEME_EVENT}/`,
        { headers: { Authorization: `Bearer ${credentials.accessToken}` } },
    );
    expect(response.ok()).toBe(true);
    return response.json();
}

/** Clicks the tile as a person does; its swatches cover the radio. */
async function pickTile(dialog: Locator, name: string): Promise<void> {
    const radio = dialog.page().getByRole("radio", { name, exact: true });
    await dialog.locator("label.mx_GuaThemeTile", { has: radio }).first().click();
}

/** Signs another account in from its own browser context, with chat themes on and Brazilian Portuguese chosen. */
async function openInPortuguese(
    browser: Browser,
    homeserver: StartedHomeserverContainer,
    credentials: Credentials,
): Promise<Page> {
    const context = await browser.newContext();
    await context.route("http://localhost:8080/config.json*", (route) =>
        route.fulfill({
            json: {
                ...CONFIG_JSON,
                default_server_config: { "m.homeserver": { base_url: homeserver.baseUrl } },
                features: { ...CONFIG_JSON.features, feature_gua_chat_themes: true },
            },
        }),
    );
    await context.addInitScript(
        ({ baseUrl, credentials }) => {
            window.localStorage.setItem("mx_hs_url", baseUrl);
            window.localStorage.setItem("mx_user_id", credentials.userId);
            window.localStorage.setItem("mx_access_token", credentials.accessToken);
            window.localStorage.setItem("mx_device_id", credentials.deviceId);
            window.localStorage.setItem("mx_is_guest", "false");
            window.localStorage.setItem("mx_has_pickle_key", "false");
            window.localStorage.setItem("mx_has_access_token", "true");
            window.localStorage.setItem("mx_local_settings", JSON.stringify({ language: "pt-br" }));
        },
        { baseUrl: homeserver.baseUrl, credentials },
    );
    const page = await context.newPage();
    await page.goto("/");
    await page.waitForSelector(".mx_MatrixChat", { timeout: 30000 });
    return page;
}

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

        await page.getByRole("textbox", { name: "Send an unencrypted message…" }).pressSequentially("@bot");
        const suggestion = page.locator(".mx_Autocomplete .mx_Autocomplete_Completion").first();
        await expect(suggestion).toBeVisible();
        // A trial click fails when another element would receive the click.
        await suggestion.click({ trial: true });
    });

    test("sets an artwork and a credited photo that the other member sees", async ({
        page,
        app,
        browser,
        homeserver,
        request,
        user,
    }) => {
        test.slow();
        const bob = await homeserver.registerUser(`bob_${Date.now()}`, "bob-password", "Bob");
        const roomId = await app.client.createRoom({ name: "Themed", invite: [bob.userId] });
        const joined = await request.post(
            `${homeserver.baseUrl}/_matrix/client/v3/join/${encodeURIComponent(roomId)}`,
            {
                headers: { Authorization: `Bearer ${bob.accessToken}` },
                data: {},
            },
        );
        expect(joined.ok()).toBe(true);
        await app.viewRoomByName("Themed");

        // Modern is the default layout.
        const dialog = await app.settings.openRoomSettings("Chat theme");
        await pickTile(dialog, "Azulejo");
        await dialog.getByRole("button", { name: "Set theme" }).click();
        await expect(dialog.locator(".mx_GuaThemePanel_status")).toHaveText("Theme set");
        expect(await roomTheme(request, homeserver, user, roomId)).toEqual({
            art: "azulejo",
            bubble: "blue",
            fallback_preset: "sky",
            kind: "art",
            v: 1,
        });

        await pickTile(dialog, "Smiling Maned Wolf, Photo: Gabriel Bonfa");
        await dialog.getByRole("button", { name: "Set theme" }).click();
        await expect(dialog.locator(".mx_GuaThemePanel_status")).toHaveText("Theme set");
        expect(await roomTheme(request, homeserver, user, roomId)).toEqual({
            art: "photo-maned-wolf-smiling",
            bubble: "blue",
            bubble_dark: "purple",
            fallback_preset: "mint",
            kind: "art",
            v: 1,
        });

        await dialog.getByRole("button", { name: "Photo: Gabriel Bonfa · All rights reserved" }).click();
        const credit = dialog.getByRole("listitem").filter({ hasText: "Smiling Maned Wolf" });
        await expect(credit).toContainText("Photo: Gabriel Bonfa");
        await expect(credit.getByRole("link", { name: "All rights reserved" })).toHaveAttribute(
            "href",
            "https://github.com/Gua-ra/gua-android/blob/develop/tools/wallpapers/licenses/LicenseRef-Gabriel-Bonfa-Photo.txt",
        );
        await expect(credit.getByRole("link", { name: "Source" })).toHaveCount(0);
        await app.settings.closeDialog();

        // The previous still stays until it has cross-faded out.
        const still = page.locator(`${WALLPAPER} img.mx_GuaWallpaper_still`);
        await expect(still).toHaveCount(1);
        await expect(still).toHaveAttribute("src", /photo-maned-wolf-smiling/);
        await expect.poll(() => still.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
        await expect(page.locator(".mx_RoomView_body")).toHaveAttribute("data-gua-wallpaper", "");
        await expect(page.locator(".mx_RoomView")).toHaveAttribute("data-gua-bubble", "");

        await app.settings.setValue("layout", null, SettingLevel.DEVICE, Layout.Bubble);
        await expect(still).toHaveCount(1);
        await expect(still).toHaveAttribute("src", /photo-maned-wolf-smiling/);
        await app.settings.setValue("layout", null, SettingLevel.DEVICE, Layout.IRC);
        await expect(page.locator(WALLPAPER)).toHaveCount(0);

        const bobPage = await openInPortuguese(browser, homeserver, bob);
        await bobPage.goto(`/#/room/${roomId}`);
        const bobStill = bobPage.locator(`${WALLPAPER} img.mx_GuaWallpaper_still`);
        await expect(bobStill).toHaveCount(1);
        await expect(bobStill).toHaveAttribute("src", /photo-maned-wolf-smiling/);
        await bobPage.getByRole("button", { name: "Informação da sala" }).first().click();
        await bobPage.locator(".mx_RightPanel").getByRole("menuitem", { name: "Configurações" }).click();
        await bobPage.locator(".mx_TabbedView_tabLabel", { hasText: "Tema da conversa" }).click();
        await expect(
            bobPage.getByRole("button", { name: "Foto: Gabriel Bonfa · Todos os direitos reservados" }),
        ).toBeVisible();
        await bobPage.context().close();
    });
});
