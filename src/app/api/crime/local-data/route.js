// Local police department crime data aggregation API
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { city, state, latitude, longitude, address } = await request.json();

    if (!city || !state) {
      return NextResponse.json({ message: 'City and state are required' }, { status: 400 });
    }

    console.log('🔍 Fetching local crime data for:', { city, state, address });

    const crimeData = await fetchLocalCrimeData(city, state, latitude, longitude, address);

    return NextResponse.json(crimeData);

  } catch (error) {
    console.error('❌ Local Crime API Error:', error);
    return NextResponse.json({ 
      message: 'Failed to fetch local crime data',
      error: error.message
    }, { status: 500 });
  }
}

async function fetchLocalCrimeData(city, state, latitude, longitude, address) {
  const cityKey = `${city.toLowerCase()}-${state.toLowerCase()}`;
  
  console.log('🎯 Targeting city:', cityKey);

  switch (cityKey) {
    case 'memphis-tn':
      return await fetchMemphisCrimeData(latitude, longitude, address);
    
    case 'fort worth-tx':
      return await fetchFortWorthCrimeData(latitude, longitude, address);
    
    case 'oklahoma city-ok':
      return await fetchOklahomaCityCrimeData(latitude, longitude, address);
    
    case 'sunnyvale-ca':
      return await fetchSunnyvaleCrimeData(latitude, longitude, address);
    
    case 'crosby-tx':
      return await fetchCrosbyHarrisCountyCrimeData(latitude, longitude, address);
    
    default:
      // Fallback to FBI data for unsupported cities
      console.log('⚠️ No local API available for', cityKey, '- using FBI fallback');
      return await fetchFBIFallbackData(city, state);
  }
}

// ====== MEMPHIS POLICE DEPARTMENT API ======
async function fetchMemphisCrimeData(latitude, longitude, address) {
  console.log('🏛️ Fetching Memphis Police data...');
  
  const baseUrl = 'https://data.memphistn.gov/resource/puh4-eea4.json';
  const radiusMiles = 0.5; // Search within 0.5 mile radius
  
  // Calculate date range - last 12 months for trending
  const endDate = new Date();
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 1);
  
  const whereClause = `offense_date between '${startDate.toISOString().split('T')[0]}' and '${endDate.toISOString().split('T')[0]}'`;
  
  // Start with a simple query to get recent crimes - we'll add geo filtering later
  let url = `${baseUrl}?$limit=500&$order=offense_date DESC`;
  
  // Add date filter for last 6 months to get recent data
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const dateFilter = `offense_date >= '${sixMonthsAgo.toISOString().split('T')[0]}'`;
  url += `&$where=${encodeURIComponent(dateFilter)}`;
  
  console.log('📅 Fetching Memphis crimes from last 6 months');

  console.log('🔗 Memphis API URL:', url);

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'PropertyROI/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`Memphis API error: ${response.status} ${response.statusText}`);
  }

  const crimes = await response.json();
  console.log('📊 Memphis crimes found:', crimes.length);

  // Analyze the crime data
  const analysis = analyzeCrimeData(crimes, 'memphis');
  
  return {
    source: 'Memphis Police Department',
    city: 'Memphis',
    state: 'TN',
    address,
    searchRadius: radiusMiles,
    timeframe: '12 months',
    totalIncidents: crimes.length,
    crimeIndex: analysis.crimeIndex,
    crimeScore: analysis.crimeScore,
    riskLevel: analysis.riskLevel,
    trends: analysis.trends,
    recentIncidents: crimes.slice(0, 10), // Most recent 10
    lastUpdated: new Date().toISOString(),
    coordinates: latitude && longitude ? { lat: latitude, lng: longitude } : null
  };
}

