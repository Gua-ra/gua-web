/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, type ReactNode, useState } from "react";
import { type Room } from "matrix-js-sdk/src/matrix";
import { Button } from "@vector-im/compound-web";
import ChatSolidIcon from "@vector-im/compound-design-tokens/assets/web/icons/chat-solid";

import { _t } from "../../../languageHandler";
import Modal from "../../../Modal";
import InlineSpinner from "../../../components/views/elements/InlineSpinner";
import SettingsStore from "../../../settings/SettingsStore";
import { SettingLevel } from "../../../settings/SettingLevel";
import { Layout } from "../../../settings/enums/Layout";
import { bubbleColour } from "../model/bubbles";
import { THEME_GALLERY } from "../model/gallery";
import { bubbleName, SECTION_NAMES, wallpaperName } from "../model/names";
import {
    baseTheme,
    canSave,
    firstTileTheme,
    isFirstTileSelected,
    isTileSelected,
    shownTheme,
    shownWallpaper,
    type ThemeScreenMode,
} from "../model/screenModel";
import { type ChatTheme, shownBubble, STOCK } from "../model/types";
import { WallpaperLayer } from "../render/WallpaperLayer";
import { useIsBubbleLayout } from "../state/useEffectiveChatTheme";
import { type Appearance, useAppearance } from "../state/useAppearance";
import { ChatBubblePickerDialog } from "./ChatBubblePickerDialog";
import { ChatThemePreview } from "./ChatThemePreview";
import { ChatThemeTile, TileGroup } from "./ChatThemeTile";
import { ChatWallpaperPickerDialog } from "./ChatWallpaperPickerDialog";
import { showChatThemeError } from "./usePickerSave";
import { useThemeScreen } from "./useThemeScreen";

interface Props {
    mode: ThemeScreenMode;
    room?: Room;
}

interface TileEntry {
    theme: ChatTheme;
    name?: string;
    selected: boolean;
    onSelect: () => void;
}

interface Preview {
    /** What saving writes: no theme for the Default and Classic tiles. */
    theme: ChatTheme;
    /** What the preview draws: the user's default for the Default tile. */
    shown: ChatTheme;
}

function RoundButton({
    title,
    value,
    disabled,
    onClick,
    children,
}: {
    title: string;
    value: string;
    disabled: boolean;
    onClick: () => void;
    children: ReactNode;
}): JSX.Element {
    return (
        <button
            type="button"
            className="mx_Dialog_nonDialogButton mx_GuaThemePanel_roundButton"
            aria-label={`${title}: ${value}`}
            disabled={disabled}
            onClick={onClick}
        >
            <span className="mx_GuaThemePanel_circle" aria-hidden={true}>
                {children}
            </span>
            <span aria-hidden={true}>{title}</span>
        </button>
    );
}

function BubbleSwatch({ theme, appearance }: { theme: ChatTheme; appearance: Appearance }): JSX.Element {
    const colour = bubbleColour(shownBubble(theme, appearance.dark), appearance.dark);
    return (
        <span className="mx_GuaThemePanel_swatch" style={colour ? { backgroundColor: colour } : undefined}>
            <ChatSolidIcon />
        </span>
    );
}

