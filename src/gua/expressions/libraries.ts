/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { useMemo } from "react";

import { type AccountDataDocument, useAccountDataDocument } from "./accountDataDocument";
import { decodeStickerLibrary, STICKER_LIBRARY_EVENT_TYPE, type StickerLibrary } from "./stickerLibrary";
import { decodeGifFavourites, GIF_LIBRARY_EVENT_TYPE, type GifFavourite, KLIPY } from "./gifLibrary";

export function useStickerLibrary(): [StickerLibrary, AccountDataDocument] {
    const [content, document] = useAccountDataDocument(STICKER_LIBRARY_EVENT_TYPE);
    const library = useMemo(() => decodeStickerLibrary(content), [content]);
    return [library, document];
}

/** KLIPY favourites only; favourites from another provider stay stored but are not shown. */
export function useKlipyGifFavourites(): [string[], AccountDataDocument] {
    const [content, document] = useAccountDataDocument(GIF_LIBRARY_EVENT_TYPE);
    const ids = useMemo(
        () =>
            decodeGifFavourites(content)
                .filter((favourite: GifFavourite) => favourite.provider === KLIPY)
                .map((favourite) => favourite.id),
        [content],
    );
    return [ids, document];
}
