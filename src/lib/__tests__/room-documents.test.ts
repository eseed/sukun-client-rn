import type { BuyerRoom } from '../../api/types';
import {
  documentType,
  formatFileSize,
  missingDocuments,
  roomNeedsDocuments,
  uploadProblem,
} from '../room-documents';

const file = (mimeType: string, size: number) => ({ uri: 'file:///x', name: 'x', mimeType, size });

const ROOM = {
  requiredAttachments: [
    { key: 'national_id', label: 'National ID', required: true },
    { key: 'marriage_certificate', label: 'Marriage certificate', required: false },
  ],
  attachments: [],
  canUploadAttachments: true,
} as unknown as BuyerRoom;

describe('room documents', () => {
  it('reads a type from the name when the picker reports none', () => {
    expect(documentType('scan.PDF', null)).toBe('application/pdf');
    expect(documentType('photo.jpg', 'application/octet-stream')).toBe('image/jpeg');
    expect(documentType('photo.jpg', 'image/png')).toBe('image/png');
  });

  it('allows images and PDFs within 20 MB for the whole room', () => {
    expect(uploadProblem([file('image/jpeg', 1000), file('application/pdf', 1000)], 0)).toBeNull();
    expect(uploadProblem([file('image/heic', 1000)], 0)).toMatch(/JPEG, PNG/);
    expect(uploadProblem([file('image/jpeg', 1024 * 1024)], 19.5 * 1024 * 1024)).toMatch(/20 MB/);
  });

  it('knows what is still missing, and whether a required one is', () => {
    expect(missingDocuments(ROOM).map((document) => document.key)).toEqual([
      'national_id',
      'marriage_certificate',
    ]);
    expect(roomNeedsDocuments(ROOM)).toBe(true);
    const idIn = {
      ...ROOM,
      attachments: [{ key: 'national_id' }],
    } as unknown as BuyerRoom;
    expect(missingDocuments(idIn).map((document) => document.key)).toEqual([
      'marriage_certificate',
    ]);
    expect(roomNeedsDocuments(idIn)).toBe(false);
  });

  it('formats sizes a guest can compare with the limit', () => {
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1.5 MB');
    expect(formatFileSize(300 * 1024)).toBe('300 KB');
  });
});
