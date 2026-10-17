import type { EventContentBlock } from '../../api/types';
import { contentBlockHeading, contentBlocksOfKind, groupSponsors } from '../content-blocks';

const blocks: EventContentBlock[] = [
  { id: 'l1', type: 'logistics', title: 'Buses', body: '<p>Bus</p>', addonId: null },
  { id: 'f1', type: 'faq', title: null, body: null, items: [{ question: 'Q', answer: 'A' }] },
  { id: 'l2', type: 'logistics', title: null, body: '<p>Cabins</p>', addonId: 'addon-1' },
  { id: 'f2', type: 'faq', title: 'Empty', body: null, items: [] },
  { id: 'a1', type: 'accessibility', title: null, body: '   ' },
];

describe('contentBlocksOfKind', () => {
  it("keeps one kind's blocks in the admin's order", () => {
    expect(contentBlocksOfKind(blocks, 'logistics').map((block) => block.id)).toEqual(['l1', 'l2']);
  });

  it('leaves out a block with nothing to show, so an empty kind renders nothing', () => {
    expect(contentBlocksOfKind(blocks, 'faq').map((block) => block.id)).toEqual(['f1']);
    expect(contentBlocksOfKind(blocks, 'accessibility')).toEqual([]);
    expect(contentBlocksOfKind(blocks, 'sponsors')).toEqual([]);
  });

  it('reads missing blocks (an older backend) as none', () => {
    expect(contentBlocksOfKind(undefined, 'faq')).toEqual([]);
  });
});

describe('contentBlockHeading', () => {
  it("uses the admin's title, else the kind's own heading", () => {
    expect(contentBlockHeading(blocks[0]!)).toBe('Buses');
    expect(contentBlockHeading(blocks[2]!)).toBe('Getting there');
    expect(contentBlockHeading(blocks[1]!)).toBe('Questions');
    expect(
      contentBlockHeading({ id: 'i', type: 'inclusions', title: '  ', body: null, items: [] }),
    ).toBe("What's included");
    expect(
      contentBlockHeading({ id: 's', type: 'sponsors', title: null, body: null, items: [] }),
    ).toBe('Partners');
    expect(contentBlockHeading({ id: 'a', type: 'accessibility', title: null, body: 'x' })).toBe(
      'Accessibility',
    );
  });
});

describe('groupSponsors', () => {
  it('leads with the first tier listed, the rest grouped by tier in order', () => {
    const { lead, rest } = groupSponsors([
      { name: 'A', tier: 'Presenting partner' },
      { name: 'B', tier: 'Partners' },
      { name: 'C', tier: 'Friends' },
      { name: 'D', tier: 'partners' },
    ]);
    expect(lead).toEqual({
      tier: 'Presenting partner',
      items: [{ name: 'A', tier: 'Presenting partner' }],
    });
    expect(rest.map((group) => [group.tier, group.items.map((item) => item.name)])).toEqual([
      ['Partners', ['B', 'D']],
      ['Friends', ['C']],
    ]);
  });

  it('has no lead when every sponsor shares one tier, or none has a tier', () => {
    expect(
      groupSponsors([
        { name: 'A', tier: 'Partners' },
        { name: 'B', tier: 'Partners' },
      ]).lead,
    ).toBeNull();
    expect(groupSponsors([{ name: 'A' }, { name: 'B', tier: 'Partners' }]).lead).toBeNull();
    expect(groupSponsors([{ name: 'A' }, { name: 'B' }])).toEqual({
      lead: null,
      rest: [{ tier: null, items: [{ name: 'A' }, { name: 'B' }] }],
    });
  });
});
