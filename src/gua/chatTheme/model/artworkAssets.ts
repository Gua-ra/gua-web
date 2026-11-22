/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import glassDropsLight from "../../../../res/img/gua/wallpapers/glass-drops-light.webp";
import glassDropsDark from "../../../../res/img/gua/wallpapers/glass-drops-dark.webp";
import glassDropsBlueLight from "../../../../res/img/gua/wallpapers/glass-drops-blue-light.webp";
import glassDropsBlueDark from "../../../../res/img/gua/wallpapers/glass-drops-blue-dark.webp";
import moltenPearlLight from "../../../../res/img/gua/wallpapers/molten-pearl-light.webp";
import moltenPearlDark from "../../../../res/img/gua/wallpapers/molten-pearl-dark.webp";
import silkLight from "../../../../res/img/gua/wallpapers/silk-light.webp";
import silkDark from "../../../../res/img/gua/wallpapers/silk-dark.webp";
import ipeLight from "../../../../res/img/gua/wallpapers/ipe-light.webp";
import ipeDark from "../../../../res/img/gua/wallpapers/ipe-dark.webp";
import rainOnGlassLight from "../../../../res/img/gua/wallpapers/rain-on-glass-light.webp";
import rainOnGlassDark from "../../../../res/img/gua/wallpapers/rain-on-glass-dark.webp";
import pantanalLight from "../../../../res/img/gua/wallpapers/pantanal-light.webp";
import pantanalDark from "../../../../res/img/gua/wallpapers/pantanal-dark.webp";
import currentsLiveLight from "../../../../res/img/gua/wallpapers/currents-live-light.webp";
import currentsLiveDark from "../../../../res/img/gua/wallpapers/currents-live-dark.webp";
import borealLight from "../../../../res/img/gua/wallpapers/boreal-light.webp";
import borealDark from "../../../../res/img/gua/wallpapers/boreal-dark.webp";
import lagoonLight from "../../../../res/img/gua/wallpapers/lagoon-light.webp";
import lagoonDark from "../../../../res/img/gua/wallpapers/lagoon-dark.webp";
import seaSparksLight from "../../../../res/img/gua/wallpapers/sea-sparks-light.webp";
import seaSparksDark from "../../../../res/img/gua/wallpapers/sea-sparks-dark.webp";
import tropicDuskLight from "../../../../res/img/gua/wallpapers/tropic-dusk-light.webp";
import tropicDuskDark from "../../../../res/img/gua/wallpapers/tropic-dusk-dark.webp";
import duneLagoonsLight from "../../../../res/img/gua/wallpapers/dune-lagoons-light.webp";
import duneLagoonsDark from "../../../../res/img/gua/wallpapers/dune-lagoons-dark.webp";
import palmCoastLight from "../../../../res/img/gua/wallpapers/palm-coast-light.webp";
import palmCoastDark from "../../../../res/img/gua/wallpapers/palm-coast-dark.webp";
import riverBendsLight from "../../../../res/img/gua/wallpapers/river-bends-light.webp";
import riverBendsDark from "../../../../res/img/gua/wallpapers/river-bends-dark.webp";
import highlandMistLight from "../../../../res/img/gua/wallpapers/highland-mist-light.webp";
import highlandMistDark from "../../../../res/img/gua/wallpapers/highland-mist-dark.webp";
import glacierLakeLight from "../../../../res/img/gua/wallpapers/glacier-lake-light.webp";
import glacierLakeDark from "../../../../res/img/gua/wallpapers/glacier-lake-dark.webp";
import canolaSkyLight from "../../../../res/img/gua/wallpapers/canola-sky-light.webp";
import canolaSkyDark from "../../../../res/img/gua/wallpapers/canola-sky-dark.webp";
import harbourFogLight from "../../../../res/img/gua/wallpapers/harbour-fog-light.webp";
import harbourFogDark from "../../../../res/img/gua/wallpapers/harbour-fog-dark.webp";
import canyonGlowLight from "../../../../res/img/gua/wallpapers/canyon-glow-light.webp";
import canyonGlowDark from "../../../../res/img/gua/wallpapers/canyon-glow-dark.webp";
import polarIceLight from "../../../../res/img/gua/wallpapers/polar-ice-light.webp";
import polarIceDark from "../../../../res/img/gua/wallpapers/polar-ice-dark.webp";
import moonTideLight from "../../../../res/img/gua/wallpapers/moon-tide-light.webp";
import moonTideDark from "../../../../res/img/gua/wallpapers/moon-tide-dark.webp";
import guaraLight from "../../../../res/img/gua/wallpapers/guara-light.webp";
import guaraDark from "../../../../res/img/gua/wallpapers/guara-dark.webp";
import currentsLight from "../../../../res/img/gua/wallpapers/currents-light.webp";
import currentsDark from "../../../../res/img/gua/wallpapers/currents-dark.webp";
import azulejoLight from "../../../../res/img/gua/wallpapers/azulejo-light.webp";
import azulejoDark from "../../../../res/img/gua/wallpapers/azulejo-dark.webp";
import calcadaoLight from "../../../../res/img/gua/wallpapers/calcadao-light.webp";
import calcadaoDark from "../../../../res/img/gua/wallpapers/calcadao-dark.webp";
import knitLight from "../../../../res/img/gua/wallpapers/knit-light.webp";
import knitDark from "../../../../res/img/gua/wallpapers/knit-dark.webp";
import doodlesBrasilLight from "../../../../res/img/gua/wallpapers/doodles-brasil-light.webp";
import doodlesBrasilDark from "../../../../res/img/gua/wallpapers/doodles-brasil-dark.webp";
import doodlesCanadaLight from "../../../../res/img/gua/wallpapers/doodles-canada-light.webp";
import doodlesCanadaDark from "../../../../res/img/gua/wallpapers/doodles-canada-dark.webp";
import paperLight from "../../../../res/img/gua/wallpapers/paper-light.webp";
import paperDark from "../../../../res/img/gua/wallpapers/paper-dark.webp";
import paperCutLight from "../../../../res/img/gua/wallpapers/paper-cut-light.webp";
import paperCutDark from "../../../../res/img/gua/wallpapers/paper-cut-dark.webp";
import { type ArtworkId } from "./artworks";

