import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  Card,
  PageHeader,
  ResourceState,
  Screen,
  Text,
} from '../../src/components/ui';
import { useOrders } from '../../src/hooks/queries';
import { formatDate, formatEgp } from '../../src/lib/format';
import { colors, space } from '../../src/theme/tokens';

function statusLabel(status: string): string {
  return status.replaceAll('_', ' ');
}

export default function OrdersScreen() {
  const router = useRouter();
  const orders = useOrders({ limit: 20 });
  const items = orders.data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <Screen scroll contentStyle={styles.content}>
      <PageHeader
        title="Order history"
        subtitle="Your purchases, all in one place."
        onBack={() => router.back()}
      />

      <ResourceState
        status={orders.isLoading ? 'loading' : orders.isError ? 'error' : items.length === 0 ? 'empty' : 'success'}
        loadingLabel="Loading your orders..."
        emptyTitle="No orders yet"
        emptyMessage="Orders you place will appear here."
        errorMessage="We couldn't load your order history."
        onRetry={() => void orders.refetch()}
      >
        <View style={styles.list}>
          {items.map((order) => (
            <Pressable
              key={order.id}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/orders/[id]', params: { id: order.id } })}
              style={({ pressed }) => [pressed && styles.pressed]}
            >
              <Card style={styles.card}>
                <View style={styles.cardTop}>
                  <Text variant="eyebrow">Order {order.orderNumber}</Text>
                  <Text variant="metaSm" style={styles.status}>
                    {statusLabel(order.status)}
                  </Text>
                </View>
                <View style={styles.cardBottom}>
                  <Text variant="meta">{formatDate(order.createdAt)}</Text>
                  <Text variant="bodyValue" style={styles.total}>
                    {formatEgp(order.totalEgp)}
                  </Text>
                </View>
              </Card>
            </Pressable>
          ))}

          {orders.hasNextPage ? (
            <Pressable
              accessibilityRole="button"
              disabled={orders.isFetchingNextPage}
              onPress={() => void orders.fetchNextPage()}
              style={styles.more}
            >
              <Text variant="buttonLabel" color={colors.accentSky}>
                {orders.isFetchingNextPage ? 'Loading...' : 'Load more'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </ResourceState>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.s5,
  },
  list: {
    gap: space.s3,
  },
  card: {
    gap: space.s4,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.s3,
  },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.s3,
  },
  status: {
    textTransform: 'capitalize',
  },
  total: {
    fontWeight: '600',
  },
  more: {
    alignItems: 'center',
    paddingVertical: space.s4,
  },
  pressed: {
    opacity: 0.75,
  },
});
