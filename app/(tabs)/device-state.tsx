import { ThemedText } from "@/components/themed-text";
import { BLE_GATT_CPF_FORMAT_BOOLEAN, BLE_GATT_CPF_FORMAT_CUSTOM_COLOR, BLE_GATT_CPF_FORMAT_UINT32, BLE_GATT_CPF_FORMAT_UTF8S, getCharacteristicName, getServiceName } from "@/constants/bluetooth";
import { CharacteristicInfo, useBluetooth } from "@/context/bluetooth-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Link } from "expo-router";
import React, { useEffect, useState } from "react";
import { Button, KeyboardAvoidingView, Platform, ScrollView, Switch, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// UUIDs for McuMgr service and characteristic
const MCUMGR_SERVICE_UUID = "8d53dc1d-1db7-4cd3-868b-8a527460aa84";
const MCUMGR_CHARACTERISTIC_UUID = "da2e7828-fbce-4e01-ae9e-261174997c48";



export default function DeviceStateScreen() {
    const { selectedDevice, setSelectedDevice } = useBluetooth();
    const tabBarHeight = useBottomTabBarHeight();

    // Local state for tracking pending input values (before BLE write)
    const [pendingValues, setPendingValues] = useState<Record<string, string>>({});
    // Track which device we've initialized for to avoid re-initializing on every update
    const [initializedDeviceId, setInitializedDeviceId] = useState<string | null>(null);

    if (selectedDevice != null) {
        console.log(`Connected to device: ${selectedDevice.name} `);
    }

    // Initialize pendingValues only when device changes (not on every characteristic update)
    useEffect(() => {
        if (!selectedDevice) {
            setInitializedDeviceId(null);
            setPendingValues({});
            return;
        }

        // Only initialize if this is a new device
        if (selectedDevice.mac === initializedDeviceId) {
            console.log(`Device ${selectedDevice.mac} already initialized, skipping`);
            return;
        }

        const initialValues: Record<string, string> = {};
        Object.entries(selectedDevice.characteristicsByService).forEach(([serviceUuid, chars]) => {
            Object.entries(chars).forEach(([charUuid, charInfo]) => {
                // Only initialize for text/numeric inputs (not boolean or color)
                if (charInfo.cpfFormat === BLE_GATT_CPF_FORMAT_UTF8S && charInfo.value) {
                    try {
                        initialValues[charUuid] = atob(charInfo.value);
                    } catch (e) {
                        console.log(`Error decoding UTF8 value for ${charUuid}:`, e);
                    }
                } else if (charInfo.cpfFormat === BLE_GATT_CPF_FORMAT_UINT32 && charInfo.value) {
                    try {
                        const decoded = atob(charInfo.value);
                        const value = (decoded.charCodeAt(0) & 0xFF) |
                            ((decoded.charCodeAt(1) & 0xFF) << 8) |
                            ((decoded.charCodeAt(2) & 0xFF) << 16) |
                            ((decoded.charCodeAt(3) & 0xFF) << 24);
                        initialValues[charUuid] = String(value);
                    } catch (e) {
                        console.log(`Error decoding UINT32 value for ${charUuid}:`, e);
                    }
                }
            });
        });

        setPendingValues(initialValues);
        setInitializedDeviceId(selectedDevice.mac);
    }, [initializedDeviceId, selectedDevice, selectedDevice?.mac]);

    // Helper to find which service contains a characteristic
    const findServiceUuidForChar = (charUuid: string): string | undefined => {
        if (!selectedDevice) return undefined;
        return Object.keys(selectedDevice.characteristicsByService).find(
            svc => selectedDevice.characteristicsByService[svc][charUuid]
        );
    };

    // Helper to update characteristic value in context (optimistic update)
    const updateCharValue = (charUuid: string, newValue: string, charInfo: CharacteristicInfo) => {
        if (!selectedDevice) return;
        const serviceUuid = findServiceUuidForChar(charUuid);
        if (!serviceUuid) return;

        const updatedDevice = {
            ...selectedDevice,
            characteristicsByService: {
                ...selectedDevice.characteristicsByService,
                [serviceUuid]: {
                    ...selectedDevice.characteristicsByService[serviceUuid],
                    [charUuid]: {
                        ...selectedDevice.characteristicsByService[serviceUuid][charUuid],
                        value: newValue
                    }
                }
            }
        };
        console.log(`CharacteristicInfo updated: ${JSON.stringify(updatedDevice.characteristicsByService[serviceUuid][charUuid])} `)
        setSelectedDevice(updatedDevice);
    };

    // Helper to set isUpdateInProgress flag
    const setCharUpdateInProgress = (charUuid: string, inProgress: boolean) => {
        if (!selectedDevice) return;
        const serviceUuid = findServiceUuidForChar(charUuid);
        if (!serviceUuid) return;

        const updatedDevice = {
            ...selectedDevice,
            characteristicsByService: {
                ...selectedDevice.characteristicsByService,
                [serviceUuid]: {
                    ...selectedDevice.characteristicsByService[serviceUuid],
                    [charUuid]: {
                        ...selectedDevice.characteristicsByService[serviceUuid][charUuid],
                        isUpdateInProgress: inProgress
                    }
                }
            }
        };
        setSelectedDevice(updatedDevice);
    };

    // Helper to write characteristic value to BLE with full promise chain
    const writeCharValue = (charUuid: string, charInfo: CharacteristicInfo, newEncodedValue: string, previousEncodedValue: string) => {
        setCharUpdateInProgress(charUuid, true);

        charInfo.characteristic.writeWithResponse(newEncodedValue)
            .then(() => {
                updateCharValue(charUuid, newEncodedValue, charInfo);
                setPendingValues(prev => ({ ...prev, [charUuid]: atob(newEncodedValue) }));
            })
            .catch((error) => {
                console.log(`Error writing value to characteristic ${charUuid}: ${error} `);
                // Revert value on error
                updateCharValue(charUuid, previousEncodedValue, charInfo);
                setPendingValues(prev => ({ ...prev, [charUuid]: atob(previousEncodedValue) }));
            })
            .finally(() => {
                setCharUpdateInProgress(charUuid, false);
            });
    };

    function renderCharacteristicInput(charUuid: string, charInfo: CharacteristicInfo) {
        if (charInfo.cpfFormat === BLE_GATT_CPF_FORMAT_BOOLEAN) {
            // Decode the boolean value from the characteristic
            let displayValue = false;
            if (charInfo.value) {
                try {
                    const decoded = atob(charInfo.value);
                    displayValue = decoded.charCodeAt(0) !== 0;
                } catch (e) {
                    console.log('Error decoding boolean value:', e);
                }
            }

            return (
                <Switch
                    value={displayValue}
                    disabled={charInfo.isUpdateInProgress}
                    onValueChange={(value) => {
                        console.log(`Toggle changed to: ${value} `);

                        const previousValue = charInfo.value ?? '';
                        const boolByte = value ? 1 : 0;
                        const encoded = btoa(String.fromCharCode(boolByte));

                        // Write to BLE - writeCharValue will update on success and revert on failure
                        writeCharValue(charUuid, charInfo, encoded, previousValue);
                    }}
                />
            );
        }

        if (charInfo.cpfFormat === BLE_GATT_CPF_FORMAT_UTF8S) {
            // Use local pending value during editing
            const displayValue = pendingValues[charUuid] ?? '';

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
                    editable={!charInfo.isUpdateInProgress}
                    value={displayValue}
                    onChangeText={(text) => {
                        // Update local state only - don't update BLE value yet
                        setPendingValues(prev => ({ ...prev, [charUuid]: text }));
                    }}
                    onSubmitEditing={() => {
                        const previousValue = charInfo.value ?? '';
                        const encoded = btoa(displayValue);
                        writeCharValue(charUuid, charInfo, encoded, previousValue);
                    }}
                />
            );
        }

        if (charInfo.cpfFormat === BLE_GATT_CPF_FORMAT_UINT32) {
            // Use local pending value during editing
            const displayValue = pendingValues[charUuid] ?? '';

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
                    editable={!charInfo.isUpdateInProgress}
                    value={displayValue}
                    onChangeText={(text) => {
                        // Only allow numeric input
                        const numericText = text.replace(/[^0-9]/g, '');
                        // Update local state only - don't update BLE value yet
                        setPendingValues(prev => ({ ...prev, [charUuid]: numericText }));
                    }}
                    onSubmitEditing={() => {
                        const previousValue = charInfo.value ?? '';
                        const numericValue = parseInt(displayValue, 10);

                        if (!isNaN(numericValue)) {
                            // Convert uint32 to 4 bytes (little-endian)
                            const byte0 = numericValue & 0xFF;
                            const byte1 = (numericValue >> 8) & 0xFF;
                            const byte2 = (numericValue >> 16) & 0xFF;
                            const byte3 = (numericValue >> 24) & 0xFF;
                            const encoded = btoa(String.fromCharCode(byte0, byte1, byte2, byte3));

                            writeCharValue(charUuid, charInfo, encoded, previousValue);
                        } else {
                            console.log(`Invalid number input: ${displayValue} `);
                        }
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
                    <Link href={`/ color - picker - modal ? r = ${r}& g=${g}& b=${b}& charUuid=${charUuid} `} asChild>
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
                                <View key={service.uuid + `- service - details - ` + String(index)}>
                                    <ThemedText
                                        key={service.uuid + `- ` + String(index)}>
                                        {`Service ` + getServiceName(service.uuid) + `: `}
                                    </ThemedText>

                                    {Object.entries(selectedDevice?.characteristicsByService[service.uuid] ?? {}).map(([charUuid, charInfo], charIndex) => {
                                        const isMcuMgrCharacteristic = service.uuid === MCUMGR_SERVICE_UUID && charUuid === MCUMGR_CHARACTERISTIC_UUID;

                                        return (
                                            <View
                                                key={`${service.uuid} -char - ${charIndex} `}
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