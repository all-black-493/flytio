import { account } from "@interfaces/http/procedures/account";
import { auth } from "@interfaces/http/procedures/auth";
import { bookings } from "@interfaces/http/procedures/bookings";
import { flights } from "@interfaces/http/procedures/flights";
import { payments } from "@interfaces/http/procedures/payments";
import { places } from "@interfaces/http/procedures/places";
import { routes } from "@interfaces/http/procedures/routes";

/** Business API. Health is served separately - see health-route.ts. */
export const router = { ...routes, ...places, ...flights, ...account, ...auth, ...bookings, ...payments };
