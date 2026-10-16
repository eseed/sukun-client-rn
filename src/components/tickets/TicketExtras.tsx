import { StyleSheet, View } from 'react-native';
import type { AddonType, TicketAddon, TicketChild } from '../../api/types';
import { ticketAddonDetail, ticketAddonTitle } from '../../lib/addons';
import { colors, fontFamily } from '../../theme/tokens';
import { Avatar, BedIcon, BusIcon, MealIcon, PlusIcon, Text } from '../ui';

/**
 * A ticket's extras and the children it admits, as the ticket card (light) and the entry pass
 * (dark) both list them. Presentation only: the rows read back what the server attached.
 */

export type ExtrasTone = 'light' | 'inverse';

function palette(tone: ExtrasTone) {
  return tone === 'inverse'
    ? {
        primary: colors.creme,
        muted: colors.textInverseMuted,
        iconWell: colors.borderInverse,
        rule: colors.borderInverse,
      }
    : {
        primary: colors.textPrimary,
        muted: colors.textMuted,
        iconWell: colors.bgPage,
        rule: colors.borderDefault,
      };
}

function AddonIcon({ type, color }: { type: AddonType; color: string }) {
  switch (type) {
    case 'accommodation':
      return <BedIcon color={color} />;
    case 'transport':
      return <BusIcon color={color} />;
    case 'meal':
      return <MealIcon color={color} />;
    default:
      return <PlusIcon size={18} color={color} />;
  }
}

/** One extra: its kind's icon, its name, and the line that says when or where. */
export function AddonRow({ addon, tone = 'light' }: { addon: TicketAddon; tone?: ExtrasTone }) {
  const p = palette(tone);
  return (
    <View style={styles.row}>
      <View style={[styles.iconWell, { backgroundColor: p.iconWell }]}>
        <AddonIcon type={addon.type} color={p.primary} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.title, { color: p.primary }]}>{ticketAddonTitle(addon)}</Text>
        <Text style={[styles.detail, { color: p.muted }]}>{ticketAddonDetail(addon)}</Text>
      </View>
    </View>
  );
}

/**
 * The children who come in on this ticket, each with their own extras. They have no number and
 * no account, so this is the only place they show; the guardian's QR code admits them.
 */
export function ChildrenList({
  childTickets,
  tone = 'light',
}: {
  childTickets: readonly TicketChild[];
  tone?: ExtrasTone;
}) {
  const p = palette(tone);
  return (
    <View>
      {childTickets.map((child, index) => (
        <View
          key={child.ticketId}
          style={[styles.child, index > 0 && [styles.childDivider, { borderTopColor: p.rule }]]}
        >
          <View style={styles.childTop}>
            <Avatar name={child.name} size={32} />
            <View style={styles.rowText}>
              <Text style={[styles.title, { color: p.primary }]}>{child.name}</Text>
              <Text style={[styles.detail, { color: p.muted }]}>
                {child.addons.length === 0 ? `${child.tier.name} · no add-ons` : child.tier.name}
              </Text>
            </View>
          </View>
          {child.addons.length > 0 ? (
            <View style={styles.childAddons}>
              {child.addons.map((addon, addonIndex) => (
                <Text
                  key={`${addon.addonOptionId}-${addonIndex}`}
                  style={[styles.childAddon, { color: p.primary }]}
                >
                  {ticketAddonTitle(addon)}
                  <Text style={[styles.childAddon, { color: p.muted }]}>
                    {` · ${ticketAddonDetail(addon)}`}
                  </Text>
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/** "you, Laila and Omar": who one scan of the guardian's code lets in. */
export function admittedWithYou(childTickets: readonly TicketChild[]): string {
  const names = ['you', ...childTickets.map((child) => child.name)];
  return names.length <= 2
    ? names.join(' and ')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 7,
  },
  /* The 32px well at the add-on thumbnails' 10px-family radius. */
  iconWell: {
    alignItems: 'center',
    borderRadius: 9,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 14.5,
  },
  detail: {
    fontFamily: fontFamily.body,
    fontSize: 12.5,
  },
  child: {
    paddingVertical: 8,
  },
  childDivider: {
    borderStyle: 'dashed',
    borderTopWidth: 1,
  },
  childTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  childAddons: {
    gap: 4,
    marginLeft: 44,
    marginTop: 6,
  },
  childAddon: {
    fontFamily: fontFamily.body,
    fontSize: 12.5,
  },
});
