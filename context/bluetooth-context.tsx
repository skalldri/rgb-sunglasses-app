import { McuMgrClient } from "@/services/mcumgr";
import { createContext, ReactNode, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Characteristic, Device, Service, Subscription } from "react-native-ble-plx";

export interface CharacteristicInfo {
    characteristic: Characteristic;
    value: string | null;
    name: string | null;
    cpfFormat: number | null;
    isUpdateInProgress: boolean;
}

export type BluetoothContextDevice = {
    name: string;
    mac: string;
    device: Device;
    services: Service[];
    characteristicsByService: Record<string, Record<string, CharacteristicInfo>>;
    mcuMgrClient?: McuMgrClient;
};

type BluetoothContextType = {
    selectedDevice: BluetoothContextDevice | null;
    setSelectedDevice: (device: BluetoothContextDevice | null) => void;
    isScanning: boolean;
    setIsScanning: (scanning: boolean) => void;
    writeToCharacteristic: (charUuid: string, newEncodedValue: string) => Promise<boolean>;
    getCharacteristicInfo: (charUuid: string) => CharacteristicInfo | null;
    updateCharValue: (charUuid: string, newValue: string) => void;
    // Monitor subscription management (persists across navigation)
    monitorSubscriptions: React.MutableRefObject<Subscription[]>;
    disconnectSubscription: React.MutableRefObject<Subscription | null>;
};

const BluetoothContext = createContext<BluetoothContextType | undefined>(undefined);


export function BluetoothProvider({ children }: { children: ReactNode }) {
    const [selectedDevice, setSelectedDevice] = useState<BluetoothContextDevice | null>(null);
    const [isScanning, setIsScanning] = useState<boolean>(false);

    // Use ref to access current device in callbacks without stale closures
    const selectedDeviceRef = useRef<BluetoothContextDevice | null>(null);
    selectedDeviceRef.current = selectedDevice;

    // Store subscriptions at context level so they persist across navigation
    const monitorSubscriptions = useRef<Subscription[]>([]);
    const disconnectSubscription = useRef<Subscription | null>(null);

    // Helper to find which service contains a characteristic
    const findServiceUuidForChar = useCallback((charUuid: string): string | undefined => {
        const device = selectedDeviceRef.current;
        if (!device) return undefined;
        return Object.keys(device.characteristicsByService).find(
            svc => device.characteristicsByService[svc][charUuid]
        );
    }, []);

    // Helper to get characteristic info by UUID
    const getCharacteristicInfo = useCallback((charUuid: string): CharacteristicInfo | null => {
        const device = selectedDeviceRef.current;
        if (!device) return null;
        const serviceUuid = findServiceUuidForChar(charUuid);
        if (!serviceUuid) return null;
        return device.characteristicsByService[serviceUuid][charUuid] ?? null;
    }, [findServiceUuidForChar]);

    // Helper to update characteristic value in context
    const updateCharValue = useCallback((charUuid: string, newValue: string) => {
        setSelectedDevice(prevDevice => {
            if (!prevDevice) return null;
            const serviceUuid = Object.keys(prevDevice.characteristicsByService).find(
                svc => prevDevice.characteristicsByService[svc][charUuid]
            );
            if (!serviceUuid) return prevDevice;

            return {
                ...prevDevice,
                characteristicsByService: {
                    ...prevDevice.characteristicsByService,
                    [serviceUuid]: {
                        ...prevDevice.characteristicsByService[serviceUuid],
                        [charUuid]: {
                            ...prevDevice.characteristicsByService[serviceUuid][charUuid],
                            value: newValue
                        }
                    }
                }
            };
        });
    }, []);

    // Helper to set isUpdateInProgress flag
    const setCharUpdateInProgress = useCallback((charUuid: string, inProgress: boolean) => {
        setSelectedDevice(prevDevice => {
            if (!prevDevice) return null;
            const serviceUuid = Object.keys(prevDevice.characteristicsByService).find(
                svc => prevDevice.characteristicsByService[svc][charUuid]
            );
            if (!serviceUuid) return prevDevice;

            return {
                ...prevDevice,
                characteristicsByService: {
                    ...prevDevice.characteristicsByService,
                    [serviceUuid]: {
                        ...prevDevice.characteristicsByService[serviceUuid],
                        [charUuid]: {
                            ...prevDevice.characteristicsByService[serviceUuid][charUuid],
                            isUpdateInProgress: inProgress
                        }
                    }
                }
            };
        });
    }, []);

    // Write to a characteristic and update context state
    // Returns true on success, false on failure
    const writeToCharacteristic = useCallback(async (charUuid: string, newEncodedValue: string): Promise<boolean> => {
        const charInfo = getCharacteristicInfo(charUuid);
        if (!charInfo) {
            console.log(`Characteristic ${charUuid} not found`);
            return false;
        }

        setCharUpdateInProgress(charUuid, true);

        try {
            await charInfo.characteristic.writeWithResponse(newEncodedValue);
            updateCharValue(charUuid, newEncodedValue);
            return true;
        } catch (error) {
            console.log(`Error writing value to characteristic ${charUuid}: ${error}`);
            return false;
        } finally {
            setCharUpdateInProgress(charUuid, false);
        }
    }, [getCharacteristicInfo, setCharUpdateInProgress, updateCharValue]);

    const contextValue = useMemo(() => ({
        selectedDevice,
        setSelectedDevice,
        isScanning,
        setIsScanning,
        writeToCharacteristic,
        getCharacteristicInfo,
        updateCharValue,
        monitorSubscriptions,
        disconnectSubscription,
    }), [selectedDevice, isScanning, writeToCharacteristic, getCharacteristicInfo, updateCharValue]);

    return (
        <BluetoothContext.Provider value={contextValue}>
            {children}
        </BluetoothContext.Provider>
    );
}

export function useBluetooth(): BluetoothContextType {
    const context = useContext(BluetoothContext);
    if (!context) throw new Error('useBluetooth must be used within BluetoothProvider');
    return context;
}