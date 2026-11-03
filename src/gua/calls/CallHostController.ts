/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { MatrixClientPeg } from "../../MatrixClientPeg";
import PlatformPeg from "../../PlatformPeg";
import MatrixClientBackedController from "../../settings/controllers/MatrixClientBackedController";
import { type SettingKey } from "../../settings/Settings";
import SettingsStore from "../../settings/SettingsStore";
import { type WatchManager } from "../../settings/WatchManager";
import { isCallHost } from "./hosts";

interface CallHostOptions {
    hostValue?: () => unknown;
    reloadOnChange?: boolean;
}

/**
 * Gives the accounts in `gua_call.hosts` a fixed value for a setting, whatever the config says.
 * Other accounts get the usual value.
 */
export default class CallHostController extends MatrixClientBackedController {
    private readonly hostValue: () => unknown;
    private readonly reloadOnChange: boolean;

    public constructor(
        private readonly settingName: SettingKey,
        private readonly watchers: WatchManager,
        { hostValue = () => true, reloadOnChange = false }: CallHostOptions = {},
    ) {
        super();
        this.hostValue = hostValue;
        this.reloadOnChange = reloadOnChange;
    }

    public getValueOverride(): unknown {
        // MatrixClientPeg has the signed-in client before startup passes it to the controllers, and none after logout.
        return isCallHost(MatrixClientPeg.get()?.credentials?.userId) ? this.hostValue() : null;
    }

    public onChange(): void {
        if (this.reloadOnChange) PlatformPeg.get()?.reload();
    }

    protected initMatrixClient(): void {
        const level = SettingsStore.firstSupportedLevel(this.settingName);
        // Watchers read the new value themselves.
        if (level) this.watchers.notifyUpdate(this.settingName, null, level, null);
    }
}
