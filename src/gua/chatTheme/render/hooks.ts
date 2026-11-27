/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { type RefObject, useEffect, useLayoutEffect, useState } from "react";

export interface Size {
    width: number;
    height: number;
}

export function useElementSize(ref: RefObject<HTMLElement | null>): Size {
    const [size, setSize] = useState<Size>({ width: 0, height: 0 });
    useEffect(() => {
        const element = ref.current;
        if (!element) return;
        const update = (): void =>
            setSize((current) => {
                const { width, height } = element.getBoundingClientRect();
                return current.width === width && current.height === height ? current : { width, height };
            });
        update();
        const observer = new ResizeObserver(update);
        observer.observe(element);
        return () => observer.disconnect();
    }, [ref]);
    return size;
}

/** Follows zoom and moves between screens, which change the ratio without resizing anything. */
export function useDevicePixelRatio(): number {
    const [ratio, setRatio] = useState(() => window.devicePixelRatio || 1);
    useEffect(() => {
        const query = window.matchMedia?.(`(resolution: ${ratio}dppx)`);
        const update = (): void => setRatio(window.devicePixelRatio || 1);
        query?.addEventListener?.("change", update);
        return () => query?.removeEventListener?.("change", update);
    }, [ratio]);
    return ratio;
}

/** The layers to draw, oldest first: the previous value stays mounted under the new one while it fades in. */
export function useCrossfade<T>(key: string, value: T, durationMs: number): { key: string; value: T }[] {
    const [shown, setShown] = useState({ key, value });
    const [previous, setPrevious] = useState<{ key: string; value: T } | null>(null);
    useLayoutEffect(() => {
        if (shown.key === key) return;
        setPrevious(shown);
        setShown({ key, value });
    }, [key, value, shown]);
    useEffect(() => {
        if (!previous) return;
        const timer = window.setTimeout(() => setPrevious(null), durationMs);
        return () => window.clearTimeout(timer);
    }, [previous, durationMs]);
    const below = shown.key !== key ? shown : previous;
    return below && below.key !== key ? [below, { key, value }] : [{ key, value }];
}
