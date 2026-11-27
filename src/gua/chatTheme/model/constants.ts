/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

/** Room state with an empty state key. Content `{}` removes the chat's theme. */
export const CHAT_BACKGROUND_EVENT_TYPE = "global.gua.room.background";

/** Account data with the room event's content. Clearing writes `{}` because Gua's servers have MSC3391 deletion off. */
export const CHAT_THEME_ACCOUNT_DATA_TYPE = "global.gua.chat_theme";

export const PHOTO_MAX_DIMENSION = 8192;
/** The largest photo size accepted, and the download cap when showing one. */
export const PHOTO_MAX_SIZE = 20_000_000;
export const PHOTO_MAX_BLURHASH_LENGTH = 100;
/** Room versions 6 and later reject floats, so dim is in whole percent and align in thousandths. */
export const PHOTO_MAX_DIM = 80;
export const PHOTO_DEFAULT_DIM = 35;
export const PHOTO_MAX_ALIGN = 1000;
export const PHOTO_DEFAULT_ALIGN = 500;

export const ARTWORK_PIXEL_WIDTH = 1290;
export const ARTWORK_PIXEL_HEIGHT = 2796;
