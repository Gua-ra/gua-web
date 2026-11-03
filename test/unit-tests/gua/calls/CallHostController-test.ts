/*
Copyright 2026 Gua

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { act, renderHook } from "jest-matrix-react";

import SettingsStore from "../../../../src/settings/SettingsStore";
import { SettingLevel } from "../../../../src/settings/SettingLevel";
import { UIFeature } from "../../../../src/settings/UIFeature";
import MatrixClientBackedController from "../../../../src/settings/controllers/MatrixClientBackedController";
import SdkConfig from "../../../../src/SdkConfig";
import { MatrixClientPeg } from "../../../../src/MatrixClientPeg";
import { useFeatureEnabled, useSettingValue } from "../../../../src/hooks/useSettings";
import {
    getMockClientWithEventEmitter,
    mockClientMethodsServer,
    mockClientMethodsUser,
    mockPlatformPeg,
    unmockClientPeg,
} from "../../../test-utils";

const HOST = "@host:example.org";
const MEMBER = "@member:example.org";
const HOST_URL = "https://call-host.example.org/room";

function signIn(userId: string): void {
    const client = getMockClientWithEventEmitter({ ...mockClientMethodsUser(userId), ...mockClientMethodsServer() });
    MatrixClientBackedController.matrixClient = client;
}

function callSettings(): unknown[] {
    return [
        SettingsStore.getValue("feature_group_calls"),
        SettingsStore.getValue("feature_ask_to_join"),
        SettingsStore.getValue(UIFeature.Voip),
        SettingsStore.getValue("Developer.elementCallUrl"),
    ];
}

describe("CallHostController", () => {
    beforeEach(() => {
        SdkConfig.put({
            gua_call: { hosts: [HOST], host_url: HOST_URL },
            features: { feature_group_calls: false, feature_ask_to_join: false },
            setting_defaults: { [UIFeature.Voip]: false },
        });
    });

    afterEach(() => {
        unmockClientPeg();
        SdkConfig.reset();
        SettingsStore.reset();
        localStorage.clear();
        jest.restoreAllMocks();
    });

    it("keeps the configured values before sign-in", () => {
        jest.spyOn(MatrixClientPeg, "get").mockReturnValue(null);
        expect(callSettings()).toEqual([false, false, false, ""]);
    });

    it("turns calls on for a host", () => {
        signIn(HOST);
        expect(callSettings()).toEqual([true, true, true, HOST_URL]);
    });

    it("keeps the configured values for other accounts", () => {
        signIn(MEMBER);
        expect(callSettings()).toEqual([false, false, false, ""]);
    });

    it("keeps a host's own Element Call URL when the config has no host_url", async () => {
        SdkConfig.put({ gua_call: { hosts: [HOST] } });
        signIn(HOST);
        await SettingsStore.setValue("Developer.elementCallUrl", null, SettingLevel.DEVICE, "https://device.example");
        expect(SettingsStore.getValue("Developer.elementCallUrl")).toBe("https://device.example");
    });

    it("updates mounted components when an account signs in and when it changes", () => {
        jest.spyOn(MatrixClientPeg, "get").mockReturnValue(null);
        const groupCalls = renderHook(() => useFeatureEnabled("feature_group_calls"));
        const voip = renderHook(() => useSettingValue(UIFeature.Voip));
        expect([groupCalls.result.current, voip.result.current]).toEqual([false, false]);

        act(() => signIn(HOST));
        expect([groupCalls.result.current, voip.result.current]).toEqual([true, true]);

        act(() => signIn(MEMBER));
        expect([groupCalls.result.current, voip.result.current]).toEqual([false, false]);
    });

    it("still reloads the app when group calls are toggled", async () => {
        const platform = mockPlatformPeg({ reload: jest.fn() });
        await SettingsStore.setValue("feature_group_calls", null, SettingLevel.DEVICE, true);
        expect(platform.reload).toHaveBeenCalled();
    });
});
