// Quick TRI calculation for 5432 Houghton
// Property details
const purchasePrice = 199900;
const downPaymentPct = 30;
const closingCosts = 9000;
const monthlyRent = 1900;
const interestRate = 5.5;
const propertyTax = 1745;
const insurance = 1440;
const otherExpenses = 3840;
const maintenancePct = 5;
const vacancyPct = 5;
const managementPct = 9;

// Calculate initial values
const downPayment = purchasePrice * (downPaymentPct / 100);
const initialInvestment = downPayment + closingCosts;
const loanAmount = purchasePrice - downPayment;

// Monthly mortgage payment (P&I)
const monthlyRate = interestRate / 100 / 12;
const numPayments = 30 * 12;
const monthlyPayment = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1);

console.log('5432 Houghton Analysis:');
console.log('Purchase Price:', purchasePrice);
console.log('Down Payment:', downPayment);
console.log('Closing Costs:', closingCosts);
console.log('Initial Investment:', initialInvestment);
console.log('Loan Amount:', loanAmount);
console.log('Monthly Payment (P&I):', monthlyPayment.toFixed(2));

// Annual calculations
const annualRent = monthlyRent * 12;
const effectiveRent = annualRent * (1 - vacancyPct/100); // After vacancy
const annualMaintenance = annualRent * (maintenancePct/100);
const annualManagement = annualRent * (managementPct/100);
const annualMortgage = monthlyPayment * 12;

const annualExpenses = annualMaintenance + annualManagement + propertyTax + insurance + otherExpenses + annualMortgage;
const annualCashFlow = effectiveRent - annualExpenses;

console.log('\nAnnual Cash Flow:');
console.log('Effective Rent (after vacancy):', effectiveRent);
console.log('Total Annual Expenses:', annualExpenses);
console.log('Annual Cash Flow:', annualCashFlow);

// Function to calculate TRI for any number of years
function calculateTRI(years) {
  const appreciationRate = 0.03;
  const discountRate = 0.07;
  
  let totalPV = 0;
  
  // Cash flows for each year (simplified - no inflation for this quick calc)
  for (let year = 1; year <= years; year++) {
    const pv = annualCashFlow / Math.pow(1 + discountRate, year);
    totalPV += pv;
  }
  
  // Final property value
  const finalValue = purchasePrice * Math.pow(1 + appreciationRate, years);
  
  // Remaining mortgage balance
  const remainingBalance = years >= 30 ? 0 : 
    loanAmount * Math.pow(1 + monthlyRate, years * 12) - 
    (monthlyPayment * (Math.pow(1 + monthlyRate, years * 12) - 1) / monthlyRate);
  
  const saleProceeds = finalValue - remainingBalance;
  const salePV = saleProceeds / Math.pow(1 + discountRate, years);
  
  const totalPresentValue = totalPV + salePV;
  const annualizedReturn = totalPresentValue > initialInvestment ? 
    (Math.pow(totalPresentValue / initialInvestment, 1 / years) - 1) * 100 : 0;
  
  return {
    years,
    totalCashFlowPV: totalPV,
    finalValue,
    remainingBalance,
    saleProceeds,
    salePV,
    totalPV: totalPresentValue,
    annualizedReturn
  };
}

// Calculate for both 5 and 30 years
const result5 = calculateTRI(5);
const result30 = calculateTRI(30);

console.log('\n=== 5-YEAR HOLD ===');
console.log('Cash Flow PV:', result5.totalCashFlowPV.toFixed(2));
console.log('Final Property Value:', result5.finalValue.toFixed(2));
console.log('Remaining Mortgage:', result5.remainingBalance.toFixed(2));
console.log('Sale Proceeds:', result5.saleProceeds.toFixed(2));
console.log('Sale PV:', result5.salePV.toFixed(2));
console.log('Total PV:', result5.totalPV.toFixed(2));
console.log('ANNUALIZED RETURN:', result5.annualizedReturn.toFixed(2) + '%');

console.log('\n=== 30-YEAR HOLD ===');
console.log('Cash Flow PV:', result30.totalCashFlowPV.toFixed(2));
console.log('Final Property Value:', result30.finalValue.toFixed(2));
console.log('Remaining Mortgage:', result30.remainingBalance.toFixed(2));
console.log('Sale Proceeds:', result30.saleProceeds.toFixed(2));
console.log('Sale PV:', result30.salePV.toFixed(2));
console.log('Total PV:', result30.totalPV.toFixed(2));
console.log('ANNUALIZED RETURN:', result30.annualizedReturn.toFixed(2) + '%');