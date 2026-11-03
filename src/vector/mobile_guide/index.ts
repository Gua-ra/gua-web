/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import "./index.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";

function onContinueToWebClick(): void {
    // Keep mobile visitors on the web client for four hours after they explicitly opt in.
    document.cookie = "element_mobile_redirect_to_guide=false;path=/;max-age=14400;SameSite=Lax";
}

document.getElementById("continue_to_web_button")?.addEventListener("click", onContinueToWebClick);
