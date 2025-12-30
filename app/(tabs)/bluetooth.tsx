import BluetoothDeviceListItem from "@/components/bluetooth-device-list-item";
import ParallaxScrollView from "@/components/parallax-scroll-view";
import { ThemedText } from "@/components/themed-text";
import { Image } from 'expo-image';
import { useState } from "react";
import { Button, ScrollView, StyleSheet } from 'react-native';

import { useBluetooth } from "@/context/bluetooth-context";
import { bleManager, requestPermissions } from "@/hooks/use-ble";
import { LogLevel } from "react-native-ble-plx";

type BleDevice = {
    name: string;
    mac: string;
};

export default function BluetoothScreen() {

    // Declare app state. App "state" is how we build reactive UIs.
    // 1. State is declared and has an "initial state". Alongside the state variable, 
    // a modifier function is also declared.
    // 2. The HTML / DOM is declared such that it depends on the state variable
    // 3. The application modifies the state variable using the declared function
    // 4. React automatically re-renders the app using the updated state variables 
    const { isScanning, setIsScanning } = useBluetooth();
    const [devices, setDevices] = useState<BleDevice[]>([]);

    /**
     * 
     * @param mac De-duplicate devices
     */
    function isDuplicateDevice(allDevices: BleDevice[], newMac: string) {
        return allDevices.findIndex((d) => d.mac === newMac) >= 0;
    }

    async function DoBluetoothScan() {
        console.log('Starting Bluetooth scan...');
        setIsScanning(true);
        setDevices([]);
        await requestPermissions();

        bleManager.setLogLevel(LogLevel.Verbose);

        await bleManager.startDeviceScan(null, null, (error, device) => {
            if (error) {
                console.log(error);
            }

            if (device) {
                if (device.localName?.includes("RGB Sunglasses")) {
                    console.log(`Found device: ${device.name ?? 'Unnamed'} (${device.id})`);

                    setDevices((prevDevices) => {

                        if (!isDuplicateDevice(prevDevices, device.id)) {
                            return [...prevDevices, { name: device.localName ?? 'Unnamed', mac: device.id }];
                        }

                        return prevDevices;
                    });
                }
            }
        });

        // Check if any devices are already paired with the OS with the "Core Config Service" UUID
        const connectedDevices = await bleManager.connectedDevices(["12345678-1234-5678-0001-56789abc0000"]);

        for (const device of connectedDevices) {
            console.log(`Already connected to device: ${device.name ?? 'Unnamed'} (${device.id})`);

            if (device.localName?.includes("RGB Sunglasses") || device.name?.includes("RGB Sunglasses")) {
                console.log(`Already connected to device: is an RGB Sunglasses!`);

                setDevices((prevDevices) => {

                    if (!isDuplicateDevice(prevDevices, device.id)) {
                        return [...prevDevices, { name: device.localName ?? device.name ?? 'Unnamed', mac: device.id }];
                    }

                    return prevDevices;
                });
            }
        }
    }

    return (
        <ParallaxScrollView
            headerBackgroundColor={{ light: '#A1CEDC', dark: '#1D3D47' }}
            headerImage={
                <Image
                    source={require('@/assets/images/partial-react-logo.png')}
                    style={styles.reactLogo}
                />
            }
        >
            <ThemedText>
                {`Connect to the RGB Sunglasses`}
            </ThemedText>

            <Button
                onPress={DoBluetoothScan}
                title={isScanning ? "Scanning..." : "Scan for Bluetooth Devices"}
                disabled={isScanning}
            />

            <ScrollView>
                {devices.map(device => (
                    <BluetoothDeviceListItem
                        key={device.mac}
                        deviceName={device.name}
                        macAddress={device.mac}
                    />
                ))}

            </ScrollView>

        </ParallaxScrollView>
    );
}

const styles = StyleSheet.create({
    titleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    stepContainer: {
        gap: 8,
        marginBottom: 8,
    },
    reactLogo: {
        height: 178,
        width: 290,
        bottom: 0,
        left: 0,
        position: 'absolute',
    },
});