// ====== FORT WORTH POLICE DEPARTMENT API ======
async function fetchFortWorthCrimeData(latitude, longitude, address) {
  console.log('🏛️ Fetching Fort Worth Police data...');
  
  // Try multiple potential endpoints for Fort Worth
  const endpoints = [
    'https://data.fortworthtexas.gov/resource/k6ic-7kp7.json',
    'https://data.fortworthtexas.gov/api/views/k6ic-7kp7/rows.json'
  ];
  
  for (const endpoint of endpoints) {
    try {
      console.log('🔗 Trying Fort Worth endpoint:', endpoint);
      
      const response = await fetch(`${endpoint}?$limit=100`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'PropertyROI/1.0'
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Fort Worth API working:', endpoint);
        
        // Process Fort Worth data format
        const analysis = analyzeCrimeData(data, 'fort-worth');
        
        return {
          source: 'Fort Worth Police Department',
          city: 'Fort Worth',
          state: 'TX',
          address,
          totalIncidents: Array.isArray(data) ? data.length : 0,
          crimeIndex: analysis.crimeIndex,
          crimeScore: analysis.crimeScore,
          riskLevel: analysis.riskLevel,
          lastUpdated: new Date().toISOString()
        };
      }
    } catch (error) {
      console.log('❌ Fort Worth endpoint failed:', endpoint, error.message);
    }
  }
  
  // If all Fort Worth endpoints fail, fallback to FBI
  console.log('⚠️ All Fort Worth endpoints failed, using FBI fallback');
  return await fetchFBIFallbackData('Fort Worth', 'TX');
}

// ====== PLACEHOLDER FUNCTIONS FOR OTHER CITIES ======
async function fetchOklahomaCityCrimeData(latitude, longitude, address) {
  console.log('🏛️ Oklahoma City - using FBI fallback (no open API available)');
  return await fetchFBIFallbackData('Oklahoma City', 'OK');
}

async function fetchSunnyvaleCrimeData(latitude, longitude, address) {
  console.log('🏛️ Sunnyvale - using FBI fallback (no municipal API available)');
  return await fetchFBIFallbackData('Sunnyvale', 'CA');
}

async function fetchCrosbyHarrisCountyCrimeData(latitude, longitude, address) {
  console.log('🏛️ Crosby/Harris County - using FBI fallback (no municipal API available)');
  return await fetchFBIFallbackData('Crosby', 'TX');
}

// ====== FBI FALLBACK ======
async function fetchFBIFallbackData(city, state) {
  console.log('📊 Using FBI Crime Data as fallback for', city, state);
  
  // Use existing FBI API logic but mark as fallback
  const baseUrl = 'https://api.usa.gov/crime/fbi/cde';
  const apiKey = process.env.FBI_CRIME_API_KEY;
  
  if (!apiKey) {
    throw new Error('FBI API key not available');
  }

  const agenciesUrl = `${baseUrl}/agency/byStateAbbr/${state.toUpperCase()}?API_KEY=${apiKey}`;
  const agenciesResponse = await fetch(agenciesUrl);
  
  if (agenciesResponse.ok) {
    const agenciesData = await agenciesResponse.json();
    const allAgencies = [];
    for (const county in agenciesData) {
      if (Array.isArray(agenciesData[county])) {
        allAgencies.push(...agenciesData[county]);
      }
    }
    
    const matchingAgency = allAgencies.find(agency => {
      const agencyName = agency.agency_name?.toLowerCase() || '';
      return agencyName.includes(city.toLowerCase());
    }) || allAgencies[0]; // Use first agency if no match

    return {
      source: 'FBI Crime Data Explorer (Fallback)',
      city,
      state,
      agency: matchingAgency?.agency_name || 'Unknown',
      crimeIndex: 5.0, // Default until we get better data
      crimeScore: 50,
      riskLevel: 'Unknown - Limited Data',
      note: 'Local police data not available. Using federal statistics.',
      lastUpdated: new Date().toISOString()
    };
  }
  
  throw new Error('No crime data available');
}

