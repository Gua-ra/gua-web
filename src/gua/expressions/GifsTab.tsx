/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { logger } from "matrix-js-sdk/src/logger";
import { Button, InlineSpinner } from "@vector-im/compound-web";
import TimeIcon from "@vector-im/compound-design-tokens/assets/web/icons/time";
import FavouriteIcon from "@vector-im/compound-design-tokens/assets/web/icons/favourite";
import FavouriteSolidIcon from "@vector-im/compound-design-tokens/assets/web/icons/favourite-solid";
import ChartIcon from "@vector-im/compound-design-tokens/assets/web/icons/chart";
import ArrowLeftIcon from "@vector-im/compound-design-tokens/assets/web/icons/arrow-left";

import { _t } from "../../languageHandler";
import { useMatrixClientContext } from "../../contexts/MatrixClientContext";
import { favouriteGif, KLIPY, unfavouriteGif } from "./gifLibrary";
import { type GifFile, type GifItem, type GifPage, type GifProvider, gifPreview, gifProvider } from "./klipy";
import { useKlipyGifFavourites } from "./libraries";
import { useRecentGifs } from "./recents";
import { useShouldAnimate } from "./media";
import { type ExpressionTarget, sendGif } from "./senders";
import { ExpressionSearch } from "./ExpressionSearch";
import { showError } from "./StickersTab";

const SEARCH_DELAY_MS = 300;
const LOAD_MORE_MARGIN_PX = 300;
// KLIPY requires this wording, so it is not translated.
const SEARCH_PLACEHOLDER = "Search KLIPY";

export type GifBrowse = "recent" | "favourites" | "trending";

interface Props {
    target: ExpressionTarget;
    onFinished(): void;
    provider?: GifProvider;
}

interface Results {
    items: GifItem[];
    page: number;
    hasNext: boolean;
}

type Status = "loading" | "error" | "ready";

