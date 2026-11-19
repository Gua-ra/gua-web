/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import {
    EventType,
    type IContent,
    type IEventRelation,
    type MatrixClient,
    type MatrixEvent,
    MsgType,
    THREAD_RELATION_TYPE,
} from "matrix-js-sdk/src/matrix";

import { uploadFile } from "../../ContentMessages";
import { attachRelation } from "../../components/views/rooms/SendMessageComposer";
import { addReplyToMessageContent } from "../../utils/Reply";
import { doMaybeLocalRoomAction } from "../../utils/local-room";
import { BLURHASH_FIELD, createThumbnail } from "../../utils/image-media";
import { type JsonObject, type StickerImage } from "./StickerImage";
import { stickerContent } from "./stickerContent";
import { type GifItem, gifForSending } from "./klipy";

/** Where a sticker or GIF goes: the composer's thread relation and the event it replies to, if any. */
export interface ExpressionTarget {
    roomId: string;
    relation?: IEventRelation;
    replyToEvent?: MatrixEvent;
}

export class GifSendError extends Error {}

export async function sendSticker(client: MatrixClient, target: ExpressionTarget, image: StickerImage): Promise<void> {
    const content = stickerContent(image, relatesTo(target));
    await send(client, target, EventType.Sticker, content);
}

export async function sendGif(
    client: MatrixClient,
    target: ExpressionTarget,
    item: GifItem,
    caption: string,
    fetchFn: typeof fetch = (...args) => fetch(...args),
): Promise<void> {
    const selection = gifForSending(item);
    if (!selection) throw new GifSendError("The GIF has no rendition to send");
    const [file, still] = await Promise.all([
        download(fetchFn, selection.file.url),
        selection.still ? download(fetchFn, selection.still.url).catch(() => undefined) : undefined,
    ]);

    const info: JsonObject = {
        "h": selection.file.height,
        "is_animated": true,
        "org.matrix.msc4230.is_animated": true,
        "mimetype": "image/webp",
        "size": file.size,
        "w": selection.file.width,
    };
    const content: JsonObject = {
        msgtype: MsgType.Image,
        body: caption.trim() || selection.body,
        // With a caption the body is the caption and the file keeps the GIF's title.
        ...(caption.trim() && { filename: `${selection.body}.webp` }),
        info,
    };

    if (still && selection.still) {
        const thumbnail = await uploadFile(client, target.roomId, still);
        content.info = {
            ...info,
            thumbnail_info: {
                h: selection.still.height,
                mimetype: "image/jpeg",
                size: still.size,
                w: selection.still.width,
            },
            ...(thumbnail.file ? { thumbnail_file: thumbnail.file } : { thumbnail_url: thumbnail.url }),
            ...(await blurhash(still, selection.still.width, selection.still.height)),
        };
    }

    const uploaded = await uploadFile(
        client,
        target.roomId,
        new File([file], `${selection.body}.webp`, { type: "image/webp" }),
    );
    if (uploaded.file) content.file = uploaded.file;
    else content.url = uploaded.url;

    const relates = relatesTo(target);
    await send(client, target, EventType.RoomMessage, relates ? { ...content, "m.relates_to": relates } : content);
}

/** The `m.relates_to` the composer would give a message sent from it now. */
function relatesTo(target: ExpressionTarget): JsonObject | undefined {
    const draft: IContent = {};
    attachRelation(draft, target.relation);
    if (target.replyToEvent) addReplyToMessageContent(draft, target.replyToEvent);
    return draft["m.relates_to"] as JsonObject | undefined;
}

async function send(
    client: MatrixClient,
    target: ExpressionTarget,
    type: EventType,
    content: JsonObject,
): Promise<void> {
    const threadId =
        target.relation?.rel_type === THREAD_RELATION_TYPE.name ? (target.relation.event_id ?? null) : null;
    await doMaybeLocalRoomAction(
        target.roomId,
        (roomId) => client.sendEvent(roomId, threadId, type as EventType.RoomMessage, content as never),
        client,
    );
}

async function download(fetchFn: typeof fetch, url: string): Promise<Blob> {
    const response = await fetchFn(url);
    if (!response.ok) throw new GifSendError(`The GIF host answered ${response.status}`);
    return response.blob();
}

/** The GIF still goes without a blurhash when the browser cannot decode it. */
async function blurhash(still: Blob, width: number, height: number): Promise<JsonObject> {
    let url: string | undefined;
    try {
        url = URL.createObjectURL(still);
        const image = new Image();
        image.src = url;
        await image.decode();
        const { info } = await createThumbnail(image, width, height, "image/jpeg");
        return info[BLURHASH_FIELD] ? { [BLURHASH_FIELD]: info[BLURHASH_FIELD] } : {};
    } catch {
        return {};
    } finally {
        if (url) URL.revokeObjectURL(url);
    }
}
