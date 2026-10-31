/*
Copyright 2025 New Vector Ltd.
SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React from "react";
import { type RoomMember, type Room } from "matrix-js-sdk/src/matrix";

import { textualPowerLevel } from "../../../../Roles";
import PowerSelector from "../../elements/PowerSelector";
import { type IRoomPermissions } from "../UserInfo";
import {
    type UserInfoPowerLevelState,
    useUserInfoPowerlevelViewModel,
} from "../../../viewmodels/right_panel/UserInfoPowerlevelViewModel";

export const PowerLevelSection: React.FC<{
    user: RoomMember;
    room: Room;
    roomPermissions: IRoomPermissions;
}> = ({ user, room, roomPermissions }) => {
    const vm = useUserInfoPowerlevelViewModel(user, room);

    // Gua: a creator's power comes from the room's create event and cannot be changed.
    if (roomPermissions.canEdit && user.powerLevel !== Infinity) {
        return <PowerLevelEditor vm={vm} roomPermissions={roomPermissions} />;
    }

    const powerLevel = user.powerLevel;
    const role = textualPowerLevel(powerLevel, vm.powerLevelUsersDefault);
    return (
        <div className="mx_UserInfo_profileField">
            <div className="mx_UserInfo_roleDescription">{role}</div>
        </div>
    );
};

export const PowerLevelEditor: React.FC<{
    vm: UserInfoPowerLevelState;
    roomPermissions: IRoomPermissions;
}> = ({ vm, roomPermissions }) => {
    return (
        <div className="mx_UserInfo_profileField">
            <PowerSelector
                label={undefined}
                value={vm.selectedPowerLevel}
                maxValue={roomPermissions.modifyLevelMax}
                usersDefault={vm.powerLevelUsersDefault}
                onChange={vm.onPowerChange}
            />
        </div>
    );
};