/** URLs only: a still is fetched when something draws it, never bundled into JavaScript. */
const STILLS: Record<ArtworkId, { light: string; dark: string }> = {
    "glass-drops": { light: glassDropsLight, dark: glassDropsDark },
    "glass-drops-blue": { light: glassDropsBlueLight, dark: glassDropsBlueDark },
    "molten-pearl": { light: moltenPearlLight, dark: moltenPearlDark },
    "silk": { light: silkLight, dark: silkDark },
    "ipe": { light: ipeLight, dark: ipeDark },
    "rain-on-glass": { light: rainOnGlassLight, dark: rainOnGlassDark },
    "pantanal": { light: pantanalLight, dark: pantanalDark },
    "currents-live": { light: currentsLiveLight, dark: currentsLiveDark },
    "boreal": { light: borealLight, dark: borealDark },
    "lagoon": { light: lagoonLight, dark: lagoonDark },
    "sea-sparks": { light: seaSparksLight, dark: seaSparksDark },
    "tropic-dusk": { light: tropicDuskLight, dark: tropicDuskDark },
    "dune-lagoons": { light: duneLagoonsLight, dark: duneLagoonsDark },
    "palm-coast": { light: palmCoastLight, dark: palmCoastDark },
    "river-bends": { light: riverBendsLight, dark: riverBendsDark },
    "highland-mist": { light: highlandMistLight, dark: highlandMistDark },
    "glacier-lake": { light: glacierLakeLight, dark: glacierLakeDark },
    "canola-sky": { light: canolaSkyLight, dark: canolaSkyDark },
    "harbour-fog": { light: harbourFogLight, dark: harbourFogDark },
    "canyon-glow": { light: canyonGlowLight, dark: canyonGlowDark },
    "polar-ice": { light: polarIceLight, dark: polarIceDark },
    "moon-tide": { light: moonTideLight, dark: moonTideDark },
    "guara": { light: guaraLight, dark: guaraDark },
    "currents": { light: currentsLight, dark: currentsDark },
    "azulejo": { light: azulejoLight, dark: azulejoDark },
    "calcadao": { light: calcadaoLight, dark: calcadaoDark },
    "knit": { light: knitLight, dark: knitDark },
    "doodles-brasil": { light: doodlesBrasilLight, dark: doodlesBrasilDark },
    "doodles-canada": { light: doodlesCanadaLight, dark: doodlesCanadaDark },
    "paper": { light: paperLight, dark: paperDark },
    "paper-cut": { light: paperCutLight, dark: paperCutDark },
};

export function stillUrl(id: ArtworkId, dark: boolean): string {
    return dark ? STILLS[id].dark : STILLS[id].light;
}
