'use client';

import { useState, useMemo, useEffect, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import PageHeader from '@/components/ui/PageHeader';
import { calcDeal, calcProjections, formatDealSummary } from '@/lib/dealAnalysis';

// ─── Defaults ────────────────────────────────────────────────────────────────
const DEFAULTS = {
  address: '',
  purchasePrice: '',
  repairCosts: '',
  reserveFund: 40000,
  monthlyRent: '',
  taxPct: 2.1,
  insuranceMonthly: 150,
  maintPctRent: 5,
  vacancyPctRent: 5,
  mgmtPctRent: 8,
  hoaMonthly: 0,
  equityCount: 5,
  equityPerInvestor: 60000,
  debtCount: 2,
  debtPerInvestor: 120000,
  debtRatePct: 8,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const n = (v) => (v === '' || v === null || v === undefined ? 0 : Number(v));
const fmt$ = (v) =>
  isNaN(Number(v))
    ? '—'
    : '$' + Math.round(Number(v)).toLocaleString('en-US');
const fmtPct = (v) =>
  isNaN(Number(v)) ? '—' : Number(v).toFixed(1) + '%';
const fmtRaw$ = (v) =>
  isNaN(Number(v)) ? '' : String(Math.round(Number(v)));

// ─── Sub-components ───────────────────────────────────────────────────────────

function InputField({ label, value, onChange, prefix, suffix, step, type = 'number', placeholder }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <div className="relative flex items-center">
        {prefix && (
          <span className="absolute left-2 text-gray-500 text-sm pointer-events-none">{prefix}</span>
        )}
        <input
          type={type}
          step={step}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-400 ${prefix ? 'pl-5' : ''} ${suffix ? 'pr-8' : ''}`}
        />
        {suffix && (
          <span className="absolute right-2 text-gray-500 text-sm pointer-events-none">{suffix}</span>
        )}
      </div>
    </div>
  );
}

function SectionCard({ title, children, className = '' }) {
  return (
    <section className={`bg-white rounded-lg border border-gray-200 shadow-sm p-6 ${className}`}>
      <h2 className="text-lg font-semibold text-gray-800 mb-4">{title}</h2>
      {children}
    </section>
  );
}

// ─── Main content (uses useSearchParams so must be inside Suspense) ────────────
function DealAnalyzerContent() {
  const searchParams = useSearchParams();
  const summaryRef = useRef(null);

  const [form, setForm] = useState(() => {
    const init = { ...DEFAULTS };
    // URL params override defaults (set during first render; searchParams not yet available in useState init,
    // so we handle it in useEffect below)
    return init;
  });

  // Apply URL params on mount
  useEffect(() => {
    const price   = searchParams.get('price');
    const repairs = searchParams.get('repairs');
    const rent    = searchParams.get('rent');
    const address = searchParams.get('address');

    setForm((prev) => ({
      ...prev,
      ...(address ? { address } : {}),
      ...(price   ? { purchasePrice: price } : {}),
      ...(repairs ? { repairCosts: repairs } : {}),
      ...(rent    ? { monthlyRent: rent } : {}),
    }));
  }, [searchParams]);

  useEffect(() => {
    document.title = 'DA - Deal Analyzer';
  }, []);

  const set = (field) => (val) =>
    setForm((prev) => ({ ...prev, [field]: val }));

  // Build numeric inputs object for the library
  const inputs = useMemo(
    () => ({
      address: form.address,
      purchasePrice:    n(form.purchasePrice),
      repairCosts:      n(form.repairCosts),
      reserveFund:      n(form.reserveFund),
      monthlyRent:      n(form.monthlyRent),
      taxPct:           n(form.taxPct),
      insuranceMonthly: n(form.insuranceMonthly),
      maintPctRent:     n(form.maintPctRent),
      vacancyPctRent:   n(form.vacancyPctRent),
      mgmtPctRent:      n(form.mgmtPctRent),
      hoaMonthly:       n(form.hoaMonthly),
      equityCount:      n(form.equityCount),
      equityPerInvestor:n(form.equityPerInvestor),
      debtCount:        n(form.debtCount),
      debtPerInvestor:  n(form.debtPerInvestor),
      debtRatePct:      n(form.debtRatePct),
    }),
    [form]
  );

  const deal        = useMemo(() => calcDeal(inputs), [inputs]);
  const projections = useMemo(() => calcProjections(inputs, deal, 5), [inputs, deal]);
  const summary     = useMemo(() => formatDealSummary(inputs, deal), [inputs, deal]);

  const stackBalanced = Math.abs(deal.surplus) < 1;
  const stackGap = deal.surplus < -0.5;

  const dcrColor =
    deal.debtCoverage === null
      ? 'text-gray-500'
      : deal.debtCoverage >= 1.25
      ? 'text-green-600'
      : deal.debtCoverage >= 1.0
      ? 'text-yellow-600'
      : 'text-red-600';

  const cfColor = deal.equityCashFlow >= 0 ? 'text-green-600' : 'text-red-600';

  const handleCopySummary = () => {
    const text = summary.paragraphs.join('\n\n');
    navigator.clipboard.writeText(text).catch(() => {
      // Fallback
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    });
  };

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-full { break-inside: avoid; }
          body { background: white !important; }
          header { background: white !important; color: black !important; }
        }
      `}</style>

      <main className="mx-auto max-w-7xl p-6 space-y-6">
        {/* ── Header ── */}
        <div className="bg-[#1e293b] text-white rounded-lg p-6 no-print">
          <PageHeader
            title="Deal Analyzer"
            subtitle="Private capital deal structuring — equity &amp; debt tranches"
            currentPage="/deal-analyzer"
          />
        </div>

        {/* ── Section 1: Property Details ── */}
        <SectionCard title="Property Details">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <div className="col-span-2 md:col-span-3 lg:col-span-4">
              <InputField
                label="Address"
                value={form.address}
                onChange={set('address')}
                type="text"
                placeholder="123 Main St, City, ST 00000"
              />
            </div>

            <InputField
              label="Purchase Price"
              value={form.purchasePrice}
              onChange={set('purchasePrice')}
              prefix="$"
              placeholder="350000"
            />
            <InputField
              label="Repair / Reno Budget"
              value={form.repairCosts}
              onChange={set('repairCosts')}
              prefix="$"
              placeholder="25000"
            />
            <InputField
              label="Reserve Fund"
              value={form.reserveFund}
              onChange={set('reserveFund')}
              prefix="$"
            />
            <InputField
              label="Est. Monthly Rent"
              value={form.monthlyRent}
              onChange={set('monthlyRent')}
              prefix="$"
              placeholder="2400"
            />
            <InputField
              label="Property Tax %"
              value={form.taxPct}
              onChange={set('taxPct')}
              suffix="%"
              step="0.1"
            />
            <InputField
              label="Insurance / mo"
              value={form.insuranceMonthly}
              onChange={set('insuranceMonthly')}
              prefix="$"
            />
            <InputField
              label="Maintenance % rent"
              value={form.maintPctRent}
              onChange={set('maintPctRent')}
              suffix="%"
              step="0.5"
            />
            <InputField
              label="Vacancy %"
              value={form.vacancyPctRent}
              onChange={set('vacancyPctRent')}
              suffix="%"
              step="0.5"
            />
            <InputField
              label="Mgmt % rent"
              value={form.mgmtPctRent}
              onChange={set('mgmtPctRent')}
              suffix="%"
              step="0.5"
            />
            <InputField
              label="HOA / mo"
              value={form.hoaMonthly}
              onChange={set('hoaMonthly')}
              prefix="$"
            />
          </div>
        </SectionCard>

        {/* ── Section 2: Capital Structure ── */}
        <SectionCard title="Capital Structure">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Equity Tranche */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="font-semibold text-green-800 mb-3">Equity Tranche</h3>
              <div className="grid grid-cols-2 gap-3">
                <InputField
                  label="# of Investors"
                  value={form.equityCount}
                  onChange={set('equityCount')}
                />
                <InputField
                  label="$ per Investor"
                  value={form.equityPerInvestor}
                  onChange={set('equityPerInvestor')}
                  prefix="$"
                />
              </div>
              <div className="mt-3 text-sm text-green-700 font-medium">
                Total Equity: {fmt$(deal.totalEquity)}
              </div>
            </div>

            {/* Debt Tranche */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-blue-800 mb-3">Debt Tranche</h3>
              <div className="grid grid-cols-3 gap-3">
                <InputField
                  label="# of Lenders"
                  value={form.debtCount}
                  onChange={set('debtCount')}
                />
                <InputField
                  label="$ per Lender"
                  value={form.debtPerInvestor}
                  onChange={set('debtPerInvestor')}
                  prefix="$"
                />
                <InputField
                  label="Annual Rate %"
                  value={form.debtRatePct}
                  onChange={set('debtRatePct')}
                  suffix="%"
                  step="0.25"
                />
              </div>
              <div className="mt-3 text-sm text-blue-700 font-medium">
                Total Debt: {fmt$(deal.totalDebt)} &nbsp;|&nbsp; Monthly Interest: {fmt$(deal.monthlyDebtService)}
              </div>
            </div>
          </div>

          {/* Capital Stack Validation Bar */}
          <div
            className={`mt-4 flex flex-wrap items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium border ${
              stackBalanced
                ? 'bg-green-50 border-green-300 text-green-800'
                : stackGap
                ? 'bg-red-50 border-red-300 text-red-800'
                : 'bg-yellow-50 border-yellow-300 text-yellow-800'
            }`}
          >
            <span>Total Raise: {fmt$(deal.totalRaise)}</span>
            <span className="text-gray-400">|</span>
            <span>Total Need: {fmt$(deal.totalNeed)}</span>
            <span className="text-gray-400">|</span>
            {stackBalanced ? (
              <span className="text-green-700 font-bold">BALANCED ✓</span>
            ) : stackGap ? (
              <span className="text-red-700 font-bold">GAP: {fmt$(Math.abs(deal.surplus))} ⚠</span>
            ) : (
              <span className="text-yellow-700 font-bold">SURPLUS: {fmt$(deal.surplus)} ↑</span>
            )}
          </div>
        </SectionCard>

        {/* ── Section 3: Monthly P&L ── */}
        <SectionCard title="Monthly P&amp;L Waterfall">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <colgroup>
                <col className="w-2/3" />
                <col className="w-1/3" />
              </colgroup>
              <tbody className="divide-y divide-gray-100">
                {/* Revenue */}
                <PnLRow label="Gross Rent" value={fmt$(deal.grossRent)} />
                <PnLRow label="Vacancy Loss" value={`(${fmt$(deal.vacancyLoss)})`} valueClass="text-red-500" indent />
                <PnLRow label="Effective Rent" value={fmt$(deal.effectiveRent)} subtotal />

                {/* Expenses */}
                <PnLRow label="Property Taxes" value={`(${fmt$(deal.taxesMonthly)})`} valueClass="text-red-500" indent />
                <PnLRow label="Insurance" value={`(${fmt$(deal.insuranceMonthly)})`} valueClass="text-red-500" indent />
                <PnLRow label="Maintenance" value={`(${fmt$(deal.maintenanceMonthly)})`} valueClass="text-red-500" indent />
                <PnLRow label="Management" value={`(${fmt$(deal.managementMonthly)})`} valueClass="text-red-500" indent />
                {n(form.hoaMonthly) > 0 && (
                  <PnLRow label="HOA" value={`(${fmt$(deal.hoaMonthly)})`} valueClass="text-red-500" indent />
                )}

                {/* NOI */}
                <PnLRow label="Net Operating Income (NOI)" value={fmt$(deal.noiMonthly)} subtotal />

                {/* Debt */}
                <PnLRow label="Private Debt Service" value={`(${fmt$(deal.monthlyDebtService)})`} valueClass="text-red-500" indent />

                {/* Equity CF */}
                <tr className="border-t-2 border-gray-300">
                  <td className="py-2 font-bold text-gray-800">Equity Cash Flow</td>
                  <td className={`py-2 text-right font-bold text-base ${cfColor}`}>
                    {fmt$(deal.equityCashFlow)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Metrics below table */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <MetricBadge
              label="Break-even Rent"
              value={deal.breakEvenRent !== null ? fmt$(deal.breakEvenRent) : '—'}
              sub="min rent for positive CF"
            />
            <MetricBadge
              label="Debt Coverage Ratio"
              value={deal.debtCoverage !== null ? Number(deal.debtCoverage).toFixed(2) + 'x' : '—'}
              sub={
                deal.debtCoverage === null
                  ? 'no debt'
                  : deal.debtCoverage >= 1.25
                  ? 'strong coverage'
                  : deal.debtCoverage >= 1.0
                  ? 'adequate coverage'
                  : 'below threshold'
              }
              valueClass={dcrColor}
            />
            <MetricBadge
              label="Equity CF / Investor"
              value={fmt$(deal.equityCashFlowPerInvestor) + '/mo'}
              sub={fmtPct(deal.equityCoC) + ' cash-on-cash'}
              valueClass={cfColor}
            />
          </div>
        </SectionCard>

        {/* ── Section 4: Investor Returns ── */}
        <SectionCard title="Investor Returns">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Debt card */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-5">
              <h3 className="font-semibold text-blue-800 text-base mb-3">Debt Investors</h3>
              <dl className="space-y-1.5 text-sm text-gray-600">
                <ReturnRow label="Each lender invests" value={fmt$(deal.debtInvestment)} />
                <ReturnRow label="Annual interest income" value={fmt$(deal.debtAnnualIncomePerInvestor)} />
                <ReturnRow label="Monthly payment" value={fmt$(n(form.debtCount) > 0 ? deal.monthlyDebtService / n(form.debtCount) : 0)} />
                <ReturnRow label="Return rate" value={fmtPct(form.debtRatePct)} />
                <ReturnRow label="Gets equity?" value="No" />
              </dl>
              <p className="mt-3 text-xs text-blue-700 bg-blue-100 rounded px-2 py-1.5">
                Guaranteed return, first priority on income
              </p>
            </div>

            {/* Equity card */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-5">
              <h3 className="font-semibold text-green-800 text-base mb-3">Equity Investors</h3>
              <dl className="space-y-1.5 text-sm text-gray-600">
                <ReturnRow label="Each investor contributes" value={fmt$(deal.equityInvestment)} />
                <ReturnRow label="Monthly income" value={fmt$(deal.equityCashFlowPerInvestor)} valueClass={cfColor} />
                <ReturnRow label="Annual income" value={fmt$(deal.equityCashFlowPerInvestor * 12)} valueClass={cfColor} />
                <ReturnRow label="Cash-on-cash" value={fmtPct(deal.equityCoC)} valueClass={cfColor} />
                <ReturnRow
                  label="Initial equity share of property"
                  value={
                    n(form.equityCount) > 0 && deal.totalEquity > 0
                      ? fmtPct((n(form.equityPerInvestor) / deal.totalEquity) * 100)
                      : '—'
                  }
                />
              </dl>
              <p className="mt-3 text-xs text-green-700 bg-green-100 rounded px-2 py-1.5">
                Gains from appreciation + ongoing cash flow
              </p>
            </div>
          </div>
        </SectionCard>

        {/* ── Section 5: 5-Year Projection ── */}
        <SectionCard title="5-Year Projection">
          <p className="text-xs text-gray-500 mb-3">
            Assumes 3% annual property appreciation and 2.5% annual rent growth. Debt is interest-only (balance fixed).
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm print-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left py-2 px-2 font-semibold text-gray-600">Year</th>
                  <th className="text-right py-2 px-2 font-semibold text-gray-600">Prop Value</th>
                  <th className="text-right py-2 px-2 font-semibold text-gray-600">Total Equity</th>
                  <th className="text-right py-2 px-2 font-semibold text-gray-600">Per Eq. Investor</th>
                  <th className="text-right py-2 px-2 font-semibold text-gray-600">Equity CF / yr</th>
                  <th className="text-right py-2 px-2 font-semibold text-gray-600">Cum. CF / Investor</th>
                  <th className="text-right py-2 px-2 font-semibold text-gray-600">Debt Income / yr</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {projections.map((row) => (
                  <tr key={row.year} className="hover:bg-gray-50">
                    <td className="py-2 px-2 text-gray-600 font-medium">Year {row.year}</td>
                    <td className="py-2 px-2 text-right text-gray-600">{fmt$(row.propValue)}</td>
                    <td className="py-2 px-2 text-right text-gray-600">{fmt$(row.equityTotal)}</td>
                    <td className="py-2 px-2 text-right text-blue-600 font-medium">{fmt$(row.equityPerInvestor)}</td>
                    <td className={`py-2 px-2 text-right font-medium ${row.yearlyEquityCF >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {fmt$(row.yearlyEquityCF)}
                    </td>
                    <td className={`py-2 px-2 text-right font-medium ${row.cumulEquityCFPerInvestor >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {fmt$(row.cumulEquityCFPerInvestor)}
                    </td>
                    <td className="py-2 px-2 text-right text-blue-600">{fmt$(row.yearlyDebtIncomePerInvestor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        {/* ── Section 6: Pitch Summary ── */}
        <SectionCard title="Investor Pitch Summary">
          <div ref={summaryRef} className="bg-gray-50 border border-gray-200 rounded-lg p-5 space-y-3 print-full">
            {summary.paragraphs.map((p, i) => (
              <p key={i} className="text-sm text-gray-600 leading-relaxed">
                {p}
              </p>
            ))}
          </div>
          <div className="mt-3 flex gap-3 no-print">
            <button
              onClick={handleCopySummary}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
            >
              Copy
            </button>
            <button
              onClick={() => window.print()}
              className="px-4 py-2 bg-gray-600 text-white text-sm rounded hover:bg-gray-700 transition-colors"
            >
              Print
            </button>
          </div>
        </SectionCard>
      </main>
    </>
  );
}

// ─── Small helper sub-components ─────────────────────────────────────────────

function PnLRow({ label, value, subtotal = false, indent = false, valueClass = 'text-gray-600' }) {
  return (
    <tr className={subtotal ? 'bg-gray-50' : ''}>
      <td className={`py-1.5 text-gray-600 ${subtotal ? 'font-semibold' : ''} ${indent ? 'pl-4' : ''}`}>
        {label}
      </td>
      <td className={`py-1.5 text-right ${subtotal ? 'font-semibold text-gray-800' : valueClass}`}>
        {value}
      </td>
    </tr>
  );
}

function MetricBadge({ label, value, sub, valueClass = 'text-gray-800' }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-lg font-bold ${valueClass}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function ReturnRow({ label, value, valueClass = 'text-gray-800' }) {
  return (
    <div className="flex justify-between items-center">
      <dt className="text-gray-500">{label}</dt>
      <dd className={`font-medium ${valueClass}`}>{value}</dd>
    </div>
  );
}

// ─── Page export (wraps Suspense for useSearchParams) ─────────────────────────
export default function DealAnalyzerPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-lg text-gray-600">Loading deal analyzer...</div>
        </div>
      }
    >
      <DealAnalyzerContent />
    </Suspense>
  );
}
