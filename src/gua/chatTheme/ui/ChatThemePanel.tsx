/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, type ReactNode, type RefObject, useEffect, useId, useRef, useState } from "react";
import { type Room } from "matrix-js-sdk/src/matrix";
import { Button } from "@vector-im/compound-web";
import ChatSolidIcon from "@vector-im/compound-design-tokens/assets/web/icons/chat-solid";

import { _t } from "../../../languageHandler";
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
import { type ChatTheme, isStock, shownBubble, STOCK, themesEqual } from "../model/types";
import { WallpaperThumbnail } from "../render/WallpaperLayer";
import { useIsBubbleLayout } from "../state/flags";
import { type Appearance, useAppearance } from "../state/useAppearance";
import { ChatBubblePicker } from "./ChatBubblePicker";
import { ChatPhotoEditor } from "./ChatPhotoEditor";
import { ChatThemeActions } from "./ChatThemeSubView";
import { ChatThemePreview } from "./ChatThemePreview";
import { ChatThemeTile, TileGroup, tileLabel } from "./ChatThemeTile";
import { ChatWallpaperPicker } from "./ChatWallpaperPicker";
import { type PreparedPhoto } from "./photo/preparePhoto";
import { useThemeSave } from "./usePickerSave";
import { type ThemeScreen, useThemeScreen } from "./useThemeScreen";

interface Props {
    mode: ThemeScreenMode;
    room?: Room;
}

interface TileEntry {
    theme: ChatTheme;
    name?: string;
    selected: boolean;
    checked: boolean;
    current: boolean;
    onSelect: () => void;
}

interface Preview {
    /** What saving writes: no theme for the Default and Classic tiles. */
    theme: ChatTheme;
    /** What the preview draws: the user's default for the Default tile. */
    shown: ChatTheme;
    /** What the tile is called, for the announcement. */
    label: string;
}

type View = { kind: "panel" } | { kind: "bubble" } | { kind: "wallpaper" } | { kind: "photo"; photo: PreparedPhoto };

/** The button that opened a picker, which takes focus when the panel shows again. */
type FocusTarget = "bubble" | "wallpaper";

const ROUND_BUTTON_SIZE = 64;

