/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, useEffect, useRef, useState } from "react";
import { logger } from "matrix-js-sdk/src/logger";
import { InlineSpinner } from "@vector-im/compound-web";

import { _t } from "../../languageHandler";
import BaseDialog from "../../components/views/dialogs/BaseDialog";
import DialogButtons from "../../components/views/elements/DialogButtons";
import MatrixClientContext, { useMatrixClientContext } from "../../contexts/MatrixClientContext";
import { MatrixClientPeg } from "../../MatrixClientPeg";
import { CANVAS_SIZE, drawSticker, encodeSticker, type Framing } from "./stickerEditor";
import { stickerImageForFile, DEFAULT_STICKER_BODY } from "./stickerContent";
import { addSticker, MAX_STICKERS, StickerLimitReachedError } from "./stickerLibrary";
import { useStickerLibrary } from "./libraries";
import { pushRecentSticker } from "./recents";
import { type ExpressionTarget, sendSticker } from "./senders";

const NOTE_SEEN_KEY = "mx_gua_sticker_note_seen";
const MIN_SCALE = 1;
const MAX_SCALE = 4;
const MAX_TEXT_LENGTH = 40;

interface Props {
    image: ImageBitmap;
    target: ExpressionTarget;
    onFinished(): void;
}

type Action = "send" | "save";

function noteSeen(): boolean {
    try {
        return window.localStorage.getItem(NOTE_SEEN_KEY) === "true";
    } catch {
        return false;
    }
}

function markNoteSeen(): void {
    try {
        window.localStorage.setItem(NOTE_SEEN_KEY, "true");
    } catch {
        // Showing the note again is harmless.
    }
}

/** The web has no automatic cut-out, so stickers are framed from the photo and get text only. */
function StickerEditor({ image, target, onFinished }: Props): JSX.Element {
    const client = useMatrixClientContext();
    const [library, libraryDocument] = useStickerLibrary();
    const canvas = useRef<HTMLCanvasElement>(null);
    const drag = useRef<{ x: number; y: number }>(undefined);
    const [framing, setFraming] = useState<Framing>({ scale: 1, offsetX: 0, offsetY: 0 });
    const [text, setText] = useState("");
    const [busy, setBusy] = useState<Action>();
    const [error, setError] = useState<string>();
    const [showNote] = useState(() => !noteSeen());

    useEffect(() => {
        if (showNote) markNoteSeen();
    }, [showNote]);

    useEffect(() => {
        const context = canvas.current?.getContext("2d");
        if (context) drawSticker(context, image, framing, text);
    }, [image, framing, text]);

    const canvasUnitsPerPixel = (): number =>
        CANVAS_SIZE / (canvas.current?.getBoundingClientRect().width || CANVAS_SIZE);

    const finish = async (action: Action): Promise<void> => {
        if (!canvas.current || busy) return;
        setError(undefined);
        if (library.stickers.length >= MAX_STICKERS) {
            setError(_t("gua|expressions|sticker_limit"));
            return;
        }
        setBusy(action);
        try {
            const encoded = await encodeSticker(canvas.current);
            if (!encoded) throw new Error("The sticker is empty");
            const extension = encoded.blob.type === "image/webp" ? "webp" : "png";
            // Sticker media is never encrypted: My stickers can be sent to any chat.
            const { content_uri: url } = await client.uploadContent(encoded.blob, {
                name: `sticker.${extension}`,
                type: encoded.blob.type,
                includeFilename: false,
            });
            const sticker = stickerImageForFile({
                url,
                body: text.trim() || DEFAULT_STICKER_BODY,
                width: encoded.width,
                height: encoded.height,
                mimetype: encoded.blob.type,
                size: encoded.blob.size,
            });
            await libraryDocument.update((content) => addSticker(content, sticker, Date.now()));
            if (action === "send") {
                pushRecentSticker(client.getSafeUserId(), sticker);
                await sendSticker(client, target, sticker);
            }
            onFinished();
        } catch (caught) {
            logger.error("Could not create a sticker", caught);
            setError(
                caught instanceof StickerLimitReachedError
                    ? _t("gua|expressions|sticker_limit")
                    : action === "send"
                      ? _t("gua|expressions|sticker_send_failed")
                      : _t("gua|expressions|library_update_failed"),
            );
            setBusy(undefined);
        }
    };

    return (
        <BaseDialog
            className="mx_GuaStickerEditorDialog"
            title={_t("gua|expressions|create_sticker")}
            onFinished={onFinished}
            fixedWidth={false}
        >
            <canvas
                ref={canvas}
                className="mx_GuaStickerEditorDialog_canvas"
                width={CANVAS_SIZE}
                height={CANVAS_SIZE}
                aria-label={_t("gua|expressions|editor_canvas")}
                onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    drag.current = { x: event.clientX, y: event.clientY };
                }}
                onPointerMove={(event) => {
                    if (!drag.current) return;
                    const scale = canvasUnitsPerPixel();
                    const dx = (event.clientX - drag.current.x) * scale;
                    const dy = (event.clientY - drag.current.y) * scale;
                    drag.current = { x: event.clientX, y: event.clientY };
                    setFraming((current) => ({
                        ...current,
                        offsetX: current.offsetX + dx,
                        offsetY: current.offsetY + dy,
                    }));
                }}
                onPointerUp={() => (drag.current = undefined)}
                onPointerCancel={() => (drag.current = undefined)}
                onWheel={(event) => {
                    const factor = Math.exp(-event.deltaY / 500);
                    setFraming((current) => ({
                        ...current,
                        scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, current.scale * factor)),
                    }));
                }}
            />
            <label className="mx_GuaStickerEditorDialog_field">
                <span>{_t("gua|expressions|editor_zoom")}</span>
                <input
                    type="range"
                    min={MIN_SCALE}
                    max={MAX_SCALE}
                    step={0.01}
                    value={framing.scale}
                    onChange={(event) => setFraming((current) => ({ ...current, scale: Number(event.target.value) }))}
                />
            </label>
            <label className="mx_GuaStickerEditorDialog_field mx_no_textinput">
                <span>{_t("gua|expressions|editor_text")}</span>
                <input
                    type="text"
                    maxLength={MAX_TEXT_LENGTH}
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                />
            </label>
            {error && <p className="mx_GuaStickerEditorDialog_error">{error}</p>}
            <DialogButtons
                primaryButton={busy === "send" ? <InlineSpinner /> : _t("gua|expressions|send")}
                onPrimaryButtonClick={() => finish("send")}
                onCancel={onFinished}
                disabled={!!busy}
            >
                <button type="button" onClick={() => finish("save")} disabled={!!busy}>
                    {busy === "save" ? <InlineSpinner /> : _t("action|save")}
                </button>
            </DialogButtons>
            {showNote && <p className="mx_GuaStickerEditorDialog_note">{_t("gua|expressions|editor_note")}</p>}
        </BaseDialog>
    );
}

/** Modal renders dialogs outside the logged-in tree, so the client is provided here. */
export default function StickerEditorDialog(props: Props): JSX.Element {
    return (
        <MatrixClientContext.Provider value={MatrixClientPeg.safeGet()}>
            <StickerEditor {...props} />
        </MatrixClientContext.Provider>
    );
}
