/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, useState } from "react";
import { type Room } from "matrix-js-sdk/src/matrix";
import classNames from "classnames";

import { _t } from "../../languageHandler";
import EmojiPicker from "../../components/views/emojipicker/EmojiPicker";
import { type GifProvider } from "./klipy";
import { type ExpressionTarget } from "./senders";
import { StickersTab } from "./StickersTab";
import { GifsTab } from "./GifsTab";

export type ExpressionTab = "emoji" | "gif" | "stickers";

const TABS: ExpressionTab[] = ["emoji", "gif", "stickers"];
const LAST_TAB_KEY = "mx_gua_expressions_last_tab";

function lastTab(): ExpressionTab {
    try {
        const stored = window.localStorage.getItem(LAST_TAB_KEY);
        return TABS.find((tab) => tab === stored) ?? "stickers";
    } catch {
        return "stickers";
    }
}

function rememberTab(tab: ExpressionTab): void {
    try {
        window.localStorage.setItem(LAST_TAB_KEY, tab);
    } catch {
        // The panel opens on Stickers next time instead.
    }
}

function tabLabel(tab: ExpressionTab): string {
    switch (tab) {
        case "emoji":
            return _t("common|emoji");
        case "gif":
            // A product name in every language.
            return "GIF";
        case "stickers":
            return _t("gua|expressions|tab_stickers");
    }
}

interface Props {
    room: Room;
    target: ExpressionTarget;
    addEmoji(unicode: string): boolean;
    onFinished(): void;
    onCreateSticker(): void;
    gifProvider?: GifProvider;
}

/**
 * Emoji, GIF and Stickers in one panel, as on Android: the web has no system keyboard to offer emoji.
 * Its tiles always load, whatever the media previews setting, because the user is choosing them.
 */
export function ExpressionPanel({
    room,
    target,
    addEmoji,
    onFinished,
    onCreateSticker,
    gifProvider,
}: Props): JSX.Element {
    const [tab, setTab] = useState<ExpressionTab>(lastTab);

    const select = (next: ExpressionTab): void => {
        setTab(next);
        rememberTab(next);
    };

    let content: JSX.Element;
    switch (tab) {
        case "emoji":
            content = <EmojiPicker onChoose={addEmoji} onFinished={onFinished} />;
            break;
        case "gif":
            content = <GifsTab target={target} onFinished={onFinished} provider={gifProvider} />;
            break;
        case "stickers":
            content = (
                <StickersTab room={room} target={target} onFinished={onFinished} onCreateSticker={onCreateSticker} />
            );
            break;
    }

    return (
        <div
            className="mx_GuaExpressionPanel"
            onKeyDown={(event) => {
                // The panel's menu is unmanaged, so it closes itself on Escape.
                if (event.key === "Escape" && !event.defaultPrevented) {
                    event.preventDefault();
                    onFinished();
                }
            }}
        >
            <div className="mx_GuaExpressionPanel_tabs" role="tablist">
                {TABS.map((name) => (
                    <button
                        key={name}
                        type="button"
                        role="tab"
                        id={`mx_GuaExpressionPanel_tab_${name}`}
                        aria-selected={tab === name}
                        aria-controls="mx_GuaExpressionPanel_content"
                        className={classNames("mx_GuaExpressionPanel_tab", {
                            mx_GuaExpressionPanel_tab_selected: tab === name,
                        })}
                        onClick={() => select(name)}
                    >
                        {tabLabel(name)}
                    </button>
                ))}
            </div>
            <div
                id="mx_GuaExpressionPanel_content"
                role="tabpanel"
                aria-labelledby={`mx_GuaExpressionPanel_tab_${tab}`}
                className="mx_GuaExpressionPanel_content"
            >
                {content}
            </div>
        </div>
    );
}