function RoundButton({
    buttonRef,
    title,
    value,
    disabled,
    onClick,
    children,
}: {
    buttonRef: RefObject<HTMLButtonElement | null>;
    title: string;
    value: string;
    disabled: boolean;
    onClick: () => void;
    children: ReactNode;
}): JSX.Element {
    return (
        <button
            ref={buttonRef}
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

/**
 * The theme screen for a chat or for the personal default. Picking a tile previews it; the pickers and the photo
 * editor open in its place, each with Back. A save announces itself and puts focus back where the user was.
 */
export function ChatThemePanel({ mode, room }: Props): JSX.Element {
    const screen = useThemeScreen(mode, room);
    const [view, setView] = useState<View>({ kind: "panel" });
    const [announcement, setAnnouncement] = useState("");
    const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);

    const back = (target: FocusTarget): void => {
        setView({ kind: "panel" });
        setFocusTarget(target);
    };
    const saved = (target: FocusTarget): void => {
        setAnnouncement(_t("gua|chat_theme|theme_set"));
        back(target);
    };

    switch (view.kind) {
        case "bubble":
            return <ChatBubblePicker screen={screen} onBack={() => back("bubble")} onSaved={() => saved("bubble")} />;
        case "wallpaper":
            return (
                <ChatWallpaperPicker
                    screen={screen}
                    onBack={() => back("wallpaper")}
                    onSaved={() => saved("wallpaper")}
                    onPhoto={(photo) => setView({ kind: "photo", photo })}
                />
            );
        case "photo":
            return (
                <ChatPhotoEditor
                    screen={screen}
                    photo={view.photo}
                    onBack={() => setView({ kind: "wallpaper" })}
                    onSaved={() => saved("wallpaper")}
                />
            );
        case "panel":
            return (
                <ThemeGallery
                    mode={mode}
                    screen={screen}
                    announcement={announcement}
                    focusTarget={focusTarget}
                    onFocused={() => setFocusTarget(null)}
                    onAnnounce={setAnnouncement}
                    onOpen={(kind) => {
                        setAnnouncement("");
                        setView({ kind });
                    }}
                />
            );
    }
}

function ThemeGallery({
    mode,
    screen,
    announcement,
    focusTarget,
    onFocused,
    onAnnounce,
    onOpen,
}: {
    mode: ThemeScreenMode;
    screen: ThemeScreen;
    announcement: string;
    focusTarget: FocusTarget | null;
    onFocused: () => void;
    onAnnounce: (announcement: string) => void;
    onOpen: (kind: "bubble" | "wallpaper") => void;
}): JSX.Element {
    const { state, save } = screen;
    const appearance = useAppearance();
    const bubbleLayout = useIsBubbleLayout();
    const [preview, setPreview] = useState<Preview | null>(null);
    const { saving, error, run, setError } = useThemeSave(save);
    const rootRef = useRef<HTMLDivElement>(null);
    const bubbleRef = useRef<HTMLButtonElement>(null);
    const wallpaperRef = useRef<HTMLButtonElement>(null);
    const group = useId();
    const headingIds = useId();

    const base = baseTheme(state);
    const disabled = !state.canChange || saving;
    const setLabel = mode === "chat" ? _t("gua|chat_theme|set_theme") : _t("gua|chat_theme|set_default");

    useEffect(() => {
        if (!focusTarget) return;
        (focusTarget === "bubble" ? bubbleRef : wallpaperRef).current?.focus();
        onFocused();
    }, [focusTarget, onFocused]);

    // The Set button goes with the preview, so after a save focus moves to the tile that is now the saved one.
    const [focusChecked, setFocusChecked] = useState(false);
    useEffect(() => {
        if (!focusChecked) return;
        rootRef.current?.querySelector<HTMLInputElement>("input[type='radio']:checked")?.focus();
        setFocusChecked(false);
    }, [focusChecked]);

    const startPreview = (next: Preview): void => {
        setPreview(next);
        setError(null);
        onAnnounce("");
    };

    const onSave = (theme: ChatTheme): Promise<void> =>
        run(theme, () => {
            setPreview(null);
            onAnnounce(_t("gua|chat_theme|theme_set"));
            setFocusChecked(true);
        });

    const status = preview ? _t("gua|chat_theme|previewing", { name: preview.label, action: setLabel }) : announcement;

    // A theme can be in two sections; only its first tile is the group's checked radio.
    let checkedGiven = false;
    const sections = THEME_GALLERY.map((section) => {
        const tiles: TileEntry[] = section.themes.map((theme) => ({
            theme,
            selected: preview ? themesEqual(theme, preview.theme) : isTileSelected(state, theme),
            checked: false,
            current: !!preview && isTileSelected(state, theme),
            onSelect: () =>
                startPreview({ theme, shown: theme, label: tileLabel(theme.wallpaper, theme, appearance.dark) }),
        }));
        if (section.id === "featured") {
            const name = mode === "chat" ? _t("gua|chat_theme|default_tile") : _t("gua|chat_theme|classic");
            tiles.unshift({
                theme: firstTileTheme(state),
                name,
                selected: preview ? isStock(preview.theme) : isFirstTileSelected(state),
                checked: false,
                current: !!preview && isFirstTileSelected(state),
                onSelect: () => startPreview({ theme: STOCK, shown: shownTheme(state, STOCK), label: name }),
            });
        }
        for (const tile of tiles) {
            tile.checked = tile.selected && !checkedGiven;
            checkedGiven ||= tile.checked;
        }
        return { id: section.id, tiles };
    });

    return (
        <div ref={rootRef} className="mx_GuaThemePanel">
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
                <ChatThemeActions
                    setLabel={setLabel}
                    saving={saving}
                    disabled={!canSave(state, preview.theme)}
                    error={error}
                    onCancel={() => {
                        setPreview(null);
                        setError(null);
                    }}
                    onSet={() => onSave(preview.theme)}
                />
            ) : (
                <div className="mx_GuaThemePanel_buttons">
                    <RoundButton
                        buttonRef={bubbleRef}
                        title={_t("gua|chat_theme|chat_bubble")}
                        value={bubbleName(base, appearance.dark)}
                        disabled={disabled}
                        onClick={() => onOpen("bubble")}
                    >
                        <BubbleSwatch theme={base} appearance={appearance} />
                    </RoundButton>
                    <RoundButton
                        buttonRef={wallpaperRef}
                        title={_t("gua|chat_theme|wallpaper")}
                        value={wallpaperName(base.wallpaper)}
                        disabled={disabled}
                        onClick={() => onOpen("wallpaper")}
                    >
                        <WallpaperThumbnail
                            wallpaper={shownWallpaper(state)}
                            appearance={appearance}
                            width={ROUND_BUTTON_SIZE}
                            height={ROUND_BUTTON_SIZE}
                        />
                    </RoundButton>
                </div>
            )}

            <div className="mx_GuaThemePanel_status" role="status">
                {status}
            </div>

            <div className="mx_GuaThemePanel_note">
                <p>{mode === "chat" ? _t("gua|chat_theme|chat_note") : _t("gua|chat_theme|default_note")}</p>
                {!state.canChange && <p>{_t("gua|chat_theme|no_permission")}</p>}
            </div>

            {sections.map(({ id, tiles }) => {
                const headingId = `${headingIds}-${id}`;
                return (
                    <section key={id} className="mx_GuaThemePanel_section">
                        <h3 id={headingId}>{_t(SECTION_NAMES[id])}</h3>
                        <TileGroup labelledBy={headingId}>
                            {tiles.map((tile, index) => (
                                <ChatThemeTile
                                    key={index}
                                    group={group}
                                    wallpaper={tile.theme.wallpaper}
                                    bubbles={tile.theme}
                                    name={tile.name}
                                    selected={tile.selected}
                                    checked={tile.checked}
                                    current={tile.current}
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
