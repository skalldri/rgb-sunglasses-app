import { McuMgrClient } from "@/services/mcumgr";
import { createContext, ReactNode, useContext, useState } from "react";
import { Device, Service } from "react-native-ble-plx";


export type BluetoothContextDevice = {
    name: string;
    mac: string;
    device: Device;
    services: Service[];
    characteristicsByService: Record<string, Record<string, any>>;
    mcuMgrClient?: McuMgrClient;
};

type BluetoothContextType = {
    selectedDevice: BluetoothContextDevice | null;
    setSelectedDevice: (device: BluetoothContextDevice | null) => void;
};

const BluetoothContext = createContext<BluetoothContextType | undefined>(undefined);


export function BluetoothProvider({ children }: { children: ReactNode }) {
    const [selectedDevice, setSelectedDevice] = useState<BluetoothContextDevice | null>(null);

    return (
        <BluetoothContext.Provider value={{ selectedDevice, setSelectedDevice }}>
            {children}
        </BluetoothContext.Provider>
    );
}

export function useBluetooth() {
    const context = useContext(BluetoothContext);
    if (!context) throw new Error('useBluetooth must be used within BluetoothProvider');
    return context;
}