export function GifsTab({ target, onFinished, provider = gifProvider() }: Props): JSX.Element {
    const client = useMatrixClientContext();
    const recents = useRecentGifs(client.getSafeUserId());
    const [favouriteIds, favouritesDocument] = useKlipyGifFavourites();
    const [query, setQuery] = useState("");
    const [searchTerm, setSearchTerm] = useState("");
    const [browse, setBrowse] = useState<GifBrowse>("trending");
    const [results, setResults] = useState<Results>({ items: [], page: 0, hasNext: false });
    const [status, setStatus] = useState<Status>("loading");
    const [attempt, setAttempt] = useState(0);
    const [preview, setPreview] = useState<GifItem>();
    const request = useRef<AbortController>(undefined);

    useEffect(() => {
        const timer = window.setTimeout(() => setSearchTerm(query.trim()), SEARCH_DELAY_MS);
        return () => window.clearTimeout(timer);
    }, [query]);

    // Recent and favourite lists are fetched by id, so they reload when the ids change.
    const ids = browse === "recent" ? recents.items : browse === "favourites" ? favouriteIds : undefined;
    const idsKey = ids?.join(",");

    const load = useCallback(
        (page: number, signal: AbortSignal): Promise<GifPage> => {
            if (searchTerm) return provider.search(searchTerm, page, signal);
            if (browse === "trending") return provider.trending(page, signal);
            return provider
                .items(idsKey ? idsKey.split(",") : [], signal)
                .then((items) => ({ items, page: 1, hasNext: false }));
        },
        [provider, searchTerm, browse, idsKey],
    );

    useEffect(() => {
        if (!provider.isAvailable) return;
        request.current?.abort();
        const controller = new AbortController();
        request.current = controller;
        setStatus("loading");
        setResults({ items: [], page: 0, hasNext: false });
        load(1, controller.signal).then(
            (page) => {
                if (controller.signal.aborted) return;
                setResults({ items: page.items, page: page.page, hasNext: page.hasNext });
                setStatus("ready");
            },
            (error) => {
                if (controller.signal.aborted) return;
                logger.warn("Could not load GIFs", error);
                setStatus("error");
            },
        );
        return () => controller.abort();
    }, [provider, load, attempt]);

    const loadMore = (): void => {
        if (status !== "ready" || !results.hasNext) return;
        const controller = new AbortController();
        request.current = controller;
        setStatus("loading");
        load(results.page + 1, controller.signal).then(
            (page) => {
                if (controller.signal.aborted) return;
                setResults((current) => ({
                    items: [...current.items, ...page.items],
                    page: page.page,
                    hasNext: page.hasNext,
                }));
                setStatus("ready");
            },
            (error) => {
                if (controller.signal.aborted) return;
                logger.warn("Could not load more GIFs", error);
                setStatus("error");
            },
        );
    };

    const favourites = useMemo(() => new Set(favouriteIds), [favouriteIds]);
    const toggleFavourite = (item: GifItem): void => {
        const edit = favourites.has(item.id)
            ? (content: Record<string, unknown>) => unfavouriteGif(content, item.id, KLIPY)
            : (content: Record<string, unknown>) => favouriteGif(content, item.id, KLIPY);
        favouritesDocument.update(edit).catch((error) => {
            logger.error("Could not update GIF favourites", error);
            showError(_t("gua|expressions|library_update_failed"));
        });
    };

    if (!provider.isAvailable) {
        return (
            <div className="mx_GuaGifsTab">
                <p className="mx_GuaExpressionPanel_message">{_t("gua|expressions|gifs_unavailable")}</p>
            </div>
        );
    }

    if (preview) {
        return (
            <GifPreview
                item={preview}
                isFavourite={favourites.has(preview.id)}
                onToggleFavourite={() => toggleFavourite(preview)}
                onBack={() => setPreview(undefined)}
                onSend={async (caption) => {
                    await sendGif(client, target, preview, caption);
                    recents.push(preview.id);
                    onFinished();
                }}
            />
        );
    }

    const isBrowsing = !searchTerm && !query.trim();
    let body: React.ReactNode;
    if (status === "error") {
        body = (
            <div className="mx_GuaExpressionPanel_message">
                <p>{_t("gua|expressions|gifs_load_failed")}</p>
                <Button kind="secondary" size="sm" onClick={() => setAttempt((count) => count + 1)}>
                    {_t("action|try_again")}
                </Button>
            </div>
        );
    } else if (status === "ready" && results.items.length === 0) {
        body = <p className="mx_GuaExpressionPanel_message">{_t("gua|expressions|gifs_none")}</p>;
    } else {
        body = (
            <>
                <GifGrid
                    items={results.items}
                    favourites={favourites}
                    onSelect={setPreview}
                    onToggleFavourite={toggleFavourite}
                />
                {status === "loading" && (
                    <div className="mx_GuaExpressionPanel_message">
                        <InlineSpinner />
                    </div>
                )}
            </>
        );
    }

    return (
        <div className="mx_GuaGifsTab">
            <ExpressionSearch placeholder={SEARCH_PLACEHOLDER} value={query} onChange={setQuery} />
            <div
                className="mx_GuaGifsTab_results"
                onScroll={(event) => {
                    const element = event.currentTarget;
                    if (element.scrollTop + element.clientHeight > element.scrollHeight - LOAD_MORE_MARGIN_PX) {
                        loadMore();
                    }
                }}
            >
                {body}
            </div>
            <nav className="mx_GuaExpressionPanel_bottomBar" aria-label={_t("gua|expressions|browse")}>
                <BrowseButton
                    label={_t("gua|expressions|section_recent")}
                    icon={<TimeIcon width={24} height={24} aria-hidden />}
                    selected={isBrowsing && browse === "recent"}
                    onClick={() => {
                        setQuery("");
                        setBrowse("recent");
                    }}
                />
                <BrowseButton
                    label={_t("gua|expressions|section_favourites")}
                    icon={<FavouriteIcon width={24} height={24} aria-hidden />}
                    selected={isBrowsing && browse === "favourites"}
                    onClick={() => {
                        setQuery("");
                        setBrowse("favourites");
                    }}
                />
                <BrowseButton
                    label={_t("gua|expressions|gifs_trending")}
                    icon={<ChartIcon width={24} height={24} aria-hidden />}
                    selected={isBrowsing && browse === "trending"}
                    onClick={() => {
                        setQuery("");
                        setBrowse("trending");
                    }}
                />
            </nav>
        </div>
    );
}

function BrowseButton({
    label,
    icon,
    selected,
    onClick,
}: {
    label: string;
    icon: React.ReactNode;
    selected: boolean;
    onClick(): void;
}): JSX.Element {
    return (
        <button
            type="button"
            className="mx_GuaExpressionPanel_barButton"
            aria-label={label}
            aria-pressed={selected}
            title={label}
            onClick={onClick}
        >
            {icon}
        </button>
    );
}

interface GridProps {
    items: GifItem[];
    favourites: Set<string>;
    onSelect(item: GifItem): void;
    onToggleFavourite(item: GifItem): void;
}

/** Two columns, each item placed in the shorter one, in the order KLIPY returned them. */
export function masonryColumns<T>(items: T[], aspect: (item: T) => number): [T[], T[]] {
    const columns: [T[], T[]] = [[], []];
    const heights = [0, 0];
    for (const item of items) {
        const column = heights[1] < heights[0] ? 1 : 0;
        columns[column].push(item);
        heights[column] += aspect(item);
    }
    return columns;
}

