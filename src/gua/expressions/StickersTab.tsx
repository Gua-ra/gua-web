/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, useMemo, useRef, useState } from "react";
import { type Room } from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";
import { ContextMenu, MenuItem } from "@vector-im/compound-web";
import TimeIcon from "@vector-im/compound-design-tokens/assets/web/icons/time";
import FavouriteIcon from "@vector-im/compound-design-tokens/assets/web/icons/favourite";
import FavouriteSolidIcon from "@vector-im/compound-design-tokens/assets/web/icons/favourite-solid";
import DeleteIcon from "@vector-im/compound-design-tokens/assets/web/icons/delete";
import CloseIcon from "@vector-im/compound-design-tokens/assets/web/icons/close";
import PlusIcon from "@vector-im/compound-design-tokens/assets/web/icons/plus";
import DownloadIcon from "@vector-im/compound-design-tokens/assets/web/icons/download";

import { _t } from "../../languageHandler";
import Modal from "../../Modal";
import ErrorDialog from "../../components/views/dialogs/ErrorDialog";
import QuestionDialog from "../../components/views/dialogs/QuestionDialog";
import { useMatrixClientContext } from "../../contexts/MatrixClientContext";
import { mediaFromMxc } from "../../customisations/Media";
import { type StickerImage } from "./StickerImage";
import {
    addSticker,
    deleteSticker,
    favouriteSticker,
    StickerLimitReachedError,
    unfavouriteSticker,
} from "./stickerLibrary";
import { type StickerSection, stickerSections, type StickerTile } from "./stickerSections";
import { useStickerLibrary } from "./libraries";
import { useRecentStickers } from "./recents";
import { useStickerPacks } from "./useStickerPacks";
import { stickerSrc, useShouldAnimate } from "./media";
import { type ExpressionTarget, sendSticker } from "./senders";
import { ExpressionSearch } from "./ExpressionSearch";

interface Props {
    room: Room;
    target: ExpressionTarget;
    /** Closes the panel after a send, or before the sticker editor opens. */
    onFinished(): void;
    onCreateSticker(): void;
}

export function StickersTab({ room, target, onFinished, onCreateSticker }: Props): JSX.Element {
    const client = useMatrixClientContext();
    const [library, libraryDocument] = useStickerLibrary();
    const recents = useRecentStickers(client.getSafeUserId());
    const packs = useStickerPacks(room);
    const [query, setQuery] = useState("");
    const sections = useMemo(
        () => stickerSections(recents.items, library, packs, query),
        [recents.items, library, packs, query],
    );
    const sectionElements = useRef(new Map<string, HTMLElement>());

    const favouriteUrls = useMemo(() => new Set(library.favourites.map((image) => image.url)), [library]);
    const mineUrls = useMemo(() => new Set(library.stickers.map(({ image }) => image.url)), [library]);

    const send = (image: StickerImage): void => {
        recents.push(image);
        onFinished();
        sendSticker(client, target, image).catch((error) => {
            logger.error("Could not send a sticker", error);
            showError(_t("gua|expressions|sticker_send_failed"));
        });
    };

    const editLibrary = (edit: Parameters<typeof libraryDocument.update>[0]): void => {
        libraryDocument.update(edit).catch((error) => {
            logger.error("Could not update My stickers", error);
            showError(
                error instanceof StickerLimitReachedError
                    ? _t("gua|expressions|sticker_limit")
                    : _t("gua|expressions|library_update_failed"),
            );
        });
    };

    const confirmDelete = async (shortcode: string): Promise<void> => {
        const { finished } = Modal.createDialog(QuestionDialog, {
            title: _t("gua|expressions|delete_title"),
            description: _t("gua|expressions|delete_description"),
            button: _t("action|delete"),
            danger: true,
        });
        const [confirmed] = await finished;
        if (confirmed) editLibrary((content) => deleteSticker(content, shortcode));
    };

    const hasMatches = sections.some((section) => section.tiles.length > 0);

    return (
        <div className="mx_GuaStickersTab">
            <ExpressionSearch placeholder={_t("gua|expressions|search_stickers")} value={query} onChange={setQuery} />
            <div className="mx_GuaStickersTab_sections">
                {sections.map((section) => (
                    <section
                        key={section.id}
                        className="mx_GuaStickersTab_section"
                        aria-label={sectionTitle(section)}
                        ref={(element) => {
                            if (element) sectionElements.current.set(section.id, element);
                            else sectionElements.current.delete(section.id);
                        }}
                    >
                        <h3 className="mx_GuaStickersTab_sectionTitle">{sectionTitle(section)}</h3>
                        <div className="mx_GuaStickersTab_grid">
                            {section.kind === "recent" && (
                                <button type="button" className="mx_GuaStickersTab_create" onClick={onCreateSticker}>
                                    <PlusIcon width={24} height={24} aria-hidden />
                                    <span>{_t("gua|expressions|create_sticker")}</span>
                                </button>
                            )}
                            {section.tiles.map((tile) => (
                                <StickerTileButton key={tile.image.url} tile={tile} onSend={() => send(tile.image)}>
                                    {favouriteUrls.has(tile.image.url) ? (
                                        <MenuItem
                                            Icon={FavouriteSolidIcon}
                                            label={_t("gua|expressions|remove_favourite")}
                                            onSelect={() =>
                                                editLibrary((content) => unfavouriteSticker(content, tile.image.url))
                                            }
                                        />
                                    ) : (
                                        <MenuItem
                                            Icon={FavouriteIcon}
                                            label={_t("gua|expressions|add_favourite")}
                                            onSelect={() =>
                                                editLibrary((content) => favouriteSticker(content, tile.image))
                                            }
                                        />
                                    )}
                                    {section.kind === "recent" && (
                                        <MenuItem
                                            Icon={CloseIcon}
                                            label={_t("gua|expressions|remove_recent")}
                                            onSelect={() => recents.remove(tile.image)}
                                        />
                                    )}
                                    {section.kind === "pack" && !mineUrls.has(tile.image.url) && (
                                        <MenuItem
                                            Icon={DownloadIcon}
                                            label={_t("gua|expressions|save_sticker")}
                                            onSelect={() =>
                                                editLibrary((content) => addSticker(content, tile.image, Date.now()))
                                            }
                                        />
                                    )}
                                    {section.kind === "mine" && tile.shortcode !== undefined && (
                                        <MenuItem
                                            Icon={DeleteIcon}
                                            kind="critical"
                                            label={_t("action|delete")}
                                            onSelect={() => confirmDelete(tile.shortcode!)}
                                        />
                                    )}
                                </StickerTileButton>
                            ))}
                        </div>
                    </section>
                ))}
                {query.trim() && !hasMatches && (
                    <p className="mx_GuaExpressionPanel_message">{_t("gua|expressions|no_stickers")}</p>
                )}
            </div>
            <StickerSectionBar
                sections={sections}
                onSelect={(id) => sectionElements.current.get(id)?.scrollIntoView({ block: "start" })}
            />
        </div>
    );
}

