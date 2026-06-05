from django.conf import settings
from django.http import JsonResponse
from django.shortcuts import render

from .models import Hall


def _hall_to_dict(hall: Hall) -> dict:
    return {
        "id": hall.id,
        "name": hall.name,
        "slug": hall.slug,
        "lat": hall.latitude,
        "lng": hall.longitude,
        "address": hall.address,
        "campus_zone": hall.campus_zone,
        "description": hall.description,
        "capacity": hall.capacity,
        "phone": hall.phone,
        "amenities": hall.amenities,
        "is_featured": hall.is_featured,
        "image": hall.image.url if hall.image else None,
    }


def home(request):
    halls = Hall.objects.filter(is_active=True)
    hall_data = [_hall_to_dict(h) for h in halls]
    zones = (
        Hall.objects.filter(is_active=True)
        .exclude(campus_zone="")
        .values_list("campus_zone", flat=True)
        .distinct()
        .order_by("campus_zone")
    )
    return render(
        request,
        "finder/home.html",
        {
            "halls": halls,
            "hall_data": hall_data,
            "zones": zones,
            "ors_api_key": settings.ORS_API_KEY or "",
        },
    )


def api_halls(request):
    halls = Hall.objects.filter(is_active=True)
    return JsonResponse({"halls": [_hall_to_dict(h) for h in halls]})


def api_route(request):
    """
    Calculate and return a route between two coordinates using OpenRouteService.
    Query params: origin_lat, origin_lng, dest_lat, dest_lng, mode (WALKING|DRIVING|TRANSIT)
    """
    try:
        origin_lat = float(request.GET.get("origin_lat", 0))
        origin_lng = float(request.GET.get("origin_lng", 0))
        dest_lat = float(request.GET.get("dest_lat", 0))
        dest_lng = float(request.GET.get("dest_lng", 0))
        mode = request.GET.get("mode", "WALKING")

        if not all([origin_lat, origin_lng, dest_lat, dest_lng]):
            return JsonResponse({"error": "Missing route parameters"}, status=400)

        api_key = settings.ORS_API_KEY
        if not api_key:
            return JsonResponse({"error": "OpenRouteService API key not configured"}, status=500)

        # Map travel mode to ORS profile
        profile_map = {"DRIVING": "driving-car", "WALKING": "foot-walking", "TRANSIT": "foot-walking"}
        profile = profile_map.get(mode, "foot-walking")

        # Call OpenRouteService API
        import requests

        ors_url = f"https://api.openrouteservice.org/v2/directions/{profile}/geojson"
        headers = {"Authorization": api_key, "Content-Type": "application/json"}
        payload = {"coordinates": [[origin_lng, origin_lat], [dest_lng, dest_lat]]}

        response = requests.post(ors_url, json=payload, headers=headers, timeout=10)

        if response.status_code != 200:
            return JsonResponse({"error": f"Route calculation failed: {response.status_code}"}, status=400)

        data = response.json()
        route_feature = data.get("features", [{}])[0]

        return JsonResponse(
            {
                "route": route_feature,
                "distance": route_feature.get("properties", {}).get("summary", {}).get("distance", 0),
                "duration": route_feature.get("properties", {}).get("summary", {}).get("duration", 0),
            }
        )

    except Exception as e:
        import traceback

        traceback.print_exc()
        return JsonResponse({"error": f"Route error: {str(e)}"}, status=500)
