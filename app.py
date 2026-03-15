from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import uuid
from datetime import datetime

app = Flask(__name__)
# Enable CORS for the frontend to hit this backend
CORS(app)

OPEN_CHARGE_MAP_URL = "https://api.openchargemap.io/v3/poi"

def transform_to_ocpi(ocm_data):
    """
    Transforms the OpenChargeMap array into an OCPI 2.2 compliant Location Object array.
    """
    locations = []
    
    for item in ocm_data:
        addr = item.get("AddressInfo", {})
        
        # Determine if it's fast charging
        is_fast = False
        conns = item.get("Connections", [])
        if conns:
            is_fast = any(c.get("LevelID") == 3 for c in conns)
            
        ocpi_location = {
            "country_code": addr.get("Country", {}).get("ISOCode", "US"),
            "party_id": "OCM", # Open Charge Map
            "id": str(item.get("ID")),
            "publish": True,
            "name": addr.get("Title", "Unknown Station"),
            "address": addr.get("AddressLine1", "Unknown Address"),
            "city": addr.get("Town", "Unknown City"),
            "postal_code": addr.get("Postcode", "00000"),
            "country": addr.get("Country", {}).get("ISOCode", "US"),
            "coordinates": {
                "latitude": str(addr.get("Latitude")),
                "longitude": str(addr.get("Longitude"))
            },
            "parking_type": "PARKING_LOT",
            "evses": [],
            "last_updated": item.get("DateLastStatusUpdate", datetime.utcnow().isoformat() + "Z")
        }
        
        # Build EVSEs (Electric Vehicle Supply Equipment) representations
        # OCM provides connections, we'll map each connection strictly to an EVSE instance
        for idx, conn in enumerate(conns):
            # Map connector types to OCPI standard
            conn_type = "sCHUKO" # Default fallback
            current_type = "AC"
            
            ocm_type_id = conn.get("ConnectionTypeID")
            if ocm_type_id == 2:
                conn_type = "IEC_62196_T2" # Type 2
            elif ocm_type_id == 33:
                conn_type = "CCS1"
                current_type = "DC"
            elif ocm_type_id == 32:
                conn_type = "CCS2"
                current_type = "DC"
            elif ocm_type_id == 27:
                conn_type = "TESLA"
                current_type = "DC"
            elif ocm_type_id == 1:
                conn_type = "IEC_62196_T1" # Type 1
                
            volts = conn.get("Voltage") or 230
            amps = conn.get("Amps") or 32
            
            evse = {
                "uid": f"{item.get('ID')}-{idx}",
                "status": "AVAILABLE" if item.get("StatusTypeID") == 50 else "UNKNOWN",
                "capabilities": ["REMOTE_START_STOP_CAPABLE", "RFID_READER"],
                "connectors": [{
                    "id": str(idx + 1),
                    "standard": conn_type,
                    "format": "SOCKET",
                    "power_type": current_type,
                    "max_voltage": volts,
                    "max_amperage": amps,
                    "last_updated": item.get("DateLastStatusUpdate", datetime.utcnow().isoformat() + "Z")
                }],
                "last_updated": item.get("DateLastStatusUpdate", datetime.utcnow().isoformat() + "Z")
            }
            ocpi_location["evses"].append(evse)
            
        locations.append(ocpi_location)
        
    return locations

@app.route('/ocpi/2.2/locations', methods=['GET'])
def get_locations():
    """
    OCPI Compliant Locations Endpoint
    """
    lat = request.args.get('lat', 37.7749)
    lng = request.args.get('lng', -122.4194)
    
    # 1. Fetch raw data from Open Charge Map
    params = {
        "output": "json",
        "latitude": lat,
        "longitude": lng,
        "distance": 25,
        "distanceunit": "KM",
        "maxresults": 30
    }
    
    print(f"Fetching OpenChargeMap for {lat}, {lng}...")
    try:
        response = requests.get(OPEN_CHARGE_MAP_URL, params=params, timeout=10)
        response.raise_for_status()
        raw_data = response.json()
        
        # 2. Transform into OCPI 2.2 strict standard
        ocpi_locations = transform_to_ocpi(raw_data)
        
        # 3. Return OCPI Standard Output Wrapper
        return jsonify({
            "status_code": 1000,
            "status_message": "Success",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "data": ocpi_locations
        })
        
    except Exception as e:
        print(f"Error fetching OCM: {e}")
        return jsonify({
            "status_code": 2000,
            "status_message": "Error fetching upstream data",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "data": []
        }), 500

if __name__ == '__main__':
    # Run the server on port 5000 (standard Flask port)
    app.run(host='127.0.0.1', port=5000, debug=True)
