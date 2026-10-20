import { convertFormDataAsync } from 'expo/src/winter/fetch/convertFormData';
import { liveApi, partFileName } from '../index';
import { request } from '../http';

/**
 * The room documents upload, as the bytes the backend reads: `data` with the keys in order, then
 * each file under its own name and type. Run through Expo's own multipart encoder, which is what
 * the app's `fetch` sends, so a part the encoder cannot read fails here rather than on a phone.
 */

jest.mock('../http', () => ({
  ApiError: class ApiError extends Error {},
  request: jest.fn(),
}));
jest.mock('expo-file-system', () => ({
  File: class {
    mockUri: string;
    constructor(mockUri: string) {
      this.mockUri = mockUri;
    }
    async bytes() {
      return Uint8Array.from(`bytes-of:${this.mockUri}`, (char) => char.charCodeAt(0));
    }
  },
}));

const requestMock = request as jest.MockedFunction<typeof request>;

// The phone's FormData: React Native's, patched by Expo at startup (`winter/runtime.native.ts`).
// jest-expo stubs that patch and Node has its own FormData (which turns a part object into
// "[object Object]"), so both real pieces are installed here for this file.
const nativeFormData = jest.requireActual('react-native/Libraries/Network/FormData').default;
jest.requireActual('expo/src/winter/FormData').installFormDataPatch(nativeFormData);
const nodeFormData = globalThis.FormData;
beforeAll(() => {
  globalThis.FormData = nativeFormData;
});
afterAll(() => {
  globalThis.FormData = nodeFormData;
});

it('posts data and files in matching order, each file named and typed', async () => {
  requestMock.mockResolvedValueOnce({ roomId: 'room-1' });

  await liveApi.rooms.uploadAttachments('room-1', [
    {
      key: 'national_id',
      file: { uri: 'file:///cache/a1.jpg', name: 'ID front.jpg', mimeType: 'image/jpeg', size: 3 },
    },
    {
      key: 'national_id',
      file: {
        uri: 'file:///cache/b2.pdf',
        name: 'ID back.pdf',
        mimeType: 'application/pdf',
        size: 3,
      },
    },
  ]);

  const [path, options] = requestMock.mock.calls[0]!;
  expect(path).toBe('mobile/rooms/room-1/attachments');
  expect(options).toMatchObject({ method: 'POST' });

  const { body, boundary } = await convertFormDataAsync(options!.form!, 'BOUNDARY');
  expect(boundary).toBe('BOUNDARY');
  const text = new TextDecoder().decode(body);
  expect(text).toBe(
    [
      '--BOUNDARY',
      'content-disposition: form-data; name="data"',
      '',
      '{"keys":["national_id","national_id"]}',
      '--BOUNDARY',
      'content-disposition: form-data; name="files"; filename="ID-front.jpg"',
      'content-type: image/jpeg',
      '',
      'bytes-of:file:///cache/a1.jpg',
      '--BOUNDARY',
      'content-disposition: form-data; name="files"; filename="ID-back.pdf"',
      'content-type: application/pdf',
      '',
      'bytes-of:file:///cache/b2.pdf',
      '--BOUNDARY--',
      '',
    ].join('\r\n'),
  );
});

it('names each part in plain ASCII, so the stored name reads as the guest chose it', () => {
  expect(partFileName('ID front.JPG')).toBe('ID-front.jpg');
  expect(partFileName('بطاقة.pdf')).toBe('document.pdf');
  expect(partFileName('IMG_0042.HEIC.jpeg')).toBe('IMG_0042.HEIC.jpeg');
  expect(partFileName('scan')).toBe('scan');
});
