import { ThemedText } from "@/components/themed-text";
import { BLE_GATT_CPF_FORMAT_BOOLEAN, BLE_GATT_CPF_FORMAT_UTF8S, getCharacteristicName, getServiceName } from "@/constants/bluetooth";
import { useBluetooth } from "@/context/bluetooth-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Link } from "expo-router";
import React, { useState } from "react";
import { Button, ScrollView, Switch, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// UUIDs for McuMgr service and characteristic
const MCUMGR_SERVICE_UUID = "8d53dc1d-1db7-4cd3-868b-8a527460aa84";
const MCUMGR_CHARACTERISTIC_UUID = "da2e7828-fbce-4e01-ae9e-261174997c48";



export default function DeviceStateScreen() {
    const { selectedDevice } = useBluetooth();
    const tabBarHeight = useBottomTabBarHeight();
    const [charValues, setCharValues] = useState<Record<string, any>>({});

    if (selectedDevice != null) {
        console.log(`Connected to device: ${selectedDevice.name}`);
    }

    function renderCharacteristicInput(charUuid: string, charInfo: any) {
        if (charInfo.cpfFormat === BLE_GATT_CPF_FORMAT_BOOLEAN) {
            return (
                <Switch
                    value={charValues[charUuid] ?? false}
                    onValueChange={(value) => {
                        console.log(`Toggle changed to: ${value}`);
                        setCharValues(prev => ({ ...prev, [charUuid]: value }));
                    }}
                />
            );
        }

        if (charInfo.cpfFormat === BLE_GATT_CPF_FORMAT_UTF8S) {
            return (
                <TextInput
                    style={{
                        borderWidth: 1,
                        borderColor: '#ccc',
                        borderRadius: 4,
                        padding: 4,
                        minWidth: 100,
                        color: '#fff',
                    }}
                    placeholder="Enter value"
                    placeholderTextColor="#888"
                    value={charValues[charUuid] ?? ''}
                    onChangeText={(text) => {
                        console.log(`Text changed to: ${text}`);
                        setCharValues(prev => ({ ...prev, [charUuid]: text }));
                    }}
                />
            );
        }

        return null;
    }

    return (
        <SafeAreaView
            style={{ flex: 1, overflow: 'hidden' }}>
            <ThemedText>
                {selectedDevice == null ? "NOT CONNECTED" : selectedDevice.name}
            </ThemedText>

            <View style={{ height: 1, backgroundColor: '#ccc', marginVertical: 16 }} />

            <ScrollView contentContainerStyle={{ paddingBottom: tabBarHeight }}>
                {
                    selectedDevice?.services.map((service, index) => {
                        return (
                            <View key={service.uuid + `-service-details-` + String(index)}>
                                <ThemedText
                                    key={service.uuid + `-` + String(index)}>
                                    {`Service ` + getServiceName(service.uuid) + `:`}
                                </ThemedText>

                                {Object.entries(selectedDevice?.characteristicsByService[service.uuid] ?? {}).map(([charUuid, charInfo], charIndex) => {
                                    const isMcuMgrCharacteristic = service.uuid === MCUMGR_SERVICE_UUID && charUuid === MCUMGR_CHARACTERISTIC_UUID;

                                    return (
                                        <View
                                            key={`${service.uuid}-char-${charIndex}`}
                                            style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 16, marginVertical: 4 }}>
                                            <ThemedText style={{ fontSize: 12, flex: 1 }}>
                                                {charInfo.name ?? getCharacteristicName(charUuid)}
                                            </ThemedText>
                                            {isMcuMgrCharacteristic && (
                                                <Link href="/firmware-update-modal" asChild>
                                                    <Button title="Update" onPress={() => { }} />
                                                </Link>
                                            )}
                                            {renderCharacteristicInput(charUuid, charInfo)}
                                        </View>
                                    );
                                })}

                                {index < (selectedDevice?.services.length ?? 0) - 1 && (
                                    <View style={{ height: 1, backgroundColor: '#ccc', marginVertical: 16 }} />
                                )}
                            </View>
                        )
                    })
                }
            </ScrollView>

        </SafeAreaView>
    );
}