"""City-level OSM reverse geocoding with a shared request limit and cache."""

import asyncio
import logging
import time
from collections import OrderedDict

import httpx

logger = logging.getLogger(__name__)


class GeocodingError(RuntimeError):
    pass


class MapGeocoder:
    def __init__(self, client: httpx.AsyncClient, endpoint: str) -> None:
        self._client, self._endpoint = client, endpoint
        self._lock = asyncio.Lock()
        self._last_request = 0.0
        self._cache: OrderedDict[tuple[float, float], str | None] = OrderedDict()

    async def city(self, latitude: float, longitude: float) -> str | None:
        key = (round(latitude, 3), round(longitude, 3))
        async with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
                return self._cache[key]
            await asyncio.sleep(max(0.0, 1.1 - (time.monotonic() - self._last_request)))
            self._last_request = time.monotonic()
            try:
                response = await self._client.get(
                    self._endpoint,
                    params={
                        "lat": str(key[0]),
                        "lon": str(key[1]),
                        "format": "geocodejson",
                        "zoom": "10",
                        "layer": "address",
                        "accept-language": "zh-CN",
                    },
                    headers={
                        "User-Agent": "Kunyu-GeoAgent/0.1 (desktop map city lookup)"
                    },
                    timeout=10,
                )
                response.raise_for_status()
                data = response.json()
                features = data["features"]
                if not isinstance(features, list):
                    raise ValueError("Geocoding features must be a list.")
                name = None
                if features:
                    place = features[0]["properties"]["geocoding"]
                    name = (
                        place["name"] if place["type"] == "city" else place.get("city")
                    )
                    if name is not None and (
                        not isinstance(name, str) or not name.strip()
                    ):
                        raise ValueError("Geocoding city name is invalid.")
            except (
                httpx.HTTPError,
                ValueError,
                KeyError,
                TypeError,
                IndexError,
            ) as error:
                logger.warning("Map city lookup failed: %s", error)
                raise GeocodingError("无法读取地图所在城市。") from error
            self._cache[key] = name
            if len(self._cache) > 256:
                self._cache.popitem(last=False)
            return name
