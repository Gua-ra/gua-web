/*
Copyright 2025 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { type IConfigOptions } from "../IConfigOptions";

export const GUA_BRAND = "Gua";
export const GUA_LOGO_URL = "themes/gua/img/logos/logo.svg";
export const GUA_WELCOME_BACKGROUND_URL = "themes/gua/img/backgrounds/background.svg";

export const GUA_CONFIG_DEFAULTS: Partial<IConfigOptions> = {
    brand: GUA_BRAND,
    branding: {
        welcome_background_url: GUA_WELCOME_BACKGROUND_URL,
        auth_header_logo_url: GUA_LOGO_URL,
        auth_footer_links: [
            {
                text: "Developed by Sarah Lacerda",
                url: "https://github.com/sarah-lacerda",
            },
            {
                text: "GitHub",
                url: "https://github.com/Gua-ra/gua-web",
            },
        ],
    },
    gua_auth: {
        phone_oidc_login: true,
    },
    disable_custom_urls: true,
    disable_guests: true,
    disable_3pid_login: true,
    default_country_code: "BR",
    default_theme: "light",
    setting_defaults: {
        breadcrumbs: true,
        language: "pt-br",
    },
    room_directory: {
        servers: ["dev.gua.sarahlacerda.me"],
    },
    mobile_builds: {
        ios: null,
        android: null,
        fdroid: null,
    },
    element_call: {
        use_exclusively: false,
        participant_limit: 8,
        brand: "Gua Call",
    },
    oidc_metadata: {
        logo_uri: GUA_LOGO_URL,
    },
};
