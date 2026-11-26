/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { type MatrixClient, type MatrixEvent } from "matrix-js-sdk/src/matrix";

import Modal from "../../Modal";
import { stickerImageFromJson } from "./StickerImage";
import StickerDetailsDialog from "./StickerDetailsDialog";

/** False when the event has no plain mxc sticker to save, such as an encrypted file. */
export function openStickerDetails(client: MatrixClient, event: MatrixEvent): boolean {
    const image = stickerImageFromJson(event.getContent());
    if (!image) return false;
    const room = client.getRoom(event.getRoomId()) ?? undefined;
    Modal.createDialog(StickerDetailsDialog, { image, room });
    return true;
}