interface TileProps {
    tile: StickerTile;
    onSend(): void;
    /** The right-click and long-press actions. */
    children: React.ReactNode;
}

function StickerTileButton({ tile, onSend, children }: TileProps): JSX.Element {
    const client = useMatrixClientContext();
    const animate = useShouldAnimate();
    const label = _t("gua|expressions|sticker_label", { body: tile.image.body?.trim() || "" });
    return (
        <ContextMenu
            title={label}
            showTitle={false}
            hasAccessibleAlternative={false}
            trigger={
                <button type="button" className="mx_GuaStickersTab_tile" aria-label={label} onClick={onSend}>
                    <img src={stickerSrc(client, tile.image, animate)} alt="" loading="lazy" draggable={false} />
                </button>
            }
        >
            {children}
        </ContextMenu>
    );
}

function StickerSectionBar({
    sections,
    onSelect,
}: {
    sections: StickerSection[];
    onSelect(id: string): void;
}): JSX.Element {
    const client = useMatrixClientContext();
    return (
        <nav className="mx_GuaExpressionPanel_bottomBar" aria-label={_t("gua|expressions|browse")}>
            {sections.map((section) => {
                const title = sectionTitle(section);
                let icon: React.ReactNode;
                if (section.kind === "recent") icon = <TimeIcon width={24} height={24} aria-hidden />;
                else if (section.kind === "favourites") icon = <FavouriteIcon width={24} height={24} aria-hidden />;
                else {
                    const avatarUrl = section.pack?.avatarUrl ?? section.tiles[0]?.image.url;
                    const src = avatarUrl ? mediaFromMxc(avatarUrl, client).getSquareThumbnailHttp(48) : null;
                    icon = src ? <img src={src} alt="" width={24} height={24} /> : null;
                }
                return (
                    <button
                        key={section.id}
                        type="button"
                        className="mx_GuaExpressionPanel_barButton"
                        aria-label={title}
                        title={title}
                        onClick={() => onSelect(section.id)}
                    >
                        {icon}
                    </button>
                );
            })}
        </nav>
    );
}

function sectionTitle(section: StickerSection): string {
    switch (section.kind) {
        case "recent":
            return _t("gua|expressions|section_recent");
        case "favourites":
            return _t("gua|expressions|section_favourites");
        case "mine":
            return _t("gua|expressions|section_mine");
        case "pack":
            return section.pack?.displayName ?? "";
    }
}

export function showError(title: string): void {
    Modal.createDialog(ErrorDialog, { title, description: undefined });
}
