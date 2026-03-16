'use client';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/ui/PageHeader';

const DEFAULTS = {
  downPct: 25, rateApr: 6.4, loanYears: 30,
  closingCostsPct: 3, repairCosts: 5000,
  taxPct: 2.1, insuranceMonthly: 150,
  maintPctRent: 5, vacancyPctRent: 5, mgmtPctRent: 8,
  rentPerSqft: 1.00,
};

function calcM(listing, mark, A) {
  const price = Number(listing.price);
  const hoa = mark?.hoa_quarterly != null ? mark.hoa_quarterly / 3 : 0;
  const rep = mark?.repair_costs ?? A.repairCosts;
  const rentBase = mark?.rent_override
    || (mark?.rent_min != null && mark?.rent_max != null ? Math.round((mark.rent_min + mark.rent_max) / 2) : null)
    || (mark?.rent_min ?? mark?.rent_max)
    || (listing.sqft ? Math.round(listing.sqft * A.rentPerSqft) : 0);
  const rent = rentBase;
  if (!price || !rent) return null;
  const down = price * (A.downPct / 100);
  const cc = price * (A.closingCostsPct / 100);
  const paid = down + cc + rep;
  const loan = price - down;
  const r = A.rateApr / 100 / 12, n = A.loanYears * 12;
  const pI = loan * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  const tax = (price * (A.taxPct / 100)) / 12;
  const ins = A.insuranceMonthly;
  const mgmt = rent * (A.mgmtPctRent / 100);
  const maint = rent * (A.maintPctRent / 100);
  const vac = rent * (A.vacancyPctRent / 100);
  const opEx = tax + hoa + ins + maint + vac + mgmt;
  const cf = Math.round(rent - (pI + opEx));
  const noi = rent - (opEx - vac);
  const cap = Math.round((noi * 12 / price) * 1000) / 10;
  const coc = paid > 0 ? Math.round((cf * 12 / paid) * 1000) / 10 : null;
  const yrs = 30, eff = rent * (1 - A.vacancyPctRent / 100);
  const tv = price + eff * 12 * yrs;
  let te = paid + rent * 12 * (A.mgmtPctRent / 100) * yrs + pI * 12 * yrs + tax * 12 * yrs + rent * 12 * (A.maintPctRent / 100) * yrs + ins * 12 * yrs + hoa * 12 * yrs;
  const depr = (price + cc + rep + ins * 12) / 27.5 / 12;
  te += Math.max(0, (eff - rent * (A.mgmtPctRent / 100) - rent * (A.maintPctRent / 100) - ins - depr - tax) * 0.44) * 12 * yrs;
  const atroi = paid > 0 ? Math.round(((tv - te) / paid / yrs) * 1000) / 10 : 0;
  return { cf, cap, coc, atroi, rent: Math.round(rent) };
}

function fmt$(n) {
  if (n == null) return '—';
  return '$' + Math.round(n).toLocaleString();
}
function fmtPct(n) {
  if (n == null) return '—';
  return n.toFixed(1) + '%';
}

