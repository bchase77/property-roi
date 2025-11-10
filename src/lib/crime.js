// Crime data service functions

// Geocoding service for getting coordinates from address
export async function geocodeAddress(address, city, state) {
  try {
    const fullAddress = `${address}, ${city}, ${state}`;
    console.log('🗺️ Geocoding address:', fullAddress);
    
    // Using Nominatim (free OpenStreetMap geocoding service)
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fullAddress)}&limit=1`, 
      {
        headers: {
          'User-Agent': 'PropertyROI/1.0 Real Estate Analysis'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Geocoding failed: ${response.statusText}`);
    }

    const results = await response.json();
    
    if (results.length > 0) {
      const result = results[0];
      console.log('📍 Geocoding successful:', { lat: result.lat, lng: result.lon });
      return {
        latitude: parseFloat(result.lat),
        longitude: parseFloat(result.lon),
        display_name: result.display_name
      };
    }
    
    throw new Error('Address not found');
  } catch (error) {
    console.error('❌ Geocoding error:', error);
    return null;
  }
}

// Primary crime data fetching function - tries local APIs first
export async function fetchCrimeDataByLocation(city, state, address = null) {
  try {
    console.log('🔍 Fetching crime data for:', { city, state, address });
    
    let coordinates = null;
    
    // If we have an address, try to get coordinates for radius-based search
    if (address) {
      coordinates = await geocodeAddress(address, city, state);
    }

    // Try local police data first
    const localResponse = await fetch('/api/crime/local-data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        city, 
        state, 
        address,
        latitude: coordinates?.latitude,
        longitude: coordinates?.longitude
      }),
    });

    if (localResponse.ok) {
      const localData = await localResponse.json();
      console.log('✅ Local crime data retrieved successfully');
      return localData;
    } else {
      console.log('⚠️ Local crime data failed, falling back to FBI data');
      
      // Fallback to original FBI API
      const fbiFallback = await fetch('/api/crime/fetch-by-location', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ city, state }),
      });

      if (fbiFallback.ok) {
        return await fbiFallback.json();
      } else {
        throw new Error('Both local and FBI crime data unavailable');
      }
    }
  } catch (error) {
    console.error('Crime data fetch error:', error);
    throw error;
  }
}

/**
 * Formats crime index score with color coding and labels
 * 
 * Crime Index Scale (1-10):
 * • 1-3: Low Crime (🟢 Green) - Generally safe area with below-average crime rates
 * • 4-6: Moderate Crime (🟡 Yellow) - Average crime rates for the region  
 * • 7-10: High Crime (🔴 Red) - Above-average crime rates, exercise caution
 * 
 * Lower scores = Safer neighborhoods
 * Higher scores = More dangerous neighborhoods
 */
export function formatCrimeIndex(crimeIndex) {
  if (!crimeIndex) return { score: null, label: 'Unknown', color: 'gray' };
  
  if (crimeIndex <= 3) return { score: crimeIndex, label: 'Low Crime', color: 'green' };
  if (crimeIndex <= 6) return { score: crimeIndex, label: 'Moderate Crime', color: 'yellow' };
  return { score: crimeIndex, label: 'High Crime', color: 'red' };
}

export function getCrimeDescription(crimeIndex) {
  const formatted = formatCrimeIndex(crimeIndex);
  
  const descriptions = {
    'Low Crime': 'Generally safe area with below-average crime rates. Good for families and property values.',
    'Moderate Crime': 'Average crime rates for the region. Standard safety precautions recommended.',
    'High Crime': 'Above-average crime rates, exercise caution. May impact rental demand and property values.',
    'Unknown': 'Crime data unavailable for this location'
  };
  
  return descriptions[formatted.label] || 'Crime data unavailable';
}

/**
 * Gets a detailed explanation of the crime index scale
 */
export function getCrimeIndexExplanation() {
  return {
    title: "Crime Index Scale (1-10)",
    description: "Our crime index combines violent and property crime rates to create a safety score for neighborhoods. Lower numbers indicate safer areas.",
    ranges: [
      { min: 1, max: 3, label: "Low Crime", color: "green", icon: "🟢", description: "Generally safe area with below-average crime rates. Good for families and property values." },
      { min: 4, max: 6, label: "Moderate Crime", color: "yellow", icon: "🟡", description: "Average crime rates for the region. Standard safety precautions recommended." },
      { min: 7, max: 10, label: "High Crime", color: "red", icon: "🔴", description: "Above-average crime rates, exercise caution. May impact rental demand and property values." }
    ],
    note: "Crime data sourced from FBI Crime Data Explorer. Calculations based on violent and property crimes per capita."
  };
}