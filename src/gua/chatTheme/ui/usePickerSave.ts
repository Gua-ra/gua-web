/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { useCallback, useState } from "react";

import { _t } from "../../../languageHandler";
import { type ChatTheme } from "../model/types";

type Choice = ChatTheme | (() => Promise<ChatTheme>);

export interface ThemeSave {
    saving: boolean;
    /** Why the last save failed, shown under the buttons. */
    error: string | null;
    /** Saves the choice and then calls `onSaved`; a failure only sets `error`. */
    run: (choice: Choice, onSaved: () => void) => Promise<void>;
    setError: (error: string | null) => void;
}

export function useThemeSave(save: (theme: ChatTheme) => Promise<void>): ThemeSave {
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const run = useCallback(
        async (choice: Choice, onSaved: () => void): Promise<void> => {
            setSaving(true);
            setError(null);
            try {
                await save(typeof choice === "function" ? await choice() : choice);
            } catch {
                setSaving(false);
                setError(_t("gua|chat_theme|error_generic"));
                return;
            }
            setSaving(false);
            onSaved();
        },
        [save],
    );
    return { saving, error, run, setError };
}
