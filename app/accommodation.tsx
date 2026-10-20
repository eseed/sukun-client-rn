import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import type { BuyerRoom, PickedDocument, RoomRequiredAttachment } from '../src/api/types';
import {
  Badge,
  BackButton,
  BulletHeading,
  Button,
  Card,
  InlineError,
  ResourceState,
  Screen,
  StepLabel,
  Text,
} from '../src/components/ui';
import { useEvent, useEventRooms, useUploadRoomAttachments } from '../src/hooks/queries';
import { track } from '../src/lib/analytics';
import { codeForError, messageForError } from '../src/lib/errors';
import { formatDate } from '../src/lib/format';
import {
  chooseFiles,
  choosePhotos,
  formatFileSize,
  maxFilesOf,
  missingDocuments,
  type PickResult,
  takePhoto,
  uploadProblem,
} from '../src/lib/room-documents';
import { colors, space } from '../src/theme/tokens';

/** Refusals that come from the upload itself rather than the room, in the guest's words. */
const UPLOAD_MESSAGES: Record<string, string> = {
  FILE_TOO_LARGE: 'All documents for this room together must be 20 MB or less.',
  UNSUPPORTED_CONTENT_TYPE: 'Use photos (JPEG, PNG) or PDF files.',
  INVALID_MULTIPART_PAYLOAD: "The upload didn't go through. Try again.",
};

/**
 * `/accommodation?eventId=`: the documents a room asks its guests for (an ID, a marriage
 * certificate), the app's side of the website's page of the same name.
 *
 * An admin's notification links here (the website's `/accommodation` link, opened in the app), as
 * do the entry pass, the receipt and the rooms screen while a room still asks. Any guest in the
 * room, or its buyer, uploads once for the whole room: every required document together, optional
 * ones then or later. What is uploaded can be opened again; nothing can be replaced from here.
 */
export default function AccommodationScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const validEventId =
    typeof eventId === 'string' && /^[A-Za-z0-9_-]+$/.test(eventId) ? eventId : undefined;
  const roomsQuery = useEventRooms(validEventId);
  const eventQuery = useEvent(validEventId);
  const rooms = roomsQuery.data ?? [];

  function close() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/tickets');
  }

  return (
    <Screen scroll contentStyle={styles.content}>
      <BackButton onPress={close} style={styles.back} />

      <StepLabel>{eventQuery.data?.title ?? 'Your stay'}</StepLabel>
      <View style={styles.heading}>
        <BulletHeading title="Room documents" size="lg" />
      </View>
      <Text variant="bodyMuted" style={styles.lead}>
        Upload what your room asks for. Anyone in the room can do it, once for everyone.
      </Text>

      <ResourceState
        status={
          !validEventId || roomsQuery.isError
            ? 'error'
            : roomsQuery.isLoading
              ? 'loading'
              : 'success'
        }
        loadingLabel="Loading your room..."
        errorMessage="We couldn't load your room."
        onRetry={() => void roomsQuery.refetch()}
      >
        {rooms.length === 0 ? (
          <View style={styles.empty}>
            <Text variant="bodyLead">You have no room for this event.</Text>
            <Button
              label="Go to my tickets"
              variant="accent"
              onPress={() => router.replace('/(tabs)/tickets')}
            />
          </View>
        ) : (
          <View style={styles.rooms}>
            {rooms.map((room) => (
              <RoomCard key={room.roomId} room={room} onRefresh={() => void roomsQuery.refetch()} />
            ))}
          </View>
        )}
      </ResourceState>
    </Screen>
  );
}

function RoomCard({ room, onRefresh }: { room: BuyerRoom; onRefresh: () => void }) {
  return (
    <Card style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.roomName}>
          {room.addonName} · {room.roomType}
        </Text>
        <Badge
          label={`${room.occupants.length} of ${room.capacity}`}
          tone={room.openPlaces === 0 ? 'sage' : 'gold'}
        />
      </View>
      <Text variant="metaSm" color={colors.textMuted}>
        {room.roomNumber ? `Room ${room.roomNumber} · ` : ''}
        Check-in {formatDate(room.checkInDate)} · Check-out {formatDate(room.checkOutDate)}
      </Text>

      <DocumentsSection room={room} onRefresh={onRefresh} />
    </Card>
  );
}

