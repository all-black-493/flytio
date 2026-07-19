from fastapi import APIRouter, HTTPException, status, Query, Depends
from backend.external_services.flight import amadeus_flight_service
from backend.schemas.flights import FlightSearchResponse, FlightPricingResponse
from backend.utils.cache import make_cache_key, get_cached, set_cached
from backend.schemas.flight_search import (
    FlightSearchRequestPost,
    FlightSearchRequestGet,
)
from backend.schemas.flight_price_confirm import FlightOfferRequest
from backend.schemas.flight_order import FlightOrderRequestBody
from typing import Annotated
from backend.utils.security import get_current_user
from backend.models.users import UserInDB

router = APIRouter()

FLIGHT_SEARCH_CACHE_TTL_SECONDS = 60


@router.post("/shopping/flight-offers", response_model=FlightSearchResponse)
async def search_flights(request: FlightSearchRequestPost):
    """
    Search for flights using the Amadeus Flight Search API.
    This endpoint accepts a validated flight search request and returns available flight offers from the Amadeus API. The request is validated using pydantic models.
    Responses are cached in Redis for one minute per unique search request.
    """
    try:
        request_body = request.model_dump(by_alias=True, mode="json")

        print(request_body)

        cache_key = make_cache_key("flights:search", request_body)
        cached_response = await get_cached(cache_key)
        if cached_response is not None:
            return cached_response
        response = amadeus_flight_service.search_flights(request_body)
        await set_cached(cache_key, response, FLIGHT_SEARCH_CACHE_TTL_SECONDS)

        return response
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        print("Error: ", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Flight search failed: {str(e)}",
        )


@router.get("/shopping/flight-offers")
async def search_flights_2(request: Annotated[FlightSearchRequestGet, Query()]):
    request_body = request.model_dump(mode="json", exclude_none=True)
    response = amadeus_flight_service.search_flights_get(request_body)
    return response


@router.post("/shopping/flight-offers/pricing", response_model=FlightPricingResponse)
async def confirm_price(request: FlightOfferRequest):
    """
    Confirm flight pricing using the Amadeus Flight Offers Pricing API

    This endpoint accepts a flight offer request and returns confirmed pricing information from the Amadeus API
    """
    try:
        request_body = request.model_dump(mode="json", by_alias=True)
        response = amadeus_flight_service.confirm_price(request_body)
        return response
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Price confirmation failed: {str(e)}"
        )


@router.post("/booking/flight-orders")
async def flight_order(
    request: FlightOrderRequestBody, current_user: UserInDB = Depends(get_current_user)
):
    """
    Create Order associated with a flight
    """
    request_body = request.model_dump(mode="json", by_alias=True)
    response = amadeus_flight_service.create_flight_order(request_body)
    return response
