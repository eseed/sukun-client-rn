import { registerAcquisitionDevice, submitKochavaAttribution } from '../acquisition';
import { request } from '../http';

jest.mock('../http', () => ({
  request: jest.fn(),
}));

const requestMock = request as jest.MockedFunction<typeof request>;

beforeEach(() => {
  requestMock.mockReset();
});

describe('live acquisition routes', () => {
  it('registers the Sukun-owned installation without auth', async () => {
    const response = {
      deviceId: 'cfa8c18c-77c0-40f7-a366-9423036f0325',
      attributionStatus: 'pending' as const,
      hasFirstAttribution: false,
    };
    requestMock.mockResolvedValueOnce(response);

    await expect(
      registerAcquisitionDevice({
        deviceId: response.deviceId,
        platform: 'android',
        appVersion: '2.0.1',
      }),
    ).resolves.toBe(response);

    expect(requestMock).toHaveBeenCalledWith(
      'mobile/devices',
      expect.objectContaining({
        method: 'POST',
        auth: false,
        body: {
          deviceId: response.deviceId,
          platform: 'android',
          appVersion: '2.0.1',
        },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('submits the provider result unchanged under the Sukun device UUID', async () => {
    const deviceId = 'cfa8c18c-77c0-40f7-a366-9423036f0325';
    const payload = {
      success: 1,
      action: 'get_attribution',
      data: { kochava_device_id: 'provider-id', retry: -1, attribution: false },
    };
    const response = {
      id: 'attribution-1',
      deviceId,
      provider: 'kochava' as const,
      status: 'organic' as const,
      isFirstAttribution: true,
      receivedAt: '2026-09-21T12:00:00.000Z',
    };
    requestMock.mockResolvedValueOnce(response);

    await expect(
      submitKochavaAttribution(deviceId, {
        provider: 'kochava',
        providerInstallationId: 'provider-id',
        providerSdkVersion: '5.0.0',
        payload,
      }),
    ).resolves.toBe(response);

    expect(requestMock).toHaveBeenCalledWith(
      `mobile/devices/${deviceId}/attributions`,
      expect.objectContaining({
        method: 'POST',
        auth: false,
        body: {
          provider: 'kochava',
          providerInstallationId: 'provider-id',
          providerSdkVersion: '5.0.0',
          payload,
        },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(requestMock.mock.calls[0]?.[1]?.body).toMatchObject({ payload });
  });
});
