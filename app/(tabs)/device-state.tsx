import { ThemedText } from "@/components/themed-text";
import { BLE_GATT_CPF_FORMAT_BOOLEAN, BLE_GATT_CPF_FORMAT_CUSTOM_COLOR, BLE_GATT_CPF_FORMAT_UINT32, BLE_GATT_CPF_FORMAT_UTF8S, getCharacteristicName, getServiceName } from "@/constants/bluetooth";
import { CharacteristicInfo, useBluetooth } from "@/context/bluetooth-context";
import { decodeBooleanFromBase64, decodeColorFromBase64, decodeUint32FromBase64, decodeUtf8FromBase64, encodeBooleanToBase64, encodeUint32ToBase64, encodeUtf8ToBase64, sanitizeNumericInput } from "@/services/ble-value-codec";
import { SMP_CHARACTERISTIC_UUID, SMP_SERVICE_UUID } from "@/services/mcumgr";
import { Link } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Animated, Button, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";


export default function DeviceStateScreen() {
    const { selectedDevice, writeToCharacteristic } = useBluetooth();

    // Local state for tracking pending input values (before BLE write)
    const [pendingValues, setPendingValues] = useState<Record<string, string>>({});
    // Track which device we've initialized for to avoid re-initializing on every update
    const [initializedDeviceId, setInitializedDeviceId] = useState<string | null>(null);
    // Track write status for each characteristic (success/error/null)
    const [writeStatus, setWriteStatus] = useState<Record<string, 'success' | 'error' | null>>({});
    // Track animation values for color fade
    const fadeAnims = useRef<Record<string, Animated.Value>>({});

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
                        initialValues[charUuid] = decodeUtf8FromBase64(charInfo.value);
                    } catch (e) {
                        console.log(`Error decoding UTF8 value for ${charUuid}:`, e);
                    }
                } else if (charInfo.cpfFormat === BLE_GATT_CPF_FORMAT_UINT32 && charInfo.value) {
                    try {
                        initialValues[charUuid] = String(decodeUint32FromBase64(charInfo.value));
                    } catch (e) {
                        console.log(`Error decoding UINT32 value for ${charUuid}:`, e);
                    }
                }
            });
        });

        setPendingValues(initialValues);
        setInitializedDeviceId(selectedDevice.mac);
    }, [initializedDeviceId, selectedDevice, selectedDevice?.mac]);

    // Helper to trigger write status animation
    function triggerStatusAnimation(charUuid: string, status: 'success' | 'error') {
        // Initialize fade animation if not exists
        if (!fadeAnims.current[charUuid]) {
            fadeAnims.current[charUuid] = new Animated.Value(1);
        }

        // Set status
        setWriteStatus(prev => ({ ...prev, [charUuid]: status }));

        // Reset animation value to 1 (full color)
        fadeAnims.current[charUuid].setValue(1);

        // Fade to 0 over 1 second
        Animated.timing(fadeAnims.current[charUuid], {
            toValue: 0,
            duration: 1000,
            useNativeDriver: false,
        }).start(() => {
            // Clear status after animation completes
            setWriteStatus(prev => ({ ...prev, [charUuid]: null }));
        });
    }

    function decodeValueForInput(cpfFormat: number | null, encodedValue: string, charUuid: string): string {
        try {
            if (cpfFormat === BLE_GATT_CPF_FORMAT_UINT32) {
                return String(decodeUint32FromBase64(encodedValue));
            }
            if (cpfFormat === BLE_GATT_CPF_FORMAT_UTF8S) {
                return decodeUtf8FromBase64(encodedValue);
            }
            return decodeUtf8FromBase64(encodedValue);
        } catch (error) {
            console.log(`Error decoding value for ${charUuid}:`, error);
            return '';
        }
    }

    // Helper to write characteristic value to BLE with UI feedback
    async function writeCharValue(charUuid: string, newEncodedValue: string, previousEncodedValue: string) {
        const success = await writeToCharacteristic(charUuid, newEncodedValue);

        // Get the characteristic info using the flat lookup
        const charInfo = selectedDevice?.characteristics?.[charUuid] ?? null;

        if (success) {
            const decodedValue = decodeValueForInput(charInfo?.cpfFormat ?? null, newEncodedValue, charUuid);

            setPendingValues(prev => ({ ...prev, [charUuid]: decodedValue }));
            triggerStatusAnimation(charUuid, 'success');
        } else {
            const decodedPreviousValue = decodeValueForInput(charInfo?.cpfFormat ?? null, previousEncodedValue, charUuid);

            setPendingValues(prev => ({ ...prev, [charUuid]: decodedPreviousValue }));
            triggerStatusAnimation(charUuid, 'error');
        }
    }

    function renderCharacteristicInput(charUuid: string, charInfo: CharacteristicInfo) {
        if (charInfo.cpfFormat === BLE_GATT_CPF_FORMAT_BOOLEAN) {
            // Decode the boolean value from the characteristic
            let displayValue = false;
            if (charInfo.value) {
                try {
                    displayValue = decodeBooleanFromBase64(charInfo.value);
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
                        const encoded = encodeBooleanToBase64(value);

                        // Write to BLE - writeCharValue will update on success and revert on failure
                        writeCharValue(charUuid, encoded, previousValue);
                    }}
                />
            );
        }

        if (charInfo.cpfFormat === BLE_GATT_CPF_FORMAT_UTF8S) {
            // Use local pending value during editing
            const displayValue = pendingValues[charUuid] ?? '';

            return (
                <TextInput
                    style={styles.textInput}
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
                        const encoded = encodeUtf8ToBase64(displayValue);
                        writeCharValue(charUuid, encoded, previousValue);
                    }}
                />
            );
        }

        if (charInfo.cpfFormat === BLE_GATT_CPF_FORMAT_UINT32) {
            // Use local pending value during editing
            const displayValue = pendingValues[charUuid] ?? '';

            return (
                <TextInput
                    style={styles.textInput}
                    placeholder="Enter number"
                    placeholderTextColor="#888"
                    keyboardType="numeric"
                    editable={!charInfo.isUpdateInProgress}
                    value={displayValue}
                    onChangeText={(text) => {
                        // Only allow numeric input
                        const numericText = sanitizeNumericInput(text);
                        // Update local state only - don't update BLE value yet
                        setPendingValues(prev => ({ ...prev, [charUuid]: numericText }));
                    }}
                    onSubmitEditing={() => {
                        const previousValue = charInfo.value ?? '';
                        const numericValue = parseInt(displayValue, 10);

                        if (!isNaN(numericValue)) {
                            const encoded = encodeUint32ToBase64(numericValue);

                            writeCharValue(charUuid, encoded, previousValue);
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
            try {
                const color = decodeColorFromBase64(charInfo.value);
                r = color.r;
                g = color.g;
                b = color.b;
            } catch (e) {
                console.log('Error decoding custom color value:', e);
            }

            return (
                <View style={styles.colorPickerContainer}>
                    <View style={[styles.colorPreview, { backgroundColor: `rgb(${r}, ${g}, ${b})` }]} />
                    <Link href={`/color-picker-modal?r=${r}&g=${g}&b=${b}&charUuid=${charUuid}`} asChild>
                        <Button title="Pick Color" onPress={() => { }} />
                    </Link>
                </View>
            );
        }

        return null;
    }

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView
                style={styles.container}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={50}>
                <ThemedText>
                    {selectedDevice == null ? "NOT CONNECTED" : selectedDevice.name}
                </ThemedText>

                <View style={styles.separator} />

                <ScrollView contentContainerStyle={styles.scrollContent}>
                    {
                        selectedDevice?.services.map((service, index) => {
                            return (
                                <View key={service.uuid + `- service - details - ` + String(index)}>
                                    <ThemedText
                                        key={service.uuid + `- ` + String(index)}>
                                        {getServiceName(service.uuid)}
                                    </ThemedText>

                                    {Object.entries(selectedDevice?.characteristicsByService[service.uuid] ?? {}).map(([charUuid, charInfo], charIndex) => {
                                        const isMcuMgrCharacteristic = service.uuid === SMP_SERVICE_UUID && charUuid === SMP_CHARACTERISTIC_UUID;

                                        // Get animated color for this characteristic
                                        const status = writeStatus[charUuid];
                                        const fadeValue = fadeAnims.current[charUuid];

                                        // Interpolate color based on status and fade value
                                        const textColor = status && fadeValue
                                            ? fadeValue.interpolate({
                                                inputRange: [0, 1],
                                                outputRange: ['#ffffff', status === 'success' ? '#00ff00' : '#ff0000']
                                            })
                                            : '#ffffff';

                                        return (
                                            <View
                                                key={`${service.uuid} -char - ${charIndex} `}
                                                style={styles.characteristicRow}>
                                                <Animated.Text style={[styles.characteristicLabel, { color: textColor }]}>
                                                    {charInfo.name ?? getCharacteristicName(charUuid)}
                                                </Animated.Text>
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
                                        <View style={styles.separator} />
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

const styles = StyleSheet.create({
    container: {
        flex: 1,
        overflow: 'hidden',
    },
    separator: {
        height: 1,
        backgroundColor: '#ccc',
        marginVertical: 16,
    },
    scrollContent: {
        paddingBottom: 0,
    },
    characteristicRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginLeft: 16,
        marginVertical: 4,
    },
    characteristicLabel: {
        fontSize: 12,
        flexShrink: 1,
        marginRight: 8,
    },
    textInput: {
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 4,
        padding: 4,
        flex: 1,
        minWidth: 80,
        color: '#fff',
    },
    colorPickerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    colorPreview: {
        width: 32,
        height: 32,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#ccc',
    },
});
