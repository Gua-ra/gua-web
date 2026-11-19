/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { useCallback } from "react";
import { ClientEvent, type MatrixClient, type MatrixEvent, TypedEventEmitter } from "matrix-js-sdk/src/matrix";

import { useMatrixClientContext } from "../../contexts/MatrixClientContext";
import { useTypedEventEmitter, useTypedEventEmitterState } from "../../hooks/useEventEmitter";
import { type JsonObject } from "./StickerImage";

type LibraryEventType = "global.gua.stickers" | "global.gua.gifs";

const CHANGED = "changed";

/**
 * A global account data event edited optimistically: an edit shows at once and is rolled back if
 * the server refuses it. Edits made while one is in flight build on the pending content.
 */
export class AccountDataDocument extends TypedEventEmitter<typeof CHANGED, { [CHANGED]: () => void }> {
    private static readonly documents = new WeakMap<MatrixClient, Map<LibraryEventType, AccountDataDocument>>();

    private pending?: JsonObject;

    private constructor(
        private readonly client: MatrixClient,
        private readonly eventType: LibraryEventType,
    ) {
        super();
    }

    public static for(client: MatrixClient, eventType: LibraryEventType): AccountDataDocument {
        let documents = this.documents.get(client);
        if (!documents) {
            documents = new Map();
            this.documents.set(client, documents);
        }
        let document = documents.get(eventType);
        if (!document) {
            document = new AccountDataDocument(client, eventType);
            documents.set(eventType, document);
        }
        return document;
    }

    public get content(): JsonObject {
        return this.pending ?? this.client.getAccountData(this.eventType)?.getContent() ?? {};
    }

    public async update(edit: (content: JsonObject) => JsonObject): Promise<void> {
        const previous = this.pending;
        const next = edit(this.content);
        this.setPending(next);
        try {
            await this.client.setAccountData(this.eventType, next);
            // The sync echo has reached the store by now.
            if (this.pending === next) this.setPending(undefined);
        } catch (error) {
            if (this.pending === next) this.setPending(previous);
            throw error;
        }
    }

    private setPending(content: JsonObject | undefined): void {
        this.pending = content;
        this.emit(CHANGED);
    }
}

export function useAccountDataDocument(eventType: LibraryEventType): [JsonObject, AccountDataDocument] {
    const client = useMatrixClientContext();
    const document = AccountDataDocument.for(client, eventType);
    const readContent = useCallback(() => document.content, [document]);
    const content = useTypedEventEmitterState(document, CHANGED, readContent);
    const onAccountData = useCallback(
        (event: MatrixEvent) => {
            if (event.getType() === eventType) document.emit(CHANGED);
        },
        [document, eventType],
    );
    useTypedEventEmitter(client, ClientEvent.AccountData, onAccountData);
    return [content, document];
}
