from dotenv import load_dotenv
import os
from amadeus import Client, ResponseError

load_dotenv()

traveler = {
    "id": "1",
    "dateOfBirth": "1999-01-16",
    "name": {"firstName": "JORGE", "lastName": "GONZALES"},
    "gender": "MALE",
    "contact": {
        "emailAddress": "jorge.gonzales833@gmail.com",
        "phones": [
            {"deviceType": "MOBILE", "countryCallingCode": "34", "number": "480080076"}
        ],
    },
    "documents": [
        {
            "documentType": "PASSPORT",
            "birthPlace": "Madrid",
            "issuanceLocation": "Madrid",
            "issuanceDate": "2018-04-14",
            "number": "00000000",
            "expiryDate": "2026-09-14",
            "issuanceCountry": "ES",
            "validityCountry": "ES",
            "nationality": "ES",
            "holder": True,
        }
    ],
}


class AmadeusFlightService:
    """Service for interacting with Amadeus Flight Search API using Amadeus SDK"""

    def __init__(self):
        self.api_key = os.getenv("AMADEUS_API_KEY")
        self.api_secret = os.getenv("AMADEUS_API_SECRET")

        if not self.api_key or not self.api_secret:
            raise ValueError("Amadeus API credentials not configured")

        try:
            self.amadeus = Client(client_id=self.api_key, client_secret=self.api_secret)
            print("Amadeus client created successfully")
        except Exception as e:
            print(f"Error creating Amadeus client: {e}")
            raise Exception(f"Failed to create Amadeus client: {str(e)}")

    def search_flights(self, request_body: dict) -> dict:
        try:
            response = self.amadeus.shopping.flight_offers_search.post(request_body)

            if hasattr(response, "data"):
                return {
                    "meta": {"count": len(response.data)},
                    "data": response.data,
                    "dictionaries": (
                        response.result.get("dictionaries", {})
                        if hasattr(response, "result")
                        else {}
                    ),
                }

            return response.result if hasattr(response, "result") else {}

        except ResponseError as api_error:
            print(f"Amadeus API error: {api_error}")
            print("Status:", api_error.response.status_code)
            print("Body:", api_error.response.body)
            print("Result:", api_error.response.result)
            raise Exception(f"Amadeus API Error: {api_error}")

        except Exception as e:
            print(f"Error processing flight search: {e}")
            raise Exception(f"Error processing flight search: {e}")

    def confirm_price(self, request_body: dict) -> dict:
        response = self.amadeus.shopping.flight_offers.pricing.post(request_body)
        return response.data

    def create_flight_order(self, request_body: dict):
        try:
            travelers = request_body.get("travelers")

            body = {
                "originLocationCode": request_body.get("originLocationCode"),
                "destinationLocationCode": request_body.get("destinationLocationCode"),
                "departureDate": request_body.get("departureDate"),
                "adults": request_body.get("adults"),
            }

            if request_body.get("returnDate"):
                body.update({"returnDate": request_body.get("returnDate")})

            flight_search = self.amadeus.shopping.flight_offers_search.get(**body).data

            # price_confirm = self.amadeus.flight_offers.pricing.post(
            #     flight_search[0]
            # ).data

            booked_flight = self.amadeus.booking.flight_orders.post(
                flight_search[0], travelers
            ).data
            return booked_flight

        except ResponseError as error:
            raise error

    def search_flights_get(self, request_body: dict) -> dict:
        try:
            response = self.amadeus.shopping.flight_offers_search.get(
                **request_body
            ).data
            return response
        except ResponseError as error:
            raise error


amadeus_flight_service = AmadeusFlightService()
