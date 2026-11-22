/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, useState } from "react";
import { type Room } from "matrix-js-sdk/src/matrix";
import classNames from "classnames";
import CheckIcon from "@vector-im/compound-design-tokens/assets/web/icons/check";

import { _t } from "../../../languageHandler";
import BaseDialog from "../../../components/views/dialogs/BaseDialog";
import DialogButtons from "../../../components/views/elements/DialogButtons";
import { BUBBLE_IDS, type BubbleId, bubbleColour } from "../model/bubbles";
import { BUBBLE_NAMES } from "../model/names";
import { baseTheme, canSavePickerChoice, shownTheme, type ThemeScreenMode } from "../model/screenModel";
import { type ChatTheme, makeTheme, withBubbles } from "../model/types";
import { useAppearance } from "../state/useAppearance";
import { ChatThemePreview } from "./ChatThemePreview";
import { TileGroup } from "./ChatThemeTile";
import { useSaveAndClose } from "./usePickerSave";
import { useThemeScreen } from "./useThemeScreen";

interface Props {
    mode: ThemeScreenMode;
    room?: Room;
    onFinished: () => void;
}

function ChatBubblePickerDialogContent({ mode, room, onFinished }: Props): JSX.Element {
    const { state, save } = useThemeScreen(mode, room);
    const appearance = useAppearance();
    const base = baseTheme(state);
    const [bubbles, setBubbles] = useState<ChatTheme>(base);
    const { saving, saveAndClose } = useSaveAndClose(save, onFinished);
    const choice = withBubbles(base.wallpaper, bubbles);

    const pick = (bubble: BubbleId): void => {
        if (bubble !== bubbles.bubble) setBubbles(makeTheme({ kind: "none" }, bubble));
    };

    return (
        <>
            <ChatThemePreview theme={shownTheme(state, choice)} appearance={appearance} />
            <TileGroup label={_t("gua|chat_theme|chat_bubble")}>
                {BUBBLE_IDS.map((bubble) => {
                    const selected = bubble === bubbles.bubble;
                    const colour = bubbleColour(bubble, appearance.dark);
                    return (
                        <button
                            key={bubble}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            aria-label={_t("gua|chat_theme|bubble_label", { name: _t(BUBBLE_NAMES[bubble]) })}
                            tabIndex={selected ? 0 : -1}
                            className={classNames("mx_Dialog_nonDialogButton mx_GuaThemeSwatch", {
                                mx_GuaThemeSwatch_standard: !colour,
                            })}
                            style={colour ? { backgroundColor: colour } : undefined}
                            onClick={() => pick(bubble)}
                        >
                            {selected && <CheckIcon aria-hidden={true} />}
                        </button>
                    );
                })}
            </TileGroup>
            <DialogButtons
                primaryButton={saving ? _t("gua|chat_theme|progress") : _t("gua|chat_theme|set")}
                primaryDisabled={saving || !canSavePickerChoice(state, choice)}
                onPrimaryButtonClick={() => saveAndClose(choice)}
                onCancel={onFinished}
            />
        </>
    );
}

/** The content sits inside BaseDialog, which provides the client context to modals. */
export function ChatBubblePickerDialog(props: Props): JSX.Element {
    return (
        <BaseDialog
            className="mx_GuaThemePickerDialog"
            title={_t("gua|chat_theme|chat_bubble")}
            onFinished={props.onFinished}
            fixedWidth={false}
        >
            <ChatBubblePickerDialogContent {...props} />
        </BaseDialog>
    );
}
