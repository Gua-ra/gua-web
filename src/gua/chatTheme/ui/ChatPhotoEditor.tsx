/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, type PointerEvent, useEffect, useId, useRef, useState } from "react";
import { IconButton, InlineField, Label, RadioControl, Root } from "@vector-im/compound-web";
import ArrowLeftIcon from "@vector-im/compound-design-tokens/assets/web/icons/arrow-left";
import ArrowRightIcon from "@vector-im/compound-design-tokens/assets/web/icons/arrow-right";
import ArrowUpIcon from "@vector-im/compound-design-tokens/assets/web/icons/arrow-up";
import ArrowDownIcon from "@vector-im/compound-design-tokens/assets/web/icons/arrow-down";

import { _t } from "../../../languageHandler";
import { useMatrixClientContext } from "../../../contexts/MatrixClientContext";
import { PHOTO_DEFAULT_ALIGN, PHOTO_DEFAULT_DIM, PHOTO_MAX_ALIGN, PHOTO_MAX_DIM } from "../model/constants";
import { aspectFill } from "../model/layout";
import { baseTheme } from "../model/screenModel";
import { type PhotoWallpaper, withBubbles } from "../model/types";
import { useAppearance } from "../state/useAppearance";
import { ChatThemePreview } from "./ChatThemePreview";
import { ChatThemeActions, ChatThemeSubView } from "./ChatThemeSubView";
import { type PreparedPhoto, PHOTO_MIMETYPE, uploadPhoto } from "./photo/preparePhoto";
import { useThemeSave } from "./usePickerSave";
import { type ThemeScreen } from "./useThemeScreen";

interface Props {
    screen: ThemeScreen;
    photo: PreparedPhoto;
    onBack: () => void;
    onSaved: () => void;
}

const NUDGE = 100;
const DIM_STEP = 5;

const clampAlign = (value: number): number => Math.round(Math.min(Math.max(value, 0), PHOTO_MAX_ALIGN));

/** StrictMode unmounts and remounts within one task, so the close waits a task to see whether the editor came back. */
function useCloseOnUnmount(bitmap: ImageBitmap): void {
    const mounted = useRef(false);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            window.setTimeout(() => {
                if (!mounted.current) bitmap.close();
            });
        };
    }, [bitmap]);
}

