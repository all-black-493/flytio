import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import type { Order } from '@/data/types';
import { useTheme } from '@/hooks/use-theme';
import { formatShortDate, formatTime } from '@/utils/format';

export type BoardingPassCardProps = {
  order: Order;
  passengerName: string;
  seat: string;
  cabinClass: string;
};

function Notch({ side }: { side: 'left' | 'right' }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.notch,
        { backgroundColor: theme.background },
        side === 'left' ? styles.notchLeft : styles.notchRight,
      ]}
    />
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <ThemedText type="caption" themeColor="onPrimary" style={styles.fieldLabel}>
        {label}
      </ThemedText>
      <ThemedText type="bodyBold" themeColor="onPrimary">
        {value}
      </ThemedText>
    </View>
  );
}

export function BoardingPassCard({ order, passengerName, seat, cabinClass }: BoardingPassCardProps) {
  const theme = useTheme();
  const slice = order.slices[0];
  const segment = slice.segments[0];

  return (
    <View style={[styles.card, { backgroundColor: theme.primary }]}>
      <ThemedText type="subtitle" themeColor="onPrimary">
        {order.owner?.name ?? 'Airline'}
      </ThemedText>

      <View style={styles.routeRow}>
        <View style={styles.routeEnd}>
          <ThemedText type="display" themeColor="onPrimary">
            {segment.origin.iata_code}
          </ThemedText>
          <ThemedText type="caption" themeColor="onPrimary" style={styles.muted}>
            {segment.origin.city_name}
          </ThemedText>
        </View>
        <Ionicons name="airplane" size={22} color={theme.onPrimary} style={styles.planeIcon} />
        <View style={[styles.routeEnd, styles.routeEndRight]}>
          <ThemedText type="display" themeColor="onPrimary">
            {segment.destination.iata_code}
          </ThemedText>
          <ThemedText type="caption" themeColor="onPrimary" style={styles.muted}>
            {segment.destination.city_name}
          </ThemedText>
        </View>
      </View>

      <View style={styles.fieldRow}>
        <Field label="Boarding Time" value={formatTime(segment.departing_at)} />
        <Field label="Departure Time" value={formatTime(segment.departing_at)} />
        <Field label="Arrival Time" value={formatTime(segment.arriving_at)} />
      </View>

      <View style={styles.fieldRow}>
        <Field label="Passenger Name" value={passengerName} />
        <Field label="Date" value={formatShortDate(segment.departing_at)} />
        <Field label="Class" value={cabinClass} />
      </View>

      <View style={styles.perforationRow}>
        <Notch side="left" />
        <View style={styles.dashedLine} />
        <Notch side="right" />
      </View>

      <View style={styles.fieldRow}>
        <Field label="Gate" value="15" />
        <Field label="Terminal" value="2" />
        <Field label="Seat" value={seat} />
        <Field label="Weight" value="30KG" />
      </View>

      <View style={styles.qrWrap}>
        <View style={styles.qrCard}>
          <QRCode value={order.booking_reference} size={96} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.large,
    padding: Spacing.four,
    gap: Spacing.four,
    overflow: 'hidden',
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  routeEnd: {
    gap: 2,
  },
  routeEndRight: {
    alignItems: 'flex-end',
  },
  planeIcon: {
    transform: [{ rotate: '90deg' }],
  },
  muted: {
    opacity: 0.8,
  },
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  field: {
    gap: 2,
  },
  fieldLabel: {
    opacity: 0.75,
  },
  perforationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: -Spacing.four,
  },
  dashedLine: {
    flex: 1,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.5)',
  },
  notch: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  notchLeft: {
    marginLeft: -10,
  },
  notchRight: {
    marginRight: -10,
  },
  qrWrap: {
    alignItems: 'center',
  },
  qrCard: {
    backgroundColor: '#FFFFFF',
    padding: Spacing.two,
    borderRadius: Radius.medium,
  },
});
