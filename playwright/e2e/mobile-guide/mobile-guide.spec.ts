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

    test("explains private beta access without public store links", async ({ page, axe }) => {
        await page.goto("/mobile_guide/");

        await expect(page.getByRole("heading", { name: "Gua is currently in private beta" })).toBeVisible();
        await expect(page.getByRole("link", { name: "Request beta access" })).toHaveAttribute(
            "href",
            "https://gua.global/support",
        );
        await expect(page.getByText("Gua is not yet available in public app stores.")).toBeVisible();
        await expect(page.locator("body")).not.toContainText("Element");
        await expect(
            page.locator('a[href*="apps.apple.com"], a[href*="play.google.com"], a[href*="f-droid.org"]'),
        ).toHaveCount(0);
        await expect(axe).toHaveNoViolations();
    });
});
