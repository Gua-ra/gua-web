/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { devices } from "@playwright/test";

import { test, expect } from "../../element-web-test";

test.describe("Gua mobile guide", () => {
    test.use({
        viewport: { width: 390, height: 844 }, // iPhone 16e
    });

    test("prioritizes desktop guidance without enrollment or public store links", async ({ page, axe }) => {
        await page.goto("/mobile_guide/");

        await expect(page.locator('link[rel="icon"][sizes="32x32"]')).toHaveAttribute(
            "href",
            /^\/themes\/gua\/img\/icons\/favicon\.[a-f0-9]+\.png$/,
        );
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

test.describe("Gua mobile redirect", () => {
    test.use({
        userAgent: devices["iPhone 13"].userAgent,
        viewport: { width: 390, height: 844 },
    });

    test("sends phones to the guide until they choose to continue on web", async ({ page, context }) => {
        await page.goto("/");
        await expect(page).toHaveURL(/\/mobile_guide\/$/);

        await page.getByRole("link", { name: "Continue to Gua Web" }).click();

        await expect(page.getByTestId("mx_welcome_screen")).toBeVisible({ timeout: 15_000 });
        await expect(page).not.toHaveURL(/mobile_guide/);
        expect(await context.cookies()).toContainEqual(
            expect.objectContaining({ name: "element_mobile_redirect_to_guide", value: "false", path: "/" }),
        );
    });
});

test.describe("Gua web registration entry", () => {
    test("keeps account creation disabled and sends the registration route to the welcome screen", async ({ page }) => {
        await page.goto("/#/register");

        await expect(page).toHaveURL(/#\/welcome$/, { timeout: 15_000 });
        await expect(page.getByTestId("mx_welcome_screen")).toBeVisible();
        await expect(page.getByRole("img", { name: "Gua" })).toHaveAttribute("src", "themes/gua/img/logos/logo.svg");
        const createAccount = page.getByRole("link", { name: "Create Account" });
        await expect(createAccount).toBeVisible();
        await expect(createAccount).toHaveAttribute("aria-disabled", "true");
        await expect(createAccount).toHaveAttribute("title", "Web account creation is unavailable during the beta.");
        await expect(createAccount).not.toHaveAttribute("href", /.+/);
        await expect(createAccount).toHaveCSS("cursor", "not-allowed");
        await expect(createAccount).toBeDisabled();
    });

    test.describe("in Brazilian Portuguese", () => {
        test.use({ config: { setting_defaults: { language: "pt-br" } } });

        test("translates the disabled account creation message", async ({ page }) => {
            await page.goto("/#/welcome");

            await expect(page.getByRole("link", { name: "Criar Conta" })).toHaveAttribute(
                "title",
                "A criação de contas pela web não está disponível durante o beta.",
                { timeout: 15_000 },
            );
        });
    });
});