export function ChatPhotoEditor({ screen, photo, onBack, onSaved }: Props): JSX.Element {
    const { state, save } = screen;
    const client = useMatrixClientContext();
    const appearance = useAppearance();
    const [dim, setDim] = useState(PHOTO_DEFAULT_DIM);
    const [align, setAlign] = useState({ x: PHOTO_DEFAULT_ALIGN, y: PHOTO_DEFAULT_ALIGN });
    const [previewDark, setPreviewDark] = useState(appearance.dark);
    const { saving, error, run } = useThemeSave(save);
    const frameRef = useRef<HTMLDivElement>(null);
    const drag = useRef<{ x: number; y: number; align: { x: number; y: number } } | null>(null);
    const dimId = useId();
    useCloseOnUnmount(photo.bitmap);

    const wallpaper: PhotoWallpaper = {
        url: "",
        mimetype: PHOTO_MIMETYPE,
        w: photo.width,
        h: photo.height,
        size: photo.blob.size,
        blurhash: photo.blurhash,
        dim,
        alignX: align.x,
        alignY: align.y,
    };
    const base = baseTheme(state);
    const preview = withBubbles({ kind: "photo", photo: wallpaper }, base);

    const move = (x: number, y: number): void => setAlign({ x: clampAlign(x), y: clampAlign(y) });

    // A smaller align moves the photo right or down, so the drag distance is subtracted.
    const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
        const start = drag.current;
        const frame = frameRef.current;
        if (!start || !frame) return;
        const { width, height } = frame.getBoundingClientRect();
        const rect = aspectFill(width, height, photo.width, photo.height, 0, 0);
        const overflowX = rect.width - width;
        const overflowY = rect.height - height;
        move(
            overflowX > 0 ? start.align.x - ((event.clientX - start.x) / overflowX) * PHOTO_MAX_ALIGN : start.align.x,
            overflowY > 0 ? start.align.y - ((event.clientY - start.y) / overflowY) * PHOTO_MAX_ALIGN : start.align.y,
        );
    };

    const onSet = (): Promise<void> =>
        run(async () => {
            const uploaded = await uploadPhoto(client, photo, { dim, alignX: align.x, alignY: align.y });
            return withBubbles({ kind: "photo", photo: uploaded }, base);
        }, onSaved);

    return (
        <ChatThemeSubView title={_t("gua|chat_theme|wallpaper")} onBack={onBack}>
            <div
                ref={frameRef}
                className="mx_GuaPhotoEditor_frame"
                title={_t("gua|chat_theme|photo|position_hint")}
                onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    drag.current = { x: event.clientX, y: event.clientY, align };
                }}
                onPointerMove={onPointerMove}
                onPointerUp={() => (drag.current = null)}
                onPointerCancel={() => (drag.current = null)}
            >
                <ChatThemePreview
                    theme={preview}
                    appearance={{ ...appearance, dark: previewDark }}
                    localPhoto={photo.bitmap}
                />
            </div>
            <p className="mx_GuaThemePanel_note">{_t("gua|chat_theme|photo|position_hint")}</p>
            <div className="mx_GuaPhotoEditor_moves">
                <IconButton
                    className="mx_Dialog_nonDialogButton"
                    tooltip={_t("gua|chat_theme|photo|move_left")}
                    onClick={() => move(align.x + NUDGE, align.y)}
                >
                    <ArrowLeftIcon />
                </IconButton>
                <IconButton
                    className="mx_Dialog_nonDialogButton"
                    tooltip={_t("gua|chat_theme|photo|move_right")}
                    onClick={() => move(align.x - NUDGE, align.y)}
                >
                    <ArrowRightIcon />
                </IconButton>
                <IconButton
                    className="mx_Dialog_nonDialogButton"
                    tooltip={_t("gua|chat_theme|photo|move_up")}
                    onClick={() => move(align.x, align.y + NUDGE)}
                >
                    <ArrowUpIcon />
                </IconButton>
                <IconButton
                    className="mx_Dialog_nonDialogButton"
                    tooltip={_t("gua|chat_theme|photo|move_down")}
                    onClick={() => move(align.x, align.y - NUDGE)}
                >
                    <ArrowDownIcon />
                </IconButton>
            </div>
            <Root className="mx_GuaPhotoEditor_controls" onSubmit={(event) => event.preventDefault()}>
                <div
                    className="mx_GuaPhotoEditor_appearance"
                    role="radiogroup"
                    aria-label={_t("gua|chat_theme|photo|preview_appearance")}
                >
                    <InlineField
                        name="gua-photo-preview"
                        control={<RadioControl checked={!previewDark} onChange={() => setPreviewDark(false)} />}
                    >
                        <Label>{_t("gua|chat_theme|photo|light")}</Label>
                    </InlineField>
                    <InlineField
                        name="gua-photo-preview"
                        control={<RadioControl checked={previewDark} onChange={() => setPreviewDark(true)} />}
                    >
                        <Label>{_t("gua|chat_theme|photo|dark")}</Label>
                    </InlineField>
                </div>
                <label className="mx_GuaPhotoEditor_dim" htmlFor={dimId}>
                    {_t("gua|chat_theme|photo|dim")}
                    <input
                        id={dimId}
                        type="range"
                        min={0}
                        max={PHOTO_MAX_DIM}
                        step={DIM_STEP}
                        value={dim}
                        aria-valuetext={`${dim}%`}
                        onChange={(event) => {
                            setDim(Number(event.target.value));
                            setPreviewDark(true);
                        }}
                    />
                </label>
            </Root>
            <p className="mx_GuaThemePanel_note">{_t("gua|chat_theme|photo|note")}</p>
            <ChatThemeActions
                setLabel={_t("gua|chat_theme|set")}
                saving={saving}
                disabled={!state.canChange}
                error={error}
                onCancel={onBack}
                onSet={onSet}
            />
        </ChatThemeSubView>
    );
}
