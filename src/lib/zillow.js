// Zillow API integration for fetching market values
// Note: Zillow's official API has limited access, so this uses alternative approaches

export async function fetchZillowData(zpid) {
  if (!zpid) return null;
  
  try {
    // First try: RapidAPI's Zillow API (requires subscription)
    const rapidApiResponse = await fetchFromRapidAPI(zpid);
    if (rapidApiResponse?.success) {
      return {
        marketValue: rapidApiResponse.data.price,
        zestimate: rapidApiResponse.data.zestimate,
        updatedAt: new Date().toISOString(),
        source: 'rapidapi'
      };
    }

    // Second try: Web scraping approach (less reliable)
    const scrapedData = await fetchFromZillowWeb(zpid);
    if (scrapedData?.success) {
      return {
        marketValue: scrapedData.data.price,
        zestimate: scrapedData.data.zestimate,
        updatedAt: new Date().toISOString(),
        source: 'scraping'
      };
    }

    return null;
  } catch (error) {
    console.error('Error fetching Zillow data:', error);
    return null;
  }
}

async function fetchFromRapidAPI(zpid) {
  try {
    // This would require a RapidAPI subscription to Zillow API
    const response = await fetch(`https://zillow-com1.p.rapidapi.com/property?zpid=${zpid}`, {
      headers: {
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY || '',
        'X-RapidAPI-Host': 'zillow-com1.p.rapidapi.com'
      }
    });

    if (!response.ok) {
      throw new Error('RapidAPI request failed');
    }

    const data = await response.json();
    return {
      success: true,
      data: {
        price: data.price || data.zestimate,
        zestimate: data.zestimate,
        address: data.address
      }
    };
  } catch (error) {
    console.error('RapidAPI fetch failed:', error);
    return { success: false, error: error.message };
  }
}

async function fetchFromZillowWeb() {
  try {
    // Alternative: Use a web scraping service or build our own
    // Note: This is less reliable and may break if Zillow changes their structure
    
    // For now, return mock data structure
    // In production, you'd implement actual scraping or use a service
    return {
      success: false,
      error: 'Web scraping not implemented'
    };
  } catch (error) {
    console.error('Web scraping failed:', error);
    return { success: false, error: error.message };
  }
}

// Utility to validate ZPID format
export function isValidZpid(zpid) {
  return zpid && /^\d{8,10}$/.test(zpid.toString());
}

// Extract ZPID from Zillow URL
export function extractZpidFromUrl(url) {
  if (!url) return null;
  
  const match = url.match(/\/(\d{8,10})_zpid/);
  return match ? match[1] : null;
}

// Get Zillow URL from ZPID
export function getZillowUrl(zpid) {
  if (!isValidZpid(zpid)) return null;
  return `https://www.zillow.com/homedetails/${zpid}_zpid/`;
}