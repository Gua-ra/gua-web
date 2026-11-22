/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { useEffect, useState } from "react";

export interface Appearance {
    dark: boolean;
    increasedContrast: boolean;
    reducedTransparency: boolean;
}

const REDUCED_TRANSPARENCY = "(prefers-reduced-transparency: reduce)";

/** Reads the Compound theme class on the body, which Compound's own colours follow. */
function readAppearance(): Appearance {
    const classes = document.body.classList;
    return {
        dark: classes.contains("cpd-theme-dark") || classes.contains("cpd-theme-dark-hc"),
        increasedContrast: classes.contains("cpd-theme-light-hc") || classes.contains("cpd-theme-dark-hc"),
        reducedTransparency: window.matchMedia?.(REDUCED_TRANSPARENCY).matches ?? false,
    };
}

function sameAppearance(a: Appearance, b: Appearance): boolean {
    return (
        a.dark === b.dark &&
        a.increasedContrast === b.increasedContrast &&
        a.reducedTransparency === b.reducedTransparency
    );
}

export function useAppearance(): Appearance {
    const [appearance, setAppearance] = useState(readAppearance);
    useEffect(() => {
        const update = (): void =>
            setAppearance((current) => {
                const next = readAppearance();
                return sameAppearance(current, next) ? current : next;
            });
        const observer = new MutationObserver(update);
        observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
        const query = window.matchMedia?.(REDUCED_TRANSPARENCY);
        query?.addEventListener?.("change", update);
        update();
        return () => {
            observer.disconnect();
            query?.removeEventListener?.("change", update);
        };
    }, []);
    return appearance;
}
