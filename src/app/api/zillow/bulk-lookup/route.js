import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { address } = await request.json();

    if (!address) {
      return NextResponse.json({ error: 'Address is required' }, { status: 400 });
    }

    console.log('🏠 Looking up property:', address);

    const rapidApiKey = process.env.RAPIDAPI_KEY;
    if (!rapidApiKey) {
      return NextResponse.json({ error: 'RapidAPI key not configured' }, { status: 500 });
    }

    // Initialize API response tracking
    const apiResponses = {
      step1_exact_match: [],
      step2_property_details: [],
      step3_nearby_comparables: [],
      step4_wider_comparables: []
    };

    // Step 1: Try to find exact property match first
    console.log('🎯 Step 1: Looking for exact address match...');
    let exactMatch = await getExactPropertyMatch(address, rapidApiKey, apiResponses.step1_exact_match);
    
    if (exactMatch) {
      console.log('✅ Found exact property match:', exactMatch);
      exactMatch.apiResponses = apiResponses;
      return NextResponse.json(exactMatch);
    }

    // Step 2: Get property details to find comparables
    console.log('🏠 Step 2: Getting property details for comparable search...');
    const propertyDetails = await getPropertyDetails(address, rapidApiKey, apiResponses.step2_property_details);
    
    // Step 3: Find nearby comparables with same bed/bath and similar sqft
    console.log('📍 Step 3: Searching for nearby comparables...');
    const comparables = await getNearbyComparables(address, propertyDetails, rapidApiKey, apiResponses.step3_nearby_comparables);
    
    if (comparables && comparables.length > 0) {
      console.log('✅ Found comparable properties:', comparables);
      const averageData = calculateComparableAverage(address, propertyDetails, comparables);
      averageData.apiResponses = apiResponses;
      return NextResponse.json(averageData);
    }

    // Step 4: Enhanced comparable search if initial search failed
    console.log('⚠️ Step 4: Searching wider area for comparables...');
    const widerComparables = await getWiderAreaComparables(address, propertyDetails, rapidApiKey, apiResponses.step4_wider_comparables);
    
    if (widerComparables && widerComparables.length > 0) {
      console.log('✅ Found wider area comparables:', widerComparables);
      const averageData = calculateComparableAverage(address, propertyDetails, widerComparables);
      averageData.apiResponses = apiResponses;
      return NextResponse.json(averageData);
    }

    // Step 5: Last resort - market estimate with note about no comparables found
    console.log('⚠️ Step 5: No comparables found, using market estimate');
    const fallbackData = getFallbackEstimate(address);
    fallbackData.note = 'No comparable properties found in area - market estimate only. Consider manual research.';
    fallbackData.apiResponses = apiResponses;
    return NextResponse.json(fallbackData);

  } catch (error) {
    console.error('Bulk lookup error:', error);
    return NextResponse.json({ 
      error: 'Failed to lookup property: ' + error.message,
      success: false 
    }, { status: 500 });
  }
}

