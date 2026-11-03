/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React from "react";
import { render, screen, waitFor } from "jest-matrix-react";
import { mocked } from "jest-mock";
import { type MatrixClient, Room, RoomVersionStability } from "matrix-js-sdk/src/matrix";

import RoomUpgradeDialog from "../../../../../src/components/views/dialogs/RoomUpgradeDialog";
import { stubClient } from "../../../../test-utils";

describe("RoomUpgradeDialog", () => {
    let cli: MatrixClient;
    let room: Room;

    beforeEach(() => {
        cli = stubClient();
        room = new Room("!room:example.com", cli, cli.getSafeUserId());
    });

    it("closes without an upgrade when the server's room versions cannot be loaded", async () => {
        jest.spyOn(room, "getVersion").mockReturnValue("12");
        mocked(cli.getCapabilities).mockRejectedValue(new Error("offline"));
        const onFinished = jest.fn();
        render(<RoomUpgradeDialog room={room} onFinished={onFinished} />);

        await waitFor(() => expect(onFinished).toHaveBeenCalledWith(false));
        expect(screen.queryByRole("button", { name: "Upgrade this room to version 10" })).not.toBeInTheDocument();
    });

    it("offers the version the server recommends", async () => {
        jest.spyOn(room, "getVersion").mockReturnValue("10");
        mocked(cli.getCapabilities).mockResolvedValue({
            "m.room_versions": { default: "12", available: { "12": RoomVersionStability.Stable } },
        });
        render(<RoomUpgradeDialog room={room} onFinished={jest.fn()} />);

        expect(await screen.findByRole("button", { name: "Upgrade this room to version 12" })).toBeInTheDocument();
    });
});
