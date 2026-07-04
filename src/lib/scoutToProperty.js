import { DEFAULTS } from '@/lib/calcMetrics';

// Converts a row from /api/scout/listings into an object shaped like a
// `properties` table row, so it can flow through the same selection state,
// MetricsGrid, DetailedAnalysisTable, and charts used for owned properties.
// purchased: false makes AssetValueChart/PerformanceMetricsChart skip the
// per-property historical-years fetch, same as any other projected property.
export function scoutListingToProperty(listing) {
  const [street, ...rest] = (listing.address || '').split(',');
  const price = Number(listing.price) || 0;

  return {
    id: `scout-${listing.mls_num}`,
    address: street.trim(),
    city: rest.join(',').trim(),
    state: '',
    purchase_price: price,
    down_payment_pct: DEFAULTS.downPct,
    interest_apr_pct: DEFAULTS.rateApr,
    loan_years: DEFAULTS.loanYears,
    monthly_rent: Number(listing.rent) || 0,
    property_tax_pct: DEFAULTS.taxPct,
    hoa_monthly: listing.hoa_quarterly != null ? Number(listing.hoa_quarterly) / 3 : 0,
    insurance_monthly: DEFAULTS.insuranceMonthly,
    maintenance_pct_rent: DEFAULTS.maintPctRent,
    vacancy_pct_rent: DEFAULTS.vacancyPctRent,
    management_pct_rent: DEFAULTS.mgmtPctRent,
    other_monthly: 0,
    repair_costs: listing.repair_costs != null ? Number(listing.repair_costs) : DEFAULTS.repairCosts,
    closing_costs: price * (DEFAULTS.closingCostsPct / 100),
    purchased: false,
    year_purchased: null,
    mortgage_free: false,
    _source: 'scout',
    _mlsNum: listing.mls_num,
  };
}
