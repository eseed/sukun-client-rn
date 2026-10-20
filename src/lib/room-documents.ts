import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import type { BuyerRoom, PickedDocument, RoomRequiredAttachment } from '../api/types';

/**
 * Room documents: what a room asks for, the limits the server holds them to, and the three ways
 * to pick a file on the phone (the camera, the photo library, the Files app).
 *
 * The limits are the backend's (`room-attachment.constants.ts` and the storage policy for
 * `addon_room_attachment`), checked here first so a guest hears about them before a long upload.
 */

/** All of a room's documents together, those already uploaded included. */
export const ROOM_DOCUMENTS_MAX_BYTES = 20 * 1024 * 1024;
export const ROOM_DOCUMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

/** Photos are re-encoded as JPEG at this quality: an ID stays legible at well under 2 MB. */
const PHOTO_QUALITY = 0.6;

export type PickResult =
  | { status: 'picked'; files: PickedDocument[] }
  | { status: 'cancelled' }
  | { status: 'no-permission' }
  | { status: 'failed' };

export function maxFilesOf(document: RoomRequiredAttachment): number {
  return Math.max(document.maxFiles ?? 1, 1);
}

/** A room that asks for documents, for the panels that point at the upload screen. */
export function roomAsksForDocuments(room: BuyerRoom): boolean {
  return (room.requiredAttachments ?? []).length > 0;
}

/** The documents a room still asks for: the ones nobody in it has uploaded yet. */
export function missingDocuments(room: BuyerRoom): RoomRequiredAttachment[] {
  const uploaded = new Set((room.attachments ?? []).map((attachment) => attachment.key));
  return (room.requiredAttachments ?? []).filter((document) => !uploaded.has(document.key));
}

/** True while a required document is still missing from the room. */
export function roomNeedsDocuments(room: BuyerRoom): boolean {
  return room.canUploadAttachments && missingDocuments(room).some((document) => document.required);
}

const EXTENSION_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

/** The picker's own type, or one read from the file name when it reports none. */
export function documentType(name: string, reported: string | null | undefined): string {
  if (reported && reported !== 'application/octet-stream') return reported.toLowerCase();
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_TYPES[extension] ?? reported ?? '';
}

/**
 * Why a set of files cannot be sent, in the guest's words, or null when it can. `stored` is the
 * bytes the room's earlier uploads already take.
 */
export function uploadProblem(files: PickedDocument[], storedBytes: number): string | null {
  if (files.some((file) => !ROOM_DOCUMENT_TYPES.includes(file.mimeType))) {
    return 'Use photos (JPEG, PNG) or PDF files.';
  }
  const total = files.reduce((sum, file) => sum + file.size, storedBytes);
  if (total > ROOM_DOCUMENTS_MAX_BYTES) {
    return 'All documents for this room together must be 20 MB or less. Remove a file or use a smaller one.';
  }
  return null;
}

/** "1.4 MB", "820 KB": a size a guest can compare with the 20 MB limit. */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function fromImageAssets(assets: ImagePicker.ImagePickerAsset[]): PickedDocument[] {
  const stamp = Date.now();
  return assets.map((asset, index) => {
    const fallbackName = `photo-${stamp}-${index + 1}.jpg`;
    const name = asset.fileName || asset.uri.split('/').pop() || fallbackName;
    return {
      uri: asset.uri,
      name,
      mimeType: documentType(name, asset.mimeType),
      size: asset.fileSize ?? 0,
    };
  });
}

export async function takePhoto(): Promise<PickResult> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return { status: 'no-permission' };
  try {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: PHOTO_QUALITY,
    });
    if (result.canceled || result.assets.length === 0) return { status: 'cancelled' };
    return { status: 'picked', files: fromImageAssets(result.assets) };
  } catch {
    return { status: 'failed' };
  }
}

/** The photo library needs no permission prompt: the system picker shows only what is chosen. */
export async function choosePhotos(limit: number): Promise<PickResult> {
  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: PHOTO_QUALITY,
      allowsMultipleSelection: limit > 1,
      selectionLimit: limit,
      orderedSelection: true,
    });
    if (result.canceled || result.assets.length === 0) return { status: 'cancelled' };
    return { status: 'picked', files: fromImageAssets(result.assets.slice(0, limit)) };
  } catch {
    return { status: 'failed' };
  }
}

/** PDFs (and images saved as files) from the Files app or Google Drive. */
export async function chooseFiles(limit: number): Promise<PickResult> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: ROOM_DOCUMENT_TYPES,
      multiple: limit > 1,
      copyToCacheDirectory: true,
    });
    if (result.canceled || result.assets.length === 0) return { status: 'cancelled' };
    return {
      status: 'picked',
      files: result.assets.slice(0, limit).map((asset) => ({
        uri: asset.uri,
        name: asset.name,
        mimeType: documentType(asset.name, asset.mimeType),
        size: asset.size ?? 0,
      })),
    };
  } catch {
    return { status: 'failed' };
  }
}
