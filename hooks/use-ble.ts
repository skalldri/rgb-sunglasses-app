import * as ExpoDevice from "expo-device";
import { PermissionsAndroid, Platform } from "react-native";
import { BleManager, BleManagerOptions, BleRestoredState } from "react-native-ble-plx";

const bleManagerOptions: BleManagerOptions = {
    restoreStateIdentifier: 'bleManagerRestoredState',
    restoreStateFunction: (bleRestoredState: BleRestoredState | null) => {
        if (bleRestoredState == null) {
            console.log(`No restored state for BleManager`);
            // BleManager was constructed for the first time.
        } else {
            console.log(`State was restored! ${JSON.stringify(bleRestoredState)}`);
            // BleManager was restored. Check `bleRestoredState.connectedPeripherals` property.
        }
    },
};

export const bleManager = new BleManager(bleManagerOptions);

const requestAndroid31Permissions = async () => {
    const bluetoothScanPermission = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        {
            title: "Location Permission",
            message: "Bluetooth Low Energy requires Location",
            buttonPositive: "OK",
        }
    );
    const bluetoothConnectPermission = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        {
            title: "Location Permission",
            message: "Bluetooth Low Energy requires Location",
            buttonPositive: "OK",
        }
    );
    const fineLocationPermission = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
            title: "Location Permission",
            message: "Bluetooth Low Energy requires Location",
            buttonPositive: "OK",
        }
    );

    return (
        bluetoothScanPermission === "granted" &&
        bluetoothConnectPermission === "granted" &&
        fineLocationPermission === "granted"
    );
};

export const requestPermissions = async () => {
    if (Platform.OS === "android") {
        if ((ExpoDevice.platformApiLevel ?? -1) < 31) {
            const granted = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                {
                    title: "Location Permission",
                    message: "Bluetooth Low Energy requires Location",
                    buttonPositive: "OK",
                }
            );
            return granted === PermissionsAndroid.RESULTS.GRANTED;
        } else {
            const isAndroid31PermissionsGranted =
                await requestAndroid31Permissions();

            return isAndroid31PermissionsGranted;
        }
    } else {
        return true;
    }
};