/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, useState } from "react";
import { IconButton, Tooltip } from "@vector-im/compound-web";
import LinkIcon from "@vector-im/compound-design-tokens/assets/web/icons/link";

import { _t } from "../../languageHandler";
import { copyPlaintext } from "../../utils/strings";

export function CopyGuestLinkButton({ link }: { link: string }): JSX.Element {
    const [feedback, setFeedback] = useState<string>();

    const copyLink = async (): Promise<void> => {
        setFeedback((await copyPlaintext(link)) ? _t("common|copied") : _t("error|failed_copy"));
    };

    return (
        <Tooltip
            label={feedback ?? _t("gua|call|copy_guest_link")}
            onOpenChange={(open) => {
                if (!open) setFeedback(undefined);
            }}
        >
            <IconButton onClick={copyLink}>
                <LinkIcon />
            </IconButton>
        </Tooltip>
    );
}