function daysAgo(dateStr) {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function AtroiBadge({ value }) {
  if (value == null) return <span className="text-gray-500">—</span>;
  const color = value >= 10 ? 'bg-purple-900/60 text-purple-300' : value >= 5 ? 'bg-yellow-900/60 text-yellow-300' : 'bg-red-900/60 text-red-300';
  return <span className={`text-xs font-bold px-2 py-0.5 rounded ${color}`}>{value.toFixed(1)}%</span>;
}

// Returns "best" index in an array of values where higher is better (or lower for price/repairs/hoa)
function bestIndex(values, lowerBetter = false) {
  const nums = values.map(v => (v == null || isNaN(v) ? null : Number(v)));
  const validNums = nums.filter(v => v !== null);
  if (validNums.length < 2) return null;
  const target = lowerBetter ? Math.min(...validNums) : Math.max(...validNums);
  const idx = nums.indexOf(target);
  return idx;
}

export default function ScoutComparePage() {
  const router = useRouter();
  const [allListings, setAllListings] = useState([]);
  const [loading, setLoading] = useState(true);
  // Track removed properties locally
  const [removedMls, setRemovedMls] = useState(new Set());

  useEffect(() => {
    fetch('/api/scout/listings')
      .then(r => r.json())
      .then(data => {
        setAllListings(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const potentials = useMemo(() => {
    return allListings.filter(l => l.status === 'potential' && !removedMls.has(l.mls_num));
  }, [allListings, removedMls]);

  const metricsMap = useMemo(() => {
    const m = {};
    potentials.forEach(l => {
      m[l.mls_num] = calcM(l, l, DEFAULTS);
    });
    return m;
  }, [potentials]);

  const removeProperty = async (mls_num) => {
    setRemovedMls(prev => new Set([...prev, mls_num]));
    try {
      await fetch('/api/scout/marks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mls_num, status: null }),
      });
    } catch (err) {
      console.error('Failed to remove mark:', err);
      // Rollback
      setRemovedMls(prev => {
        const next = new Set(prev);
        next.delete(mls_num);
        return next;
      });
    }
  };

  // Helper: highlight cell with best value
  const highlightClass = (idx, bestIdx) =>
    idx === bestIdx ? 'bg-green-900/30' : '';

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-900 text-white p-6">
        <PageHeader title="Scout: Compare" subtitle="Potential properties side-by-side" currentPage="/scout/compare" />
        <p className="text-gray-400">Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-900 text-white p-6">
      <div className="flex items-start gap-4 mb-6">
        <div className="flex-1">
          <PageHeader title="Scout: Compare" subtitle="Potential properties side-by-side" currentPage="/scout/compare" />
        </div>
        <button
          onClick={() => router.push('/scout')}
          className="mt-1 px-3 py-1.5 text-sm text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors whitespace-nowrap"
        >
          ← Back to Scout
        </button>
      </div>

      {potentials.length === 0 ? (
        <div className="bg-gray-800 rounded-xl p-12 text-center">
          <p className="text-gray-400 text-lg mb-2">No potential properties marked yet.</p>
          <p className="text-gray-600 text-sm mb-4">Go back to Scout to mark some.</p>
          <button
            onClick={() => router.push('/scout')}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg"
          >
            ← Back to Scout
          </button>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-xl overflow-x-auto">
          <table className="text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-700">
                {/* Label column */}
                <th className="sticky left-0 z-10 bg-gray-800 px-4 py-3 text-left text-gray-400 font-medium text-xs min-w-[140px] border-r border-gray-700">
                  Property
                </th>
                {potentials.map(l => (
                  <th key={l.mls_num} className="px-4 py-3 text-left min-w-[200px] border-r border-gray-700/50">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        {l.href ? (
                          <a href={l.href} target="_blank" rel="noopener noreferrer" className="font-medium text-white text-xs hover:text-blue-400 transition-colors leading-tight block">
                            {l.address}
                          </a>
                        ) : (
                          <span className="font-medium text-white text-xs leading-tight block">{l.address}</span>
                        )}
                        <span className="text-gray-600 text-xs">{l.mls_num}</span>
                      </div>
                      <button
                        onClick={() => removeProperty(l.mls_num)}
                        className="text-gray-600 hover:text-red-400 transition-colors text-xs flex-shrink-0 mt-0.5"
                        title="Remove from compare"
                      >
                        ✕
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">

              {/* Price */}
              {(() => {
                const bIdx = bestIndex(potentials.map(l => Number(l.price)), true);
                return (
                  <tr className="hover:bg-gray-750/30">
                    <td className="sticky left-0 z-10 bg-gray-800 px-4 py-2.5 text-gray-400 text-xs font-medium border-r border-gray-700">
                      Price
                    </td>
                    {potentials.map((l, i) => (
                      <td key={l.mls_num} className={`px-4 py-2.5 text-xs font-mono text-white border-r border-gray-700/50 ${highlightClass(i, bIdx)}`}>
                        {fmt$(Number(l.price))}
                        {l.first_price && l.first_price !== l.price && (
                          <span className={`ml-1 text-xs ${Number(l.price) < Number(l.first_price) ? 'text-green-400' : 'text-red-400'}`}>
                            {Number(l.price) < Number(l.first_price) ? '↓' : '↑'}{fmt$(Math.abs(Number(l.price) - Number(l.first_price)))}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })()}

              {/* Beds / Baths / Sqft */}
              <tr className="hover:bg-gray-750/30">
                <td className="sticky left-0 z-10 bg-gray-800 px-4 py-2.5 text-gray-400 text-xs font-medium border-r border-gray-700">
                  Beds / Baths / Sqft
                </td>
                {potentials.map(l => (
                  <td key={l.mls_num} className="px-4 py-2.5 text-xs text-gray-300 border-r border-gray-700/50">
                    {l.beds ?? '—'}bd / {l.baths ?? '—'}ba
                    {l.sqft ? <span className="text-gray-500 ml-1">/ {l.sqft.toLocaleString()} sqft</span> : null}
                  </td>
                ))}
              </tr>

              {/* Est. Rent */}
              {(() => {
                const rents = potentials.map(l => metricsMap[l.mls_num]?.rent ?? null);
                const bIdx = bestIndex(rents, false);
                return (
                  <tr className="hover:bg-gray-750/30">
                    <td className="sticky left-0 z-10 bg-gray-800 px-4 py-2.5 text-gray-400 text-xs font-medium border-r border-gray-700">
                      Est. Rent
                    </td>
                    {potentials.map((l, i) => {
                      const m = metricsMap[l.mls_num];
                      return (
                        <td key={l.mls_num} className={`px-4 py-2.5 text-xs text-gray-300 border-r border-gray-700/50 ${highlightClass(i, bIdx)}`}>
                          {m ? fmt$(m.rent) + '/mo' : '—'}
                        </td>
                      );
                    })}
                  </tr>
                );
              })()}

              {/* Cash Flow */}
              {(() => {
                const vals = potentials.map(l => metricsMap[l.mls_num]?.cf ?? null);
                const bIdx = bestIndex(vals, false);
                return (
                  <tr className="hover:bg-gray-750/30">
                    <td className="sticky left-0 z-10 bg-gray-800 px-4 py-2.5 text-gray-400 text-xs font-medium border-r border-gray-700">
                      Cash Flow/mo
                    </td>
                    {potentials.map((l, i) => {
                      const m = metricsMap[l.mls_num];
                      return (
                        <td key={l.mls_num} className={`px-4 py-2.5 text-xs font-bold border-r border-gray-700/50 ${highlightClass(i, bIdx)}`}>
                          {m ? (
                            <span className={m.cf >= 0 ? 'text-green-400' : 'text-red-400'}>
                              {m.cf >= 0 ? '+' : ''}{fmt$(m.cf)}
                            </span>
                          ) : '—'}
                        </td>
                      );
                    })}
                  </tr>
                );
              })()}

              {/* Cap Rate */}
              {(() => {
                const vals = potentials.map(l => metricsMap[l.mls_num]?.cap ?? null);
                const bIdx = bestIndex(vals, false);
                return (
                  <tr className="hover:bg-gray-750/30">
                    <td className="sticky left-0 z-10 bg-gray-800 px-4 py-2.5 text-gray-400 text-xs font-medium border-r border-gray-700">
                      Cap Rate
                    </td>
                    {potentials.map((l, i) => {
                      const m = metricsMap[l.mls_num];
                      return (
                        <td key={l.mls_num} className={`px-4 py-2.5 text-xs text-gray-300 border-r border-gray-700/50 ${highlightClass(i, bIdx)}`}>
                          {m ? fmtPct(m.cap) : '—'}
                        </td>
                      );
                    })}
                  </tr>
                );
              })()}

              {/* CoC */}
              {(() => {
                const vals = potentials.map(l => metricsMap[l.mls_num]?.coc ?? null);
                const bIdx = bestIndex(vals, false);
                return (
                  <tr className="hover:bg-gray-750/30">
                    <td className="sticky left-0 z-10 bg-gray-800 px-4 py-2.5 text-gray-400 text-xs font-medium border-r border-gray-700">
                      CoC Return
                    </td>
                    {potentials.map((l, i) => {
                      const m = metricsMap[l.mls_num];
                      return (
                        <td key={l.mls_num} className={`px-4 py-2.5 text-xs text-gray-300 border-r border-gray-700/50 ${highlightClass(i, bIdx)}`}>
                          {m ? fmtPct(m.coc) : '—'}
                        </td>
                      );
                    })}
                  </tr>
                );
              })()}

              {/* 30y ATROI */}
              {(() => {
                const vals = potentials.map(l => metricsMap[l.mls_num]?.atroi ?? null);
                const bIdx = bestIndex(vals, false);
                return (
                  <tr className="hover:bg-gray-750/30">
                    <td className="sticky left-0 z-10 bg-gray-800 px-4 py-2.5 text-gray-400 text-xs font-medium border-r border-gray-700">
                      30y ATROI
                    </td>
                    {potentials.map((l, i) => {
                      const m = metricsMap[l.mls_num];
                      return (
                        <td key={l.mls_num} className={`px-4 py-2.5 border-r border-gray-700/50 ${highlightClass(i, bIdx)}`}>
                          <AtroiBadge value={m?.atroi ?? null} />
                        </td>
                      );
                    })}
                  </tr>
                );
              })()}

              {/* Repairs Budget */}
              {(() => {
                const vals = potentials.map(l => l.repair_costs != null ? Number(l.repair_costs) : DEFAULTS.repairCosts);
                const bIdx = bestIndex(vals, true);
                return (
                  <tr className="hover:bg-gray-750/30">
                    <td className="sticky left-0 z-10 bg-gray-800 px-4 py-2.5 text-gray-400 text-xs font-medium border-r border-gray-700">
                      Repairs Budget
                    </td>
                    {potentials.map((l, i) => (
                      <td key={l.mls_num} className={`px-4 py-2.5 text-xs text-gray-300 border-r border-gray-700/50 ${highlightClass(i, bIdx)}`}>
                        {fmt$(l.repair_costs != null ? l.repair_costs : DEFAULTS.repairCosts)}
                        {l.repair_costs == null && <span className="text-gray-600 ml-1">(default)</span>}
                      </td>
                    ))}
                  </tr>
                );
              })()}

              {/* HOA/qtr */}
              {(() => {
                const vals = potentials.map(l => l.hoa_quarterly != null ? Number(l.hoa_quarterly) : 0);
                const bIdx = bestIndex(vals, true);
                return (
                  <tr className="hover:bg-gray-750/30">
                    <td className="sticky left-0 z-10 bg-gray-800 px-4 py-2.5 text-gray-400 text-xs font-medium border-r border-gray-700">
                      HOA/qtr
                    </td>
                    {potentials.map((l, i) => (
                      <td key={l.mls_num} className={`px-4 py-2.5 text-xs text-gray-300 border-r border-gray-700/50 ${highlightClass(i, bIdx)}`}>
                        {l.hoa_quarterly != null ? fmt$(l.hoa_quarterly) : <span className="text-gray-600">—</span>}
                      </td>
                    ))}
                  </tr>
                );
              })()}

              {/* School District */}
              <tr className="hover:bg-gray-750/30">
                <td className="sticky left-0 z-10 bg-gray-800 px-4 py-2.5 text-gray-400 text-xs font-medium border-r border-gray-700">
                  School District
                </td>
                {potentials.map(l => (
                  <td key={l.mls_num} className="px-4 py-2.5 text-xs text-gray-300 border-r border-gray-700/50">
                    {l.school_district || <span className="text-gray-600">—</span>}
                  </td>
                ))}
              </tr>

              {/* First Seen / Days on Market */}
              {(() => {
                const days = potentials.map(l => daysAgo(l.first_seen));
                const bIdx = bestIndex(days, true); // fewer days = fresher = highlight
                return (
                  <tr className="hover:bg-gray-750/30">
                    <td className="sticky left-0 z-10 bg-gray-800 px-4 py-2.5 text-gray-400 text-xs font-medium border-r border-gray-700">
                      First Seen / DOM
                    </td>
                    {potentials.map((l, i) => {
                      const d = daysAgo(l.first_seen);
                      const dateStr = l.first_seen
                        ? new Date(l.first_seen).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
                        : null;
                      return (
                        <td key={l.mls_num} className={`px-4 py-2.5 text-xs text-gray-300 border-r border-gray-700/50 ${highlightClass(i, bIdx)}`}>
                          {dateStr
                            ? <span>{dateStr} <span className="text-gray-500">({d}d)</span></span>
                            : <span className="text-gray-600">—</span>
                          }
                        </td>
                      );
                    })}
                  </tr>
                );
              })()}

              {/* Notes */}
              <tr className="hover:bg-gray-750/30">
                <td className="sticky left-0 z-10 bg-gray-800 px-4 py-2.5 text-gray-400 text-xs font-medium border-r border-gray-700">
                  Notes
                </td>
                {potentials.map(l => (
                  <td key={l.mls_num} className="px-4 py-2.5 text-xs text-gray-400 border-r border-gray-700/50 max-w-[200px]">
                    {l.mark_notes || <span className="text-gray-600">—</span>}
                  </td>
                ))}
              </tr>

            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
