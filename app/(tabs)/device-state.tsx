import { ThemedText } from "@/components/themed-text";
import { useBluetooth } from "@/context/bluetooth-context";
import React from "react";
import { SafeAreaView } from "react-native-safe-area-context";


export default function DeviceStateScreen() {
    const { selectedDevice } = useBluetooth();

    return (
        <SafeAreaView>
            <ThemedText>
                {selectedDevice == null ? "NOT CONNECTED" : selectedDevice.name}
            </ThemedText>
        </SafeAreaView>
    );
}