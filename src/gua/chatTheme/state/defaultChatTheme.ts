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
 * The personal default theme in global account data. A write shows at once and is rolled back if the server refuses
 * it; `setAccountData` resolves only once the sync echo has arrived, so the pending content can then be dropped.
 */
export class DefaultChatThemeStore extends TypedEventEmitter<typeof CHANGED, { [CHANGED]: () => void }> {
    private static readonly stores = new WeakMap<MatrixClient, DefaultChatThemeStore>();

    private pending?: Record<string, unknown>;
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
        const content = this.pending ?? this.client.getAccountData(CHAT_THEME_ACCOUNT_DATA_TYPE)?.getContent();
        if (this.decoded && this.decoded.content === content) return this.decoded.theme;
        const theme = decodeChatTheme(content);
        this.decoded = { content, theme };
        return theme;
    }

    /** Clearing writes `{}`. */
    public async set(theme: ChatTheme): Promise<void> {
        const previous = this.pending;
        const next = encodeChatTheme(theme);
        this.setPending(next);
        try {
            await this.client.setAccountData(CHAT_THEME_ACCOUNT_DATA_TYPE, next);
            if (this.pending === next) this.setPending(undefined);
        } catch (error) {
            if (this.pending === next) this.setPending(previous);
            throw error;
        }
    }

    public onAccountData = (event: MatrixEvent): void => {
        if (event.getType() === CHAT_THEME_ACCOUNT_DATA_TYPE) this.emit(CHANGED);
    };

    private setPending(content: Record<string, unknown> | undefined): void {
        this.pending = content;
        this.emit(CHANGED);
    }
}

export function useDefaultChatTheme(client: MatrixClient): ChatTheme {
    const store = DefaultChatThemeStore.for(client);
    const read = useCallback(() => store.theme, [store]);
    useTypedEventEmitter(client, ClientEvent.AccountData, store.onAccountData);
    return useTypedEventEmitterState(store, CHANGED, read);
}
