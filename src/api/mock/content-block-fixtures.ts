import type { EventContentBlock } from '../types';
import { ADDON_ACCOMMODATION, ADDON_TRANSPORT } from './addon-fixtures';
import { TULUA_ID } from './fixtures';

/**
 * Tulua's published content blocks, in the admin's order, written after the approved design's
 * sample content (`approved-content-blocks-design.html`) and fitted to the mock event.
 *
 * Shaped as `GET public/events/:id` sends them: `body` is the admin's Markdown already rendered
 * and sanitised to HTML by the backend, a sponsor without a logo has no `logoUrl`, and a
 * logistics block names its add-on only while that add-on is switched on. The other mock events
 * have none, which is how an event without blocks reads.
 */
export const contentBlocksByEvent: Record<string, EventContentBlock[]> = {
  [TULUA_ID]: [
    {
      id: 'cb-tulua-included',
      type: 'inclusions',
      title: null,
      body: null,
      items: [
        { label: 'Two days of sessions on every stage' },
        { label: 'Breakfast and dinner on both days' },
        { label: 'Desert walks and the sound bath at sunset' },
        { label: 'Yoga mats and props provided' },
      ],
    },
    {
      id: 'cb-tulua-bus',
      type: 'logistics',
      title: 'Buses from Cairo',
      body:
        '<p>Coaches leave Cairo Festival City at <strong>8:00 AM on Friday</strong> and come ' +
        'back on Sunday afternoon. The ride takes about five hours.</p>',
      addonId: ADDON_TRANSPORT,
    },
    {
      id: 'cb-tulua-faq',
      type: 'faq',
      title: null,
      body: null,
      items: [
        {
          question: 'Can I come for one day only?',
          answer:
            'Yes. Pick a day pass when you get your ticket. It covers every session that day.',
        },
        {
          question: 'Are children welcome?',
          answer:
            "Children aged 4 to 12 come on a kids' pass with an adult. Add them to the adult's " +
            'order and they enter on the same QR.',
        },
        {
          question: 'What if the weather turns?',
          answer:
            'Sessions move into the covered tents. The schedule in the app updates if anything ' +
            'changes.',
        },
      ],
    },
    {
      id: 'cb-tulua-stay',
      type: 'logistics',
      title: 'Staying the night',
      body:
        '<p>Desert Lodge rooms are a short walk from the main stage. Check-in from 2:00 PM, ' +
        'breakfast included.</p>',
      addonId: ADDON_ACCOMMODATION,
    },
    {
      id: 'cb-tulua-access',
      type: 'accessibility',
      title: null,
      body:
        '<ul><li>Step-free paths from the bus stop to the main stage and the dining tent.</li>' +
        '<li>A quiet tent is open all day near the entrance.</li>' +
        "<li>Message the team on WhatsApp before the day and we'll plan with you.</li></ul>",
    },
    {
      id: 'cb-tulua-partners',
      type: 'sponsors',
      title: null,
      body: null,
      items: [
        { name: 'Siwa Springs', tier: 'Presenting partner' },
        { name: 'Nile Roasters', tier: 'Partners' },
        { name: 'Desert Loom', tier: 'Partners' },
        { name: 'Red Sea Yoga', tier: 'Partners' },
      ],
    },
  ],
};
