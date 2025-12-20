import { ThemedText } from "@/components/themed-text";
import { BLE_GATT_CPF_FORMAT_BOOLEAN, BLE_GATT_CPF_FORMAT_UTF8S, getCharacteristicName, getServiceName } from "@/constants/bluetooth";
import { useBluetooth } from "@/context/bluetooth-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import React, { useState } from "react";
import { ScrollView, Switch, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";



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
                                    return (
                                        <View
                                            key={`${service.uuid}-char-${charIndex}`}
                                            style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 16, marginVertical: 4 }}>
                                            <ThemedText style={{ fontSize: 12, flex: 1 }}>
                                                {charInfo.name ?? getCharacteristicName(charUuid)}
                                            </ThemedText>
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