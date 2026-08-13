/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { test, expect } from "../../element-web-test";

test.describe("Gua mobile guide", () => {
    test.use({
        viewport: { width: 390, height: 844 }, // iPhone 16e
    });

    test("prioritizes desktop guidance without enrollment or public store links", async ({ page, axe }) => {
        await page.goto("/mobile_guide/");

        await expect(page.getByRole("heading", { name: "Gua Web is optimized for desktop browsers" })).toBeVisible();
        await expect(page.getByRole("img", { name: "Gua" })).toHaveAttribute("src", "/themes/gua/img/logos/logo.svg");
        await expect(page.getByText("For the best experience, open Gua Web in a desktop browser.")).toBeVisible();
        await expect(page.getByRole("heading", { name: "On a mobile device?" })).toBeVisible();
        await expect(page.getByRole("heading", { name: "Continue on web anyway" })).toBeVisible();
        await expect(page.getByText("available to testers signed up for the Gua beta program.")).toBeVisible();
        await expect(page.locator(".mx_BetaStep_number")).toHaveCount(0);
        await expect(page.locator(".mx_Eyebrow")).toHaveCount(0);
        await expect(page.locator("body")).not.toContainText("Request beta access");
        await expect(page.locator("body")).not.toContainText("Apply on gua.global");
        await expect(page.locator("body")).not.toContainText("invitation");
        await expect(page.locator("body")).not.toContainText("Element");
        await expect(
            page.locator('a[href*="apps.apple.com"], a[href*="play.google.com"], a[href*="f-droid.org"]'),
        ).toHaveCount(0);
        await expect(axe).toHaveNoViolations();
    });
});

test.describe("Gua web registration entry", () => {
    const registrationDisabledMessage = "Web account creation is unavailable during the beta.";

    test.use({
        config: async ({ config }, use) => {
            await use({
                ...config,
                brand: "Gua",
                branding: {
                    ...config.branding,
                    registration_disabled_message: registrationDisabledMessage,
                },
                setting_defaults: {
                    ...config.setting_defaults,
                    "UIFeature.registration": false,
                },
            });
        },
    });

    test("shows account creation as disabled without exposing the registration route", async ({ page }) => {
        await page.goto("/#/welcome");

        const createAccount = page.getByRole("link", { name: "Create Account" });
        await expect(createAccount).toBeVisible();
        await expect(createAccount).toHaveAttribute("aria-disabled", "true");
        await expect(createAccount).toHaveAttribute("title", registrationDisabledMessage);
        await expect(createAccount).not.toHaveAttribute("href", /.+/);
        await expect(createAccount).toHaveCSS("cursor", "not-allowed");
        await expect(createAccount).toBeDisabled();
    });
});
