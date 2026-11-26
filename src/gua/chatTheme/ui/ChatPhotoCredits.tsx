/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, type MouseEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@vector-im/compound-web";

import { _t } from "../../../languageHandler";
import ExternalLink from "../../../components/views/elements/ExternalLink";
import { PHOTO_LICENCE_URLS, type PhotoCredit, photoCredits } from "../model/artworks";
import { ARTWORK_NAMES, photoCreditText, photoCreditWithLicence, photoLicenceName } from "../model/names";
import { WallpaperThumbnail } from "../render/WallpaperLayer";
import { useAppearance } from "../state/useAppearance";
import { ChatThemeSubView } from "./ChatThemeSubView";

/** 9:16, as in the apps' credits. */
const THUMBNAIL_WIDTH = 45;
const THUMBNAIL_HEIGHT = 80;

type OpenCredits = (event: MouseEvent<HTMLElement>) => void;

/** Never disabled, so members who cannot change the theme still reach the credits. */
export function PhotoCreditLine({ credit, onClick }: { credit: PhotoCredit; onClick: OpenCredits }): JSX.Element {
    return (
        <Button
            className="mx_Dialog_nonDialogButton mx_GuaThemePanel_credit"
            kind="tertiary"
            size="sm"
            onClick={onClick}
        >
            {photoCreditWithLicence(credit)}
        </Button>
    );
}

/** The Photos heading carries a credits button, never disabled for the same reason as the credit line. */
export function SectionHeading({
    section,
    id,
    onPhotoCredits,
    children,
}: {
    section: string;
    id: string;
    onPhotoCredits: OpenCredits;
    children: ReactNode;
}): JSX.Element {
    const heading = <h3 id={id}>{children}</h3>;
    if (section !== "photos") return heading;
    return (
        <div className="mx_GuaThemePanel_sectionHeading">
            {heading}
            <Button className="mx_Dialog_nonDialogButton" kind="tertiary" size="sm" onClick={onPhotoCredits}>
                {_t("gua|chat_theme|photo_credits")}
            </Button>
        </div>
    );
}

export function ChatPhotoCredits({ onBack }: { onBack: () => void }): JSX.Element {
    const appearance = useAppearance();
    return (
        <ChatThemeSubView title={_t("gua|chat_theme|photo_credits")} onBack={onBack}>
            <ul className="mx_GuaPhotoCredits">
                {photoCredits().map(({ id, credit }) => (
                    <li key={id} className="mx_GuaPhotoCredits_photo">
                        <span className="mx_GuaPhotoCredits_thumbnail">
                            <WallpaperThumbnail
                                wallpaper={{ kind: "art", art: id }}
                                appearance={appearance}
                                width={THUMBNAIL_WIDTH}
                                height={THUMBNAIL_HEIGHT}
                            />
                        </span>
                        <span className="mx_GuaPhotoCredits_text">
                            <span className="mx_GuaPhotoCredits_name">{_t(ARTWORK_NAMES[id])}</span>
                            <span>{photoCreditText(credit)}</span>
                            <span className="mx_GuaPhotoCredits_links">
                                <ExternalLink href={PHOTO_LICENCE_URLS[credit.licence]}>
                                    {photoLicenceName(credit.licence)}
                                </ExternalLink>
                                {credit.sourceUrl && (
                                    <ExternalLink href={credit.sourceUrl}>
                                        {_t("gua|chat_theme|photo_source")}
                                    </ExternalLink>
                                )}
                            </span>
                            <span className="mx_GuaPhotoCredits_changes">{_t("gua|chat_theme|photo_changes")}</span>
                        </span>
                    </li>
                ))}
            </ul>
        </ChatThemeSubView>
    );
}

export interface PhotoCreditsView {
    open: OpenCredits;
    /** The view that opened the credits hides while they show, staying mounted so its preview or choice survives. */
    shown: boolean;
    view: JSX.Element | null;
}

/** Back returns focus to the button that opened the credits. */
export function usePhotoCredits(): PhotoCreditsView {
    const [shown, setShown] = useState(false);
    const opener = useRef<HTMLElement | null>(null);
    useEffect(() => {
        if (!shown) opener.current?.focus();
    }, [shown]);
    return {
        open: (event) => {
            opener.current = event.currentTarget;
            setShown(true);
        },
        shown,
        view: shown ? <ChatPhotoCredits onBack={() => setShown(false)} /> : null,
    };
}
