/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { useCallback } from "react";
import { ClientEvent, type MatrixClient, type MatrixEvent, TypedEventEmitter } from "matrix-js-sdk/src/matrix";

import { useTypedEventEmitter, useTypedEventEmitterState } from "../../../hooks/useEventEmitter";
import { decodeChatTheme, encodeChatTheme } from "../model/codec";
import { CHAT_THEME_ACCOUNT_DATA_TYPE } from "../model/constants";
import { type ChatTheme } from "../model/types";

const CHANGED = "changed";

/**
 * The personal default theme in global account data. A write shows at once and is dropped if the server refuses it;
 * `setAccountData` resolves only once the sync echo has arrived, so a finished write can then be dropped too. While
 * writes overlap the newest one still in flight shows, and with none left the account data does, so a refused write
 * never brings back one that already finished, and later changes from other devices show.
 */
export class DefaultChatThemeStore extends TypedEventEmitter<typeof CHANGED, { [CHANGED]: () => void }> {
    private static readonly stores = new WeakMap<MatrixClient, DefaultChatThemeStore>();

    private readonly inFlight: Record<string, unknown>[] = [];
    private decoded?: { content: unknown; theme: ChatTheme };

    private constructor(private readonly client: MatrixClient) {
        super();
    }

    public static for(client: MatrixClient): DefaultChatThemeStore {
        let store = this.stores.get(client);
        if (!store) {
            store = new DefaultChatThemeStore(client);
            this.stores.set(client, store);
        }
        return store;
    }

    public get theme(): ChatTheme {
        const content = this.inFlight.at(-1) ?? this.client.getAccountData(CHAT_THEME_ACCOUNT_DATA_TYPE)?.getContent();
        if (this.decoded && this.decoded.content === content) return this.decoded.theme;
        const theme = decodeChatTheme(content);
        this.decoded = { content, theme };
        return theme;
    }

    /** Clearing writes `{}`. */
    public async set(theme: ChatTheme): Promise<void> {
        const next = encodeChatTheme(theme);
        this.inFlight.push(next);
        this.emit(CHANGED);
        try {
            await this.client.setAccountData(CHAT_THEME_ACCOUNT_DATA_TYPE, next);
        } finally {
            this.inFlight.splice(this.inFlight.indexOf(next), 1);
            this.emit(CHANGED);
        }
    }

    public onAccountData = (event: MatrixEvent): void => {
        if (event.getType() === CHAT_THEME_ACCOUNT_DATA_TYPE) this.emit(CHANGED);
    };
}

export function useDefaultChatTheme(client: MatrixClient): ChatTheme {
    const store = DefaultChatThemeStore.for(client);
    const read = useCallback(() => store.theme, [store]);
    useTypedEventEmitter(client, ClientEvent.AccountData, store.onAccountData);
    return useTypedEventEmitterState(store, CHANGED, read);
}
