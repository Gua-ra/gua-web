/*
Copyright 2025 Gua

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type CSSProperties, type JSX, useRef } from "react";

interface Props {
    value: string;
    length?: number;
    hasError?: boolean;
    disabled?: boolean;
    autoFocus?: boolean;
    ariaLabel?: string;
    onChange: (pin: string) => void;
}

const containerStyle: CSSProperties = {
    position: "relative",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: "14px",
    padding: "12px 0",
};

const inputStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    opacity: 0,
    border: "none",
    background: "transparent",
};

/**
 * A masked 6-bubble PIN entry: a visually hidden numeric input owns the keyboard while a row
 * of circles shows how many digits have been entered. Web equivalent of the iOS PinBubbleField.
 */
export default function GuaPinBubbleField({
    value,
    length = 6,
    hasError = false,
    disabled,
    autoFocus,
    ariaLabel,
    onChange,
}: Props): JSX.Element {
    const inputRef = useRef<HTMLInputElement>(null);

    const onInput = (ev: React.ChangeEvent<HTMLInputElement>): void => {
        onChange(ev.target.value.replace(/\D/g, "").slice(0, length));
    };

    return (
        <div
            className="mx_GuaPinBubbleField"
            style={{ ...containerStyle, cursor: disabled ? "default" : "text" }}
            onClick={() => inputRef.current?.focus()}
        >
            <input
                ref={inputRef}
                type="password"
                inputMode="numeric"
                autoComplete="one-time-code"
                aria-label={ariaLabel}
                value={value}
                disabled={disabled}
                autoFocus={autoFocus}
                onChange={onInput}
                style={inputStyle}
            />
            {Array.from({ length }).map((_unused, index) => {
                const filled = index < value.length;
                const fill = hasError ? "var(--cpd-color-icon-critical-primary)" : "var(--cpd-color-icon-primary)";
                const stroke = hasError ? "var(--cpd-color-icon-critical-primary)" : "var(--cpd-color-icon-secondary)";
                return (
                    <span
                        // eslint-disable-next-line react/no-array-index-key
                        key={index}
                        aria-hidden="true"
                        style={{
                            width: "18px",
                            height: "18px",
                            borderRadius: "50%",
                            border: `1.5px solid ${stroke}`,
                            background: filled ? fill : "transparent",
                            transition: "background 0.12s ease-out",
                            pointerEvents: "none",
                        }}
                    />
                );
            })}
        </div>
    );
}
