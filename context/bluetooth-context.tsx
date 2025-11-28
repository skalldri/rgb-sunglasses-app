import { createContext, ReactNode, useContext, useState } from "react";


export type Device = {
    name: string;
};

type BluetoothContextType = {
    selectedDevice: Device | null;
    setSelectedDevice: (device: Device | null) => void;
};

const BluetoothContext = createContext<BluetoothContextType | undefined>(undefined);


export function BluetoothProvider({ children }: { children: ReactNode }) {
    const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);

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