function DocumentsSection({ room, onRefresh }: { room: BuyerRoom; onRefresh: () => void }) {
  const requiredAttachments = room.requiredAttachments ?? [];
  const attachments = room.attachments ?? [];
  if (requiredAttachments.length === 0) {
    return (
      <Text variant="bodyMuted" style={styles.note}>
        This room doesn&apos;t need any documents.
      </Text>
    );
  }

  const missing = missingDocuments(room);
  const canAdd = room.canUploadAttachments && missing.length > 0;

  return (
    <View style={styles.documents}>
      {attachments.length > 0 ? (
        <View style={styles.uploaded}>
          <View style={styles.uploadedTop}>
            <Text variant="eyebrow" color={colors.textMuted}>
              Uploaded
            </Text>
            {room.attachmentsValid ? <Badge label="Checked" tone="sage" /> : null}
          </View>
          {attachments.map((attachment, index) => (
            <Pressable
              key={`${attachment.key}-${index}`}
              accessibilityRole="link"
              accessibilityHint="Opens the document"
              onPress={() => void openDocument(attachment.url)}
              hitSlop={{ top: 6, bottom: 6 }}
            >
              <Text style={styles.fileLink}>
                {attachment.label}: {attachment.fileName}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {canAdd ? (
        <UploadForm
          room={room}
          documents={missing}
          optionalOnly={attachments.length > 0}
          onRefresh={onRefresh}
        />
      ) : attachments.length > 0 ? (
        <Text variant="metaSm" color={colors.textMuted}>
          Uploaded for the whole room, so nobody needs to upload again.
        </Text>
      ) : (
        <Text variant="bodyMuted" style={styles.note}>
          This room isn&apos;t taking documents any more.
        </Text>
      )}
    </View>
  );
}

async function openDocument(url: string) {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert("Couldn't open the document", 'Try again in a moment.');
  }
}

/**
 * One row per document still missing, each filled from the camera, the photo library or the
 * Files app, then one upload for all of them. Required documents must all be there to send.
 */
function UploadForm({
  room,
  documents,
  optionalOnly,
  onRefresh,
}: {
  room: BuyerRoom;
  documents: RoomRequiredAttachment[];
  optionalOnly: boolean;
  onRefresh: () => void;
}) {
  const upload = useUploadRoomAttachments();
  const [selected, setSelected] = useState<Record<string, PickedDocument[]>>({});
  const [error, setError] = useState<string | null>(null);
  const storedBytes = (room.attachments ?? []).reduce((sum, file) => sum + file.sizeBytes, 0);

  const missingRequired = documents.filter(
    (document) => document.required && !(selected[document.key]?.length ?? 0),
  );
  const chosen = documents.flatMap((document) =>
    (selected[document.key] ?? []).map((file) => ({ key: document.key, file })),
  );

  function addFiles(document: RoomRequiredAttachment, result: PickResult) {
    if (result.status === 'cancelled') return;
    if (result.status === 'no-permission') {
      Alert.alert(
        'Camera access needed',
        'Sukun needs the camera to photograph your document. You can turn it on in Settings, or choose a photo or a file instead.',
      );
      return;
    }
    if (result.status === 'failed') {
      setError("That didn't open. Try again, or pick another way.");
      return;
    }
    const current = selected[document.key] ?? [];
    const left = maxFilesOf(document) - current.length;
    const next = [...current, ...result.files.slice(0, Math.max(left, 0))];
    const problem = uploadProblem(
      [...chosen.filter((entry) => entry.key !== document.key).map((entry) => entry.file), ...next],
      storedBytes,
    );
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setSelected((value) => ({ ...value, [document.key]: next }));
  }

  function removeFile(document: RoomRequiredAttachment, index: number) {
    setError(null);
    setSelected((value) => ({
      ...value,
      [document.key]: (value[document.key] ?? []).filter((_file, at) => at !== index),
    }));
  }

  function pick(document: RoomRequiredAttachment) {
    const left = maxFilesOf(document) - (selected[document.key]?.length ?? 0);
    if (left <= 0) return;
    const run = (how: 'camera' | 'photos' | 'files') => {
      const picking =
        how === 'camera' ? takePhoto() : how === 'photos' ? choosePhotos(left) : chooseFiles(left);
      void picking.then((result) => addFiles(document, result));
    };

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: document.label,
          options: ['Take a photo', 'Choose from photos', 'Choose a file (PDF)', 'Cancel'],
          cancelButtonIndex: 3,
        },
        (index) => {
          if (index === 0) run('camera');
          else if (index === 1) run('photos');
          else if (index === 2) run('files');
        },
      );
      return;
    }
    // Android shows up to three buttons; tapping outside or Back cancels.
    Alert.alert(
      document.label,
      undefined,
      [
        { text: 'Choose a file', onPress: () => run('files') },
        { text: 'Photos', onPress: () => run('photos') },
        { text: 'Camera', onPress: () => run('camera') },
      ],
      { cancelable: true },
    );
  }

  async function onUpload() {
    setError(null);
    if (missingRequired.length > 0) {
      setError(`Add ${missingRequired.map((document) => document.label).join(', ')}.`);
      return;
    }
    if (chosen.length === 0) {
      setError('Add at least one document.');
      return;
    }
    const problem = uploadProblem(
      chosen.map((entry) => entry.file),
      storedBytes,
    );
    if (problem) {
      setError(problem);
      return;
    }
    try {
      await upload.mutateAsync({ roomId: room.roomId, uploads: chosen });
      track('room_documents_uploaded', { event_id: room.eventId, files: chosen.length });
      setSelected({});
    } catch (err) {
      const code = codeForError(err);
      if (code === 'ADDON_ROOM_ATTACHMENTS_ALREADY_UPLOADED') onRefresh();
      setError((code && UPLOAD_MESSAGES[code]) ?? messageForError(err));
    }
  }

  return (
    <View style={styles.form}>
      {optionalOnly ? (
        <Text variant="bodyMuted">The required documents are in. You can still add these.</Text>
      ) : null}
      <Text variant="metaSm" color={colors.textMuted}>
        Photos or PDFs, up to 20 MB for the whole room.
      </Text>

      {documents.map((document) => {
        const files = selected[document.key] ?? [];
        const max = maxFilesOf(document);
        return (
          <View key={document.key} style={styles.field}>
            <Text style={styles.fieldLabel}>
              {document.label}
              {document.required ? '' : ' (optional)'}
            </Text>
            {max > 1 ? (
              <Text variant="metaSm" color={colors.textMuted}>
                Up to {max} files, for example front and back.
              </Text>
            ) : null}
            {files.map((file, index) => (
              <View key={`${file.uri}-${index}`} style={styles.fileRow}>
                <Text variant="meta" numberOfLines={1} style={styles.fileName}>
                  {file.name}
                  {file.size ? ` · ${formatFileSize(file.size)}` : ''}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${file.name}`}
                  onPress={() => removeFile(document, index)}
                  disabled={upload.isPending}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text variant="meta" color={colors.textMuted} style={styles.remove}>
                    Remove
                  </Text>
                </Pressable>
              </View>
            ))}
            {files.length < max ? (
              <Button
                label={files.length === 0 ? 'Add photo or PDF' : 'Add another'}
                variant="secondary"
                size="inline"
                disabled={upload.isPending}
                onPress={() => pick(document)}
                style={styles.addButton}
              />
            ) : null}
          </View>
        );
      })}

      {error ? <InlineError message={error} /> : null}
      <Button
        label={optionalOnly ? 'Upload' : 'Upload documents'}
        variant="accent"
        loading={upload.isPending}
        disabled={missingRequired.length > 0 || chosen.length === 0}
        onPress={() => void onUpload()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: space.s7,
  },
  back: {
    marginBottom: 10,
  },
  heading: {
    marginTop: 8,
    marginBottom: 6,
  },
  lead: {
    marginBottom: 20,
  },
  empty: {
    gap: space.s4,
    alignItems: 'flex-start',
  },
  rooms: {
    gap: space.s4,
  },
  card: {
    gap: space.s2,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.s3,
  },
  roomName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  note: {
    marginTop: space.s2,
  },
  documents: {
    gap: space.s3,
    marginTop: space.s2,
  },
  uploaded: {
    gap: space.s2,
  },
  uploadedTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s2,
  },
  fileLink: {
    fontSize: 15,
    color: colors.textPrimary,
    textDecorationLine: 'underline',
  },
  form: {
    gap: space.s3,
  },
  field: {
    gap: space.s1,
    paddingTop: space.s2,
  },
  fieldLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.s3,
  },
  fileName: {
    flex: 1,
  },
  remove: {
    textDecorationLine: 'underline',
  },
  addButton: {
    alignSelf: 'flex-start',
    marginTop: space.s1,
  },
});
