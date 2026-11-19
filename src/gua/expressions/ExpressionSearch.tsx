/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX } from "react";
import SearchIcon from "@vector-im/compound-design-tokens/assets/web/icons/search";
import CloseIcon from "@vector-im/compound-design-tokens/assets/web/icons/close";

import { _t } from "../../languageHandler";

interface Props {
    placeholder: string;
    value: string;
    onChange(value: string): void;
}

export function ExpressionSearch({ placeholder, value, onChange }: Props): JSX.Element {
    return (
        <div className="mx_GuaExpressionSearch">
            <SearchIcon width={20} height={20} aria-hidden />
            <input
                type="search"
                // The panel opens to search, as the emoji picker does.
                autoFocus
                placeholder={placeholder}
                aria-label={placeholder}
                value={value}
                onChange={(event) => onChange(event.target.value)}
            />
            {value && (
                <button
                    type="button"
                    className="mx_GuaExpressionSearch_clear"
                    aria-label={_t("action|clear")}
                    onClick={() => onChange("")}
                >
                    <CloseIcon width={20} height={20} aria-hidden />
                </button>
            )}
        </div>
    );
}
