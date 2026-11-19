/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, useMemo, useState } from "react";
import { type Room } from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";

import { _t } from "../../languageHandler";
import BaseDialog from "../../components/views/dialogs/BaseDialog";
import DialogButtons from "../../components/views/elements/DialogButtons";
import MatrixClientContext, { useMatrixClientContext } from "../../contexts/MatrixClientContext";
import { MatrixClientPeg } from "../../MatrixClientPeg";
import { type StickerImage } from "./StickerImage";
import { DEFAULT_STICKER_BODY } from "./stickerContent";
import { addSticker, favouriteSticker, StickerLimitReachedError, unfavouriteSticker } from "./stickerLibrary";
import { useStickerLibrary } from "./libraries";
import { roomStickerPacks } from "./useStickerPacks";
import { stickerSrc, useShouldAnimate } from "./media";

interface Props {
    image: StickerImage;
    room?: Room;
    onFinished(): void;
}

/** Opens from a timeline sticker in place of the media viewer. */
function StickerDetails({ image, room, onFinished }: Props): JSX.Element {
    const client = useMatrixClientContext();
    const animate = useShouldAnimate();
    const [library, libraryDocument] = useStickerLibrary();
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string>();

    const packName = useMemo(
        () =>
            room &&
            roomStickerPacks(room).find((pack) => pack.stickers.some((sticker) => sticker.image.url === image.url))
                ?.displayName,
        [room, image.url],
    );
    const isMine = library.stickers.some((sticker) => sticker.image.url === image.url);
    const isFavourite = library.favourites.some((favourite) => favourite.url === image.url);
    const body = image.body?.trim() || DEFAULT_STICKER_BODY;

    const edit = (change: Parameters<typeof libraryDocument.update>[0], onDone?: () => void): void => {
        setError(undefined);
        libraryDocument.update(change).then(onDone, (caught) => {
            logger.error("Could not update My stickers", caught);
            setError(
                caught instanceof StickerLimitReachedError
                    ? _t("gua|expressions|sticker_limit")
                    : _t("gua|expressions|library_update_failed"),
            );
        });
    };

    const favouriteLabel = isFavourite ? _t("gua|expressions|remove_favourite") : _t("gua|expressions|add_favourite");
    const toggleFavourite = (): void =>
        edit((content) => (isFavourite ? unfavouriteSticker(content, image.url) : favouriteSticker(content, image)));
    const save = (): void =>
        edit(
            (content) => addSticker(content, image, Date.now()),
            () => setSaved(true),
        );

    return (
        <BaseDialog className="mx_GuaStickerDetailsDialog" title={body} onFinished={onFinished} fixedWidth={false}>
            <img
                className="mx_GuaStickerDetailsDialog_image"
                src={stickerSrc(client, image, animate)}
                alt={_t("gua|expressions|sticker_label", { body })}
            />
            {packName && (
                <p className="mx_GuaStickerDetailsDialog_pack">{_t("gua|expressions|from_pack", { name: packName })}</p>
            )}
            {saved && <p className="mx_GuaStickerDetailsDialog_saved">{_t("gua|expressions|saved_sticker")}</p>}
            {error && <p className="mx_GuaStickerDetailsDialog_error">{error}</p>}
            <DialogButtons
                hasCancel={false}
                primaryButton={isMine ? favouriteLabel : _t("gua|expressions|save_sticker")}
                onPrimaryButtonClick={isMine ? toggleFavourite : save}
            >
                {!isMine && (
                    <button type="button" onClick={toggleFavourite}>
                        {favouriteLabel}
                    </button>
                )}
            </DialogButtons>
        </BaseDialog>
    );
}

/** Modal renders dialogs outside the logged-in tree, so the client is provided here. */
export default function StickerDetailsDialog(props: Props): JSX.Element {
    return (
        <MatrixClientContext.Provider value={MatrixClientPeg.safeGet()}>
            <StickerDetails {...props} />
        </MatrixClientContext.Provider>
    );
}
