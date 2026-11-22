/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, useId, useState } from "react";
import classNames from "classnames";
import CheckIcon from "@vector-im/compound-design-tokens/assets/web/icons/check";

import { _t } from "../../../languageHandler";
import { BUBBLE_IDS, type BubbleId, bubbleColour } from "../model/bubbles";
import { BUBBLE_NAMES } from "../model/names";
import { baseTheme, canSavePickerChoice, shownTheme } from "../model/screenModel";
import { type ChatTheme, makeTheme, NO_WALLPAPER, shownBubble, withBubbles } from "../model/types";
import { useAppearance } from "../state/useAppearance";
import { ChatThemePreview } from "./ChatThemePreview";
import { ChatThemeActions, ChatThemeSubView } from "./ChatThemeSubView";
import { TileGroup } from "./ChatThemeTile";
import { useThemeSave } from "./useThemeSave";
import { type ThemeScreen } from "./useThemeScreen";

interface Props {
    screen: ThemeScreen;
    onBack: () => void;
    onSaved: () => void;
}

export function ChatBubblePicker({ screen: { state, save }, onBack, onSaved }: Props): JSX.Element {
    const appearance = useAppearance();
    const base = baseTheme(state);
    const [bubbles, setBubbles] = useState<ChatTheme>(base);
    const { saving, error, run } = useThemeSave(save);
    const group = useId();
    const choice = withBubbles(base.wallpaper, bubbles);
    const shown = shownBubble(bubbles, appearance.dark);

    // Picking the shown swatch again would drop the other appearance's bubble with no visible change.
    const pick = (bubble: BubbleId): void => {
        if (bubble !== shown) setBubbles(makeTheme(NO_WALLPAPER, bubble));
    };

    return (
        <ChatThemeSubView title={_t("gua|chat_theme|chat_bubble")} onBack={onBack}>
            <ChatThemePreview theme={shownTheme(state, choice)} appearance={appearance} />
            <TileGroup label={_t("gua|chat_theme|chat_bubble")}>
                {BUBBLE_IDS.map((bubble) => {
                    const selected = bubble === shown;
                    const colour = bubbleColour(bubble, appearance.dark);
                    return (
                        <label
                            key={bubble}
                            className={classNames("mx_GuaThemeSwatch", { mx_GuaThemeSwatch_standard: !colour })}
                            style={colour ? { backgroundColor: colour } : undefined}
                        >
                            <input
                                type="radio"
                                className="mx_GuaThemeTile_input"
                                name={group}
                                checked={selected}
                                disabled={saving}
                                aria-label={_t("gua|chat_theme|bubble_label", { name: _t(BUBBLE_NAMES[bubble]) })}
                                onChange={() => pick(bubble)}
                            />
                            {selected && <CheckIcon aria-hidden={true} />}
                        </label>
                    );
                })}
            </TileGroup>
            <ChatThemeActions
                setLabel={_t("gua|chat_theme|set")}
                saving={saving}
                disabled={!canSavePickerChoice(state, choice)}
                error={error}
                onCancel={onBack}
                onSet={() => run(choice, onSaved)}
            />
        </ChatThemeSubView>
    );
}
