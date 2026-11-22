/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, useState } from "react";
import { type Room } from "matrix-js-sdk/src/matrix";

import { _t } from "../../../languageHandler";
import BaseDialog from "../../../components/views/dialogs/BaseDialog";
import DialogButtons from "../../../components/views/elements/DialogButtons";
import { WALLPAPER_GALLERY } from "../model/gallery";
import { SECTION_NAMES } from "../model/names";
import {
    baseTheme,
    canSavePickerChoice,
    shownTheme,
    themeWithWallpaper,
    type ThemeScreenMode,
} from "../model/screenModel";
import { NO_WALLPAPER, type Wallpaper, wallpapersEqual } from "../model/types";
import { useAppearance } from "../state/useAppearance";
import { ChatThemePreview } from "./ChatThemePreview";
import { ChatThemeTile, TileGroup } from "./ChatThemeTile";
import { useSaveAndClose } from "./usePickerSave";
import { useThemeScreen } from "./useThemeScreen";

interface Props {
    mode: ThemeScreenMode;
    room?: Room;
    onFinished: () => void;
}

function ChatWallpaperPickerDialogContent({ mode, room, onFinished }: Props): JSX.Element {
    const { state, save } = useThemeScreen(mode, room);
    const appearance = useAppearance();
    const base = baseTheme(state);
    const [chosen, setChosen] = useState<Wallpaper | null>(null);
    const { saving, saveAndClose } = useSaveAndClose(save, onFinished);
    const wallpaper = chosen ?? base.wallpaper;
    const choice = themeWithWallpaper(state, wallpaper);

    const groups: { label: string; wallpapers: Wallpaper[] }[] = [
        { label: _t("gua|chat_theme|no_wallpaper"), wallpapers: [NO_WALLPAPER] },
        ...WALLPAPER_GALLERY.map((section) => ({
            label: _t(SECTION_NAMES[section.id]),
            wallpapers: section.wallpapers,
        })),
    ];

    return (
        <>
            <ChatThemePreview theme={shownTheme(state, choice)} appearance={appearance} />
            <div className="mx_GuaThemePickerDialog_gallery">
                {groups.map((group, groupIndex) => {
                    const selectedIndex = group.wallpapers.findIndex((w) => wallpapersEqual(w, wallpaper));
                    return (
                        <section key={group.label} className="mx_GuaThemePanel_section">
                            {groupIndex > 0 && <h3>{group.label}</h3>}
                            <TileGroup label={group.label}>
                                {group.wallpapers.map((w, index) => (
                                    <ChatThemeTile
                                        key={index}
                                        wallpaper={w}
                                        bubbles={themeWithWallpaper(state, w)}
                                        name={w.kind === "none" ? group.label : undefined}
                                        selected={index === selectedIndex}
                                        focusable={index === Math.max(0, selectedIndex)}
                                        disabled={saving}
                                        appearance={appearance}
                                        onSelect={() => setChosen(w)}
                                    />
                                ))}
                            </TileGroup>
                        </section>
                    );
                })}
            </div>
            <DialogButtons
                primaryButton={saving ? _t("gua|chat_theme|progress") : _t("gua|chat_theme|set")}
                primaryDisabled={saving || chosen === null || !canSavePickerChoice(state, choice)}
                onPrimaryButtonClick={() => saveAndClose(choice)}
                onCancel={onFinished}
            />
        </>
    );
}

/** The content sits inside BaseDialog, which provides the client context to modals. */
export function ChatWallpaperPickerDialog(props: Props): JSX.Element {
    return (
        <BaseDialog
            className="mx_GuaThemePickerDialog"
            title={_t("gua|chat_theme|wallpaper")}
            onFinished={props.onFinished}
            fixedWidth={false}
        >
            <ChatWallpaperPickerDialogContent {...props} />
        </BaseDialog>
    );
}
