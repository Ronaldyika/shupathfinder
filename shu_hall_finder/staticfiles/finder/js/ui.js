/*
 * UI Controller for SHU Hall Finder
 * Manages bottom sheet, tabs, search results, and route display
 */
(function () {
    let currentSelectedHall = null;
    let allHalls = [];

    // Initialize UI
    window.addEventListener("DOMContentLoaded", () => {
        loadHallsFromData();
        setupUIListeners();
        populateDirectory();
    });

    function loadHallsFromData() {
        const el = document.getElementById("hall-data");
        if (!el) return;
        try {
            allHalls = JSON.parse(el.textContent) || [];
        } catch (e) {
            console.error("Error parsing hall data", e);
        }
    }

    function setupUIListeners() {
        // Global search
        const globalSearch = document.getElementById("globalSearchInput");
        if (globalSearch) {
            globalSearch.addEventListener("input", (e) => {
                const query = e.target.value.toLowerCase();
                if (query.length > 0) {
                    showSearchResults(query);
                } else {
                    document.getElementById("searchResultsDropdown").style.display = "none";
                }
            });

            globalSearch.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    const query = globalSearch.value.trim();
                    if (query) {
                        const results = allHalls.filter((h) =>
                            h.name.toLowerCase().includes(query) ||
                            h.description.toLowerCase().includes(query) ||
                            h.address.toLowerCase().includes(query)
                        );
                        if (results.length === 1) {
                            selectHallFromUI(results[0]);
                            globalSearch.value = "";
                            document.getElementById("searchResultsDropdown").style.display = "none";
                        }
                    }
                }
            });
        }

        // Voice search
        const btnVoice = document.getElementById("btnVoiceSearch");
        if (btnVoice) {
            btnVoice.addEventListener("click", startVoiceSearch);
        }

        // Zone filter
        const zoneFilter = document.getElementById("zoneFilter");
        if (zoneFilter) {
            zoneFilter.addEventListener("change", () => {
                populateSearchResults(zoneFilter.value);
            });
        }

        // Travel mode
        document.querySelectorAll('input[name="travelMode"]').forEach((radio) => {
            radio.addEventListener("change", () => {
                updateRouteMode(radio.value);
            });
        });

        // Get directions
        const btnGetDirections = document.getElementById("btnGetDirections");
        if (btnGetDirections) {
            btnGetDirections.addEventListener("click", () => {
                if (window.findRoute) {
                    window.findRoute();
                }
            });
        }

        // Clear route
        const btnClearRoute = document.getElementById("btnClearRoute");
        if (btnClearRoute) {
            btnClearRoute.addEventListener("click", () => {
                if (window.clearRoute) {
                    window.clearRoute();
                    document.getElementById("btnClearRoute").style.display = "none";
                    document.getElementById("routeInfoCard").classList.add("d-none");
                }
            });
        }

        // Fit bounds
        const btnFitBounds = document.getElementById("btnFitBounds");
        if (btnFitBounds) {
            btnFitBounds.addEventListener("click", () => {
                if (window.fitBoundsToHalls) {
                    window.fitBoundsToHalls(allHalls);
                }
            });
        }

        // Locate me
        const btnLocateMe = document.getElementById("btnLocateMe");
        if (btnLocateMe) {
            btnLocateMe.addEventListener("click", locateUser);
        }
    }

    function showSearchResults(query) {
        const dropdown = document.getElementById("searchResultsDropdown");
        const results = document.getElementById("liveResults");
        const matching = allHalls.filter((h) =>
            h.name.toLowerCase().includes(query) ||
            h.description.toLowerCase().includes(query) ||
            h.address.toLowerCase().includes(query)
        );

        if (matching.length === 0) {
            results.innerHTML = '<div class="p-3 text-muted">No halls found</div>';
            dropdown.style.display = "block";
            return;
        }

        results.innerHTML = matching
            .slice(0, 5)
            .map((h) => `
                <div class="search-result-item" onclick="window.selectHallByID(${h.id})">
                    <strong>${escapeHtml(h.name)}</strong>
                    <div class="small text-muted">${escapeHtml(h.campus_zone || "Campus")}</div>
                </div>
            `)
            .join("");

        dropdown.style.display = "block";
    }

    function populateSearchResults(zoneFilter = "") {
        const container = document.getElementById("searchResults");
        const filtered = zoneFilter
            ? allHalls.filter((h) => h.campus_zone === zoneFilter)
            : allHalls;

        container.innerHTML = filtered
            .map(
                (h) => `
            <div class="hall-item" onclick="window.selectHallByID(${h.id})">
                <div class="hall-item-thumb">
                    ${h.image ? `<img src="${escapeHtml(h.image)}" alt="${escapeHtml(h.name)}">` : '<i class="bi bi-building"></i>'}
                </div>
                <div class="hall-item-info">
                    <div class="hall-item-name">${escapeHtml(h.name)}</div>
                    <div class="hall-item-meta">${escapeHtml(h.campus_zone || "Campus")} • ${escapeHtml(h.address || "No address")}</div>
                </div>
            </div>
        `
            )
            .join("");
    }

    function populateDirectory() {
        const container = document.getElementById("directoryList");
        container.innerHTML = allHalls
            .map(
                (h) => `
            <div class="hall-item" onclick="window.selectHallByID(${h.id})">
                <div class="hall-item-thumb">
                    ${h.image ? `<img src="${escapeHtml(h.image)}" alt="${escapeHtml(h.name)}">` : '<i class="bi bi-building"></i>'}
                </div>
                <div class="hall-item-info">
                    <div class="hall-item-name">${escapeHtml(h.name)}</div>
                    <div class="hall-item-meta">${escapeHtml(h.campus_zone || "Campus")} • ${h.capacity || "N/A"} capacity</div>
                </div>
            </div>
        `
            )
            .join("");
    }

    window.selectHallByID = function (hallId) {
        const hall = allHalls.find((h) => h.id === hallId);
        if (hall) {
            selectHallFromUI(hall);
        }
    };

    function selectHallFromUI(hall) {
        currentSelectedHall = hall;

        // Update sheet title
        document.getElementById("sheetTitle").textContent = `Navigate to ${hall.name}`;

        // Update details
        updateHallDetails(hall);

        // Highlight selected
        document.querySelectorAll(".hall-item").forEach((item) => {
            item.classList.remove("active");
        });
        document.querySelectorAll(`.hall-item`).forEach((item) => {
            if (item.innerText.includes(hall.name)) {
                item.classList.add("active");
            }
        });

        // Hide search results
        document.getElementById("searchResultsDropdown").style.display = "none";

        // Switch to details tab
        const detailsTab = new bootstrap.Tab(document.getElementById("tab-details"));
        detailsTab.show();

        // Signal map to select the hall
        if (window.selectHallFromMarker) {
            window.selectHallFromMarker(hall.id);
        }
    }

    function updateHallDetails(hall) {
        const detailsView = document.getElementById("hallDetailsView");
        detailsView.innerHTML = `
            ${hall.image ? `<div style="border-radius: 1rem; overflow: hidden; margin-bottom: 1rem;"><img src="${escapeHtml(hall.image)}" alt="${escapeHtml(hall.name)}" style="width: 100%; height: auto;"></div>` : ""}
            
            <div class="detail-section">
                <div class="detail-label">Location</div>
                <div class="detail-value">${escapeHtml(hall.address || "Address not available")}</div>
            </div>

            <div class="detail-section">
                <div class="detail-label">Campus Zone</div>
                <div class="detail-value">${escapeHtml(hall.campus_zone || "N/A")}</div>
            </div>

            <div class="detail-section">
                <div class="detail-label">Capacity</div>
                <div class="detail-value">${hall.capacity ? `${hall.capacity} seats` : "Not specified"}</div>
            </div>

            ${hall.phone ? `
            <div class="detail-section">
                <div class="detail-label">Contact</div>
                <div class="detail-value"><a href="tel:${hall.phone}">${escapeHtml(hall.phone)}</a></div>
            </div>
            ` : ""}

            <div class="detail-section">
                <div class="detail-label">Description</div>
                <div class="detail-value">${escapeHtml(hall.description || "No description available")}</div>
            </div>

            ${hall.amenities ? `
            <div class="detail-section">
                <div class="detail-label">Amenities</div>
                <div class="detail-value">${escapeHtml(hall.amenities)}</div>
            </div>
            ` : ""}
        `;
    }

    window.displayRoute = function (route, distance, duration, mode) {
        const routeInfoCard = document.getElementById("routeInfoCard");
        const routeDistance = document.getElementById("routeDistance");
        const routeDuration = document.getElementById("routeDuration");
        const routeMode = document.getElementById("routeMode");
        const btnClearRoute = document.getElementById("btnClearRoute");

        if (distance) {
            routeDistance.textContent = (distance / 1000).toFixed(1);
            routeDuration.textContent = Math.round(duration / 60);
            routeMode.textContent = mode === "WALKING" ? "Walking" : mode === "DRIVING" ? "Driving" : "Transit";

            routeInfoCard.classList.remove("d-none");
            btnClearRoute.style.display = "block";
        }
    };

    window.updateRouteMode = function (mode) {
        const modeLabel = {
            WALKING: "Walking",
            DRIVING: "Driving",
            TRANSIT: "Transit",
        };
        document.getElementById("routeMode").textContent = modeLabel[mode] || "Walking";
    };

    function startVoiceSearch() {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            showToast("Voice search not supported in this browser", "warning");
            return;
        }

        const recognition = new SR();
        recognition.lang = "en-US";
        recognition.start();

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript.toLowerCase();
            document.getElementById("globalSearchInput").value = transcript;
            showSearchResults(transcript);
        };

        recognition.onerror = () => {
            showToast("Voice search failed", "danger");
        };
    }

    function locateUser() {
        if (!navigator.geolocation) {
            showToast("Geolocation not supported", "warning");
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                if (window.map) {
                    window.map.setView([pos.coords.latitude, pos.coords.longitude], 17);
                    document.getElementById("currentLocationBadge").classList.remove("d-none");
                    showToast("Location found!", "success");
                }
            },
            () => {
                showToast("Could not get your location", "warning");
            }
        );
    }

    function escapeHtml(str) {
        if (!str) return "";
        const div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    }

    function showToast(message, type = "info") {
        const host = document.getElementById("toastHost");
        if (!host) return;

        const toast = document.createElement("div");
        toast.className = `alert alert-${type} alert-dismissible fade show`;
        toast.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        host.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 4000);
    }
})();
