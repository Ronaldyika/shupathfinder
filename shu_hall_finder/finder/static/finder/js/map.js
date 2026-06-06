/**
 * SHU Hall Finder — Leaflet.js + OpenStreetMap + OpenRouteService
 */

(function () {
    "use strict";

    const CONFIG = {
        CENTER: { lat: 5.9597, lng: 10.1453 },
        ZOOM: 15,
        MAX_ZOOM: 19,
        MIN_ZOOM: 13,
        CAMPUS_BOUNDS: [
            [5.85, 9.95],
            [6.15, 10.35],
        ],
    };

    const ANIMATION_MS = 600;

    let map = null;
    let osmLayer = null;
    let hallsById = {};
    let hallList = [];
    let selectedHall = null;
    let userLocation = null;
    let currentRoute = null;
    let routeLayer = null;
    let directionMarker = null;
    let markers = { halls: [], userLocation: null, destination: null };
    const ROUTE_LOCAL_MAX_M = 15000;
    let currentTravelMode = "foot-walking";
    let resizeObserver = null;
    let gpsWatchId = null;
    let routeCoordinates = [];
    let routeSteps = [];
    // Defensive globals: expose to window so other scripts can't cause ReferenceError
    try {
        if (typeof window.lastNotifiedStep === "undefined") window.lastNotifiedStep = -1;
        if (typeof window.routeSteps === "undefined") window.routeSteps = [];
    } catch (e) {
        // ignore
    }
    let lastNotifiedStep = -1;

    // ---- Utilities ----

    function showToast(message, type = "info") {
        if (typeof window.showToast === "function") {
            window.showToast(message, type);
            return;
        }
        const host = document.getElementById("toastHost");
        if (!host) return;
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

    function setVisible(el, visible) {
        if (!el) return;
        if (visible) el.removeAttribute("hidden");
        else el.setAttribute("hidden", "");
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
        return tokens.every((t) => blob.includes(t));
    }

    function getVisibleHalls() {
        const zone = getZone();
        const q = getHallQuery();
        return hallList.filter(
            (h) => h.lat != null && h.lng != null && (!zone || h.campus_zone === zone) && hallMatchesQuery(h, q)
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
        if (meters < 1000) return `${Math.round(meters)} m`;
        return `${(meters / 1000).toFixed(1)} km`;
    }

    function formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        return hours > 0 ? `${hours}h ${mins}m` : `${mins} min`;
    }

    function readHallData() {
        return Array.isArray(window.HALL_DATA) ? window.HALL_DATA : [];
    }

    function escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str || "";
        return div.innerHTML;
    }

    function getTravelModeLabel(mode) {
        switch (mode) {
            case "driving-car":
                return "Drive";
            case "cycling-regular":
                return "Bike";
            default:
                return "Walk";
        }
    }

    function getTravelModeIcon(mode) {
        switch (mode) {
            case "driving-car":
                return "bi-car-front";
            case "cycling-regular":
                return "bi-bicycle";
            default:
                return "bi-person-walking";
        }
    }

    function isValidCameroonCoord(lat, lng) {
        return lat >= 1 && lat <= 13 && lng >= 8 && lng <= 16;
    }

    function toRad(deg) {
        return (deg * Math.PI) / 180;
    }

    function toDeg(rad) {
        return (rad * 180) / Math.PI;
    }

    function calcDistance(from, to) {
        const lat1 = toRad(from.lat);
        const lat2 = toRad(to.lat);
        const dLat = lat2 - lat1;
        const dLng = toRad(to.lng - from.lng);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const R = 6371000;
        return R * c;
    }

    function findClosestRoutePoint(userPos) {
        if (!routeCoordinates.length) return null;
        let minDist = Infinity;
        let closestIdx = 0;
        routeCoordinates.forEach((coord, idx) => {
            const dist = calcDistance(userPos, { lat: coord[0], lng: coord[1] });
            if (dist < minDist) {
                minDist = dist;
                closestIdx = idx;
            }
        });
        return { index: closestIdx, distance: minDist };
    }

    function getDistanceAlongRoute(userPos) {
        const closest = findClosestRoutePoint(userPos);
        if (!closest) return 0;
        let dist = 0;
        for (let i = 0; i < closest.index; i++) {
            const from = { lat: routeCoordinates[i][0], lng: routeCoordinates[i][1] };
            const to = { lat: routeCoordinates[i + 1][0], lng: routeCoordinates[i + 1][1] };
            dist += calcDistance(from, to);
        }
        const lastSegFrom = { lat: routeCoordinates[closest.index][0], lng: routeCoordinates[closest.index][1] };
        const lastSegTo = { lat: routeCoordinates[closest.index + 1]?.[0] || routeCoordinates[closest.index][0], lng: routeCoordinates[closest.index + 1]?.[1] || routeCoordinates[closest.index][1] };
        dist += calcDistance(lastSegFrom, userPos);
        return dist;
    }

    function getCurrentStepIndex(userPos) {
        if (!routeSteps.length) return 0;
        const distTraveled = getDistanceAlongRoute(userPos);
        let accumulatedDist = 0;
        for (let i = 0; i < routeSteps.length; i++) {
            accumulatedDist += routeSteps[i].distance || 0;
            if (accumulatedDist >= distTraveled) return i;
        }
        return routeSteps.length - 1;
    }

    function updateActiveStep(stepIndex) {
        document.querySelectorAll(".turn-step").forEach((el, idx) => {
            el.classList.toggle("turn-step-active", idx === stepIndex);
        });
        const navPanel = document.getElementById("turnByTurnPanel");
        if (navPanel) {
            const activeStep = navPanel.querySelector(".turn-step-active");
            if (activeStep) {
                activeStep.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }
        }
    
        try {
            const notified = typeof window.lastNotifiedStep !== "undefined" ? window.lastNotifiedStep : -1;
            const steps = Array.isArray(window.routeSteps) && window.routeSteps.length ? window.routeSteps : routeSteps;
            if (stepIndex !== notified && steps[stepIndex]) {
                const instruction = steps[stepIndex].instruction;
                const distance = formatDistance(steps[stepIndex].distance);
                showToast(`${instruction} (${distance})`, "info");
                window.lastNotifiedStep = stepIndex;
                lastNotifiedStep = stepIndex;
            }
        } catch (e) {
            // defensive: ignore notification errors
        }
    }

    function getDistanceToDestination(userPos) {
        if (!selectedHall) return Infinity;
        return calcDistance(userPos, { lat: selectedHall.lat, lng: selectedHall.lng });
    }

    function checkArrival(userPos) {
        const distToHall = getDistanceToDestination(userPos);
        if (distToHall < arrivalThresholdMeters) {
            return true;
        }
        return false;
    }

    function notifyArrival() {
        stopGpsWatch();
        showToast(`🎉 You've arrived at ${escapeHtml(selectedHall?.name || 'your destination')}!`, "success");
        if (directionMarker) {
            directionMarker.setIcon(L.divIcon({
                html: `<div class="arrival-marker"><i class="bi bi-check-circle-fill" style="font-size:32px;color:#28a745"></i></div>`,
                iconSize: [44, 44],
                iconAnchor: [22, 22],
                className: "arrival-marker",
            }));
        }
    }

    function updateRemainingDistance(userPos) {
        const distToHall = getDistanceToDestination(userPos);
        const distElement = document.getElementById("distanceRemaining");
        if (distElement) {
            if (distToHall < 1000) {
                distElement.textContent = `${Math.round(distToHall)} m away`;
            } else {
                distElement.textContent = `${(distToHall / 1000).toFixed(2)} km away`;
            }
        }
    }

    function bearingDeg(from, to) {
        const lat1 = toRad(from.lat);
        const lat2 = toRad(to.lat);
        const dLng = toRad(to.lng - from.lng);
        const y = Math.sin(dLng) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
        return (toDeg(Math.atan2(y, x)) + 360) % 360;
    }

    function getRouteLatLngs(routeFeature) {
        const geom = routeFeature?.geometry;
        if (!geom || geom.type !== "LineString" || !Array.isArray(geom.coordinates)) {
            return [];
        }
        return geom.coordinates.map((c) => [c[1], c[0]]);
    }

    function directionArrowIcon(degrees) {
        return L.divIcon({
            html: `<div class="route-direction-arrow" style="transform:rotate(${degrees}deg)"><i class="bi bi-arrow-up-short"></i></div>`,
            iconSize: [44, 44],
            iconAnchor: [22, 22],
            className: "route-direction-marker",
        });
    }

    function clearDirectionMarker() {
        if (directionMarker) {
            directionMarker.remove();
            directionMarker = null;
        }
    }

    function showDirectionArrow(origin, target) {
        if (!map || !origin || !target) return;
        clearDirectionMarker();
        const bearing = bearingDeg(origin, target);
        directionMarker = L.marker([origin.lat, origin.lng], {
            icon: directionArrowIcon(bearing),
            zIndexOffset: 1000,
        })
            .bindPopup(`Head <strong>${Math.round(bearing)}°</strong> toward ${escapeHtml(selectedHall?.name || "destination")}`)
            .addTo(map);
    }

    function setCampusMapBounds() {
        map?.setMaxBounds(CONFIG.CAMPUS_BOUNDS);
    }

    function expandMapBoundsForRoute(latLngs) {
        if (!map || !latLngs.length) return;
        const bounds = L.latLngBounds(latLngs);
        if (userLocation) bounds.extend([userLocation.lat, userLocation.lng]);
        if (selectedHall) bounds.extend([selectedHall.lat, selectedHall.lng]);
        map.setMaxBounds(bounds.pad(0.08));
    }

    // ---- Marker icons ----

    function hallMarkerIcon(isSelected = false) {
        const bg = isSelected ? "var(--map-marker-active, #c9a227)" : "var(--map-marker, #145a45)";
        const size = isSelected ? 40 : 32;
        const height = isSelected ? 48 : 40;
        const iconClass = isSelected ? "bi-pin-fill" : "bi-building";
        const fontSize = isSelected ? 20 : 16;

        return L.divIcon({
            html: `<div class="marker-pin" style="
                width:${size}px;height:${height}px;
                background:${bg};
                border:3px solid #fff;
                border-radius:50% 50% 50% 0;
                transform:rotate(-45deg);
                display:flex;align-items:center;justify-content:center;
                box-shadow:0 3px 10px rgba(0,0,0,0.25);
            "><i class="bi ${iconClass}" style="color:#fff;font-size:${fontSize}px;transform:rotate(45deg)"></i></div>`,
            iconSize: [size, height],
            iconAnchor: [size / 2, height],
            popupAnchor: [0, -height],
            className: "custom-marker",
        });
    }

    function userMarkerIcon(fallback = false) {
        const color = fallback ? "#fd7e14" : "var(--map-user, #0d6efd)";
        return L.divIcon({
            html: `<div style="width:16px;height:16px;background:${color};border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 4px rgba(13,110,253,0.25),0 2px 8px rgba(0,0,0,0.2)"></div>`,
            iconSize: [22, 22],
            iconAnchor: [11, 11],
            className: "custom-marker",
        });
    }

    function hallPopupHtml(h) {
        return `<div class="hall-popup">
            <div class="popup-title">${escapeHtml(h.name)}</div>
            <div class="popup-meta">${escapeHtml(hallMetaLine(h) || h.address || "")}</div>
        </div>`;
    }

    // ---- Map init ----

    function initMap() {
        const mapEl = document.getElementById("map");
        if (!mapEl || typeof L === "undefined") return;

        map = L.map(mapEl, {
            center: [CONFIG.CENTER.lat, CONFIG.CENTER.lng],
            zoom: CONFIG.ZOOM,
            maxZoom: CONFIG.MAX_ZOOM,
            minZoom: CONFIG.MIN_ZOOM,
            zoomControl: false,
            attributionControl: true,
        });

        osmLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
            maxZoom: CONFIG.MAX_ZOOM,
            minZoom: CONFIG.MIN_ZOOM,
            subdomains: ["a", "b", "c"],
            detectRetina: true,
        });

        osmLayer.addTo(map);

        map.setMaxBounds(CONFIG.CAMPUS_BOUNDS);
        map.on("drag", () => map.panInsideBounds(CONFIG.CAMPUS_BOUNDS, { animate: false }));

        setupEventListeners();
        setupResponsiveMap();
        loadHalls();

        setTimeout(() => map.invalidateSize(), 100);
    }

    function setupResponsiveMap() {
        const sidebar = document.getElementById("finderSidebar");
        const app = document.getElementById("hallFinderApp");

        const refresh = () => {
            if (map) {
                map.invalidateSize({ animate: true });
            }
        };

        window.addEventListener("resize", debounce(refresh, 150));

        if (sidebar) {
            sidebar.addEventListener("transitionend", (e) => {
                if (e.propertyName === "transform" || e.propertyName === "max-height") {
                    refresh();
                }
            });
        }

        if (app && typeof ResizeObserver !== "undefined") {
            resizeObserver = new ResizeObserver(debounce(refresh, 100));
            resizeObserver.observe(app);
        }

        document.addEventListener("shu-theme-changed", refresh);
    }

    function debounce(fn, wait) {
        let t;
        return function (...args) {
            clearTimeout(t);
            t = setTimeout(() => fn.apply(this, args), wait);
        };
    }

    // ---- Events ----

    function setupEventListeners() {
        document.getElementById("hallSearchInput")?.addEventListener("input", renderAllHalls);
        document.getElementById("zoneFilter")?.addEventListener("change", renderAllHalls);
        document.getElementById("btnCloseDetails")?.addEventListener("click", clearSelection);

        document.querySelectorAll(".travel-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                const mode = btn.dataset.mode;
                if (!mode) return;
                currentTravelMode = mode;
                updateTravelModeUI();
                updateTravelModeDisplay();
                if (selectedHall && userLocation) {
                    calculateRoute(userLocation, selectedHall);
                }
            });
        });

        document.getElementById("btnGetDirections")?.addEventListener("click", findRoute);
        document.getElementById("btnClearRoute")?.addEventListener("click", clearRoute);
        document.getElementById("btnLocateMe")?.addEventListener("click", () => locateUser(false));
        document.getElementById("btnZoomIn")?.addEventListener("click", () => map?.zoomIn());
        document.getElementById("btnZoomOut")?.addEventListener("click", () => map?.zoomOut());
        document.getElementById("btnFitAll")?.addEventListener("click", () => fitBoundsToHalls(getVisibleHalls()));

        setupMobilePanel();
    }

    function setupMobilePanel() {
        const sidebar = document.getElementById("finderSidebar");
        const btnToggle = document.getElementById("btnTogglePanel");
        const btnClose = document.getElementById("btnClosePanel");
        const label = document.getElementById("panelToggleLabel");

        if (!sidebar) return;

        const setCollapsed = (collapsed) => {
            sidebar.classList.toggle("panel-collapsed", collapsed);
            btnToggle?.setAttribute("aria-expanded", String(!collapsed));
            if (label) label.textContent = collapsed ? "Show halls" : "Halls";
        };

        btnToggle?.addEventListener("click", () => {
            setCollapsed(!sidebar.classList.contains("panel-collapsed"));
        });

        btnClose?.addEventListener("click", () => setCollapsed(true));
    }

    // ---- Hall rendering ----

    function loadHalls() {
        hallList = readHallData();
        hallsById = {};
        hallList.forEach((h) => {
            hallsById[h.id] = h;
        });
        renderAllHalls();
    }

    function updateHallCount(count) {
        const el = document.getElementById("hallCountLabel");
        if (el) el.textContent = `${count} hall${count === 1 ? "" : "s"}`;
    }

    function renderAllHalls() {
        markers.halls.forEach((m) => m.remove());
        markers.halls = [];

        const visibleHalls = getVisibleHalls();
        updateHallCount(visibleHalls.length);

        visibleHalls.forEach((h) => {
            const isActive = selectedHall?.id === h.id;
            const marker = L.marker([h.lat, h.lng], { icon: hallMarkerIcon(isActive) })
                .bindPopup(hallPopupHtml(h), { closeButton: true, maxWidth: 240 })
                .addTo(map);

            marker.on("click", () => selectHall(h));
            markers.halls.push(marker);
        });

        renderResultsList(visibleHalls);

        if (map && map.getZoom() < 14 && visibleHalls.length > 0 && !selectedHall) {
            fitBoundsToHalls(visibleHalls);
        }
    }

    function renderResultsList(halls) {
        const resultsList = document.getElementById("hallResults");
        if (!resultsList) return;

        if (!halls.length) {
            resultsList.innerHTML = `<div class="results-empty"><i class="bi bi-search"></i>No halls match your search.</div>`;
            return;
        }

        const maxShow = 20;
        const slice = halls.slice(0, maxShow);

        resultsList.innerHTML = slice
            .map(
                (h) => `
            <article class="result-item${selectedHall?.id === h.id ? " active" : ""}" data-hall-id="${h.id}" role="listitem">
                <div class="result-item-image">
                    ${h.image ? `<img src="${escapeHtml(h.image)}" alt="">` : '<i class="bi bi-building"></i>'}
                </div>
                <div class="result-item-content">
                    <div class="result-item-title">${escapeHtml(h.name)}</div>
                    <div class="result-item-meta">${escapeHtml(hallMetaLine(h))}</div>
                    <p class="result-item-address">${escapeHtml(h.address || "No address")}</p>
                </div>
                <span class="result-action-btn" title="Get directions" aria-hidden="true"><i class="bi bi-signpost-2"></i></span>
            </article>`
            )
            .join("");

        if (halls.length > maxShow) {
            resultsList.innerHTML += `<p class="text-center small text-muted mt-2 mb-0">Showing ${maxShow} of ${halls.length} halls — refine your search.</p>`;
        }

        resultsList.querySelectorAll(".result-item").forEach((item) => {
            item.addEventListener("click", () => {
                const hall = hallsById[parseInt(item.dataset.hallId, 10)];
                if (hall) selectHall(hall);
            });
        });

        resultsList.querySelectorAll(".result-action-btn").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const item = btn.closest(".result-item");
                const hall = hallsById[parseInt(item?.dataset.hallId, 10)];
                if (hall) {
                    selectHall(hall);
                    findRoute();
                }
            });
        });
    }

    // ---- Selection ----

    function selectHall(h) {
        if (selectedHall && selectedHall.id !== h.id) clearRoute();

        selectedHall = h;

        document.querySelectorAll(".result-item").forEach((item) => {
            item.classList.toggle("active", parseInt(item.dataset.hallId, 10) === h.id);
        });

        showHallDetails(h);
        renderAllHalls();

        if (markers.destination) markers.destination.remove();

        markers.destination = L.marker([h.lat, h.lng], { icon: hallMarkerIcon(true) })
            .bindPopup(hallPopupHtml(h))
            .addTo(map)
            .openPopup();

        map.setView([h.lat, h.lng], Math.max(map.getZoom(), 16), {
            animate: true,
            duration: ANIMATION_MS / 1000,
        });

        if (userLocation) {
            calculateRoute(userLocation, selectedHall);
        } else {
            locateUser(true);
        }

        const sidebar = document.getElementById("finderSidebar");
        if (sidebar?.classList.contains("panel-collapsed")) {
            sidebar.classList.remove("panel-collapsed");
            document.getElementById("btnTogglePanel")?.setAttribute("aria-expanded", "true");
        }
    }

    function showHallDetails(h) {
        const section = document.getElementById("hallDetailsSection");
        const resultsSection = document.getElementById("resultsSection");
        if (!section) return;

        if (resultsSection) resultsSection.setAttribute("hidden", "");

        document.getElementById("hallDetailTitle").textContent = h.name;
        document.getElementById("hallDetailMeta").textContent = h.campus_zone || "Campus";
        document.getElementById("hallDetailAddress").textContent = h.address || "No address available";
        document.getElementById("hallDetailDesc").textContent = h.description || "No description available.";
        document.getElementById("hallDetailCapacity").textContent = h.capacity ? `${h.capacity} seats` : "N/A";
        document.getElementById("hallDetailPhone").textContent = h.phone || "N/A";
        document.getElementById("hallDetailAmenities").textContent = h.amenities || "Not listed";

        const imageEl = document.getElementById("hallDetailImage");
        const placeholderEl = document.getElementById("hallImagePlaceholder");
        if (imageEl && placeholderEl) {
            if (h.image) {
                imageEl.src = h.image;
                imageEl.alt = h.name;
                imageEl.classList.remove("d-none");
                placeholderEl.classList.add("d-none");
            } else {
                imageEl.classList.add("d-none");
                placeholderEl.classList.remove("d-none");
            }
        }

        setVisible(section, true);
        setVisible(document.getElementById("travelModeSection"), true);
        updateTravelModeUI();
        updateRouteActionButtons(!!currentRoute);
        updateTravelModeDisplay();
    }

    function clearSelection() {
        selectedHall = null;

        if (markers.destination) {
            markers.destination.remove();
            markers.destination = null;
        }

        clearRoute();
        setVisible(document.getElementById("hallDetailsSection"), false);
        document.getElementById("resultsSection")?.removeAttribute("hidden");
        setVisible(document.getElementById("travelModeBadge"), false);

        document.querySelectorAll(".result-item").forEach((item) => item.classList.remove("active"));
        renderAllHalls();
    }

    // ---- Routing ----

    function findRoute() {
        if (!selectedHall) {
            showToast("Please select a hall first.", "warning");
            return;
        }
        if (!userLocation) {
            showToast("Getting your location…", "info");
            locateUser(true);
        } else {
            calculateRoute(userLocation, selectedHall);
        }
    }

    async function calculateRoute(origin, destination) {
        if (!origin || !destination) {
            showToast("Missing origin or destination.", "danger");
            return;
        }

        if (!isValidCameroonCoord(origin.lat, origin.lng) || !isValidCameroonCoord(destination.lat, destination.lng)) {
            showToast("Invalid coordinates. Please check your location.", "danger");
            return;
        }

        setLoading(true);

        try {
            const apiKey = window.ORS_API_KEY;
            if (!apiKey) {
                showToast("Routing service not configured. Add ORS_API_KEY to .env", "danger");
                return;
            }

            const url = `https://api.openrouteservice.org/v2/directions/${currentTravelMode}/geojson`;
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    Authorization: apiKey,
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
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error?.message || `HTTP ${response.status}`);
            }

            const data = await response.json();
            if (data.features?.length) {
                renderRoute(data.features[0]);
                displayRouteInfo(data.features[0]);
                showToast("Route ready!", "success");
            } else {
                showToast("No route found between these points.", "warning");
            }
        } catch (err) {
            console.error("Route error:", err);
            showToast(`Could not calculate route: ${err.message}`, "danger");
        } finally {
            setLoading(false);
        }
    }

    function renderRoute(routeFeature) {
        if (routeLayer) routeLayer.remove();
        clearDirectionMarker();

        const coords = getRouteLatLngs(routeFeature);
        if (!coords.length) {
            showToast("Route geometry missing — try again.", "warning");
            return;
        }

        const routeColor =
            getComputedStyle(document.documentElement).getPropertyValue("--map-route").trim() || "#1d7a5f";
        const summary = routeFeature.properties?.summary;
        const distance = summary?.distance || 0;
        const origin = userLocation || { lat: coords[0][0], lng: coords[0][1] };
        const destination = selectedHall || { lat: coords[coords.length - 1][0], lng: coords[coords.length - 1][1] };
        const isLongRoute = distance > ROUTE_LOCAL_MAX_M;

        routeLayer = L.layerGroup().addTo(map);

        const displayCoords = isLongRoute ? coords.slice(0, Math.min(coords.length, 400)) : coords;
        L.polyline(displayCoords, {
            color: routeColor,
            weight: 6,
            opacity: 0.92,
            lineCap: "round",
            lineJoin: "round",
        }).addTo(routeLayer);

        if (isLongRoute) {
            L.polyline(
                [
                    [origin.lat, origin.lng],
                    [destination.lat, destination.lng],
                ],
                {
                    color: routeColor,
                    weight: 3,
                    opacity: 0.45,
                    dashArray: "10, 12",
                }
            ).addTo(routeLayer);
        }

        const arrowTarget = isLongRoute
            ? destination
            : { lat: coords[Math.min(8, coords.length - 1)][0], lng: coords[Math.min(8, coords.length - 1)][1] };
        showDirectionArrow(origin, arrowTarget);

        if (markers.destination && selectedHall) {
            markers.destination.openPopup();
        }

        expandMapBoundsForRoute(coords);

        if (isLongRoute) {
            map.setView([origin.lat, origin.lng], Math.max(map.getZoom(), 14), { animate: true });
            showToast("You're far from campus — follow the arrow toward your hall.", "info");
        } else {
            const bounds = L.latLngBounds(displayCoords);
            bounds.extend([origin.lat, origin.lng]);
            bounds.extend([destination.lat, destination.lng]);
            if (bounds.isValid()) {
                map.fitBounds(bounds, { padding: [64, 64], animate: true, maxZoom: 17 });
            }
        }

        if (routeLayer && typeof routeLayer.eachLayer === "function") {
            routeLayer.eachLayer((child) => {
                if (child && typeof child.bringToFront === "function") {
                    child.bringToFront();
                }
            });
        }

        routeCoordinates = coords.map(([lat, lng]) => [lat, lng]);
        currentRoute = routeFeature;
        startLiveNavigation();
    }

    function displayRouteInfo(routeFeature) {
        const summary = routeFeature.properties?.summary;
        if (!summary) return;

        document.getElementById("routeDistance").textContent = formatDistance(summary.distance || 0);
        document.getElementById("routeDuration").textContent = formatDuration(summary.duration || 0);
        document.getElementById("routeModeLabel").textContent = getTravelModeLabel(currentTravelMode);

        const routeModeInfo = document.getElementById("routeModeInfo");
        const icon = routeModeInfo?.querySelector("i");
        if (icon) icon.className = `bi ${getTravelModeIcon(currentTravelMode)}`;

        const distRemaining = document.getElementById("distanceRemaining");
        if (distRemaining) {
            distRemaining.textContent = formatDistance(summary.distance || 0);
        }

        setVisible(document.getElementById("travelModeSection"), true);
        setVisible(document.getElementById("routeInfo"), true);
        updateRouteActionButtons(true);

        displayTurnByTurnInstructions(routeFeature);
    }

    function getTurnIcon(instruction) {
        if (!instruction) return "bi-arrow-up";
        const text = instruction.toLowerCase();
        if (text.includes("left")) return "bi-arrow-bar-left";
        if (text.includes("right")) return "bi-arrow-bar-right";
        if (text.includes("straight") || text.includes("continue")) return "bi-arrow-up";
        if (text.includes("u-turn")) return "bi-arrow-return-left";
        return "bi-arrow-up";
    }

    function displayTurnByTurnInstructions(routeFeature) {
        const segments = routeFeature.properties?.segments || [];
        const instructions = [];

        segments.forEach((segment) => {
            if (segment.steps && Array.isArray(segment.steps)) {
                segment.steps.forEach((step) => {
                    instructions.push({
                        instruction: step.instruction || "Continue",
                        distance: step.distance || 0,
                        duration: step.duration || 0,
                        maneuver: step.maneuver?.type || "unknown",
                    });
                });
            }
        });

        routeSteps = instructions;
        try { window.routeSteps = instructions; } catch (e) {}

        const navPanel = document.getElementById("turnByTurnPanel");
        if (!navPanel) return;

        if (!instructions.length) {
            navPanel.innerHTML = '<p class="text-center text-muted py-3">No turn details available</p>';
            return;
        }

        let html = '<div class="turn-by-turn-nav">';
        instructions.slice(0, 5).forEach((instr, idx) => {
            const icon = getTurnIcon(instr.instruction);
            const isFirst = idx === 0;
            html += `
                <div class="turn-step${isFirst ? " turn-step-active" : ""}">
                    <div class="turn-icon">
                        <i class="bi ${icon}"></i>
                    </div>
                    <div class="turn-content">
                        <div class="turn-instruction">${escapeHtml(instr.instruction)}</div>
                        <div class="turn-distance">${formatDistance(instr.distance)}</div>
                    </div>
                </div>
            `;
        });
        html += '</div>';

        navPanel.innerHTML = html;
        setVisible(navPanel, true);
    }

    function updateRouteActionButtons(routeActive = false) {
        const btnGet = document.getElementById("btnGetDirections");
        const btnClear = document.getElementById("btnClearRoute");
        const label = getTravelModeLabel(currentTravelMode);
        const icon = getTravelModeIcon(currentTravelMode);

        if (btnGet) {
            btnGet.innerHTML = routeActive
                ? `<i class="bi ${icon} me-2"></i>${label} route active`
                : `<i class="bi bi-signpost-2 me-2"></i>Get ${label.toLowerCase()} directions`;
        }

        setVisible(btnClear, routeActive);
    }

    function updateTravelModeUI() {
        document.querySelectorAll(".travel-btn").forEach((btn) => {
            btn.classList.toggle("active", btn.dataset.mode === currentTravelMode);
        });
    }

    function updateTravelModeDisplay() {
        const badge = document.getElementById("travelModeBadge");
        if (!badge) return;

        if (selectedHall) {
            setVisible(badge, true);
            document.getElementById("travelModeBadgeLabel").textContent = getTravelModeLabel(currentTravelMode);
            document.getElementById("travelModeIcon").className = `bi ${getTravelModeIcon(currentTravelMode)}`;
        } else {
            setVisible(badge, false);
        }
    }

    function stopGpsWatch() {
        if (gpsWatchId !== null) {
            navigator.geolocation.clearWatch(gpsWatchId);
            gpsWatchId = null;
        }
    }

    function clearRoute() {
        stopGpsWatch();
        if (routeLayer) {
            routeLayer.remove();
            routeLayer = null;
        }
        clearDirectionMarker();
        setCampusMapBounds();
        currentRoute = null;
        routeCoordinates = [];
        routeSteps = [];
        lastNotifiedStep = -1;
        setVisible(document.getElementById("routeInfo"), false);
        setVisible(document.getElementById("distanceRemainingSection"), false);
        updateRouteActionButtons(false);
    }

    // ---- Geolocation ----

    function locateUser(autoRoute = false) {
        if (!navigator.geolocation) {
            showToast("Geolocation is not supported on this device.", "danger");
            return;
        }

        showToast("Locating you…", "info");

        navigator.geolocation.getCurrentPosition(
            (pos) => placeUserMarker(pos.coords.latitude, pos.coords.longitude, false, autoRoute),
            (err) => {
                placeUserMarker(CONFIG.CENTER.lat, CONFIG.CENTER.lng, true, autoRoute);
                showToast(`Location unavailable (${err.message}). Using campus center.`, "warning");
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
    }

    function placeUserMarker(lat, lng, fallback, autoRoute) {
        if (!isValidCameroonCoord(lat, lng)) {
            lat = CONFIG.CENTER.lat;
            lng = CONFIG.CENTER.lng;
            fallback = true;
            showToast("Location outside Cameroon — using campus center.", "warning");
        }

        userLocation = { lat, lng };

        if (markers.userLocation) markers.userLocation.remove();

        markers.userLocation = L.marker([lat, lng], { icon: userMarkerIcon(fallback) })
            .bindPopup(fallback ? "<strong>Approximate start</strong><br>Campus center" : "<strong>You are here</strong>")
            .addTo(map);

        map.setView([lat, lng], Math.max(map.getZoom(), 16), { animate: true });

        if (!fallback) showToast("Location found!", "success");

        if (autoRoute && selectedHall) {
            calculateRoute(userLocation, selectedHall);
        } else if (currentRoute && selectedHall) {
            showDirectionArrow(userLocation, selectedHall);
            if (!gpsWatchId) startLiveNavigation();
        }
    }

    function startLiveNavigation() {
        if (!currentRoute || !selectedHall || !userLocation) return;
        if (gpsWatchId !== null) return;

        lastNotifiedStep = -1;
        try { window.lastNotifiedStep = -1; } catch (e) {}
        setVisible(document.getElementById("distanceRemainingSection"), true);
        showToast("Live navigation active. Follow the directions to reach your hall.", "info");

        gpsWatchId = navigator.geolocation.watchPosition(
            (pos) => {
                const newLat = pos.coords.latitude;
                const newLng = pos.coords.longitude;
                if (!isValidCameroonCoord(newLat, newLng)) return;

                userLocation = { lat: newLat, lng: newLng };
                if (markers.userLocation) {
                    markers.userLocation.setLatLng([newLat, newLng]);
                }

                const currentStepIdx = getCurrentStepIndex(userLocation);
                updateActiveStep(currentStepIdx);
                showDirectionArrow(userLocation, selectedHall);
                updateRemainingDistance(userLocation);

                map.setView([newLat, newLng], map.getZoom(), { animate: true, duration: 0.25 });

                if (checkArrival(userLocation)) {
                    notifyArrival();
                }
            },
            (err) => {
                console.warn("Geolocation watch error:", err.message);
                showToast("Unable to update location. Check your GPS.", "warning");
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
        );
    }

    function fitBoundsToHalls(halls) {
        if (!map) return;
        if (!halls.length) {
            showToast("No halls to display.", "warning");
            return;
        }
        const bounds = L.latLngBounds(halls.map((h) => [h.lat, h.lng]));
        map.fitBounds(bounds, { padding: [48, 48], animate: true, maxZoom: 17 });
    }

    function setLoading(loading) {
        const btn = document.getElementById("btnGetDirections");
        if (!btn) return;

        btn.disabled = loading;
        if (loading) {
            btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status"></span>Calculating…`;
        } else {
            updateRouteActionButtons(!!currentRoute);
        }
    }

    // ---- Boot ----

    document.addEventListener("DOMContentLoaded", () => {
        if (typeof L === "undefined") {
            showToast("Map library failed to load. Check your connection.", "danger");
            return;
        }
        if (!document.getElementById("hall-data")) {
            return;
        }
        initMap();
    });

    window.hallFinder = {
        get map() {
            return map;
        },
        get selectedHall() {
            return selectedHall;
        },
        getVisibleHalls,
        selectHall,
        findRoute,
        clearRoute,
        locateUser,
        fitBoundsToHalls,
    };
})();
