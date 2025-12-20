import { getCharacteristicName, getDescriptorName, getServiceName, getUuidForCpfDescriptor, getUuidForCudDescriptor } from "@/constants/bluetooth";
import { useBluetooth } from "@/context/bluetooth-context";
import { bleManager } from "@/hooks/use-ble";
import { useState } from "react";
import { ActivityIndicator, Button, View } from "react-native";
import { ThemedText } from "./themed-text";

interface Props {
    deviceName: string;
    macAddress: string;
    key: string | number;
}

export default function BluetoothDeviceListItem({ key, deviceName, macAddress }: Props) {

    const { selectedDevice, setSelectedDevice } = useBluetooth();
    const [canPress, setCanPress] = useState<boolean>(true); // Prevent clicking the button while the long pairing process is active

    function isSelected() {
        return selectedDevice?.mac === macAddress;
    }

    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <ThemedText style={{ flex: 1 }}>
                {deviceName}
            </ThemedText>
            <ThemedText style={{ flex: 1, fontSize: 12, opacity: 0.6 }}>
                {macAddress}
            </ThemedText>
            <View style={{ position: 'relative' }}>
                <Button
                    title={isSelected() ? "Disconnect" : "Connect"}
                    disabled={!canPress}
                    onPress={async () => {
                        setCanPress(false);
                        if (isSelected()) {
                            console.log(`Disconnecting from device: ${deviceName} (${macAddress})`);
                            await bleManager.cancelDeviceConnection(macAddress);
                        } else {
                            console.log(`Pairing with device: ${deviceName} (${macAddress})`);

                            const deviceConnection = await bleManager.connectToDevice(macAddress);

                            await deviceConnection.discoverAllServicesAndCharacteristics();

                            const services = await deviceConnection.services();

                            // Build mapping of service UUID -> characteristics (by UUID)
                            const characteristicsByService: Record<string, Record<string, any>> = {};
                            if (services) {
                                for (const service of services) {
                                    const characteristics = await deviceConnection.characteristicsForService(service.uuid);
                                    const characteristicInfos: Record<string, any> = {};

                                    for (const characteristic of characteristics) {
                                        const descriptors = await service.descriptorsForCharacteristic(characteristic.uuid);
                                        console.log(`Characteristic: ${getCharacteristicName(characteristic.uuid)}, Descriptors: ${descriptors.length}`);

                                        const charInfo: any = {
                                            characteristic,
                                            name: null,
                                            cpfFormat: null,
                                        };

                                        for (const descriptor of descriptors) {
                                            console.log(`Descriptor UUID: ${getDescriptorName(descriptor.uuid)}`);
                                            const readDescriptor = await descriptor.read();
                                            console.log(`Descriptor Value: ${readDescriptor.value}`);

                                            if (descriptor.uuid === getUuidForCudDescriptor()) {
                                                charInfo.name = atob(readDescriptor.value || '');
                                                console.log(`CUD Descriptor Value (decoded): ${charInfo.name}`);
                                            }

                                            if (descriptor.uuid === getUuidForCpfDescriptor()) {
                                                const decoded = atob(readDescriptor.value || '');
                                                charInfo.cpfFormat = decoded.charCodeAt(0);
                                                const hex = Array.from(decoded, char => char.charCodeAt(0).toString(16).padStart(2, '0')).join(' ');
                                                console.log(`CPF Descriptor Value (hex): ${hex}`);
                                            }
                                        }

                                        characteristicInfos[characteristic.uuid] = charInfo;
                                    }

                                    characteristicsByService[service.uuid] = characteristicInfos;
                                    console.log(`Service UUID: ${getServiceName(service.uuid)}, Characteristics: ${Object.keys(characteristicInfos).length}`);
                                }
                            }

                            setSelectedDevice({
                                name: deviceName,
                                mac: macAddress,
                                device: deviceConnection,
                                services: services,
                                characteristicsByService: characteristicsByService,
                            });

                            bleManager.stopDeviceScan();

                            console.log(`Pairing complete`);
                            setCanPress(true);
                        }
                    }}
                />
                {!canPress && (
                    <View style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        justifyContent: 'center',
                        alignItems: 'center',
                    }}>
                        <ActivityIndicator size="small" color="#fff" />
                    </View>
                )}
            </View>
        </View>
    );
}