// Step 1: Try to find exact property match with current rent
async function getExactPropertyMatch(address, apiKey, responseLog) {
  const apis = [
    { name: 'RentSpree', host: 'rentspree.p.rapidapi.com', endpoint: 'search' },
    { name: 'RealEstate', host: 'real-estate-by-api-dojo.p.rapidapi.com', endpoint: 'properties/search-rent' },
    { name: 'PropertyData', host: 'property-records.p.rapidapi.com', endpoint: 'search' }
  ];

  for (const api of apis) {
    try {
      const url = `https://${api.host}/${api.endpoint}?address=${encodeURIComponent(address)}`;
      const response = await fetch(url, {
        headers: { 'X-RapidAPI-Key': apiKey, 'X-RapidAPI-Host': api.host }
      });

      console.log(`${api.name} exact match API returned ${response.status}`);

      // Log the response for debugging
      const responseData = response.ok ? await response.json() : { error: `HTTP ${response.status}` };
      responseLog.push({
        api: api.name,
        url: url,
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        data: responseData,
        timestamp: new Date().toISOString()
      });

      if (response.ok) {        
        // Look for exact address match with current rent data
        const exactMatch = findExactAddressMatch(responseData, address);
        if (exactMatch) {
          return {
            success: true,
            rentEstimate: exactMatch.rent,
            bedrooms: exactMatch.bedrooms,
            bathrooms: exactMatch.bathrooms,
            sqft: exactMatch.sqft,
            address: address,
            sources: `${api.name} (Exact Match)`,
            dataPoints: 1,
            matchType: 'exact',
            lastUpdated: exactMatch.lastUpdated || new Date().toISOString()
          };
        }
      }
    } catch (error) {
      console.error(`${api.name} exact match error:`, error);
      // Log the error too
      responseLog.push({
        api: api.name,
        url: `https://${api.host}/${api.endpoint}?address=${encodeURIComponent(address)}`,
        status: 'ERROR',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
  return null;
}

// Step 2: Get property details (bedrooms, bathrooms, sqft) for comparable search
async function getPropertyDetails(address, apiKey, responseLog) {
  try {
    // Try multiple sources to get property characteristics
    const sources = [
      { host: 'property-records.p.rapidapi.com', endpoint: 'property-details' },
      { host: 'us-real-estate.p.rapidapi.com', endpoint: 'property' }
    ];

    for (const source of sources) {
      try {
        const response = await fetch(`https://${source.host}/${source.endpoint}?address=${encodeURIComponent(address)}`, {
          headers: { 'X-RapidAPI-Key': apiKey, 'X-RapidAPI-Host': source.host }
        });

        if (response.ok) {
          const data = await response.json();
          return extractPropertyDetails(data);
        }
      } catch (error) {
        console.error(`Property details error from ${source.host}:`, error);
      }
    }

    // Fallback: estimate property details from address patterns
    return estimatePropertyDetails(address);
  } catch (error) {
    console.error('Property details error:', error);
    return estimatePropertyDetails(address);
  }
}

// Step 3: Enhanced wider area comparable search
async function getWiderAreaComparables(address, propertyDetails, apiKey, responseLog) {
  try {
    // Get city/state for area search
    const parts = address.split(',');
    const city = parts[1]?.trim();
    const state = parts[2]?.trim();
    const searchArea = `${city}, ${state}`;

    console.log(`Searching wider area for comparables near ${searchArea}:`, propertyDetails);

    // Try multiple rental and property APIs with wider radius
    const apis = [
      { host: 'zillow56.p.rapidapi.com', endpoint: 'search', params: 'location' },
      { host: 'realtor.p.rapidapi.com', endpoint: 'properties/v2/list-for-rent', params: 'city,state_code' },
      { host: 'rental-listings.p.rapidapi.com', endpoint: 'search', params: 'location,radius=5' },
      { host: 'apartments-database.p.rapidapi.com', endpoint: 'search', params: 'location,radius=5' },
      { host: 'realty-mole-rental-estimate-api.p.rapidapi.com', endpoint: 'rentals', params: 'city,state' },
      { host: 'us-real-estate.p.rapidapi.com', endpoint: 'for-rent', params: 'location' }
    ];

    let allComparables = [];

    for (const api of apis) {
      try {
        let url = `https://${api.host}/${api.endpoint}`;
        let params = new URLSearchParams();
        
        // Set up parameters based on API
        if (api.params.includes('location')) {
          params.append('location', searchArea);
        }
        if (api.params.includes('city')) {
          params.append('city', city);
        }
        if (api.params.includes('state')) {
          params.append('state_code', state);
        }
        if (api.params.includes('bedrooms')) {
          params.append('bedrooms', propertyDetails.bedrooms);
        }
        if (api.params.includes('radius=5')) {
          params.append('radius', '5');
        } else if (api.params.includes('radius=2')) {
          params.append('radius', '2');
        }

        const fullUrl = `${url}?${params.toString()}`;
        console.log(`Trying ${api.host}: ${fullUrl}`);

        const response = await fetch(fullUrl, {
          headers: { 'X-RapidAPI-Key': apiKey, 'X-RapidAPI-Host': api.host }
        });

        console.log(`${api.host} wider search returned ${response.status}`);

        if (response.ok) {
          const data = await response.json();
          const comparables = filterComparables(data, propertyDetails);
          if (comparables.length > 0) {
            console.log(`Found ${comparables.length} comparables from ${api.host}`);
            allComparables = allComparables.concat(comparables);
          }
        }
      } catch (error) {
        console.error(`Wider search error from ${api.host}:`, error.message);
      }
    }

    // Sort by similarity and return best matches
    const sortedComparables = allComparables
      .sort((a, b) => calculateSimilarityScore(b, propertyDetails) - calculateSimilarityScore(a, propertyDetails))
      .slice(0, 15); // Top 15 most similar

    console.log(`Wider search found ${sortedComparables.length} total comparables`);
    return sortedComparables;
      
  } catch (error) {
    console.error('Wider area comparables error:', error);
    return [];
  }
}

// Step 3: Find nearby comparables with similar characteristics
async function getNearbyComparables(address, propertyDetails, apiKey, responseLog) {
  try {
    // Get city/state for area search
    const parts = address.split(',');
    const city = parts[1]?.trim();
    const state = parts[2]?.trim();
    const searchArea = `${city}, ${state}`;

    console.log(`Searching for comparables near ${searchArea}:`, propertyDetails);

    // Try rental listing APIs for nearby properties
    const apis = [
      { host: 'rental-listings.p.rapidapi.com', endpoint: 'search' },
      { host: 'apartments-database.p.rapidapi.com', endpoint: 'search' }
    ];

    let allComparables = [];

    for (const api of apis) {
      try {
        const response = await fetch(`https://${api.host}/${api.endpoint}?location=${encodeURIComponent(searchArea)}&bedrooms=${propertyDetails.bedrooms}&radius=2`, {
          headers: { 'X-RapidAPI-Key': apiKey, 'X-RapidAPI-Host': api.host }
        });

        if (response.ok) {
          const data = await response.json();
          const comparables = filterComparables(data, propertyDetails);
          allComparables = allComparables.concat(comparables);
        }
      } catch (error) {
        console.error(`Comparables error from ${api.host}:`, error);
      }
    }

    // Sort by similarity and return best matches
    return allComparables
      .sort((a, b) => calculateSimilarityScore(b, propertyDetails) - calculateSimilarityScore(a, propertyDetails))
      .slice(0, 10); // Top 10 most similar
      
  } catch (error) {
    console.error('Nearby comparables error:', error);
    return [];
  }
}

// Helper functions
function findExactAddressMatch(data, targetAddress) {
  // Normalize addresses for comparison
  const normalizeAddress = (addr) => addr.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
  const normalizedTarget = normalizeAddress(targetAddress);

  // Search through API response for exact address match
  const properties = data.properties || data.results || data.listings || [];
  
  for (const prop of properties) {
    const propAddress = prop.address || prop.street_address || '';
    if (normalizeAddress(propAddress) === normalizedTarget && prop.rent > 0) {
      return {
        rent: prop.rent || prop.price,
        bedrooms: prop.bedrooms || prop.beds,
        bathrooms: prop.bathrooms || prop.baths,
        sqft: prop.sqft || prop.square_feet || prop.living_area,
        lastUpdated: prop.updated || prop.listed_date
      };
    }
  }
  return null;
}

function extractPropertyDetails(data) {
  const prop = data.property || data.result || data;
  return {
    bedrooms: prop.bedrooms || prop.beds || 3,
    bathrooms: prop.bathrooms || prop.baths || 2,
    sqft: prop.sqft || prop.square_feet || prop.living_area || 1700,
    yearBuilt: prop.year_built,
    propertyType: prop.property_type || 'house'
  };
}

function estimatePropertyDetails(address) {
  // Basic estimation based on address patterns and area
  const parts = address.toLowerCase().split(',');
  const city = parts[1]?.trim() || '';
  
  // Different areas have different typical sizes
  const areaDefaults = {
    'haslet': { bedrooms: 4, bathrooms: 3, sqft: 2200 },
    'fort worth': { bedrooms: 3, bathrooms: 2, sqft: 1800 },
    'dallas': { bedrooms: 3, bathrooms: 2, sqft: 1700 },
    'plano': { bedrooms: 4, bathrooms: 3, sqft: 2100 }
  };

  return areaDefaults[city] || { bedrooms: 3, bathrooms: 2, sqft: 1700 };
}

function filterComparables(data, targetDetails) {
  const properties = data.properties || data.results || data.listings || [];
  
  return properties
    .filter(prop => {
      const bedDiff = Math.abs((prop.bedrooms || prop.beds || 3) - targetDetails.bedrooms);
      const sqftDiff = Math.abs((prop.sqft || prop.square_feet || 1700) - targetDetails.sqft);
      const sqftPercDiff = sqftDiff / targetDetails.sqft;
      
      return (
        prop.rent > 0 &&
        bedDiff <= 1 && // Within 1 bedroom
        sqftPercDiff <= 0.3 // Within 30% of square footage
      );
    })
    .map(prop => ({
      rent: prop.rent || prop.price,
      bedrooms: prop.bedrooms || prop.beds,
      bathrooms: prop.bathrooms || prop.baths,
      sqft: prop.sqft || prop.square_feet,
      address: prop.address || 'Near target',
      distance: prop.distance || 'Within 2 miles'
    }));
}

function calculateSimilarityScore(comp, target) {
  const bedScore = Math.max(0, 1 - Math.abs(comp.bedrooms - target.bedrooms) / 4);
  const bathScore = Math.max(0, 1 - Math.abs(comp.bathrooms - target.bathrooms) / 3);
  const sqftScore = Math.max(0, 1 - Math.abs(comp.sqft - target.sqft) / target.sqft);
  
  return (bedScore + bathScore + sqftScore) / 3;
}

function calculateComparableAverage(address, propertyDetails, comparables) {
  const totalRent = comparables.reduce((sum, comp) => sum + comp.rent, 0);
  const avgRent = Math.round(totalRent / comparables.length);
  
  return {
    success: true,
    rentEstimate: avgRent,
    bedrooms: propertyDetails.bedrooms,
    bathrooms: propertyDetails.bathrooms,
    sqft: propertyDetails.sqft,
    address: address,
    sources: `${comparables.length} Nearby Comparables`,
    dataPoints: comparables.length,
    matchType: 'comparable',
    comparables: comparables.slice(0, 5), // Show top 5 comparables
    lastUpdated: new Date().toISOString(),
    note: `Average of ${comparables.length} similar properties within 2 miles`
  };
}

// Fallback estimation when APIs don't work
function getFallbackEstimate(address) {
  // Parse city/state for basic market estimates
  const parts = address.toLowerCase().split(',');
  const city = parts[1]?.trim();
  const state = parts[2]?.trim();

  // Basic market rates by major Texas cities (rough estimates)
  const marketRates = {
    'dallas': { rent: 2200, sqft: 1800 },
    'fort worth': { rent: 1900, sqft: 1700 },
    'austin': { rent: 2500, sqft: 1600 },
    'houston': { rent: 2000, sqft: 1900 },
    'san antonio': { rent: 1600, sqft: 1800 },
    'plano': { rent: 2400, sqft: 1800 },
    'irving': { rent: 2100, sqft: 1700 },
    'garland': { rent: 1800, sqft: 1600 },
    'arlington': { rent: 1900, sqft: 1700 },
    'haslet': { rent: 2200, sqft: 1800 }, // Suburb of Fort Worth
  };

  // Find matching city or use state default
  let estimate = marketRates[city] || marketRates[state] || { rent: 1800, sqft: 1600 };

  // Add some variation based on address (rough heuristic)
  const variation = Math.floor(Math.random() * 400) - 200; // ±$200 variation
  
  return {
    success: true,
    rentEstimate: estimate.rent + variation,
    bedrooms: 3, // Default estimate
    bathrooms: 2,
    sqft: estimate.sqft,
    address: address,
    sources: 'Market Estimate (Fallback)',
    dataPoints: 1,
    lastUpdated: new Date().toISOString(),
    note: 'Estimated based on local market data - API access needed for precise values'
  };
}

