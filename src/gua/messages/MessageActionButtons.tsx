/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX } from "react";
import { Button } from "@vector-im/compound-web";
import PopOutIcon from "@vector-im/compound-design-tokens/assets/web/icons/pop-out";

import { type GuaAction } from "./messageActions";

export function MessageActionButtons({ actions }: { actions: readonly GuaAction[] }): JSX.Element {
    return (
        <div className="mx_GuaMessageActions">
            {actions.map(({ label, url }, index) => (
                <Button
                    key={url}
                    as="a"
                    kind={index === 0 ? "primary" : "secondary"}
                    size="sm"
                    Icon={PopOutIcon}
                    href={url}
                    target="_blank"
                    rel="noreferrer noopener"
                >
                    {label}
                </Button>
            ))}
        </div>
    );
}
