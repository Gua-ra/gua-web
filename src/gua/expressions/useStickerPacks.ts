/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { useCallback } from "react";
import { type Room, type RoomState } from "matrix-js-sdk/src/matrix";

import { useRoomState } from "../../hooks/useRoomState";
import { type JsonObject } from "./StickerImage";
import {
    decodeStickerPack,
    IMAGE_PACK_EVENT_TYPE,
    type StickerPack,
    UNSTABLE_IMAGE_PACK_EVENT_TYPE,
} from "./stickerPacks";

const PACK_EVENT_TYPES = [IMAGE_PACK_EVENT_TYPE, UNSTABLE_IMAGE_PACK_EVENT_TYPE];

/** The room's packs that hold stickers, stable format first, then by state key. */
export function roomStickerPacks(room: Room, state: RoomState = room.currentState): StickerPack[] {
    const roomAvatarUrl = room.getMxcAvatarUrl() ?? undefined;
    return PACK_EVENT_TYPES.flatMap((eventType) =>
        state
            .getStateEvents(eventType)
            .map((event) =>
                decodeStickerPack(
                    eventType,
                    event.getStateKey() ?? "",
                    event.getContent() as JsonObject,
                    room.name,
                    roomAvatarUrl,
                ),
            )
            .filter((pack) => pack.stickers.length > 0)
            .sort((a, b) => (a.stateKey < b.stateKey ? -1 : a.stateKey > b.stateKey ? 1 : 0)),
    );
}

export function useStickerPacks(room: Room): StickerPack[] {
    const mapper = useCallback((state: RoomState) => roomStickerPacks(room, state), [room]);
    return useRoomState(room, mapper);
}
