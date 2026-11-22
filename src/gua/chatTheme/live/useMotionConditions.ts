/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { type RefObject, useEffect, useState } from "react";
import { logger } from "matrix-js-sdk/src/logger";

import Modal, { ModalManagerEvent } from "../../../Modal";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

let framesTooSlow = false;
const slowFrameListeners = new Set<() => void>();

/** Once frames are too slow, every live wallpaper stays still until the page reloads. */
export function reportSlowFrames(): void {
    if (framesTooSlow) return;
    framesTooSlow = true;
    logger.warn("Live wallpapers stay still for this session: frames are too slow.");
    for (const listener of slowFrameListeners) listener();
}

export interface ViewConditions {
    reducedMotion: boolean;
    slowFrames: boolean;
    hidden: boolean;
    unfocused: boolean;
    offScreen: boolean;
    covered: boolean;
}

function prefersReducedMotion(): boolean {
    return window.matchMedia?.(REDUCED_MOTION).matches ?? false;
}

/**
 * What the page says about a live wallpaper's view. In the timeline any dialog covers it; inside a dialog only the
 * dialogs opened above it do.
 */
export function useMotionConditions(ref: RefObject<HTMLElement | null>, inDialog: boolean): ViewConditions {
    const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
    const [slowFrames, setSlowFrames] = useState(framesTooSlow);
    const [hidden, setHidden] = useState(() => document.visibilityState === "hidden");
    const [unfocused, setUnfocused] = useState(() => !document.hasFocus());
    const [offScreen, setOffScreen] = useState(false);
    const [covered, setCovered] = useState(() => !inDialog && Modal.hasDialogs());

    useEffect(() => {
        const query = window.matchMedia?.(REDUCED_MOTION);
        const onMotion = (): void => setReducedMotion(prefersReducedMotion());
        const onSlow = (): void => setSlowFrames(true);
        const onVisibility = (): void => setHidden(document.visibilityState === "hidden");
        const onFocus = (): void => setUnfocused(false);
        const onBlur = (): void => setUnfocused(true);
        query?.addEventListener?.("change", onMotion);
        slowFrameListeners.add(onSlow);
        document.addEventListener("visibilitychange", onVisibility);
        window.addEventListener("focus", onFocus);
        window.addEventListener("blur", onBlur);
        return () => {
            query?.removeEventListener?.("change", onMotion);
            slowFrameListeners.delete(onSlow);
            document.removeEventListener("visibilitychange", onVisibility);
            window.removeEventListener("focus", onFocus);
            window.removeEventListener("blur", onBlur);
        };
    }, []);

    useEffect(() => {
        const element = ref.current;
        if (!element || typeof IntersectionObserver === "undefined") return;
        const observer = new IntersectionObserver(([entry]) => setOffScreen(!entry.isIntersecting));
        observer.observe(element);
        return () => observer.disconnect();
    }, [ref]);

    useEffect(() => {
        let openedAbove = 0;
        const onOpened = (): void => {
            openedAbove++;
            setCovered(inDialog ? openedAbove > 0 : Modal.hasDialogs());
        };
        const onClosed = (): void => {
            openedAbove = Math.max(0, openedAbove - 1);
            setCovered(inDialog ? openedAbove > 0 : Modal.hasDialogs());
        };
        Modal.on(ModalManagerEvent.Opened, onOpened);
        Modal.on(ModalManagerEvent.Closed, onClosed);
        return () => {
            Modal.off(ModalManagerEvent.Opened, onOpened);
            Modal.off(ModalManagerEvent.Closed, onClosed);
        };
    }, [inDialog]);

    return { reducedMotion, slowFrames, hidden, unfocused, offScreen, covered };
}
