import { useBluetooth } from "@/context/bluetooth-context";
import { Button, View } from "react-native";
import { ThemedText } from "./themed-text";



interface Props {
    deviceName: string;
    key: number;
}

export default function BluetoothDeviceListItem({ key, deviceName }: Props) {

    const { selectedDevice, setSelectedDevice } = useBluetooth();

    function isSelected() {
        return selectedDevice?.name === deviceName;
    }

    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <ThemedText style={{ flex: 1 }}>
                {deviceName}
            </ThemedText>
            <Button
                title={isSelected() ? "Paired" : "Pair"}
                onPress={() => {
                    console.log(`Pairing with device: ${deviceName}`);

                    // TODO: actual bluetooth pairing here

                    setSelectedDevice({ name: deviceName });
                }}
                disabled={isSelected()}
            />
        </View>
    );
}