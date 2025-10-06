/**
 * Extracts the house number from a property address
 * @param {string} address - The full property address
 * @returns {string} The house number or first part of the address
 */
export function getHouseNumber(address) {
  if (!address) return '';
  
  // Extract the first number sequence from the address
  const match = address.match(/^(\d+[A-Za-z]?)/);
  return match ? match[1] : address.split(' ')[0];
}

/**
 * Creates a display label for charts using house number and abbreviation
 * @param {Object} property - The property object
 * @returns {string} Formatted display label (e.g., "123 ABC" or just "123" if no abbreviation)
 */
export function getPropertyDisplayLabel(property) {
  if (!property) return '';
  
  const houseNumber = getHouseNumber(property.address);
  const abbreviation = property.abbreviation;
  
  if (abbreviation) {
    return `${houseNumber} ${abbreviation}`;
  }
  
  return houseNumber;
}