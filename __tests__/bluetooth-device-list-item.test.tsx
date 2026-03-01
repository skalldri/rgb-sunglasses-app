import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as ExpoRouter from 'expo-router';

import BluetoothDeviceListItem from '@/components/bluetooth-device-list-item';
import {
  BLE_GATT_CPF_FORMAT_UTF8S,
  getUuidForCccDescriptor,
  getUuidForCpfDescriptor,
  getUuidForCudDescriptor,
} from '@/constants/bluetooth';
import * as BluetoothContext from '@/context/bluetooth-context';
import * as BleHook from '@/hooks/use-ble';
import { SMP_CHARACTERISTIC_UUID, SMP_SERVICE_UUID } from '@/services/mcumgr';

jest.mock('@/context/bluetooth-context', () => {
  const actual = jest.requireActual('@/context/bluetooth-context');
  return {
    ...actual,
    useBluetooth: jest.fn(),
  };
});

describe('BluetoothDeviceListItem', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('connect flow discovers metadata, sets selected device, monitors notifiable chars, and navigates', async () => {
    const setSelectedDevice = jest.fn();
    const updateCharValue = jest.fn();
    const monitorSubscriptions = { current: [] as any[] };
    const disconnectSubscription = { current: null as any };

    (BluetoothContext.useBluetooth as jest.Mock).mockReturnValue({
      selectedDevice: null,
      setSelectedDevice,
      updateCharValue,
      monitorSubscriptions,
      disconnectSubscription,
    } as any);

    jest.spyOn(ExpoRouter, 'useRouter').mockReturnValue({
      navigate: jest.fn(),
      push: jest.fn(),
      replace: jest.fn(),
      back: jest.fn(),
    });

    const regularMonitorRemove = jest.fn();
    let regularMonitorCallback: ((error: any, characteristic: any) => void) | null = null;
    const regularCharacteristic = {
      uuid: 'char-regular',
      isNotifiable: true,
      read: jest.fn(async () => ({ value: btoa('hello') })),
      monitor: jest.fn((cb: any) => {
        regularMonitorCallback = cb;
        return { remove: regularMonitorRemove };
      }),
    };

    const smpMonitor = jest.fn();
    const smpCharacteristic = {
      uuid: SMP_CHARACTERISTIC_UUID,
      isNotifiable: true,
      read: jest.fn(async () => ({ value: null })),
      monitor: smpMonitor,
    };

    const regularService = {
      uuid: 'service-regular',
      descriptorsForCharacteristic: jest.fn(async (charUuid: string) => {
        if (charUuid !== regularCharacteristic.uuid) return [];
        return [
          {
            uuid: getUuidForCudDescriptor(),
            read: jest.fn(async () => ({ value: btoa('Friendly Name') })),
          },
          {
            uuid: getUuidForCpfDescriptor(),
            read: jest.fn(async () => ({
              value: btoa(String.fromCharCode(BLE_GATT_CPF_FORMAT_UTF8S, 0, 0, 0, 0, 0, 0)),
            })),
          },
          {
            uuid: getUuidForCccDescriptor(),
            read: jest.fn(async () => ({ value: btoa(String.fromCharCode(1, 0)) })),
          },
        ];
      }),
    };

    const smpService = {
      uuid: SMP_SERVICE_UUID,
      descriptorsForCharacteristic: jest.fn(async () => []),
    };

    const deviceConnection = {
      discoverAllServicesAndCharacteristics: jest.fn(async () => undefined),
      services: jest.fn(async () => [regularService, smpService]),
      characteristicsForService: jest.fn(async (serviceUuid: string) => {
        if (serviceUuid === regularService.uuid) return [regularCharacteristic];
        if (serviceUuid === smpService.uuid) return [smpCharacteristic];
        return [];
      }),
    };

    let disconnectCallback: ((error: any, device: any) => void) | null = null;
    (BleHook.bleManager.connectToDevice as jest.Mock).mockResolvedValue(deviceConnection);
    (BleHook.bleManager.onDeviceDisconnected as jest.Mock).mockImplementation(
      (_mac: string, callback: (error: any, device: any) => void) => {
        disconnectCallback = callback;
        return { remove: jest.fn() };
      }
    );

    const { getByText } = render(
      <BluetoothDeviceListItem deviceName="RGB Sunglasses A" macAddress="AA:BB:CC" />
    );

    fireEvent.press(getByText('Connect'));

    await waitFor(() => {
      expect(BleHook.bleManager.connectToDevice).toHaveBeenCalledWith('AA:BB:CC');
      expect(setSelectedDevice).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'RGB Sunglasses A',
          mac: 'AA:BB:CC',
          characteristicsByService: expect.any(Object),
        })
      );
    });

    const selectedDevicePayload = setSelectedDevice.mock.calls[0][0];
    expect(
      selectedDevicePayload.characteristicsByService[regularService.uuid][regularCharacteristic.uuid].name
    ).toBe('Friendly Name');
    expect(
      selectedDevicePayload.characteristicsByService[regularService.uuid][regularCharacteristic.uuid].cpfFormat
    ).toBe(BLE_GATT_CPF_FORMAT_UTF8S);

    expect(regularCharacteristic.monitor).toHaveBeenCalledTimes(1);
    expect(smpMonitor).not.toHaveBeenCalled();
    expect(monitorSubscriptions.current).toHaveLength(1);

    regularMonitorCallback?.(null, { value: btoa('updated-value') });
    expect(updateCharValue).toHaveBeenCalledWith('char-regular', btoa('updated-value'));

    disconnectCallback?.(null, { id: 'AA:BB:CC' });
    expect(regularMonitorRemove).toHaveBeenCalled();
    expect(setSelectedDevice).toHaveBeenCalledWith(null);
    expect(disconnectSubscription.current).toBeNull();
  });

  it('disconnect flow cancels connection and cleans up existing subscriptions', async () => {
    const removeDisconnect = jest.fn();
    const sub1Remove = jest.fn();
    const sub2Remove = jest.fn();
    const monitorSubscriptions = { current: [{ remove: sub1Remove }, { remove: sub2Remove }] as any[] };
    const disconnectSubscription = { current: { remove: removeDisconnect } as any };
    const setSelectedDevice = jest.fn();

    (BluetoothContext.useBluetooth as jest.Mock).mockReturnValue({
      selectedDevice: { mac: 'AA:BB:CC' },
      setSelectedDevice,
      updateCharValue: jest.fn(),
      monitorSubscriptions,
      disconnectSubscription,
    } as any);

    jest.spyOn(ExpoRouter, 'useRouter').mockReturnValue({
      navigate: jest.fn(),
      push: jest.fn(),
      replace: jest.fn(),
      back: jest.fn(),
    });

    (BleHook.bleManager.cancelDeviceConnection as jest.Mock).mockResolvedValue(undefined);

    const { getByText } = render(
      <BluetoothDeviceListItem deviceName="RGB Sunglasses A" macAddress="AA:BB:CC" />
    );

    fireEvent.press(getByText('Disconnect'));

    await waitFor(() => {
      expect(BleHook.bleManager.cancelDeviceConnection).toHaveBeenCalledWith('AA:BB:CC');
      expect(setSelectedDevice).toHaveBeenCalledWith(null);
    });

    expect(removeDisconnect).toHaveBeenCalledTimes(1);
    expect(sub1Remove).toHaveBeenCalledTimes(1);
    expect(sub2Remove).toHaveBeenCalledTimes(1);
    expect(monitorSubscriptions.current).toHaveLength(0);
    expect(disconnectSubscription.current).toBeNull();
  });
});