function GifGrid({ items, favourites, onSelect, onToggleFavourite }: GridProps): JSX.Element {
    const animate = useShouldAnimate();
    const columns = masonryColumns(items, (item) => {
        const file = gifPreview(item);
        return file ? file.height / Math.max(file.width, 1) : 1;
    });
    return (
        <div className="mx_GuaGifsTab_grid">
            {columns.map((column, index) => (
                <div key={index} className="mx_GuaGifsTab_column">
                    {column.map((item) => (
                        <GifTile
                            key={item.id}
                            item={item}
                            animate={animate}
                            isFavourite={favourites.has(item.id)}
                            onSelect={() => onSelect(item)}
                            onToggleFavourite={() => onToggleFavourite(item)}
                        />
                    ))}
                </div>
            ))}
        </div>
    );
}

function GifTile({
    item,
    animate,
    isFavourite,
    onSelect,
    onToggleFavourite,
}: {
    item: GifItem;
    animate: boolean;
    isFavourite: boolean;
    onSelect(): void;
    onToggleFavourite(): void;
}): JSX.Element | null {
    const file = gifPreview(item);
    if (!file) return null;
    const label = _t("gua|expressions|gif_label", { body: item.title.trim() || "GIF" });
    return (
        <button
            type="button"
            className="mx_GuaGifsTab_tile"
            aria-label={label}
            style={{ aspectRatio: `${file.width} / ${file.height}` }}
            onClick={onSelect}
            onContextMenu={(event) => {
                // Right-click stands in for the apps' long press.
                event.preventDefault();
                onToggleFavourite();
            }}
        >
            <img src={tileSource(item, file, animate)} alt="" loading="lazy" draggable={false} />
            {isFavourite && <FavouriteSolidIcon className="mx_GuaGifsTab_favouriteBadge" aria-hidden />}
        </button>
    );
}

function tileSource(item: GifItem, file: GifFile, animate: boolean): string {
    if (animate) return file.url;
    const size = (["sm", "xs", "md", "hd"] as const).find((name) => item.renditions[name]?.animated === file);
    return (size && item.renditions[size]?.still?.url) || file.url;
}

interface PreviewProps {
    item: GifItem;
    isFavourite: boolean;
    onToggleFavourite(): void;
    onBack(): void;
    onSend(caption: string): Promise<void>;
}

function GifPreview({ item, isFavourite, onToggleFavourite, onBack, onSend }: PreviewProps): JSX.Element {
    const animate = useShouldAnimate();
    const [caption, setCaption] = useState("");
    const [sending, setSending] = useState(false);
    const [failed, setFailed] = useState(false);
    const file = item.renditions.md?.animated ?? gifPreview(item);

    const send = async (): Promise<void> => {
        if (sending) return;
        setSending(true);
        setFailed(false);
        try {
            await onSend(caption);
        } catch (error) {
            logger.error("Could not send a GIF", error);
            setFailed(true);
            setSending(false);
        }
    };

    const favouriteLabel = isFavourite ? _t("gua|expressions|remove_favourite") : _t("gua|expressions|add_favourite");
    return (
        <div className="mx_GuaGifPreview">
            <div className="mx_GuaGifPreview_header">
                <button
                    type="button"
                    className="mx_GuaExpressionPanel_barButton"
                    aria-label={_t("action|back")}
                    onClick={onBack}
                >
                    <ArrowLeftIcon width={24} height={24} aria-hidden />
                </button>
                <button
                    type="button"
                    className="mx_GuaExpressionPanel_barButton"
                    aria-label={favouriteLabel}
                    aria-pressed={isFavourite}
                    title={favouriteLabel}
                    onClick={onToggleFavourite}
                >
                    {isFavourite ? (
                        <FavouriteSolidIcon width={24} height={24} aria-hidden />
                    ) : (
                        <FavouriteIcon width={24} height={24} aria-hidden />
                    )}
                </button>
            </div>
            {file && (
                <img
                    className="mx_GuaGifPreview_image"
                    src={tileSource(item, file, animate)}
                    alt={_t("gua|expressions|gif_label", { body: item.title.trim() || "GIF" })}
                />
            )}
            <form
                className="mx_GuaGifPreview_compose"
                onSubmit={(event) => {
                    event.preventDefault();
                    void send();
                }}
            >
                <input
                    type="text"
                    // Opening the preview is a step towards sending, so the caption takes the focus.
                    autoFocus
                    placeholder={_t("gua|expressions|gif_caption")}
                    aria-label={_t("gua|expressions|gif_caption")}
                    value={caption}
                    onChange={(event) => setCaption(event.target.value)}
                />
                <Button kind="primary" size="sm" type="submit" disabled={sending}>
                    {sending ? <InlineSpinner /> : _t("gua|expressions|send")}
                </Button>
            </form>
            {failed && <p className="mx_GuaGifPreview_error">{_t("gua|expressions|gif_send_failed")}</p>}
        </div>
    );
}
