import { NextResponse } from 'next/server';
import { init, getPropertiesByIds } from '@/lib/db';
import { analyze } from '@/lib/finance';

export async function POST(req) {
  await init();
  const { ids } = await req.json(); // e.g. { ids: [1,2,3] }
  const rows = await getPropertiesByIds(ids);
  const result = rows.map(r => {
    const inps = {
      purchasePrice: Number(r.purchase_price),
      downPct: Number(r.down_payment_pct),
      rateApr: Number(r.interest_apr_pct),
      years: Number(r.loan_years),
      monthlyRent: Number(r.monthly_rent),
      taxPct: Number(r.property_tax_pct),
      hoaMonthly: Number(r.hoa_monthly),
      insuranceMonthly: Number(r.insurance_monthly),
      maintPctRent: Number(r.maintenance_pct_rent),
      vacancyPctRent: Number(r.vacancy_pct_rent),
      mgmtPctRent: Number(r.management_pct_rent),
      otherMonthly: Number(r.other_monthly),
    };
    return { id: r.id, address: r.address, metrics: analyze(inps) };
  });
  return NextResponse.json(result);
}

