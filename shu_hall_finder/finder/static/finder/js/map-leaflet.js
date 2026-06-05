/**
 * SHU Hall Finder - Leaflet.js + OpenStreetMap + OpenRouteService
 * Complete mapping, routing, and navigation system
 */

(function () {
    // Configuration
    const CONFIG = {
        CENTER: { lat: 5.9597, lng: 10.1453 },
        BOUNDS: {
            north: 5.99,
            south: 5.92,
            east: 10.19,
            west: 10.1,
        },
        ZOOM: 15,
        MAX_ZOOM: 19,
        MIN_ZOOM: 13,
    };

    // State management
    let map = null;
    let hallsById = {};
    let hallList = [];
    let selectedHall = null;
    let userLocation = null;
    let currentRoute = null;
    let routeLayer = null;
    let markers = {
        halls: [],
        userLocation: null,
        destination: null,
    };
    let currentTravelMode = "foot-walking";

    // ============ Utility Functions ============
    function showToast(message, type = "info") {
        const host = document.getElementById("toastHost");
        if (!host) {
            console.log(message);
            return;
        }
        const el = document.createElement("div");
        el.className = `app-toast app-toast--${type}`;
        el.setAttribute("role", "status");
        el.textContent = message;
        host.appendChild(el);
        requestAnimationFrame(() => el.classList.add("app-toast--show"));
        setTimeout(() => {
            el.classList.remove("app-toast--show");
            setTimeout(() => el.remove(), 300);
        }, 4200);
    }

    function getHallQuery() {
        return document.getElementById("hallSearchInput")?.value?.trim() || "";
    }

    function getZone() {
        return document.getElementById("zoneFilter")?.value || "";
    }

    function hallMatchesQuery(h, q) {
        if (!q) return true;
        const blob = [h.name, h.description, h.address, h.campus_zone, h.amenities]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
        const tokens = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
        if (!tokens.length) return true;
        return tokens.every((t) => blob.includes(t));
    }

    function getVisibleHalls() {
        const zone = getZone();
        const q = getHallQuery();
        return hallList.filter(
            (h) =>
                (!zone || h.campus_zone === zone) && hallMatchesQuery(h, q)
        );
    }

    function hallMetaLine(h) {
        const bits = [];
        if (h.campus_zone) bits.push(h.campus_zone);
        if (h.capacity) bits.push(`${h.capacity} seats`);
        if (h.phone) bits.push(h.phone);
        return bits.join(" • ");
    }

    function formatDistance(meters) {
        if (meters < 1000) return `${Math.round(meters)}m`;
        return `${(meters / 1000).toFixed(1)}km`;
    }

    function formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        if (hours > 0) {
            return `${hours}h ${mins}m`;
        }
        return `${mins}m`;
    }

    // ============ Map Initialization ============
    function initMap() {
        const mapEl = document.getElementById("map");
        if (!mapEl) return;

        map = L.map(mapEl, {
            center: [CONFIG.CENTER.lat, CONFIG.CENTER.lng],
            zoom: CONFIG.ZOOM,
            maxZoom: CONFIG.MAX_ZOOM,
            minZoom: CONFIG.MIN_ZOOM,
            zoomControl: false,
        });

        // Add OpenStreetMap tiles
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution:
                '© OpenStreetMap contributors',
            maxZoom: CONFIG.MAX_ZOOM,
            minZoom: CONFIG.MIN_ZOOM,
        }).addTo(map);

        // Setup controls
        setupMapControls();
        setupEventListeners();

        // Load and render halls
        loadHalls();
        renderHallMarkers();
        fitMapBounds();

        console.log("Map initialized successfully");
    }

    function setupMapControls() {
        const btnLocateMe = document.getElementById("btnLocateMe");
        const btnZoomIn = document.getElementById("btnZoomIn");
        const btnZoomOut = document.getElementById("btnZoomOut");

        if (btnLocateMe) {
            btnLocateMe.addEventListener("click", locateUser);
        }
        if (btnZoomIn) {
            btnZoomIn.addEventListener("click", () => map.zoomIn());
        }
        if (btnZoomOut) {
            btnZoomOut.addEventListener("click", () => map.zoomOut());
        }
    }

    function setupEventListeners() {
        // Search and filter
        const searchInput = document.getElementById("hallSearchInput");
        const zoneFilter = document.getElementById("zoneFilter");

        if (searchInput) {
            searchInput.addEventListener("input", () => {
                renderHallMarkers();
                renderResultsList();
            });
        }

        if (zoneFilter) {
            zoneFilter.addEventListener("change", () => {
                renderHallMarkers();
                renderResultsList();
            });
        }

        // Directions
        const btnGetDirections = document.getElementById("btnGetDirections");
        const btnClearRoute = document.getElementById("btnClearRoute");
        const travelBtns = document.querySelectorAll(".travel-btn");

        if (btnGetDirections) {
            btnGetDirections.addEventListener("click", getDirections);
        }

        if (btnClearRoute) {
            btnClearRoute.addEventListener("click", clearRoute);
        }

        travelBtns.forEach((btn) => {
            btn.addEventListener("click", (e) => {
                travelBtns.forEach((b) => b.classList.remove("active"));
                btn.classList.add("active");
                currentTravelMode = btn.dataset.mode;
                if (currentRoute) {
                    getDirections();
                }
            });
        });

        const btnCloseDetails = document.getElementById("btnCloseDetails");
        if (btnCloseDetails) {
            btnCloseDetails.addEventListener("click", clearSelection);
        }
    }

    // ============ Hall Management ============
    function loadHalls() {
        hallList = window.HALL_DATA || [];
        hallList.forEach((h) => {
            hallsById[h.id] = h;
        });
        updateHallCount();
    }

    function updateHallCount() {
        const label = document.getElementById("hallCountLabel");
        const count = getVisibleHalls().length;
        if (label) {
            label.textContent = `${count} hall${count === 1 ? "" : "s"}`;
        }
    }

    function renderHallMarkers() {
        // Clear existing hall markers
        markers.halls.forEach((m) => map.removeLayer(m));
        markers.halls = [];

        const visible = getVisibleHalls();

        visible.forEach((h) => {
            const marker = L.marker([h.lat, h.lng], {
                icon: L.icon({
                    iconUrl: "https://cdn-icons-png.flaticon.com/512/747/747376.png",
                    iconSize: [32, 32],
                    iconAnchor: [16, 32],
                    popupAnchor: [0, -32],
                }),
                title: h.name,
            }).addTo(map);

            marker.on("click", () => selectHall(h));

            markers.halls.push(marker);
        });
    }

    function renderResultsList() {
        const container = document.getElementById("hallResults");
        if (!container) return;

        const visible = getVisibleHalls();
        container.innerHTML = "";

        if (!visible.length) {
            container.innerHTML =
                '<p class="text-muted small">No halls match your search. Try different keywords.</p>';
            return;
        }

        visible.slice(0, 15).forEach((h) => {
            const item = document.createElement("div");
            item.className = "result-item";
            item.innerHTML = `
                <div class="result-item-image">
                    ${h.image ? `<img src="${h.image}" alt="${h.name}">` : '<i class="bi bi-building"></i>'}
                </div>
                <div class="result-item-content">
                    <h4 class="result-item-title">${h.name}</h4>
                    <p class="result-item-meta">${h.campus_zone || "Campus"}</p>
                    <p class="result-item-address">${h.address || "Address not available"}</p>
                </div>
            `;
            item.addEventListener("click", () => selectHall(h));
            container.appendChild(item);
        });
    }

    function selectHall(h) {
        selectedHall = h;

        // Update sidebar details
        const section = document.getElementById("hallDetailsSection");
        const resultsSection = document.querySelector(".results-section");
        if (section && resultsSection) {
            resultsSection.style.display = "none";
            section.style.display = "block";
        }

        // Populate details
        document.getElementById("hallDetailTitle").textContent = h.name;
        document.getElementById("hallDetailMeta").textContent =
            hallMetaLine(h) || "University of Bamenda area";
        document.getElementById("hallDetailAddress").textContent =
            h.address || "Address not available";
        document.getElementById("hallDetailDesc").textContent =
            h.description || "No description available";
        document.getElementById("hallDetailCapacity").textContent = h.capacity
            ? `${h.capacity} seats`
            : "—";
        document.getElementById("hallDetailPhone").textContent = h.phone || "—";
        document.getElementById("hallDetailAmenities").textContent =
            h.amenities || "Not listed";

        // Handle image
        const img = document.getElementById("hallDetailImage");
        const placeholder = document.getElementById("hallImagePlaceholder");
        if (h.image) {
            img.src = h.image;
            img.classList.remove("d-none");
            placeholder.classList.add("d-none");
        } else {
            img.classList.add("d-none");
            placeholder.classList.remove("d-none");
        }

        // Pan map to hall
        if (map) {
            map.setView([h.lat, h.lng], 17);
        }

        // Update marker on map
        if (markers.destination) {
            map.removeLayer(markers.destination);
        }
        markers.destination = L.marker([h.lat, h.lng], {
            icon: L.icon({
                iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
            }),
        }).addTo(map);

        showToast(`Selected: ${h.name}`, "success");
    }

    function clearSelection() {
        selectedHall = null;
        const section = document.getElementById("hallDetailsSection");
        const resultsSection = document.querySelector(".results-section");
        if (section && resultsSection) {
            section.style.display = "none";
            resultsSection.style.display = "block";
        }
        if (markers.destination) {
            map.removeLayer(markers.destination);
            markers.destination = null;
        }
    }

    function fitMapBounds() {
        const visible = getVisibleHalls();
        if (!visible.length) {
            map.setView([CONFIG.CENTER.lat, CONFIG.CENTER.lng], CONFIG.ZOOM);
            return;
        }
        if (visible.length === 1) {
            map.setView([visible[0].lat, visible[0].lng], 17);
            return;
        }
        const bounds = L.latLngBounds(visible.map((h) => [h.lat, h.lng]));
        map.fitBounds(bounds, { padding: [50, 50] });
    }

    // ============ User Location ============
    function locateUser() {
        if (!navigator.geolocation) {
            showToast("Geolocation not supported", "warning");
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                userLocation = { lat, lng };

                // Add or update marker
                if (markers.userLocation) {
                    map.removeLayer(markers.userLocation);
                }

                markers.userLocation = L.marker([lat, lng], {
                    icon: L.icon({
                        iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
                        iconSize: [25, 41],
                        iconAnchor: [12, 41],
                        popupAnchor: [1, -34],
                    }),
                    title: "Your location",
                }).addTo(map);

                map.setView([lat, lng], 17);
                showToast("Location found", "success");
            },
            () => {
                showToast("Could not get your location", "danger");
            }
        );
    }

    // ============ Directions & Routing ============
    async function getDirections() {
        if (!selectedHall) {
            showToast("Please select a hall first", "warning");
            return;
        }

        if (!userLocation) {
            showToast("Getting your location...", "info");
            return locateUserForDirections();
        }

        await calculateRoute(userLocation, selectedHall);
    }

    function locateUserForDirections() {
        if (!navigator.geolocation) {
            userLocation = CONFIG.CENTER;
            calculateRoute(userLocation, selectedHall);
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                calculateRoute(userLocation, selectedHall);
            },
            () => {
                userLocation = CONFIG.CENTER;
                showToast("Using campus location for directions", "info");
                calculateRoute(userLocation, selectedHall);
            }
        );
    }

    async function calculateRoute(origin, destination) {
        try {
            const url = `https://api.openrouteservice.org/v2/directions/${currentTravelMode}/geojson`;
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    Authorization: window.ORS_API_KEY,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    coordinates: [
                        [origin.lng, origin.lat],
                        [destination.lng, destination.lat],
                    ],
                }),
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            const data = await response.json();

            if (!data.features || !data.features.length) {
                showToast("No route found", "warning");
                return;
            }

            currentRoute = data.features[0];
            renderRoute(currentRoute);
            displayRouteInfo(currentRoute);
            showTravelModeSection();

            showToast("Route calculated successfully", "success");
        } catch (error) {
            console.error("Routing error:", error);
            showToast(`Routing error: ${error.message}`, "danger");
        }
    }

    function renderRoute(routeFeature) {
        // Clear existing route
        if (routeLayer) {
            map.removeLayer(routeLayer);
        }

        const coordinates = routeFeature.geometry.coordinates.map((coord) => [
            coord[1],
            coord[0],
        ]);

        routeLayer = L.polyline(coordinates, {
            color: "#145a45",
            weight: 4,
            opacity: 0.8,
            lineCap: "round",
            lineJoin: "round",
        }).addTo(map);

        // Fit map to route
        const bounds = L.latLngBounds(coordinates);
        map.fitBounds(bounds, { padding: [50, 50] });
    }

    function displayRouteInfo(routeFeature) {
        const props = routeFeature.properties;
        const summary = props.summary || {};

        const distance = summary.distance || 0;
        const duration = summary.duration || 0;

        document.getElementById("routeDuration").textContent =
            formatDuration(duration);
        document.getElementById("routeDistance").textContent =
            formatDistance(distance);

        const routeInfo = document.getElementById("routeInfo");
        if (routeInfo) {
            routeInfo.style.display = "block";
        }
    }

    function showTravelModeSection() {
        const section = document.getElementById("travelModeSection");
        if (section) {
            section.style.display = "block";
        }
    }

    function clearRoute() {
        currentRoute = null;
        if (routeLayer) {
            map.removeLayer(routeLayer);
            routeLayer = null;
        }
        const section = document.getElementById("travelModeSection");
        if (section) {
            section.style.display = "none";
        }
        showToast("Route cleared", "info");
    }

    // ============ Initialization ============
    document.addEventListener("DOMContentLoaded", () => {
        if (window.HALL_DATA) {
            initMap();
        } else {
            console.error("Hall data not found");
        }
    });

    // Export for debugging
    window.hallFinder = {
        map,
        selectedHall,
        currentRoute,
        getVisibleHalls,
        selectHall,
        getDirections,
        clearRoute,
    };
})();
