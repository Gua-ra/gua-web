/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { useState } from "react";

import { _t } from "../../../languageHandler";
import Modal from "../../../Modal";
import ErrorDialog from "../../../components/views/dialogs/ErrorDialog";
import { type ChatTheme } from "../model/types";

export function showChatThemeError(description: string = _t("gua|chat_theme|error_generic")): void {
    Modal.createDialog(ErrorDialog, { title: _t("gua|chat_theme|title"), description });
}

type Choice = ChatTheme | (() => Promise<ChatTheme>);

export function useSaveAndClose(
    save: (theme: ChatTheme) => Promise<void>,
    onFinished: () => void,
): { saving: boolean; saveAndClose: (choice: Choice) => Promise<void> } {
    const [saving, setSaving] = useState(false);
    const saveAndClose = async (choice: Choice): Promise<void> => {
        setSaving(true);
        try {
            await save(typeof choice === "function" ? await choice() : choice);
            onFinished();
        } catch {
            setSaving(false);
            showChatThemeError();
        }
    };
    return { saving, saveAndClose };
}
