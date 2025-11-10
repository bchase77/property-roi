// API route to fetch crime data by city/state using FBI Crime Data Explorer API
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { city, state } = await request.json();

    if (!city || !state) {
      return NextResponse.json({ message: 'City and state are required' }, { status: 400 });
    }

    // FBI Crime Data Explorer API base URL (using working endpoint from 2025)
    const baseUrl = 'https://api.usa.gov/crime/fbi/cde';
    
    // Get API key from environment variables
    const apiKey = process.env.FBI_CRIME_API_KEY || 'DEMO_KEY';
    
    console.log('🔍 Fetching crime data for:', { city, state });
    console.log('🔑 Using API key:', apiKey ? 'Found' : 'Missing');

    // Step 1: Find the agency for the given city/state using working endpoint format from 2025 examples
    const agenciesUrl = `${baseUrl}/agency/byStateAbbr/${state.toUpperCase()}?API_KEY=${apiKey}`;
    
    console.log('📡 Fetching agencies:', agenciesUrl);
    console.log('🔑 API Key (first 10 chars):', apiKey ? apiKey.substring(0, 10) + '...' : 'Missing');

    const authHeaders = {
      'Accept': 'application/json',
      'User-Agent': 'PropertyROI/1.0'
    };

    console.log('🔐 Using working 2025 API format with uppercase API_KEY parameter');

    const agenciesResponse = await fetch(agenciesUrl, {
      headers: authHeaders
    });

    if (!agenciesResponse.ok) {
      console.error('❌ FBI API Error:', agenciesResponse.status, agenciesResponse.statusText);
      const errorText = await agenciesResponse.text();
      console.error('Error details:', errorText);
      
      return NextResponse.json({
        message: `FBI API error: ${agenciesResponse.status} ${agenciesResponse.statusText}`,
        details: errorText,
        city,
        state
      }, { status: 500 });
    }

    const agenciesData = await agenciesResponse.json();
    
    // The FBI API returns data grouped by county - flatten into array
    const allAgencies = [];
    for (const county in agenciesData) {
      if (Array.isArray(agenciesData[county])) {
        allAgencies.push(...agenciesData[county]);
      }
    }
    
    console.log('🏛️ Agencies found:', allAgencies.length);

    // Find matching agency for the city - look for city police departments first
    let matchingAgency = allAgencies.find(agency => {
      const agencyName = agency.agency_name?.toLowerCase() || '';
      const cityLower = city.toLowerCase();
      
      // Prefer city police departments
      return agencyName.includes(cityLower + ' police department') ||
             agencyName.includes(cityLower + ' pd')
    });
    
    // If no city PD found, look for any agency with the city name
    if (!matchingAgency) {
      matchingAgency = allAgencies.find(agency => {
        const agencyName = agency.agency_name?.toLowerCase() || '';
        return agencyName.includes(city.toLowerCase());
      });
    }
    
    // If still no match, use county sheriff as fallback
    if (!matchingAgency) {
      matchingAgency = allAgencies.find(agency => {
        const agencyName = agency.agency_name?.toLowerCase() || '';
        return agencyName.includes("sheriff");
      });
    }

    if (!matchingAgency) {
      console.log('❌ No matching agency found for:', city);
      return NextResponse.json({ 
        message: `No crime data agency found for ${city}, ${state}`,
        availableAgencies: allAgencies.slice(0, 5).map(a => ({
          name: a.agency_name,
          counties: a.counties
        }))
      }, { status: 404 });
    }

    console.log('✅ Found matching agency:', {
      name: matchingAgency.agency_name,
      ori: matchingAgency.ori,
      counties: matchingAgency.counties
    });

    // Step 2: Get crime estimates for the area
    const currentYear = new Date().getFullYear();
    const estimatesUrl = `${baseUrl}/estimates/states/${state.toUpperCase()}/${currentYear - 1}?API_KEY=${apiKey}`;
    
    console.log('📊 Fetching crime estimates:', estimatesUrl);
    
    const estimatesResponse = await fetch(estimatesUrl, {
      headers: authHeaders
    });

    let crimeEstimates = null;
    if (estimatesResponse.ok) {
      crimeEstimates = await estimatesResponse.json();
      console.log('📈 Crime estimates retrieved');
    } else {
      console.log('⚠️ Crime estimates not available:', estimatesResponse.status);
    }

    // Calculate a simple crime index (lower = better)
    let crimeIndex = 5; // Default medium risk
    
    if (crimeEstimates?.results?.length > 0) {
      const data = crimeEstimates.results[0];
      const population = data.population || 100000;
      
      // Calculate crimes per 1000 people
      const violentCrimesPerK = (data.violent_crime || 0) / population * 1000;
      const propertyCrimesPerK = (data.property_crime || 0) / population * 1000;
      
      // Simple scoring: lower numbers = better (safer)
      // Score from 1-10 where 1 = very safe, 10 = very dangerous
      const violentScore = Math.min(10, violentCrimesPerK / 0.5); // 5 violent crimes per 1K = score of 10
      const propertyScore = Math.min(10, propertyCrimesPerK / 2.5); // 25 property crimes per 1K = score of 10
      
      crimeIndex = Math.round((violentScore * 0.7 + propertyScore * 0.3) * 10) / 10; // Weight violent crimes more
    }

    const result = {
      city,
      state,
      agency: {
        name: matchingAgency.agency_name,
        ori: matchingAgency.ori,
        counties: matchingAgency.counties
      },
      crimeIndex,
      crimeData: crimeEstimates?.results?.[0] || null,
      lastUpdated: new Date().toISOString()
    };

    console.log('✨ Crime data processed successfully:', {
      city,
      state,
      crimeIndex,
      agency: matchingAgency.agency_name
    });

    return NextResponse.json(result);

  } catch (error) {
    console.error('❌ Crime API Error:', error);
    return NextResponse.json({ 
      message: 'Failed to fetch crime data',
      error: error.message
    }, { status: 500 });
  }
}