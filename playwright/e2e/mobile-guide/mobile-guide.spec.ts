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

    test("explains beta-only access without enrollment or public store links", async ({ page, axe }) => {
        await page.goto("/mobile_guide/");

        await expect(page.getByRole("heading", { name: "Gua Web is available to Gua beta testers" })).toBeVisible();
        await expect(
            page.getByText("Gua Web is optimized for desktop browsers and is available to Gua beta testers only."),
        ).toBeVisible();
        await expect(page.getByText("Gua is not yet available in public app stores.")).toBeVisible();
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
