/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { type RefObject, useEffect, useState } from "react";
import { logger } from "matrix-js-sdk/src/logger";

import Modal, { ModalManagerEvent } from "../../../Modal";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/** How long every live wallpaper stays still after frames were too slow, before they try again. */
const SLOW_FRAMES_COOL_DOWN_MS = 10 * 60 * 1000;

let framesTooSlow = false;
const slowFrameListeners = new Set<(slow: boolean) => void>();

function setFramesTooSlow(slow: boolean): void {
    framesTooSlow = slow;
    for (const listener of slowFrameListeners) listener(slow);
}

/** Once frames are too slow, every live wallpaper shows its still for ten minutes. */
export function reportSlowFrames(): void {
    if (framesTooSlow) return;
    logger.warn("Live wallpapers stay still for ten minutes: frames are too slow.");
    setFramesTooSlow(true);
    window.setTimeout(() => setFramesTooSlow(false), SLOW_FRAMES_COOL_DOWN_MS);
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
 * What the page says about a live wallpaper's view. In the timeline any dialog covers it. Inside a dialog nothing
 * does: Modal renders only the top dialog, so one opened above unmounts this one.
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
        const onSlow = (slow: boolean): void => setSlowFrames(slow);
        const onVisibility = (): void => setHidden(document.visibilityState === "hidden");
        const onFocus = (): void => setUnfocused(false);
        const onBlur = (): void => setUnfocused(true);
        query?.addEventListener?.("change", onMotion);
        slowFrameListeners.add(onSlow);
        setSlowFrames(framesTooSlow);
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
        if (inDialog) {
            setCovered(false);
            return;
        }
        const update = (): void => setCovered(Modal.hasDialogs());
        update();
        Modal.on(ModalManagerEvent.Opened, update);
        Modal.on(ModalManagerEvent.Closed, update);
        return () => {
            Modal.off(ModalManagerEvent.Opened, update);
            Modal.off(ModalManagerEvent.Closed, update);
        };
    }, [inDialog]);

    return { reducedMotion, slowFrames, hidden, unfocused, offScreen, covered };
}
