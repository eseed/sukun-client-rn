import type { LiveEventDetail } from '../../types';
import { normalizeContentBlocks, normalizeEventDetail } from '../content-blocks';
import { liveApi } from '../index';
import { request } from '../http';

jest.mock('../http', () => ({
  ApiError: class ApiError extends Error {},
  request: jest.fn(),
}));

const requestMock = request as jest.MockedFunction<typeof request>;

/** A public event detail as a backend from before content blocks sends it. */
const olderEvent = { id: 'event-1', slug: 'tulua-2026', title: 'Tulua' } as LiveEventDetail;

beforeEach(() => {
  requestMock.mockReset();
});

describe('content blocks on the public event detail', () => {
  it('reads a response without contentBlocks as none', async () => {
    requestMock.mockResolvedValueOnce(olderEvent);

    const event = await liveApi.events.detail('tulua-2026');

    expect(requestMock).toHaveBeenCalledWith('public/events/tulua-2026', expect.anything());
    expect(event.contentBlocks).toEqual([]);
    expect(event.title).toBe('Tulua');
  });

  it('keeps every kind the backend sends, in its order, exactly as sent', () => {
    const wire = [
      {
        id: 'b1',
        type: 'logistics',
        title: 'Buses from Cairo',
        body: '<p>Buses leave at 9.</p>',
        addonId: 'addon-1',
      },
      { id: 'b2', type: 'faq', title: null, body: null, items: [{ question: 'Q?', answer: 'A.' }] },
      {
        id: 'b3',
        type: 'inclusions',
        title: null,
        body: '<p>All this:</p>',
        items: [{ label: 'Meals', description: 'Both days' }, { label: 'Mats' }],
      },
      {
        id: 'b4',
        type: 'sponsors',
        title: 'Our partners',
        body: null,
        items: [
          {
            name: 'Lead Co',
            logoUrl: 'https://cdn.test/lead.webp',
            link: 'https://lead.test',
            tier: 'Presenting partner',
          },
          { name: 'Plain Co' },
        ],
      },
      { id: 'b5', type: 'accessibility', title: null, body: '<p>Step-free.</p>' },
    ];

    const event = normalizeEventDetail({
      ...olderEvent,
      contentBlocks: wire,
    } as unknown as LiveEventDetail);

    expect(event.contentBlocks).toEqual(wire);
  });

  it('reads a missing title as none, and a switched-off add-on as no add-on', () => {
    expect(
      normalizeContentBlocks([
        { id: 'b1', type: 'logistics', body: '<p>Park at gate 2.</p>', addonId: null },
        { id: 'b2', type: 'accessibility', body: '<p>Quiet tent.</p>' },
      ]),
    ).toEqual([
      { id: 'b1', type: 'logistics', title: null, body: '<p>Park at gate 2.</p>', addonId: null },
      { id: 'b2', type: 'accessibility', title: null, body: '<p>Quiet tent.</p>' },
    ]);
  });

  it('leaves out a kind this build does not know, and items missing what they need', () => {
    expect(
      normalizeContentBlocks([
        { id: 'b1', type: 'countdown', title: 'Soon', body: '<p>Soon</p>' },
        { type: 'faq', items: [] },
        {
          id: 'b2',
          type: 'faq',
          title: null,
          body: null,
          items: [{ question: 'Kept?', answer: 'Yes.' }, { question: 'No answer' }, 'junk'],
        },
        {
          id: 'b3',
          type: 'sponsors',
          title: null,
          body: null,
          items: [{ tier: 'Partners' }, { name: 'Named', tier: ' ' }],
        },
        null,
      ]),
    ).toEqual([
      {
        id: 'b2',
        type: 'faq',
        title: null,
        body: null,
        items: [{ question: 'Kept?', answer: 'Yes.' }],
      },
      { id: 'b3', type: 'sponsors', title: null, body: null, items: [{ name: 'Named' }] },
    ]);
  });

  it('reads anything but a list as none', () => {
    expect(normalizeContentBlocks(undefined)).toEqual([]);
    expect(normalizeContentBlocks(null)).toEqual([]);
    expect(normalizeContentBlocks({ id: 'b1', type: 'faq' })).toEqual([]);
  });
});
