/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { type ChangeEvent, type JSX, useId, useRef, useState } from "react";
import { Button } from "@vector-im/compound-web";
import ImageIcon from "@vector-im/compound-design-tokens/assets/web/icons/image";

import { _t } from "../../../languageHandler";
import { useMatrixClientContext } from "../../../contexts/MatrixClientContext";
import { WALLPAPER_GALLERY } from "../model/gallery";
import { SECTION_NAMES } from "../model/names";
import { baseTheme, canSavePickerChoice, shownTheme, themeWithWallpaper } from "../model/screenModel";
import { NO_WALLPAPER, type Wallpaper, wallpapersEqual } from "../model/types";
import { useAppearance } from "../state/useAppearance";
import { SectionHeading, usePhotoCredits } from "./ChatPhotoCredits";
import { ChatThemePreview } from "./ChatThemePreview";
import { ChatThemeActions, ChatThemeSubView } from "./ChatThemeSubView";
import { ChatThemeTile, TileGroup } from "./ChatThemeTile";
import { maxUploadSize, PhotoTooLargeError, type PreparedPhoto, preparePhoto } from "./photo/preparePhoto";
import { useThemeSave } from "./useThemeSave";
import { type ThemeScreen } from "./useThemeScreen";

interface Props {
    screen: ThemeScreen;
    onBack: () => void;
    onSaved: () => void;
    onPhoto: (photo: PreparedPhoto) => void;
}

export function ChatWallpaperPicker({ screen, onBack, onSaved, onPhoto }: Props): JSX.Element {
    const { state, save } = screen;
    const client = useMatrixClientContext();
    const appearance = useAppearance();
    const base = baseTheme(state);
    const [chosen, setChosen] = useState<Wallpaper | null>(null);
    const [preparing, setPreparing] = useState(false);
    const { saving, error, run, setError } = useThemeSave(save);
    const credits = usePhotoCredits();
    const fileRef = useRef<HTMLInputElement>(null);
    const group = useId();
    const headingIds = useId();
    const wallpaper = chosen ?? base.wallpaper;
    const choice = themeWithWallpaper(state, wallpaper);

    const onPhotoChosen = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        setPreparing(true);
        setError(null);
        try {
            onPhoto(await preparePhoto(file, await maxUploadSize(client)));
        } catch (e) {
            setPreparing(false);
            setError(
                e instanceof PhotoTooLargeError
                    ? _t("gua|chat_theme|photo|too_large")
                    : _t("gua|chat_theme|error_generic"),
            );
        }
    };

    const groups: { id: string; label: string; wallpapers: Wallpaper[] }[] = [
        { id: "none", label: _t("gua|chat_theme|no_wallpaper"), wallpapers: [NO_WALLPAPER] },
        ...WALLPAPER_GALLERY.map((section) => ({
            id: section.id,
            label: _t(SECTION_NAMES[section.id]),
            wallpapers: section.wallpapers,
        })),
    ];

    return (
        <>
            <ChatThemeSubView title={_t("gua|chat_theme|wallpaper")} onBack={onBack} hidden={credits.shown}>
                <ChatThemePreview
                    theme={shownTheme(state, choice)}
                    appearance={appearance}
                    onPhotoCredits={credits.open}
                />
                <Button
                    className="mx_Dialog_nonDialogButton mx_GuaThemeSubView_photo"
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
                    className="mx_GuaThemeSubView_file"
                    tabIndex={-1}
                    aria-hidden={true}
                    onChange={onPhotoChosen}
                />
                <ChatThemeActions
                    setLabel={_t("gua|chat_theme|set")}
                    saving={saving}
                    disabled={chosen === null || !canSavePickerChoice(state, choice)}
                    error={error}
                    onCancel={onBack}
                    onSet={() => run(choice, onSaved)}
                />
                {groups.map((section) => {
                    // The No wallpaper tile names itself, so its section has no heading.
                    const headingId = section.id === "none" ? undefined : `${headingIds}-${section.id}`;
                    return (
                        <section key={section.id} className="mx_GuaThemePanel_section">
                            {headingId && (
                                <SectionHeading section={section.id} id={headingId} onPhotoCredits={credits.open}>
                                    {section.label}
                                </SectionHeading>
                            )}
                            <TileGroup labelledBy={headingId} label={section.label}>
                                {section.wallpapers.map((w, index) => (
                                    <ChatThemeTile
                                        key={index}
                                        group={group}
                                        wallpaper={w}
                                        bubbles={themeWithWallpaper(state, w)}
                                        name={w.kind === "none" ? section.label : undefined}
                                        selected={wallpapersEqual(w, wallpaper)}
                                        current={chosen !== null && wallpapersEqual(w, base.wallpaper)}
                                        disabled={saving || !state.canChange}
                                        appearance={appearance}
                                        onSelect={() => setChosen(w)}
                                    />
                                ))}
                            </TileGroup>
                        </section>
                    );
                })}
            </ChatThemeSubView>
            {credits.view}
        </>
    );
}
