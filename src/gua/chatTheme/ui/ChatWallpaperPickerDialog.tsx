/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { type ChangeEvent, type JSX, useRef, useState } from "react";
import { type Room } from "matrix-js-sdk/src/matrix";
import { Button } from "@vector-im/compound-web";
import ImageIcon from "@vector-im/compound-design-tokens/assets/web/icons/image";

import { _t } from "../../../languageHandler";
import Modal from "../../../Modal";
import { useMatrixClientContext } from "../../../contexts/MatrixClientContext";
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
import { ChatPhotoEditorDialog } from "./ChatPhotoEditorDialog";
import { maxUploadSize, PhotoTooLargeError, preparePhoto } from "./photo/preparePhoto";
import { showChatThemeError, useSaveAndClose } from "./usePickerSave";
import { useThemeScreen } from "./useThemeScreen";

interface Props {
    mode: ThemeScreenMode;
    room?: Room;
    onFinished: () => void;
}

function ChatWallpaperPickerDialogContent({ mode, room, onFinished }: Props): JSX.Element {
    const client = useMatrixClientContext();
    const { state, save } = useThemeScreen(mode, room);
    const appearance = useAppearance();
    const base = baseTheme(state);
    const [chosen, setChosen] = useState<Wallpaper | null>(null);
    const [preparing, setPreparing] = useState(false);
    const { saving, saveAndClose } = useSaveAndClose(save, onFinished);
    const fileRef = useRef<HTMLInputElement>(null);
    const wallpaper = chosen ?? base.wallpaper;
    const choice = themeWithWallpaper(state, wallpaper);

    const onPhotoChosen = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        setPreparing(true);
        try {
            const photo = await preparePhoto(file, await maxUploadSize(client));
            onFinished();
            Modal.createDialog(ChatPhotoEditorDialog, { mode, room, photo });
        } catch (error) {
            setPreparing(false);
            showChatThemeError(
                error instanceof PhotoTooLargeError
                    ? _t("gua|chat_theme|photo|too_large")
                    : _t("gua|chat_theme|error_generic"),
            );
        }
    };

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
            <Button
                className="mx_Dialog_nonDialogButton"
                kind="secondary"
                size="sm"
                Icon={ImageIcon}
                disabled={saving || preparing || !state.canChange}
                onClick={() => fileRef.current?.click()}
            >
                {_t("gua|chat_theme|choose_photo")}
            </Button>
            <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="mx_GuaThemePickerDialog_file"
                tabIndex={-1}
                aria-hidden={true}
                onChange={onPhotoChosen}
            />
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
