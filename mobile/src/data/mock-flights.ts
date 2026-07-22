import type { Offer, SeatCabin } from '@/data/types';

/**
 * Dummy data shaped exactly like Duffel offers (see backend/schemas/duffel_flights.py).
 * Swap `getMockOffers` for a real `POST /shopping/flight-offers` call once the
 * backend is wired up — the shape downstream components expect won't change.
 */
export const mockOffers: Offer[] = [
  {
    id: 'off_mock_emirates_01',
    total_amount: '1270.00',
    total_currency: 'USD',
    owner: { iata_code: 'EK', name: 'Emirates' },
    slices: [
      {
        id: 'sli_mock_01',
        origin: { iata_code: 'DAC', name: 'Hazrat Shahjalal International', city_name: 'Dhaka' },
        destination: { iata_code: 'YOW', name: 'Ottawa Macdonald-Cartier', city_name: 'Ottawa' },
        duration: 'PT20H20M',
        segments: [
          {
            id: 'seg_mock_01',
            origin: { iata_code: 'DAC', name: 'Hazrat Shahjalal International', city_name: 'Dhaka' },
            destination: { iata_code: 'YOW', name: 'Ottawa Macdonald-Cartier', city_name: 'Ottawa' },
            departing_at: '2026-08-28T12:30:00',
            arriving_at: '2026-08-29T11:30:00',
            duration: 'PT20H20M',
            marketing_carrier: { iata_code: 'EK', name: 'Emirates' },
            marketing_carrier_flight_number: '0584',
          },
        ],
      },
    ],
    passengers: [{ id: 'pas_mock_01', type: 'adult' }],
  },
  {
    id: 'off_mock_qatar_01',
    total_amount: '1370.00',
    total_currency: 'USD',
    owner: { iata_code: 'QR', name: 'Qatar Airways' },
    slices: [
      {
        id: 'sli_mock_02',
        origin: { iata_code: 'DAC', name: 'Hazrat Shahjalal International', city_name: 'Dhaka' },
        destination: { iata_code: 'YOW', name: 'Ottawa Macdonald-Cartier', city_name: 'Ottawa' },
        duration: 'PT19H20M',
        segments: [
          {
            id: 'seg_mock_02',
            origin: { iata_code: 'DAC', name: 'Hazrat Shahjalal International', city_name: 'Dhaka' },
            destination: { iata_code: 'YOW', name: 'Ottawa Macdonald-Cartier', city_name: 'Ottawa' },
            departing_at: '2026-08-28T13:30:00',
            arriving_at: '2026-08-29T12:30:00',
            duration: 'PT19H20M',
            marketing_carrier: { iata_code: 'QR', name: 'Qatar Airways' },
            marketing_carrier_flight_number: '0651',
          },
        ],
      },
    ],
    passengers: [{ id: 'pas_mock_02', type: 'adult' }],
  },
  {
    id: 'off_mock_ba_01',
    total_amount: '980.00',
    total_currency: 'USD',
    owner: { iata_code: 'BA', name: 'British Airways' },
    slices: [
      {
        id: 'sli_mock_03',
        origin: { iata_code: 'DAC', name: 'Hazrat Shahjalal International', city_name: 'Dhaka' },
        destination: { iata_code: 'YOW', name: 'Ottawa Macdonald-Cartier', city_name: 'Ottawa' },
        duration: 'PT22H05M',
        segments: [
          {
            id: 'seg_mock_03',
            origin: { iata_code: 'DAC', name: 'Hazrat Shahjalal International', city_name: 'Dhaka' },
            destination: { iata_code: 'YOW', name: 'Ottawa Macdonald-Cartier', city_name: 'Ottawa' },
            departing_at: '2026-08-28T09:10:00',
            arriving_at: '2026-08-29T09:15:00',
            duration: 'PT22H05M',
            marketing_carrier: { iata_code: 'BA', name: 'British Airways' },
            marketing_carrier_flight_number: '0198',
          },
        ],
      },
    ],
    passengers: [{ id: 'pas_mock_03', type: 'adult' }],
  },
];

export async function getMockOffers(): Promise<Offer[]> {
  return mockOffers;
}

const UNAVAILABLE_SEATS = new Set(['A1', 'D3', 'B5']);

function buildRow(row: number, columns: readonly string[]): SeatCabin['seats'] {
  return columns.map((column) => {
    const designator = `${column}${row}`;
    return { designator, available: !UNAVAILABLE_SEATS.has(designator) };
  });
}

export function getMockSeatMap(): SeatCabin[] {
  const columns = ['A', 'B', 'C', 'D'] as const;
  return [
    {
      cabin_class: 'business',
      rowLabel: 'Business Class',
      seats: [1, 2, 3].flatMap((row) => buildRow(row, columns)),
    },
    {
      cabin_class: 'economy',
      rowLabel: 'Economy Class',
      seats: [4, 5, 6, 7, 8, 9].flatMap((row) => buildRow(row, columns)),
    },
  ];
}
