/*
Copyright 2018-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, type ComponentProps, type ReactNode } from "react";
import { type Tooltip } from "@vector-im/compound-web";
import { type MediaEventContent } from "matrix-js-sdk/src/types";

import { MImageBodyInner } from "./MImageBody";
import { BLURHASH_FIELD } from "../../../utils/image-media";
import IconsShowStickersSvg from "../../../../res/img/icons-show-stickers.svg";
import { type IBodyProps } from "./IBodyProps";
import { useMediaVisible } from "../../../hooks/useMediaVisible";
import SettingsStore from "../../../settings/SettingsStore";
import { MatrixClientPeg } from "../../../MatrixClientPeg";
import { _t } from "../../../languageHandler";
import { stickerImageFromJson } from "../../../gua/expressions/StickerImage";
import { openStickerDetails } from "../../../gua/expressions/openStickerDetails";

class MStickerBodyInner extends MImageBodyInner {
    // Mostly empty to prevent default behaviour of MImageBody
    protected onClick = (ev: React.MouseEvent | React.KeyboardEvent): void => {
        ev.preventDefault();
        if (!this.props.mediaVisible) {
            this.props.setMediaVisible(true);
        } else if (this.opensDetails()) {
            openStickerDetails(MatrixClientPeg.safeGet(), this.props.mxEvent);
        }
    };

    private opensDetails(): boolean {
        return (
            SettingsStore.getValue("feature_gua_expressions") && !!stickerImageFromJson(this.props.mxEvent.getContent())
        );
    }

    // MStickerBody doesn't need a wrapping `<a href=...>`, but it does need extra padding
    // which is added by mx_MStickerBody_wrapper
    protected wrapImage(contentUrl: string, children: React.ReactNode): JSX.Element {
        if (this.props.mediaVisible && this.opensDetails()) {
            return (
                <div
                    className="mx_MStickerBody_wrapper mx_MStickerBody_wrapper_actionable"
                    role="button"
                    tabIndex={0}
                    aria-label={_t("gua|expressions|sticker_label", {
                        body: this.props.mxEvent.getContent().body?.trim() || "",
                    })}
                    onClick={this.onClick}
                    onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") this.onClick(ev);
                    }}
                >
                    {" "}
                    {children}{" "}
                </div>
            );
        }
        let onClick: React.MouseEventHandler | undefined;
        if (!this.props.mediaVisible) {
            onClick = this.onClick;
        }
        return (
            <div className="mx_MStickerBody_wrapper" onClick={onClick}>
                {" "}
                {children}{" "}
            </div>
        );
    }

    // Placeholder to show in place of the sticker image if img onLoad hasn't fired yet.
    protected getPlaceholder(width: number, height: number): ReactNode {
        if (this.props.mxEvent.getContent().info?.[BLURHASH_FIELD]) return super.getPlaceholder(width, height);
        return (
            <img
                aria-hidden
                alt=""
                className="mx_MStickerBody_placeholder"
                src={IconsShowStickersSvg}
                width="80"
                height="80"
                onMouseEnter={this.onImageEnter}
                onMouseLeave={this.onImageLeave}
            />
        );
    }

    // Tooltip to show on mouse over
    protected getTooltipProps(): ComponentProps<typeof Tooltip> | null {
        const content = this.props.mxEvent && this.props.mxEvent.getContent();

        if (!content?.body || !content.info?.w) return null;

        return {
            placement: "right",
            description: content.body,
        };
    }

    // Don't show "Download this_file.png ..."
    protected getFileBody(): ReactNode {
        return null;
    }

    protected getBanner(content: MediaEventContent): ReactNode {
        return null; // we don't need a banner, we have a tooltip
    }
}

const MAX_STICKER_SIZE = 160;

/** Stickers fit within 160×160 at their own aspect ratio, as in the apps. */
export function stickerMaxHeight(info: { w?: number; h?: number } | undefined, maxImageHeight?: number): number {
    const limit = Math.min(maxImageHeight ?? MAX_STICKER_SIZE, MAX_STICKER_SIZE);
    if (!info?.w || !info.h || info.w <= info.h) return limit;
    return Math.min(limit, Math.floor((MAX_STICKER_SIZE * info.h) / info.w));
}

const MStickerBody: React.FC<IBodyProps> = (props) => {
    const [mediaVisible, setVisible] = useMediaVisible(props.mxEvent);
    const maxImageHeight = stickerMaxHeight(props.mxEvent.getContent().info, props.maxImageHeight);
    return (
        <MStickerBodyInner
            mediaVisible={mediaVisible}
            setMediaVisible={setVisible}
            {...props}
            maxImageHeight={maxImageHeight}
        />
    );
};

export default MStickerBody;
