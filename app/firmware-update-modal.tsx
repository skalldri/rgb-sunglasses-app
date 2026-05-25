import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useBluetooth } from '@/context/bluetooth-context';
import { useMcuMgrClient } from '@/hooks/use-mcumgr-client';
import {
    calculateOverallUploadProgress,
    findUploadedImageForIndex,
    FirmwarePackage,
    parseFirmwareImageIndex,
    parseFirmwarePackageFromBase64
} from '@/services/firmware-package';
import {
    compareVersions,
    extractBoardRevision,
    fetchLatestRelease,
    findAssetForBoard,
    GitHubAsset,
    GitHubRelease,
    parseVersionFromTag,
} from '@/services/github-releases';
import { formatBytes, formatHash, ImageSlot, SlotInfoResponse } from '@/services/mcumgr';
import * as DocumentPicker from 'expo-document-picker';
import * as LegacyFS from 'expo-file-system/legacy';
import { File } from 'expo-file-system/next';
import { Link } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Button, ScrollView, StyleSheet, View } from 'react-native';

// ============================================================================
// Component
// ============================================================================

export default function FirmwareUpdateModal() {
    const { selectedDevice, setSelectedDevice } = useBluetooth();
    const { client, isInitializing, error: initError } = useMcuMgrClient(selectedDevice?.device ?? null);
    const [imageState, setImageState] = useState<ImageSlot[]>([]);
    const [status, setStatus] = useState<string>('');
    const [error, setError] = useState<string>('');
    const [uploadProgress, setUploadProgress] = useState<number>(0);
    const [isUploading, setIsUploading] = useState(false);
    const [slotInfo, setSlotInfo] = useState<SlotInfoResponse | null>(null);
    const [firmwarePackage, setFirmwarePackage] = useState<FirmwarePackage | null>(null);
    const [currentUploadIndex, setCurrentUploadIndex] = useState<number>(0);

    // Board detection
    const [boardRevision, setBoardRevision] = useState<string | null>(null);
    const [boardDetectionError, setBoardDetectionError] = useState<string>('');

    // GitHub update check
    type UpdateCheckState = 'idle' | 'checking' | 'upToDate' | 'updateAvailable' | 'error';
    const [updateCheckState, setUpdateCheckState] = useState<UpdateCheckState>('idle');
    const [latestRelease, setLatestRelease] = useState<GitHubRelease | null>(null);
    const [latestAsset, setLatestAsset] = useState<GitHubAsset | null>(null);
    const [latestVersion, setLatestVersion] = useState<string>('');
    const [updateCheckError, setUpdateCheckError] = useState<string>('');

    // Download
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState<number>(0);

    // Update context with client for cleanup on disconnect
    useEffect(() => {
        if (client && selectedDevice) {
            setSelectedDevice({
                ...selectedDevice,
                mcuMgrClient: client
            });
        }
    }, [client, selectedDevice?.mac]); // Only update when client or device MAC changes

    const refreshImageState = useCallback(async () => {
        if (!client) return;

        try {
            setStatus('Fetching image state...');
            const state = await client.getImageState();
            setImageState(state.images);
            setStatus('');
        } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            setError(`Failed to get image state: ${errorMessage}`);
        }
    }, [client]);

    const refreshSlotInfo = useCallback(async () => {
        if (!client) return;

        try {
            setStatus('Fetching slot info...');
            const info = await client.getSlotInfo();
            // Only set slot info if it has the images property
            if (info && info.images && Array.isArray(info.images)) {
                setSlotInfo(info);
            } else {
                console.log('Slot info response missing images array:', info);
                setSlotInfo(null);
            }
            setStatus('');
        } catch (e: unknown) {
            // Slot info command may not be supported on all devices
            console.log('Slot info not available:', e);
            setSlotInfo(null);
        }
    }, [client]);

    // Fetch initial state when client becomes available, then detect board revision.
    // All three SMP calls are sequenced to avoid concurrent requests (McuMgrClient
    // only supports one pending request at a time).
    useEffect(() => {
        if (!client) return;

        async function fetchInitialState() {
            await refreshImageState();
            await refreshSlotInfo();

            try {
                const boardName = await client!.getOsInfo('i');
                const revision = extractBoardRevision(boardName);
                if (revision) {
                    setBoardRevision(revision);
                } else {
                    setBoardDetectionError(`Unknown board: ${boardName}`);
                }
            } catch (e: unknown) {
                setBoardDetectionError(
                    `Board detection failed: ${e instanceof Error ? e.message : String(e)}`
                );
            }
        }

        fetchInitialState();
    }, [client, refreshImageState, refreshSlotInfo]);

    // Display initialization error if present
    useEffect(() => {
        if (initError) {
            setError(initError);
        }
    }, [initError]);

    // Check GitHub for the latest release once board revision is known
    useEffect(() => {
        if (!boardRevision || updateCheckState !== 'idle') return;

        async function checkForUpdates() {
            setUpdateCheckState('checking');
            try {
                const release = await fetchLatestRelease('skalldri', 'rgb-sunglasses');
                const asset = findAssetForBoard(release.assets, boardRevision!);
                if (!asset) {
                    throw new Error(`No firmware asset found for board: ${boardRevision}`);
                }

                const githubVersion = parseVersionFromTag(release.tag_name);
                const activeSlot = imageState.find(s => s.active && s.slot === 0);
                const deviceVersion = activeSlot?.version ?? '';
                const cmp = deviceVersion ? compareVersions(deviceVersion, githubVersion) : -1;

                setLatestRelease(release);
                setLatestAsset(asset);
                setLatestVersion(githubVersion);
                setUpdateCheckState(cmp < 0 ? 'updateAvailable' : 'upToDate');
            } catch (e: unknown) {
                setUpdateCheckError(e instanceof Error ? e.message : String(e));
                setUpdateCheckState('error');
            }
        }

        checkForUpdates();
    }, [boardRevision, imageState]);

    async function handleSelectFirmwarePackage() {
        try {
            setError('');
            const result = await DocumentPicker.getDocumentAsync({
                type: 'application/zip',
                copyToCacheDirectory: true,
            });

            if (result.canceled || !result.assets?.[0]) {
                return;
            }

            const file = result.assets[0];
            setStatus(`Loading: ${file.name}`);

            // Read file contents as base64 using new File API
            const fileRef = new File(file.uri);
            const base64Data = await fileRef.base64();

            // Parse zip file
            setStatus('Parsing firmware package...');
            const parsedPackage = await parseFirmwarePackageFromBase64(base64Data);
            setFirmwarePackage(parsedPackage);
            setStatus('');
        } catch (e: any) {
            setError(`Failed to load firmware package: ${e.message}`);
            setStatus('');
        }
    }

    async function handleStartUpdate() {
        if (!client || !firmwarePackage) return;

        setIsUploading(true);
        setUploadProgress(0);
        setError('');
        setCurrentUploadIndex(0);

        try {
            const totalImages = firmwarePackage.images.length;

            for (let i = 0; i < totalImages; i++) {
                const image = firmwarePackage.images[i];
                const imageIndex = parseFirmwareImageIndex(image.manifest.image_index);
                setCurrentUploadIndex(i);

                setStatus(`Uploading ${image.manifest.file} (${i + 1}/${totalImages})...`);

                await client.uploadImage(
                    image.data,
                    imageIndex,
                    (sent, total) => {
                        setUploadProgress(calculateOverallUploadProgress(i, totalImages, sent, total));
                    }
                );

                setStatus(`Marking image ${imageIndex} for test...`);

                // Get updated image state and mark for test
                const state = await client.getImageState();
                console.log(`Got image state after upload: ${JSON.stringify(state)}`)
                const uploadedImage = findUploadedImageForIndex(state.images, imageIndex);

                if (uploadedImage?.hash) {
                    console.log(`Setting image state!`);
                    await client.setImageState(uploadedImage.hash, true); // Confirm image, permanent install
                } else {
                    throw new Error(`Uploaded image not found in image state response`);
                }
            }

            setStatus('All firmware images uploaded successfully!');
            setFirmwarePackage(null); // Clear the package
            await refreshImageState();
        } catch (e: any) {
            setError(`Upload failed: ${e.message}`);
        } finally {
            setIsUploading(false);
        }
    }

    async function handleDownloadUpdate() {
        if (!latestAsset) return;

        setIsDownloading(true);
        setDownloadProgress(0);
        setError('');

        const destUri = (LegacyFS.cacheDirectory ?? '') + 'firmware-update.zip';

        try {
            const task = LegacyFS.createDownloadResumable(
                latestAsset.browser_download_url,
                destUri,
                {},
                ({ totalBytesWritten, totalBytesExpectedToWrite }: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => {
                    if (totalBytesExpectedToWrite > 0) {
                        setDownloadProgress(
                            Math.round((totalBytesWritten / totalBytesExpectedToWrite) * 100)
                        );
                    }
                }
            );

            const result = await task.downloadAsync();
            if (!result) {
                throw new Error('Download was cancelled');
            }

            setStatus('Parsing firmware package...');
            const fileRef = new File(result.uri);
            const base64Data = await fileRef.base64();
            const parsedPackage = await parseFirmwarePackageFromBase64(base64Data);
            setFirmwarePackage(parsedPackage);
            setStatus('');
        } catch (e: any) {
            setError(`Download failed: ${e.message}`);
        } finally {
            setIsDownloading(false);
            setDownloadProgress(0);
        }
    }

    function handleCancelPackage() {
        setFirmwarePackage(null);
        setStatus('');
    }

    async function handleConfirmImage(hash: Uint8Array) {
        if (!client) return;

        try {
            setStatus('Confirming image...');
            await client.setImageState(hash, false); // Mark for test
            await refreshImageState();
        } catch (e: any) {
            setError(`Failed to confirm: ${e.message}`);
        }
    }

    async function handleReset() {
        if (!client) return;

        try {
            setStatus('Resetting device...');
            await client.reset();
            setStatus('Device is resetting. You may need to reconnect.');
        } catch {
            // Expected - device resets before responding
            setStatus('Device is resetting. You may need to reconnect.');
        }
    }

    async function handleEraseSlot() {
        if (!client) return;

        try {
            setStatus('Erasing secondary slot (this may take a while)...');
            await client.eraseImage(1);
            setStatus('Erase complete');
            await refreshImageState();
        } catch (e: any) {
            setError(`Erase failed: ${e.message}`);
        }
    }

    function formatBoardRevision(revision: string): string {
        if (revision === 'proto0') return 'Proto0';
        if (revision === 'dk') return 'DK';
        return revision;
    }

    function renderAutoUpdateSection() {
        if (isDownloading) {
            return (
                <View style={styles.updateCard}>
                    <ThemedText style={styles.sectionTitle}>Downloading Update...</ThemedText>
                    <View style={styles.progressContainer}>
                        <View style={[styles.progressBar, { width: `${downloadProgress}%` }]} />
                        <ThemedText style={styles.progressText}>{downloadProgress}%</ThemedText>
                    </View>
                </View>
            );
        }

        if (!boardRevision && !boardDetectionError) {
            return (
                <View style={styles.updateCard}>
                    <ActivityIndicator size="small" />
                    <ThemedText style={styles.status}>Detecting board...</ThemedText>
                </View>
            );
        }

        if (boardDetectionError && !boardRevision) {
            return (
                <View style={styles.updateCard}>
                    <ThemedText style={styles.updateCardError}>{boardDetectionError}</ThemedText>
                </View>
            );
        }

        if (updateCheckState === 'checking') {
            return (
                <View style={styles.updateCard}>
                    <ThemedText style={styles.boardLabel}>
                        Board: {formatBoardRevision(boardRevision!)}
                    </ThemedText>
                    <ActivityIndicator size="small" />
                    <ThemedText style={styles.status}>Checking for updates...</ThemedText>
                </View>
            );
        }

        if (updateCheckState === 'error') {
            return (
                <View style={styles.updateCard}>
                    <ThemedText style={styles.boardLabel}>
                        Board: {formatBoardRevision(boardRevision!)}
                    </ThemedText>
                    <ThemedText style={styles.updateCardError}>
                        Update check failed: {updateCheckError}
                    </ThemedText>
                </View>
            );
        }

        if (updateCheckState === 'upToDate') {
            return (
                <View style={styles.updateCard}>
                    <ThemedText style={styles.boardLabel}>
                        Board: {formatBoardRevision(boardRevision!)}
                    </ThemedText>
                    <ThemedText style={styles.updateCardSuccess}>
                        Up to date (v{latestVersion})
                    </ThemedText>
                </View>
            );
        }

        if (updateCheckState === 'updateAvailable' && latestAsset) {
            const activeSlot = imageState.find(s => s.active && s.slot === 0);
            const deviceVersion = activeSlot?.version ?? 'Unknown';

            return (
                <View style={[styles.updateCard, styles.updateCardHighlight]}>
                    <ThemedText type="subtitle" style={styles.sectionTitle}>
                        Update Available
                    </ThemedText>
                    <ThemedText style={styles.boardLabel}>
                        Board: {formatBoardRevision(boardRevision!)}
                    </ThemedText>
                    <ThemedText style={styles.slotDetail}>Current: v{deviceVersion}</ThemedText>
                    <ThemedText style={styles.slotDetail}>Latest: v{latestVersion}</ThemedText>
                    <View style={styles.buttonRow}>
                        <Button
                            title="Download Update"
                            onPress={handleDownloadUpdate}
                            disabled={!client || isUploading}
                            color="#4CAF50"
                        />
                    </View>
                </View>
            );
        }

        return null;
    }

    function renderImageSlot(slot: ImageSlot, index: number) {
        const flags = [];
        if (slot.active) flags.push('Active');
        if (slot.pending) flags.push('Pending');
        if (slot.confirmed) flags.push('Confirmed');
        if (slot.permanent) flags.push('Permanent');
        if (slot.bootable) flags.push('Bootable');

        return (
            <View key={index} style={styles.slotCard}>
                <ThemedText style={styles.slotTitle}>
                    Image {slot.image ?? 0} / Slot {slot.slot}
                </ThemedText>
                <ThemedText style={styles.slotDetail}>
                    Version: {slot.version}
                </ThemedText>
                <ThemedText style={styles.slotDetail}>
                    Hash: {formatHash(slot.hash)}
                </ThemedText>
                {flags.length > 0 && (
                    <ThemedText style={styles.slotFlags}>
                        {flags.join(' | ')}
                    </ThemedText>
                )}
                {slot.hash && !slot.pending && slot.slot === 1 && (
                    <Button
                        title="Mark for Test"
                        onPress={() => handleConfirmImage(slot.hash!)}
                    />
                )}
            </View>
        );
    }

    function renderFirmwarePackagePreview() {
        if (!firmwarePackage) return null;

        return (
            <View style={styles.packagePreview}>
                <ThemedText type="subtitle" style={styles.sectionTitle}>
                    Firmware Package: {firmwarePackage.manifest.name}
                </ThemedText>

                {firmwarePackage.images.map((image, idx) => (
                    <View key={idx} style={styles.firmwareCard}>
                        <ThemedText style={styles.firmwareTitle}>
                            Image {image.manifest.image_index}: {image.manifest.file}
                        </ThemedText>
                        <ThemedText style={styles.firmwareDetail}>
                            Type: {image.manifest.type}
                        </ThemedText>
                        <ThemedText style={styles.firmwareDetail}>
                            Board: {image.manifest.board}
                        </ThemedText>
                        <ThemedText style={styles.firmwareDetail}>
                            Size: {formatBytes(image.manifest.size)}
                        </ThemedText>
                        <ThemedText style={styles.firmwareDetail}>
                            Version: {image.parsedHeader?.version || image.manifest.version_MCUBOOT || image.manifest.version || 'Unknown'}
                        </ThemedText>
                        <ThemedText style={styles.firmwareDetail}>
                            Target Slots: {image.manifest.slot_index_primary} → {image.manifest.slot_index_secondary}
                        </ThemedText>
                    </View>
                ))}

                <View style={styles.buttonRow}>
                    <Button
                        title="Cancel"
                        onPress={handleCancelPackage}
                        disabled={isUploading}
                        color="#888"
                    />
                    <Button
                        title={isUploading ? `Uploading (${currentUploadIndex + 1}/${firmwarePackage.images.length})...` : 'Start Update'}
                        onPress={handleStartUpdate}
                        disabled={isUploading || !client}
                        color="#4CAF50"
                    />
                </View>
            </View>
        );
    }

    if (isInitializing) {
        return (
            <ThemedView style={styles.container}>
                <ActivityIndicator size="large" />
                <ThemedText style={styles.status}>{status || 'Initializing...'}</ThemedText>
            </ThemedView>
        );
    }

    return (
        <ThemedView style={styles.container}>
            <ThemedText type="title">Firmware Update</ThemedText>

            {error ? (
                <ThemedText style={styles.error}>{error}</ThemedText>
            ) : null}

            {status ? (
                <ThemedText style={styles.status}>{status}</ThemedText>
            ) : null}

            {isUploading && (
                <View style={styles.progressContainer}>
                    <View style={[styles.progressBar, { width: `${uploadProgress}%` }]} />
                    <ThemedText style={styles.progressText}>{uploadProgress}%</ThemedText>
                </View>
            )}

            <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
                {/* Firmware Package Preview */}
                {renderFirmwarePackagePreview()}

                {/* Only show other sections if no package is loaded */}
                {!firmwarePackage && (
                    <>
                        <ThemedText type="subtitle" style={styles.sectionTitle}>
                            Current Images
                        </ThemedText>

                        {imageState.length === 0 ? (
                            <ThemedText style={styles.noImages}>No images found</ThemedText>
                        ) : (
                            imageState.map(renderImageSlot)
                        )}

                        <View style={styles.buttonRow}>
                            <Button
                                title="Refresh"
                                onPress={() => {
                                    refreshImageState();
                                    refreshSlotInfo();
                                }}
                                disabled={isUploading}
                            />
                        </View>

                        {slotInfo?.images && slotInfo.images.length > 0 && (
                            <>
                                <ThemedText type="subtitle" style={styles.sectionTitle}>
                                    Slot Info
                                </ThemedText>
                                {slotInfo.images.map((imageInfo, idx) => (
                                    <View key={idx} style={styles.slotInfoCard}>
                                        <ThemedText style={styles.slotTitle}>
                                            Image {imageInfo.image}: {imageInfo.image === 0 ? 'App Firmware' : 'Radio Firmware'}
                                        </ThemedText>
                                        {imageInfo.max_image_size && (
                                            <ThemedText style={styles.slotDetail}>
                                                Max Size: {formatBytes(imageInfo.max_image_size)}
                                            </ThemedText>
                                        )}
                                        {imageInfo.slots?.map((slot, slotIdx) => (
                                            <ThemedText key={slotIdx} style={styles.slotDetail}>
                                                Slot {slot.slot}: {formatBytes(slot.size)}
                                                {slot.upload_image_id !== undefined && ` (upload target: image ${slot.upload_image_id})`}
                                            </ThemedText>
                                        ))}
                                    </View>
                                ))}
                            </>
                        )}

                        {renderAutoUpdateSection()}

                        <ThemedText type="subtitle" style={styles.sectionTitle}>
                            Update Firmware
                        </ThemedText>

                        <View style={styles.buttonRow}>
                            <Button
                                title="Select Firmware Package (.zip)"
                                onPress={handleSelectFirmwarePackage}
                                disabled={isUploading || !client}
                            />
                        </View>

                        <ThemedText type="subtitle" style={styles.sectionTitle}>
                            Device Actions
                        </ThemedText>

                        <View style={styles.buttonRow}>
                            <Button
                                title="Reset Device"
                                onPress={handleReset}
                                disabled={isUploading || !client}
                            />
                            <Button
                                title="Erase Slot 1"
                                onPress={handleEraseSlot}
                                disabled={isUploading || !client}
                                color="#ff4444"
                            />
                        </View>
                    </>
                )}
            </ScrollView>

            <Link href="../" style={styles.link}>
                <ThemedText type="link">Done</ThemedText>
            </Link>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 20,
    },
    sectionTitle: {
        marginTop: 20,
        marginBottom: 10,
    },
    slotCard: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 8,
        padding: 12,
        marginBottom: 10,
    },
    slotInfoCard: {
        backgroundColor: 'rgba(100,149,237,0.15)',
        borderRadius: 8,
        padding: 12,
        marginBottom: 10,
    },
    slotTitle: {
        fontWeight: 'bold',
        fontSize: 16,
        marginBottom: 4,
    },
    slotDetail: {
        fontSize: 12,
        opacity: 0.8,
    },
    slotFlags: {
        fontSize: 11,
        color: '#4CAF50',
        marginTop: 4,
    },
    packagePreview: {
        marginBottom: 20,
    },
    firmwareCard: {
        backgroundColor: 'rgba(255,193,7,0.15)',
        borderRadius: 8,
        padding: 12,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,193,7,0.3)',
    },
    firmwareTitle: {
        fontWeight: 'bold',
        fontSize: 14,
        marginBottom: 6,
        color: '#FFC107',
    },
    firmwareDetail: {
        fontSize: 12,
        opacity: 0.8,
        marginBottom: 2,
    },
    noImages: {
        opacity: 0.6,
        fontStyle: 'italic',
    },
    status: {
        marginTop: 10,
        textAlign: 'center',
        opacity: 0.7,
    },
    error: {
        marginTop: 10,
        textAlign: 'center',
        color: '#ff4444',
    },
    progressContainer: {
        width: '100%',
        height: 24,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 12,
        marginTop: 10,
        overflow: 'hidden',
    },
    progressBar: {
        height: '100%',
        backgroundColor: '#4CAF50',
        borderRadius: 12,
    },
    progressText: {
        position: 'absolute',
        width: '100%',
        textAlign: 'center',
        lineHeight: 24,
        fontSize: 12,
    },
    buttonRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginVertical: 10,
        gap: 10,
    },
    link: {
        marginTop: 15,
        paddingVertical: 15,
        alignSelf: 'center',
    },
    updateCard: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 8,
        padding: 12,
        marginBottom: 10,
        marginTop: 8,
        alignItems: 'center',
        gap: 8,
    },
    updateCardHighlight: {
        borderWidth: 1,
        borderColor: 'rgba(76,175,80,0.5)',
        backgroundColor: 'rgba(76,175,80,0.1)',
    },
    updateCardError: {
        color: '#ff4444',
        fontSize: 13,
        textAlign: 'center',
    },
    updateCardSuccess: {
        color: '#4CAF50',
        fontSize: 14,
        fontWeight: 'bold',
    },
    boardLabel: {
        fontSize: 12,
        opacity: 0.6,
    },
});
