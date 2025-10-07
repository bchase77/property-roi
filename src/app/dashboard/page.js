'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { analyze, analyzeWithCurrentValues } from '@/lib/finance';
import PageHeader from '@/components/ui/PageHeader';

export default function Dashboard() {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);


  useEffect(() => {
    loadProperties();
  }, []);

  async function loadProperties() {
    try {
      const res = await fetch('/api/properties', { cache: 'no-store' });
      if (res.ok) {
        setProperties(await res.json());
      }
    } catch (error) {
      console.error('Failed to load properties:', error);
    } finally {
      setLoading(false);
    }
  }

  // Only include owned properties in portfolio calculations
  const ownedProperties = properties.filter(p => p.purchased === true || p.purchased === 'true');
  
  const totalPortfolioValue = ownedProperties.reduce((sum, p) => sum + Number(p.purchase_price), 0);
  const totalMonthlyRent = ownedProperties.reduce((sum, p) => sum + Number(p.monthly_rent), 0);
  
  // Calculate total net income (cash flow) from all owned properties using current values
  const totalNetIncome = ownedProperties.reduce((sum, p) => {
    const metrics = analyzeWithCurrentValues(p);
    return sum + metrics.cashflowMonthly;
  }, 0);
  
  const avgCapRate = ownedProperties.length > 0 
    ? ownedProperties.reduce((sum, p) => {
        const metrics = analyzeWithCurrentValues(p);
        return sum + metrics.metrics.capRate;
      }, 0) / ownedProperties.length
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-7xl p-6 space-y-8">
      <PageHeader 
        title="Property Investment Dashboard"
        subtitle="Analyze, compare, and track your real estate investments"
        currentPage="/dashboard"
      />

      {/* Key Metrics */}
      <section className="grid md:grid-cols-5 gap-6">
        <MetricCard 
          title="Owned Properties" 
          value={`${ownedProperties.length} / ${properties.length}`} 
          subtitle="Owned / Total properties"
        />
        <MetricCard 
          title="Portfolio Value" 
          value={`$${totalPortfolioValue.toLocaleString()}`}
          subtitle="Owned properties only"
        />
        <MetricCard 
          title="Monthly Rent" 
          value={`$${totalMonthlyRent.toLocaleString()}`}
          subtitle="From owned properties"
        />
        <MetricCard 
          title="Net Income" 
          value={`$${totalNetIncome.toLocaleString()}`}
          subtitle="Monthly cash flow"
        />
        <MetricCard 
          title="Avg Cap Rate" 
          value={`${avgCapRate.toFixed(2)}%`}
          subtitle="Owned properties avg"
        />
      </section>

      {/* Quick Actions */}
      <section className="grid md:grid-cols-3 text-gray-600 gap-6">
        <ActionCard
          title="Add New Property"
          description="Enter details for a potential investment property"
          href="/data-entry"
          buttonText="Start Analysis"
          icon="+"
        />
        <ActionCard
          title="View Analytics"
          description="Charts, projections, and market comparisons"
          href="/analysis"
          buttonText="View Charts"
          icon="📊"
        />
        <ActionCard
          title="Manage Portfolio"
          description="Edit existing properties and update actuals"
          href="/portfolio"
          buttonText="Manage Properties"
          icon="🏠"
        />
      </section>

      {/* Recent Properties */}
      {properties.length > 0 && (
        <section>
          <h2 className="text-2xl font-semibold mb-4">Recent Properties</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 text-gray-600 gap-4">
            {properties.slice(0, 6).map(property => (
              <PropertySummaryCard key={property.id} property={property} />
            ))}
          </div>
          {properties.length > 6 && (
            <div className="text-center mt-4">
              <Link 
                href="/portfolio" 
                className="text-blue-600 hover:text-blue-800 font-medium"
              >
                View all {properties.length} properties →
              </Link>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function MetricCard({ title, value, subtitle }) {
  return (
    <div className="bg-white rounded-lg border p-6 text-center">
      <h3 className="text-sm font-medium text-gray-500 mb-1">{title}</h3>
      <div className="text-2xl font-bold text-gray-900 mb-1">{value}</div>
      <p className="text-xs text-gray-600">{subtitle}</p>
    </div>
  );
}

function ActionCard({ title, description, href, buttonText, icon }) {
  return (
    <div className="bg-white rounded-lg border p-6">
      <div className="text-3xl mb-3">{icon}</div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-gray-600 text-sm mb-4">{description}</p>
      <Link 
        href={href}
        className="inline-block bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
      >
        {buttonText}
      </Link>
    </div>
  );
}

function PropertySummaryCard({ property }) {
  const metrics = analyze({
    purchasePrice: Number(property.purchase_price),
    downPct: Number(property.down_payment_pct),
    rateApr: Number(property.interest_apr_pct),
    years: Number(property.loan_years),
    monthlyRent: Number(property.monthly_rent),
    taxPct: Number(property.property_tax_pct),
    taxAnnual: Number(property.tax_annual) || 0,
    taxInputMode: property.tax_input_mode || 'percentage',
    hoaMonthly: Number(property.hoa_monthly),
    insuranceMonthly: Number(property.insurance_monthly),
    maintPctRent: Number(property.maintenance_pct_rent),
    vacancyPctRent: Number(property.vacancy_pct_rent),
    mgmtPctRent: Number(property.management_pct_rent),
    otherMonthly: Number(property.other_monthly),
    initialInvestment: Number(property.initial_investment) || 0,
    mortgageFree: Boolean(property.mortgage_free)
  });

  return (
    <div className="bg-white rounded-lg border p-4">
      <h4 className="font-medium text-gray-900 mb-1">{property.address}</h4>
      <p className="text-xs text-gray-500 mb-3">
        {property.city}, {property.state} {property.zip}
      </p>
      <div className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span>Value:</span>
          <span>${Number(property.purchase_price).toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span>Rent:</span>
          <span>${Number(property.monthly_rent).toLocaleString()}/mo</span>
        </div>
        <div className="flex justify-between">
          <span>Cap Rate:</span>
          <span>{metrics.metrics.capRate.toFixed(2)}%</span>
        </div>
        <div className="flex justify-between">
          <span>Cash Flow:</span>
          <span>${metrics.cashflowMonthly.toLocaleString()}/mo</span>
        </div>
      </div>
    </div>
  );
}