export function ChatThemePanel({ mode, room }: Props): JSX.Element {
    const { state, save } = useThemeScreen(mode, room);
    const appearance = useAppearance();
    const bubbleLayout = useIsBubbleLayout();
    const [preview, setPreview] = useState<Preview | null>(null);
    const [saving, setSaving] = useState(false);

    const base = baseTheme(state);
    const disabled = !state.canChange || saving;

    const onSave = async (theme: ChatTheme): Promise<void> => {
        setSaving(true);
        try {
            await save(theme);
            setPreview(null);
        } catch {
            showChatThemeError();
        } finally {
            setSaving(false);
        }
    };

    const openBubblePicker = (): void => {
        Modal.createDialog(ChatBubblePickerDialog, { mode, room });
    };
    const openWallpaperPicker = (): void => {
        Modal.createDialog(ChatWallpaperPickerDialog, { mode, room });
    };

    return (
        <div className="mx_GuaThemePanel">
            {!bubbleLayout && (
                <div className="mx_GuaThemePanel_layoutNote">
                    <span>{_t("gua|chat_theme|bubble_layout_note")}</span>
                    <Button
                        className="mx_Dialog_nonDialogButton"
                        kind="secondary"
                        size="sm"
                        onClick={() => SettingsStore.setValue("layout", null, SettingLevel.DEVICE, Layout.Bubble)}
                    >
                        {_t("gua|chat_theme|use_bubble_layout")}
                    </Button>
                </div>
            )}

            <ChatThemePreview theme={preview?.shown ?? shownTheme(state, state.current)} appearance={appearance} live />

            {preview ? (
                <div className="mx_GuaThemePanel_actions">
                    {saving ? (
                        <span className="mx_GuaThemePanel_progress">
                            <InlineSpinner />
                            {_t("gua|chat_theme|progress")}
                        </span>
                    ) : (
                        <>
                            <Button
                                className="mx_Dialog_nonDialogButton"
                                kind="secondary"
                                size="sm"
                                onClick={() => setPreview(null)}
                            >
                                {_t("action|cancel")}
                            </Button>
                            <Button
                                className="mx_Dialog_nonDialogButton"
                                kind="primary"
                                size="sm"
                                disabled={!canSave(state, preview.theme)}
                                onClick={() => onSave(preview.theme)}
                            >
                                {mode === "chat" ? _t("gua|chat_theme|set_theme") : _t("gua|chat_theme|set_default")}
                            </Button>
                        </>
                    )}
                </div>
            ) : (
                <div className="mx_GuaThemePanel_buttons">
                    <RoundButton
                        title={_t("gua|chat_theme|chat_bubble")}
                        value={bubbleName(base, appearance.dark)}
                        disabled={disabled}
                        onClick={openBubblePicker}
                    >
                        <BubbleSwatch theme={base} appearance={appearance} />
                    </RoundButton>
                    <RoundButton
                        title={_t("gua|chat_theme|wallpaper")}
                        value={wallpaperName(base.wallpaper)}
                        disabled={disabled}
                        onClick={openWallpaperPicker}
                    >
                        <WallpaperLayer wallpaper={shownWallpaper(state)} appearance={appearance} />
                    </RoundButton>
                </div>
            )}

            <div className="mx_GuaThemePanel_note">
                <p>{mode === "chat" ? _t("gua|chat_theme|chat_note") : _t("gua|chat_theme|default_note")}</p>
                {!state.canChange && <p>{_t("gua|chat_theme|no_permission")}</p>}
            </div>

            {THEME_GALLERY.map((section) => {
                const tiles: TileEntry[] = section.themes.map((theme) => ({
                    theme,
                    selected: isTileSelected(state, theme),
                    onSelect: () => setPreview({ theme, shown: theme }),
                }));
                if (section.id === "featured") {
                    tiles.unshift({
                        theme: firstTileTheme(state),
                        name: mode === "chat" ? _t("gua|chat_theme|default_tile") : _t("gua|chat_theme|classic"),
                        selected: isFirstTileSelected(state),
                        onSelect: () => setPreview({ theme: STOCK, shown: shownTheme(state, STOCK) }),
                    });
                }
                const focusIndex = Math.max(
                    0,
                    tiles.findIndex((tile) => tile.selected),
                );
                return (
                    <section key={section.id} className="mx_GuaThemePanel_section">
                        <h3>{_t(SECTION_NAMES[section.id])}</h3>
                        <TileGroup label={_t(SECTION_NAMES[section.id])}>
                            {tiles.map((tile, index) => (
                                <ChatThemeTile
                                    key={index}
                                    wallpaper={tile.theme.wallpaper}
                                    bubbles={tile.theme}
                                    name={tile.name}
                                    selected={tile.selected}
                                    focusable={index === focusIndex}
                                    disabled={disabled}
                                    appearance={appearance}
                                    onSelect={tile.onSelect}
                                />
                            ))}
                        </TileGroup>
                    </section>
                );
            })}
        </div>
    );
}