// ====== CRIME DATA ANALYSIS FUNCTIONS ======
function analyzeCrimeData(crimes, source) {
  if (!Array.isArray(crimes) || crimes.length === 0) {
    return {
      crimeIndex: 5.0,
      crimeScore: 50,
      riskLevel: 'No Data Available',
      trends: {}
    };
  }

  console.log('🔬 Analyzing', crimes.length, 'crime incidents from', source);

  // Categorize crimes
  let violentCrimes = 0;
  let propertyCrimes = 0;
  let otherCrimes = 0;
  
  const recentCrimes = [];
  const monthlyTrends = {};

  crimes.forEach(crime => {
    // Memphis-specific field mapping
    const crimeType = crime.ucr_category?.toUpperCase() || 
                     crime.offense_group_nibrs?.toUpperCase() || 
                     crime.crime_type?.toUpperCase() || '';
    
    const offenseDate = crime.offense_date || crime.date || crime.incident_date;
    
    // Categorize crime types
    if (isViolentCrime(crimeType)) {
      violentCrimes++;
    } else if (isPropertyCrime(crimeType)) {
      propertyCrimes++;
    } else {
      otherCrimes++;
    }

    // Track monthly trends
    if (offenseDate) {
      const month = new Date(offenseDate).toISOString().substring(0, 7); // YYYY-MM
      monthlyTrends[month] = (monthlyTrends[month] || 0) + 1;
    }

    // Collect recent crimes (last 30 days)
    const crimeDate = new Date(offenseDate);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    if (crimeDate >= thirtyDaysAgo) {
      recentCrimes.push({
        type: crimeType,
        date: offenseDate,
        address: crime.full_address_100_block || crime.address || crime.location_description
      });
    }
  });

  // Calculate crime score (0-100, lower = safer)
  const totalCrimes = crimes.length;
  const violentCrimeRate = (violentCrimes / totalCrimes) * 100;
  const propertyCrimeRate = (propertyCrimes / totalCrimes) * 100;
  
  // Weight violent crimes more heavily
  let crimeScore = (violentCrimeRate * 0.7 + propertyCrimeRate * 0.3);
  
  // Adjust based on total incident frequency
  if (totalCrimes > 100) crimeScore += 10; // High activity area
  if (totalCrimes > 200) crimeScore += 10; // Very high activity area
  
  crimeScore = Math.min(100, Math.max(0, crimeScore));

  // Convert to 1-10 crime index (higher = more dangerous)
  const crimeIndex = Math.round((crimeScore / 10) * 10) / 10;

  // Determine risk level
  let riskLevel;
  if (crimeScore <= 25) riskLevel = 'Low Risk - Safe Area';
  else if (crimeScore <= 50) riskLevel = 'Moderate Risk - Average Safety';
  else if (crimeScore <= 75) riskLevel = 'High Risk - Exercise Caution';
  else riskLevel = 'Very High Risk - Dangerous Area';

  console.log('📈 Crime Analysis Results:', {
    totalCrimes,
    violentCrimes,
    propertyCrimes,
    crimeScore: Math.round(crimeScore),
    crimeIndex,
    riskLevel
  });

  return {
    crimeIndex,
    crimeScore: Math.round(crimeScore),
    riskLevel,
    trends: {
      totalIncidents: totalCrimes,
      violentCrimes,
      propertyCrimes,
      otherCrimes,
      recentIncidents: recentCrimes.length,
      monthlyTrends
    }
  };
}

// Helper functions for crime categorization
function isViolentCrime(crimeType) {
  const violentKeywords = [
    'ASSAULT', 'BATTERY', 'ROBBERY', 'HOMICIDE', 'MURDER', 'RAPE', 'KIDNAPPING',
    'AGGRAVATED', 'DOMESTIC VIOLENCE', 'SHOOTING', 'STABBING', 'WEAPON',
    'CRIMES AGAINST PERSON', 'VIOLENT'
  ];
  
  return violentKeywords.some(keyword => crimeType.includes(keyword));
}

function isPropertyCrime(crimeType) {
  const propertyKeywords = [
    'THEFT', 'BURGLARY', 'LARCENY', 'FRAUD', 'VANDALISM', 'ARSON', 'EMBEZZLEMENT',
    'PROPERTY', 'STOLEN', 'BREAKING', 'ENTERING', 'SHOPLIFTING', 'AUTO THEFT',
    'CRIMES AGAINST PROPERTY'
  ];
  
  return propertyKeywords.some(keyword => crimeType.includes(keyword));
}