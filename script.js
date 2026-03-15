document.addEventListener('DOMContentLoaded', () => {
    
    // --- Navigation Logic ---
    const navLinks = document.querySelectorAll('.nav-links a');
    const pageViews = document.querySelectorAll('.page-view');

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('data-target');
            
            // Update active link
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            // Show target section
            pageViews.forEach(view => {
                view.classList.remove('active-view');
                if(view.id === targetId) {
                    view.classList.add('active-view');
                }
            });

            // Initialize map if map tab is clicked
            if(targetId === 'locator') {
                if(!mapInitialized) {
                    initMap();
                    mapInitialized = true;
                }
                // Fix Leaflet gray-box rendering bug by forcing size recalculation after CSS display changes
                setTimeout(() => {
                    if (map) map.invalidateSize();
                }, 100);
            }
        });
    });

    // --- Global Data & Real-Time Engine (OCPI Backend Simulator) ---
    let globalStations = [];
    let heartbeatInterval = null;
    let mapInitialized = false;
    let map;
    let mapMarkers = [];
    
    // Default coordinates (San Francisco)
    let userLat = 37.7749;
    let userLng = -122.4194;

    function formatNREL(nrelData) {
        // Parse the NREL Alternative Fuels Data Center Array
        return nrelData.map((loc) => {
            let total = (loc.ev_level1_evse_num || 0) + (loc.ev_level2_evse_num || 0) + (loc.ev_dc_fast_num || 0);
            let available = 0;
            let isFast = (loc.ev_dc_fast_num || 0) > 0;
            
            // If the map backend didn't have specific port count, infer minimum
            if (total === 0) {
                 total = Math.floor(Math.random() * 10) + 2;
            }
            available = Math.floor(Math.random() * (total + 1));
            
            return {
                id: loc.id,
                name: loc.station_name || "Unknown Station",
                lat: parseFloat(loc.latitude),
                lng: parseFloat(loc.longitude),
                type: isFast ? "Fast" : "Standard",
                total_connectors: total,
                available_connectors: available,
                address: `${loc.street_address}, ${loc.city}`
            };
        });
    }

    async function loadChargers(lat, lng) {
        const statusEl = document.getElementById('api-status');
        const metricEl = document.getElementById('active-chargers-metric');
        
        if(statusEl) statusEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Fetching live NREL Alternative Fuels data...';
        
        try {
            // NREL properly sets Access-Control-Allow-Origin: * natively.
            // Using API 'DEMO_KEY' which is rate limited but functions securely when hosted.
            const targetUrl = `https://developer.nrel.gov/api/alt-fuel-stations/v1/nearest.json?api_key=DEMO_KEY&latitude=${lat}&longitude=${lng}&radius=25&fuel_type=ELEC&limit=30`;
            const response = await fetch(targetUrl);
            const payload = await response.json();
            
            if(!payload || !payload.fuel_stations) throw new Error("NREL API Failed");
            
            globalStations = formatNREL(payload.fuel_stations);
            
            if(statusEl) statusEl.innerHTML = `<span style="color:var(--success-text)">Loaded ${globalStations.length} live stations from NREL API.</span>`;
            if(metricEl) metricEl.innerText = globalStations.length;
            
            renderTimers();
            if (mapInitialized) {
                renderMapMarkers();
            }
            
            if(heartbeatInterval) clearInterval(heartbeatInterval);
            startHeartbeat();
            
        } catch (error) {
            console.error("API Fetch Error:", error);
            if(statusEl) statusEl.innerHTML = `<span style="color:var(--danger-text)">API Error (CORS). Using Offline Fallback Data.</span>`;
            
            // Fallback so it's not totally empty when opened without a server
            globalStations = [
                { "id": 1, "name": "Fallback Fast Charger", "lat": lat + 0.01, "lng": lng + 0.01, "type": "Fast", "total_connectors": 8, "available_connectors": 4, "address": "123 Main St" },
                { "id": 2, "name": "Fallback Standard", "lat": lat - 0.01, "lng": lng - 0.01, "type": "Standard", "total_connectors": 4, "available_connectors": 0, "address": "456 Side St" },
                { "id": 3, "name": "Fallback Super Hub", "lat": lat + 0.02, "lng": lng - 0.02, "type": "Fast", "total_connectors": 12, "available_connectors": 1, "address": "789 Boulevard" }
            ];
            
            renderTimers();
            if (mapInitialized) {
                renderMapMarkers();
            }
            if(heartbeatInterval) clearInterval(heartbeatInterval);
            startHeartbeat();
        }
    }

    function initGeolocationAndLoad() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    userLat = pos.coords.latitude;
                    userLng = pos.coords.longitude;
                    loadChargers(userLat, userLng);
                    if(mapInitialized && map) map.setView([userLat, userLng], 12);
                },
                (err) => {
                    console.warn("Geolocation denied or failed, using default coordinates.");
                    loadChargers(userLat, userLng);
                }
            );
        } else {
            loadChargers(userLat, userLng);
        }
    }
    
    // Kick off load on DOM ready
    initGeolocationAndLoad();

    function startHeartbeat() {
        heartbeatInterval = setInterval(() => {
            let changed = false;
            globalStations.forEach(st => {
                if (Math.random() > 0.80) { // 20% chance this station has activity right now
                    const isPluggingIn = Math.random() > 0.5;
                    if (isPluggingIn && st.available_connectors > 0) {
                        st.available_connectors--;
                        changed = true;
                    } else if (!isPluggingIn && st.available_connectors < st.total_connectors) {
                        st.available_connectors++;
                        changed = true;
                    }
                }
            });

            if (changed) {
                renderTimers();
                if (mapInitialized) {
                    renderMapMarkers();
                }
            }
        }, 3000);
    }

    // --- 1. Map Locator Logic ---
    function initMap() {
        map = L.map('map').setView([userLat, userLng], 12);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);

        if (globalStations.length > 0) {
            renderMapMarkers();
        }

        document.getElementById('search-area-btn').addEventListener('click', () => {
            const center = map.getCenter();
            loadChargers(center.lat, center.lng);
        });
    }

    function renderMapMarkers() {
        if (!map) return;

        const statusEl = document.getElementById('api-status');
        const metricEl = document.getElementById('active-chargers-metric');
        
        statusEl.innerHTML = `<span style="color:var(--success-text)"><i class="fa-solid fa-server"></i> Live OCPI Payload Displayed.</span>`;
        if(metricEl) metricEl.innerText = globalStations.length;

        // Remember which popup was open so we can reopen it transparently
        let openPopupId = null;
        mapMarkers.forEach(mObj => {
            if (mObj.marker.isPopupOpen()) openPopupId = mObj.id;
            map.removeLayer(mObj.marker);
        });
        mapMarkers = [];

        // Define icons based on state and type
        const iconFast = L.divIcon({className: 'custom-div-icon', html: "<div class='dot green' style='width:24px;height:24px;border:3px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3)'></div>", iconSize: [24,24], iconAnchor:[12,12]});
        const iconStandard = L.divIcon({className: 'custom-div-icon', html: "<div class='dot blue' style='width:24px;height:24px;border:3px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3)'></div>", iconSize: [24,24], iconAnchor:[12,12]});
        const iconFull = L.divIcon({className: 'custom-div-icon', html: "<div class='dot red' style='width:24px;height:24px;border:3px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3)'></div>", iconSize: [24,24], iconAnchor:[12,12]});

        globalStations.forEach(st => {
            const isFull = st.available_connectors === 0;
            const isFast = st.type === "Fast";
            
            let icon = isFull ? iconFull : (isFast ? iconFast : iconStandard);
            
            const marker = L.marker([st.lat, st.lng], {icon: icon})
                .bindPopup(`
                    <div style="font-family:'Inter',sans-serif;">
                        <b>${st.name}</b><br>
                        <span style="font-size:12px;color:gray;">${st.address}</span><br><br>
                        ⚡ ${st.type} Charger<br>
                        🔌 Connectors: <b>${st.available_connectors}/${st.total_connectors}</b> Available<br>
                        <span style="color:${isFull ? 'red' : 'green'}; font-weight:bold;">
                            ${isFull ? 'Warning: Full! Wait ~15 mins' : 'Available Now'}
                        </span>
                    </div>
                `, { autoClose: false, closeOnClick: false });
            
            marker.addTo(map);
            mapMarkers.push({ id: st.id, marker: marker });

            // Restore popup if it was open before the re-render heartbeat
            if (openPopupId === st.id) {
                marker.openPopup();
            }
        });
    }

    // --- 2. Live Wait Timer Logic ---
    const timerContainer = document.getElementById('timer-container');
    const refreshBtn = document.getElementById('refresh-timers');
    
    function renderTimers() {
        if(!timerContainer) return;
        timerContainer.innerHTML = '';
        
        // Show a slice of our global stations on the timer board
        const displayStations = globalStations.slice(0, 6);
        
        displayStations.forEach(st => {
            const isAvail = st.available_connectors > 0;
            // Predict a fake wait time if completely full
            const waitTime = isAvail ? 0 : 15 + ((st.total_connectors % 3) * 5);
            const waitText = isAvail ? '🟢 Available Now - Drive In!' : '🟡 Est. Wait: ' + waitTime + ' mins';
            
            const card = document.createElement('div');
            card.className = 'timer-card';
            card.innerHTML = `
                <h3>${st.name}</h3>
                <p>⚡ ${st.type} Charger</p>
                <p style="margin-top:5px;font-weight:bold;font-size:1.1rem">🔌 ${st.available_connectors}/${st.total_connectors} Available</p>
                <div class="timer-status ${isAvail ? 'status-ok' : 'status-wait'}">
                    ${waitText}
                </div>
            `;
            timerContainer.appendChild(card);
        });
    }

    if(refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            refreshBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Syncing Engine...';
            setTimeout(() => {
                renderTimers();
                refreshBtn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Force Sync Data';
            }, 600);
        });
    }

    // --- 3. Forms Handling ---
    function setupForm(formId, successId, preventsDefault = true, callback = null) {
        const form = document.getElementById(formId);
        if(!form) return;
        form.addEventListener('submit', (e) => {
            if(preventsDefault) e.preventDefault();
            document.getElementById(successId).classList.remove('hidden');
            if(callback) callback();
            setTimeout(() => {
                document.getElementById(successId).classList.add('hidden');
                form.reset();
            }, 4000);
        });
    }

    const durSlider = document.getElementById('duration-slider');
    const durVal = document.getElementById('duration-val');
    if(durSlider) durSlider.addEventListener('input', (e) => durVal.innerText = e.target.value);

    setupForm('reservation-form', 'reservation-success');
    setupForm('review-form', 'review-success');
    setupForm('auto-charge-form', 'auto-charge-success');
    setupForm('lead-form', 'lead-success');

    // --- 4. Trip Planner & EV Route Filtering ---
    let routeControl = null;
    let isRouteActive = false;
    let routeLineCoords = null;
    let autocompleteTimeout = null;

    // Autocomplete: Debounced Nominatim search
    function setupAutocomplete(inputId, suggestionsId) {
        const input = document.getElementById(inputId);
        const list = document.getElementById(suggestionsId);
        if (!input || !list) return;

        input.addEventListener('input', () => {
            clearTimeout(autocompleteTimeout);
            const query = input.value.trim();
            if (query.length < 3) { list.classList.remove('show'); list.innerHTML = ''; return; }

            autocompleteTimeout = setTimeout(async () => {
                try {
                    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
                    const data = await res.json();
                    list.innerHTML = '';
                    if (data.length === 0) { list.classList.remove('show'); return; }
                    data.forEach(item => {
                        const div = document.createElement('div');
                        div.className = 'autocomplete-item';
                        div.textContent = item.display_name;
                        div.addEventListener('click', () => {
                            input.value = item.display_name;
                            list.classList.remove('show');
                            list.innerHTML = '';
                        });
                        list.appendChild(div);
                    });
                    list.classList.add('show');
                } catch(e) { list.classList.remove('show'); }
            }, 400);
        });

        // Close dropdown on outside click
        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !list.contains(e.target)) {
                list.classList.remove('show');
            }
        });
    }

    setupAutocomplete('route-start-input', 'start-suggestions');
    setupAutocomplete('route-end-input', 'end-suggestions');

    // Use My Location button
    const useLocBtn = document.getElementById('use-my-location-btn');
    if (useLocBtn) {
        useLocBtn.addEventListener('click', () => {
            if (!navigator.geolocation) return;
            useLocBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Locating...';
            navigator.geolocation.getCurrentPosition(async (pos) => {
                try {
                    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`);
                    const data = await res.json();
                    document.getElementById('route-start-input').value = data.display_name || `${pos.coords.latitude}, ${pos.coords.longitude}`;
                } catch(e) {
                    document.getElementById('route-start-input').value = `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
                }
                useLocBtn.innerHTML = '<i class="fa-solid fa-crosshairs"></i> Use My Location';
            }, () => {
                useLocBtn.innerHTML = '<i class="fa-solid fa-crosshairs"></i> Use My Location';
            });
        });
    }

    // Swap button
    const swapBtn = document.getElementById('swap-route-btn');
    if (swapBtn) {
        swapBtn.addEventListener('click', () => {
            const startInput = document.getElementById('route-start-input');
            const endInput = document.getElementById('route-end-input');
            const t = startInput.value;
            startInput.value = endInput.value;
            endInput.value = t;
        });
    }

    // Slider displays
    const batterySlider = document.getElementById('battery-slider');
    const batteryDisplay = document.getElementById('battery-display');
    if (batterySlider) batterySlider.addEventListener('input', (e) => { if(batteryDisplay) batteryDisplay.textContent = e.target.value; });

    const detourSlider = document.getElementById('detour-slider');
    const detourDisplay = document.getElementById('detour-display');
    if (detourSlider) detourSlider.addEventListener('input', (e) => { if(detourDisplay) detourDisplay.textContent = e.target.value; });

    // Build dynamic timeline from filtered stations
    function buildRouteTimeline(startName, endName, stations, summary) {
        const container = document.getElementById('route-timeline-container');
        if (!container) return;
        container.innerHTML = '';

        // Start node
        const startDiv = document.createElement('div');
        startDiv.className = 'timeline-item start';
        startDiv.innerHTML = `<h4>🛣️ Start</h4><p>${startName}</p>`;
        container.appendChild(startDiv);

        // Charging stop nodes (pick up to 4 evenly spaced stations)
        if (stations.length === 0) {
            const noDiv = document.createElement('div');
            noDiv.className = 'timeline-item charging';
            noDiv.innerHTML = `<h4>⚠️ No Chargers Found</h4><p>No charging stations available on this route. Try a wider detour radius.</p>`;
            container.appendChild(noDiv);
        } else {
            const maxStops = Math.min(stations.length, 4);
            const step = Math.max(1, Math.floor(stations.length / maxStops));
            for (let i = 0; i < maxStops; i++) {
                const st = stations[i * step];
                if (!st) continue;
                const chDiv = document.createElement('div');
                chDiv.className = 'timeline-item charging';
                const chargeType = st.type === 'Fast' ? 'DC Fast' : 'Level 2';
                chDiv.innerHTML = `<h4>⚡ Stop ${i+1}: ${st.name}</h4><p>${chargeType} • ${st.available_connectors}/${st.total_connectors} ports • ${st.address}</p>`;
                container.appendChild(chDiv);
            }
        }

        // End node
        const endDiv = document.createElement('div');
        endDiv.className = 'timeline-item end';
        endDiv.innerHTML = `<h4>🏁 Destination</h4><p>${endName}</p>`;
        container.appendChild(endDiv);
    }

    // Build sorted charger list panel
    function buildChargerList(stations, startLat, startLng) {
        const container = document.getElementById('charger-list-container');
        const countBadge = document.getElementById('charger-list-count');
        if (!container) return;
        container.innerHTML = '';
        if (countBadge) countBadge.textContent = stations.length;

        if (stations.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding:40px 20px; color:var(--text-muted);">
                    <i class="fa-solid fa-charging-station" style="font-size:2.5rem; margin-bottom:12px; display:block; opacity:0.3;"></i>
                    <p style="font-weight:700; font-size:1.1rem; color:var(--text-main); margin-bottom:6px;">No Chargers Available</p>
                    <p style="font-size:0.85rem;">No EV charging stations were found along this route.<br>Try increasing the detour radius or choosing a different route.</p>
                </div>
            `;
            return;
        }

        // Calculate distance from starting point for each station and sort ascending
        const startPt = turf.point([startLng, startLat]);
        const stationsWithDist = stations.map(st => {
            const stPt = turf.point([st.lng, st.lat]);
            const dist = turf.distance(startPt, stPt, { units: 'miles' });
            return { ...st, distFromStart: dist };
        });
        stationsWithDist.sort((a, b) => a.distFromStart - b.distFromStart);

        stationsWithDist.forEach(st => {
            const isAvail = st.available_connectors > 0;
            const item = document.createElement('div');
            item.className = 'charger-list-item';
            item.innerHTML = `
                <div class="charger-avail-dot ${isAvail ? 'available' : 'full'}"></div>
                <div class="charger-list-info">
                    <div class="charger-name">${st.name}</div>
                    <div class="charger-meta">
                        <span>⚡ ${st.type}</span>
                        <span>🔌 ${st.available_connectors}/${st.total_connectors}</span>
                        <span>📍 ${st.address}</span>
                    </div>
                </div>
                <div class="charger-dist-badge">${st.distFromStart.toFixed(1)} mi</div>
            `;
            // Click to pan map to this charger
            item.addEventListener('click', () => {
                document.querySelector('[data-target="locator"]').click();
                if (map) {
                    map.setView([st.lat, st.lng], 15);
                    // Open the popup for this marker
                    const found = mapMarkers.find(m => m.id === st.id);
                    if (found) found.marker.openPopup();
                }
            });
            container.appendChild(item);
        });
    }

    // Geocode cache to avoid redundant network calls
    const geocodeCache = {};
    async function geocodeAddress(address) {
        if (geocodeCache[address]) return geocodeCache[address];
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`);
        const data = await res.json();
        if (data.length === 0) throw new Error(`Could not find: ${address}`);
        geocodeCache[address] = data[0];
        return data[0];
    }

    // Trip form submission
    const tripForm = document.getElementById('trip-form');
    if(tripForm) {
        tripForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const startPoint = document.getElementById('route-start-input').value;
            const endPoint = document.getElementById('route-end-input').value;
            const filterDistanceMiles = parseInt(detourSlider ? detourSlider.value : 5);

            // Switch to Map View
            document.querySelector('[data-target="locator"]').click();
            
            const statusEl = document.getElementById('api-status');
            const calcBtn = document.getElementById('calculate-route-btn');
            if(calcBtn) calcBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Calculating...';
            if(statusEl) statusEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Geocoding locations...';

            // Clear existing route
            if (routeControl) {
                map.removeControl(routeControl);
                routeControl = null;
            }
            
            try {
                // PERF: Geocode BOTH addresses in parallel (was sequential before)
                const [startGeo, endGeo] = await Promise.all([
                    geocodeAddress(startPoint),
                    geocodeAddress(endPoint)
                ]);
                
                const startNode = L.latLng(startGeo.lat, startGeo.lon);
                const endNode = L.latLng(endGeo.lat, endGeo.lon);

                if(statusEl) statusEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Calculating driving route...';
                
                // PERF: Pre-fetch NREL data NOW while OSRM is computing the route
                const minLat = Math.min(startNode.lat, endNode.lat) - 0.5;
                const maxLat = Math.max(startNode.lat, endNode.lat) + 0.5;
                const minLng = Math.min(startNode.lng, endNode.lng) - 0.5;
                const maxLng = Math.max(startNode.lng, endNode.lng) + 0.5;
                const nrelUrl = `https://developer.nrel.gov/api/alt-fuel-stations/v1.json?api_key=DEMO_KEY&fuel_type=ELEC&bounds=${minLng},${minLat},${maxLng},${maxLat}&limit=200`;
                const nrelPromise = fetch(nrelUrl).then(r => r.json()).catch(() => null);

                routeControl = L.Routing.control({
                    waypoints: [startNode, endNode],
                    routeWhileDragging: false,
                    addWaypoints: false,
                    show: false,
                    lineOptions: { styles: [{ color: '#3b82f6', opacity: 0.8, weight: 6 }] }
                }).addTo(map);
                
                routeControl.on('routesfound', async function(e) {
                    const routes = e.routes;
                    const summary = routes[0].summary;
                    
                    routeLineCoords = routes[0].coordinates.map(c => [c.lng, c.lat]);
                    
                    if(statusEl) statusEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Filtering chargers along route...';

                    // PERF: NREL data was already fetching in parallel — just await it
                    const payload = await nrelPromise;
                    
                    if(payload && payload.fuel_stations) {
                        let allTripStations = formatNREL(payload.fuel_stations);
                        
                        const routeLineString = turf.lineString(routeLineCoords);
                        
                        const filteredStations = allTripStations.filter(station => {
                            const pt = turf.point([station.lng, station.lat]);
                            const distance = turf.pointToLineDistance(pt, routeLineString, {units: 'miles'});
                            return distance <= filterDistanceMiles;
                        });
                        
                        globalStations = filteredStations;
                        isRouteActive = true;
                        
                        // Update stats
                        const distMi = (summary.totalDistance / 1609).toFixed(0);
                        const durHrs = Math.floor(summary.totalTime / 3600);
                        const durMins = Math.floor((summary.totalTime % 3600) / 60);
                        
                        document.getElementById('route-distance').textContent = `${distMi} mi`;
                        document.getElementById('route-duration').textContent = `${durHrs}h ${durMins}m`;
                        document.getElementById('route-chargers').textContent = globalStations.length;
                        
                        if(statusEl) statusEl.innerHTML = `<span style="color:var(--success-text)"><i class="fa-solid fa-route"></i> Route: ${globalStations.length} chargers within ${filterDistanceMiles}mi detour.</span>`;
                        const metricEl = document.getElementById('active-chargers-metric');
                        if(metricEl) metricEl.innerText = globalStations.length;
                        
                        renderMapMarkers();
                        renderTimers();
                        
                        // Build dynamic timeline and charger list
                        buildRouteTimeline(startPoint, endPoint, globalStations, summary);
                        buildChargerList(globalStations, startNode.lat, startNode.lng);
                        document.getElementById('trip-results').classList.remove('hidden');
                    } else {
                        // NREL failed — still show route but with no chargers
                        globalStations = [];
                        buildRouteTimeline(startPoint, endPoint, [], summary);
                        buildChargerList([], startNode.lat, startNode.lng);
                        document.getElementById('trip-results').classList.remove('hidden');
                        if(statusEl) statusEl.innerHTML = `<span style="color:var(--danger-text)"><i class="fa-solid fa-triangle-exclamation"></i> Route drawn but charger data unavailable.</span>`;
                    }
                    
                    if(calcBtn) calcBtn.innerHTML = '<i class="fa-solid fa-route"></i> Calculate Route & Find Chargers';
                });
                
            } catch (error) {
                console.error("Routing Error:", error);
                if(statusEl) statusEl.innerHTML = `<span style="color:var(--danger-text)">Routing engine failed. Try valid city names.</span>`;
                if(calcBtn) calcBtn.innerHTML = '<i class="fa-solid fa-route"></i> Calculate Route & Find Chargers';
            }
        });
    }

    // Clear Route button
    const clearRouteBtn = document.getElementById('clear-route-btn');
    if (clearRouteBtn) {
        clearRouteBtn.addEventListener('click', () => {
            if (routeControl) {
                map.removeControl(routeControl);
                routeControl = null;
            }
            isRouteActive = false;
            document.getElementById('trip-results').classList.add('hidden');
            // Reload default chargers
            loadChargers(userLat, userLng);
        });
    }

    // --- 5. Tabs Logic ---
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active-tab'));
            
            btn.classList.add('active');
            document.getElementById(btn.getAttribute('data-tab')).classList.add('active-tab');
        });
    });

});
