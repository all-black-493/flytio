from fastapi import APIRouter, HTTPException, status
from backend.external_services.flight import amadeus_flight_service
from backend.schemas.flights import (
    AmadeusFlightSearchRequest,
    FlightSearchResponse,
    FlightOfferRequest,
)

router = APIRouter()


@router.post("/flights/search", response_model=FlightSearchResponse)
async def search_flights(request: AmadeusFlightSearchRequest):
    """
    Search for flights using the Amadeus Flight Search API.
    This endpoint accepts a validated flight search request and returns available flight offers from the Amadeus API. The request is validated using pydantic models
    """
    try:
        request_body = request.model_dump(by_alias=True, mode="json")
        print(request_body)
        response = amadeus_flight_service.search_flights(request_body)
        return response
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        print("Error: ", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Flight search failed: {str(e)}",
        )


@router.post("/flights/price")
async def confirm_price(request: FlightOfferRequest):
    request_body = request.model_dump(mode="json", by_alias=True)
    response = amadeus_flight_service.confirm_price(request_body)
    return response
