/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { useCallback, useMemo } from "react";
import { type Room } from "matrix-js-sdk/src/matrix";

import { useMatrixClientContext } from "../../../contexts/MatrixClientContext";
import { useRoomState } from "../../../hooks/useRoomState";
import { isMediaShown } from "../model/precedence";
import { type ThemeScreenMode, type ThemeScreenState } from "../model/screenModel";
import { type ChatTheme } from "../model/types";
import { DefaultChatThemeStore, useDefaultChatTheme } from "../state/defaultChatTheme";
import { sendChatTheme, useCanChangeChatTheme, useRoomChatTheme } from "../state/roomChatTheme";
import { isPrivateRoom, useMediaPreviews } from "../state/useEffectiveChatTheme";

export interface ThemeScreen {
    state: ThemeScreenState;
    /** Saves the chat's theme or the default; rejects when the server refuses it. */
    save: (theme: ChatTheme) => Promise<void>;
}

export function useThemeScreen(mode: ThemeScreenMode, room?: Room): ThemeScreen {
    const client = useMatrixClientContext();
    const chatRoom = mode === "chat" ? room : undefined;
    const chatTheme = useRoomChatTheme(chatRoom);
    const defaultTheme = useDefaultChatTheme(client);
    const canChangeChat = useCanChangeChatTheme(chatRoom, client);
    const roomIsPrivate = useRoomState(chatRoom, isPrivateRoom) ?? false;
    const mediaPreviews = useMediaPreviews();

    const state = useMemo<ThemeScreenState>(
        () =>
            mode === "chat"
                ? {
                      mode,
                      current: chatTheme,
                      defaultTheme,
                      canChange: canChangeChat,
                      isPhotoHidden: !roomIsPrivate && !isMediaShown(mediaPreviews, roomIsPrivate),
                  }
                : { mode, current: defaultTheme, defaultTheme, canChange: true, isPhotoHidden: false },
        [mode, chatTheme, defaultTheme, canChangeChat, mediaPreviews, roomIsPrivate],
    );

    const save = useCallback(
        (theme: ChatTheme): Promise<void> =>
            chatRoom ? sendChatTheme(client, chatRoom, theme) : DefaultChatThemeStore.for(client).set(theme),
        [client, chatRoom],
    );

    return { state, save };
}
