import BluetoothDeviceListItem from "@/components/bluetooth-device-list-item";
import ParallaxScrollView from "@/components/parallax-scroll-view";
import { ThemedText } from "@/components/themed-text";
import { Image } from 'expo-image';
import { useState } from "react";
import { Button, ScrollView, StyleSheet } from 'react-native';

import { requestPermissions } from "@/hooks/use-ble";

export default function BluetoothScreen() {

    // Declare app state. App "state" is how we build reactive UIs.
    // 1. State is declared and has an "initial state". Alongside the state variable, 
    // a modifier function is also declared.
    // 2. The HTML / DOM is declared such that it depends on the state variable
    // 3. The application modifies the state variable using the declared function
    // 4. React automatically re-renders the app using the updated state variables 
    const [isScanning, setIsScanning] = useState(false);
    const [devices, setDevices] = useState<Array<{ key: number, name: string }>>([]);


    async function DoBluetoothScan() {
        console.log('Starting Bluetooth scan...');
        setIsScanning(true);
        setDevices([]);
        await requestPermissions();

        await new Promise(resolve => setTimeout(resolve, 1000));

        setDevices([
            { name: "RGB Sunglasses", key: 0 },
            { name: "RGB Sunglasses 2", key: 1 }
        ]);

        console.log('Bluetooth scan complete');
        setIsScanning(false);
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
                {`Tap the Explore tab to learn more about what's included in this starter app.`}
            </ThemedText>

            <Button
                onPress={DoBluetoothScan}
                title={isScanning ? "Scanning..." : "Scan for Bluetooth Devices"}
                disabled={isScanning}
            />

            <ScrollView>
                {devices.map(device => (
                    <BluetoothDeviceListItem
                        key={device.key}
                        deviceName={device.name}
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
