/*
Copyright 2025 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { type IConfigOptions } from "../IConfigOptions";

export const GUA_BRAND = "Gua";
export const GUA_LOGO_URL = "themes/gua/img/logos/logo.svg";
export const GUA_APP_LOGO_URL = "themes/gua/img/logos/app-logo.png";
export const GUA_WELCOME_BACKGROUND_URL = "themes/gua/img/backgrounds/background.png";
export const GUA_WEB_REGISTRATION_ENABLED: boolean = false;
export const GUA_WEB_REGISTRATION_DISABLED_MESSAGE = "Web account creation is unavailable during the beta.";

export const GUA_CONFIG_DEFAULTS: Partial<IConfigOptions> = {
    brand: GUA_BRAND,
    branding: {
        welcome_background_url: GUA_WELCOME_BACKGROUND_URL,
        welcome_logo_url: GUA_LOGO_URL,
        auth_header_logo_url: GUA_LOGO_URL,
        registration_disabled_message: GUA_WEB_REGISTRATION_DISABLED_MESSAGE,
        auth_footer_links: [
            {
                text: "Developed by Sarah L.S.",
                text_key: "gua|footer|developed_by",
                variables: {
                    name: "Sarah L.S.",
                },
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
        "breadcrumbs": true,
        "UIFeature.registration": GUA_WEB_REGISTRATION_ENABLED,
    },
    room_directory: {
        servers: [],
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
        logo_uri: GUA_APP_LOGO_URL,
    },
};
