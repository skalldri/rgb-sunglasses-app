import { ThemedText } from "@/components/themed-text";
import { BLE_GATT_CPF_FORMAT_BOOLEAN, BLE_GATT_CPF_FORMAT_CUSTOM_COLOR, BLE_GATT_CPF_FORMAT_UINT32, BLE_GATT_CPF_FORMAT_UTF8S, getCharacteristicName, getServiceName } from "@/constants/bluetooth";
import { useBluetooth } from "@/context/bluetooth-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Link } from "expo-router";
import React, { useState } from "react";
import { Button, KeyboardAvoidingView, Platform, ScrollView, Switch, TextInput, View } from "react-native";
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
            // Decode the boolean value from the characteristic if available
            let initialValue = false;
            if (charInfo.value && charValues[charUuid] === undefined) {
                try {
                    const decoded = atob(charInfo.value);
                    initialValue = decoded.charCodeAt(0) !== 0;
                } catch (e) {
                    console.log('Error decoding boolean value:', e);
                }
            }

            return (
                <Switch
                    value={charValues[charUuid] ?? initialValue}
                    onValueChange={(value) => {
                        console.log(`Toggle changed to: ${value}`);
                        setCharValues(prev => ({ ...prev, [charUuid]: value }));
                    }}
                />
            );
        }

        if (charInfo.cpfFormat === BLE_GATT_CPF_FORMAT_UTF8S) {
            // Decode the UTF8 string value from the characteristic if available
            let initialValue = '';
            if (charInfo.value && charValues[charUuid] === undefined) {
                try {
                    initialValue = atob(charInfo.value);
                } catch (e) {
                    console.log('Error decoding UTF8 value:', e);
                }
            }

            return (
                <TextInput
                    style={{
                        borderWidth: 1,
                        borderColor: '#ccc',
                        borderRadius: 4,
                        padding: 4,
                        flex: 1,
                        minWidth: 80,
                        color: '#fff',
                    }}
                    placeholder="Enter value"
                    placeholderTextColor="#888"
                    value={charValues[charUuid] ?? initialValue}
                    onChangeText={(text) => {
                        console.log(`Text changed to: ${text}`);
                        setCharValues(prev => ({ ...prev, [charUuid]: text }));
                    }}
                />
            );
        }

        if (charInfo.cpfFormat === BLE_GATT_CPF_FORMAT_UINT32) {
            // Decode the UINT32 value from the characteristic if available
            let initialValue = '';
            if (charInfo.value && charValues[charUuid] === undefined) {
                try {
                    const decoded = atob(charInfo.value);
                    // Convert bytes to uint32 (little-endian)
                    const value = (decoded.charCodeAt(0) & 0xFF) |
                        ((decoded.charCodeAt(1) & 0xFF) << 8) |
                        ((decoded.charCodeAt(2) & 0xFF) << 16) |
                        ((decoded.charCodeAt(3) & 0xFF) << 24);
                    initialValue = value.toString();
                } catch (e) {
                    console.log('Error decoding UINT32 value:', e);
                }
            }

            return (
                <TextInput
                    style={{
                        borderWidth: 1,
                        borderColor: '#ccc',
                        borderRadius: 4,
                        padding: 4,
                        flex: 1,
                        minWidth: 80,
                        color: '#fff',
                    }}
                    placeholder="Enter number"
                    placeholderTextColor="#888"
                    keyboardType="numeric"
                    value={charValues[charUuid] ?? initialValue}
                    onChangeText={(text) => {
                        // Only allow numeric input
                        const numericText = text.replace(/[^0-9]/g, '');
                        console.log(`Number changed to: ${numericText}`);
                        setCharValues(prev => ({ ...prev, [charUuid]: numericText }));
                    }}
                />
            );
        }

        if (charInfo.cpfFormat === BLE_GATT_CPF_FORMAT_CUSTOM_COLOR) {
            // Decode the UINT32 RGB value from the characteristic if available
            let r = 0, g = 0, b = 0;
            if (charInfo.value) {
                try {
                    const decoded = atob(charInfo.value);
                    // Convert bytes to uint32 (little-endian), lower 24 bits are RGB
                    const value = (decoded.charCodeAt(0) & 0xFF) |
                        ((decoded.charCodeAt(1) & 0xFF) << 8) |
                        ((decoded.charCodeAt(2) & 0xFF) << 16) |
                        ((decoded.charCodeAt(3) & 0xFF) << 24);
                    // Extract RGB from lower 24 bits
                    r = value & 0xFF;
                    g = (value >> 8) & 0xFF;
                    b = (value >> 16) & 0xFF;
                } catch (e) {
                    console.log('Error decoding custom color value:', e);
                }
            }

            return (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View
                        style={{
                            width: 32,
                            height: 32,
                            borderRadius: 6,
                            backgroundColor: `rgb(${r}, ${g}, ${b})`,
                            borderWidth: 1,
                            borderColor: '#ccc',
                        }}
                    />
                    <Link href={`/color-picker-modal?r=${r}&g=${g}&b=${b}&charUuid=${charUuid}`} asChild>
                        <Button title="Pick Color" onPress={() => { }} />
                    </Link>
                </View>
            );
        }

        return null;
    }

    return (
        <SafeAreaView
            style={{ flex: 1, overflow: 'hidden' }}>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={50}>
                <ThemedText>
                    {selectedDevice == null ? "NOT CONNECTED" : selectedDevice.name}
                </ThemedText>

                <View style={{ height: 1, backgroundColor: '#ccc', marginVertical: 16 }} />

                <ScrollView contentContainerStyle={{ paddingBottom: /*tabBarHeight*/ 0 }}>
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
                                                <ThemedText style={{ fontSize: 12, flexShrink: 1, marginRight: 8 }}>
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
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}