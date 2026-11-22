/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, type ReactNode, useEffect, useRef } from "react";
import { Button, InlineSpinner } from "@vector-im/compound-web";
import ChevronLeftIcon from "@vector-im/compound-design-tokens/assets/web/icons/chevron-left";

import { _t } from "../../../languageHandler";

/**
 * A step of the theme screen shown in place of the panel, never as a dialog of its own: Modal renders only its top
 * dialog, so a dialog would reset the settings dialog underneath. Back takes focus when the step opens, since the
 * button that opened it is gone.
 */
export function ChatThemeSubView({
    title,
    onBack,
    children,
}: {
    title: string;
    onBack: () => void;
    children: ReactNode;
}): JSX.Element {
    const headerRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        headerRef.current?.querySelector("button")?.focus();
    }, []);
    return (
        <div className="mx_GuaThemePanel mx_GuaThemeSubView">
            <div ref={headerRef} className="mx_GuaThemeSubView_header">
                <Button
                    className="mx_Dialog_nonDialogButton"
                    kind="tertiary"
                    size="sm"
                    Icon={ChevronLeftIcon}
                    onClick={onBack}
                >
                    {_t("action|back")}
                </Button>
                <h3>{title}</h3>
            </div>
            {children}
        </div>
    );
}

/**
 * Cancel and the save button, which stays in place while saving so focus stays on it, with a save error under them.
 */
export function ChatThemeActions({
    setLabel,
    saving,
    disabled,
    error,
    onCancel,
    onSet,
}: {
    setLabel: string;
    saving: boolean;
    disabled: boolean;
    error: string | null;
    onCancel: () => void;
    onSet: () => void;
}): JSX.Element {
    return (
        <>
            <div className="mx_GuaThemePanel_actions">
                <Button className="mx_Dialog_nonDialogButton" kind="secondary" size="sm" onClick={onCancel}>
                    {_t("action|cancel")}
                </Button>
                <Button
                    className="mx_Dialog_nonDialogButton"
                    kind="primary"
                    size="sm"
                    disabled={disabled || saving}
                    aria-busy={saving}
                    onClick={onSet}
                >
                    {saving && <InlineSpinner size={16} aria-hidden={true} />}
                    {setLabel}
                </Button>
            </div>
            {error && (
                <p className="mx_GuaThemePanel_error" role="alert">
                    {error}
                </p>
            )}
        </>
    );
}
