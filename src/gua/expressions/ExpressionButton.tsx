/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, useContext, useRef } from "react";
import { type IEventRelation, type MatrixEvent, type Room } from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";
import classNames from "classnames";

import { _t } from "../../languageHandler";
import Modal from "../../Modal";
import ContextMenu, { aboveLeftOf, type MenuProps, useContextMenu } from "../../components/structures/ContextMenu";
import { CollapsibleButton } from "../../components/views/rooms/CollapsibleButton";
import { OverflowMenuContext } from "../../components/views/rooms/MessageComposerButtons";
import { ExpressionPanel } from "./ExpressionPanel";
import StickerEditorDialog from "./StickerEditorDialog";
import { showError } from "./StickersTab";

interface Props {
    room: Room;
    relation?: IEventRelation;
    replyToEvent?: MatrixEvent;
    addEmoji(unicode: string): boolean;
    menuPosition?: MenuProps;
    className?: string;
}

/** Takes the place of the emoji button while the stickers and GIFs flag is on. */
export function ExpressionButton({
    room,
    relation,
    replyToEvent,
    addEmoji,
    menuPosition,
    className,
}: Props): JSX.Element {
    const overflowMenuCloser = useContext(OverflowMenuContext);
    const [menuDisplayed, button, openMenu, closeMenu] = useContextMenu();
    const fileInput = useRef<HTMLInputElement>(null);
    const target = { roomId: room.roomId, relation, replyToEvent };

    const onFinished = (): void => {
        closeMenu();
        overflowMenuCloser?.();
    };

    const onFileChosen = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        let image: ImageBitmap;
        try {
            image = await createImageBitmap(file);
        } catch (error) {
            logger.warn("Could not decode a picture for a sticker", error);
            showError(_t("gua|expressions|editor_unreadable"));
            return;
        }
        const { finished } = Modal.createDialog(StickerEditorDialog, { image, target });
        finished.finally(() => image.close());
    };

    let contextMenu: React.ReactElement | null = null;
    if (menuDisplayed && button.current) {
        const position = menuPosition ?? aboveLeftOf(button.current.getBoundingClientRect());
        contextMenu = (
            <ContextMenu {...position} onFinished={onFinished} managed={false}>
                <ExpressionPanel
                    room={room}
                    target={target}
                    addEmoji={addEmoji}
                    onFinished={onFinished}
                    onCreateSticker={() => {
                        // The panel sits above dialogs, so it closes before the editor opens.
                        onFinished();
                        fileInput.current?.click();
                    }}
                />
            </ContextMenu>
        );
    }

    return (
        <>
            <CollapsibleButton
                className={classNames("mx_EmojiButton", className, { mx_EmojiButton_highlight: menuDisplayed })}
                iconClassName="mx_EmojiButton_icon"
                onClick={openMenu}
                title={_t("gua|expressions|open")}
                inputRef={button}
            />
            <input
                ref={fileInput}
                type="file"
                accept="image/*"
                className="mx_GuaExpressionButton_fileInput"
                onChange={onFileChosen}
            />
            {contextMenu}
        </>
    );
}
