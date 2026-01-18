id: '502', name: 'Manufacturing Costs', type: 'COGS' },
{ id: '503', name: 'Freight & Delivery', type: 'COGS' },
{ id: '401', name: 'Sales of Product Income', type: 'Income' },
{ id: '402', name: 'Amazon Sales', type: 'Income' },
{ id: '403', name: 'Amazon Refunds', type: 'Income' },
{ id: '601', name: 'Amazon FBA Fees', type: 'COGS' },
{ id: '602', name: 'Amazon Advertising Costs', type: 'Expense' },
];

// Configuration for required Parent Accounts - Matches "Master Checklist" in Plan
// const REQUIRED_PARENTS = [
//   // Plutus Core (Inventory/COGS)
//     { key: 'inventoryAsset', label: 'Inventory Asset Parent', type: 'Asset', defaultName: 'Inventory Asset' },
//       { key: 'manufacturing', label: 'Manufacturing COGS Parent', type: 'Cimport React, { useState, useEffect } from 'react';
import {
  Check,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  Database,
  Briefcase,
  CreditCard,
  FileText,
  Upload,
  Plus,
  Trash2,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  FileSpreadsheet,
  Search
} from 'lucide-react';

// --- MOCK DATA & CONSTANTS ---

const MARKETPLACES = [
  { id: 'amazon.com', name: 'Amazon.com', currency: 'USD' },
  { id: 'amazon.co.uk', name: 'Amazon.co.uk', currency: 'GBP' },
  { id: 'amazon.ca', name: 'Amazon.ca', currency: 'CAD' },
  { id: 'amazon.de', name: 'Amazon.de', currency: 'EUR' },
];

// Mock Chart of Accounts from QBO
const MOCK_QBO_COA = [
  { id: '101', name: 'Inventory Asset', type: 'Asset' },
  { id: '501', name: 'Cost of Goods SolOGS', defaultName: 'Manufacturing' },
  { key: 'freightDuty', label: 'Freight & Duty COGS Parent', type: 'COGS', defaultName: 'Freight & Custom Duty' },
  { key: 'landFreight', label: 'Land Freight COGS Parent', type: 'COGS', defaultName: 'Land Freight' },
  { key: 'storage3pl', label: 'Storage 3PL COGS Parent', type: 'COGS', defaultName: 'Storage 3PL' },
  { key: 'mfgAccessories', label: 'Mfg Accessories COGS Parent', type: 'COGS', defaultName: 'Mfg Accessories' },
  { key: 'shrinkage', label: 'Inventory Shrinkage Parent', type: 'COGS', defaultName: 'Inventory Shrinkage' },

  // LMB Targets (Revenue/Fees) - Plutus creates sub-accounts here for LMB to use
  { key: 'amzSales', label: 'Amazon Sales Parent', type: 'Income', defaultName: 'Amazon Sales' },
  { key: 'amzRefunds', label: 'Amazon Refunds Parent', type: 'Income', defaultName: 'Amazon Refunds' },
  { key: 'amzFbaFees', label: 'Amazon FBA Fees Parent', type: 'COGS', defaultName: 'Amazon FBA Fees' },
  { key: 'amzSellerFees', label: 'Amazon Seller Fees Parent', type: 'COGS', defaultName: 'Amazon Seller Fees' },
  { key: 'amzStorageFees', label: 'Amazon Storage Fees Parent', type: 'COGS', defaultName: 'Amazon Storage Fees' },
  { key: 'amzAds', label: 'Amazon Advertising Parent', type: 'COGS', defaultName: 'Amazon Advertising Costs' },
  { key: 'amzPromos', label: 'Amazon Promotions Parent', type: 'COGS', defaultName: 'Amazon Promotions' },
  { key: 'amzReimb', label: 'FBA Inv. Reimbursement Parent', type: 'Income', defaultName: 'Amazon FBA Inventory Reimbursement' },
];

// --- COMPONENTS ---

const Card = ({ children, className = "" }) => (
  <div className={`bg-white rounded-xl border border-slate-200 shadow-sm ${className}`}>
    {children}
  </div>
);

const Button = ({ children, onClick, variant = "primary", disabled = false, icon: Icon, className = "" }) => {
  const baseStyle = "inline-flex items-center justify-center px-4 py-2 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500",
    secondary: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 focus:ring-slate-400",
    danger: "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 focus:ring-red-400",
    ghost: "text-slate-600 hover:bg-slate-100"
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyle} ${variants[variant]} ${className}`}
    >
      {Icon && <Icon size={18} className="mr-2" />}
      {children}
    </button>
  );
};

const Badge = ({ children, variant = "neutral" }) => {
  const variants = {
    success: "bg-emerald-100 text-emerald-800",
    error: "bg-red-100 text-red-800",
    neutral: "bg-slate-100 text-slate-800",
    warning: "bg-amber-100 text-amber-800",
    info: "bg-blue-100 text-blue-800",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variants[variant]}`}>
      {children}
    </span>
  );
};

// --- TIMELINE COMPONENT ---
const Timeline = ({ steps, currentStep }) => {
  return (
    <div className="w-full bg-white border-b border-slate-200 py-4 px-4 overflow-x-auto">
      <div className="max-w-5xl mx-auto flex items-center justify-between min-w-[768px]">
        {steps.map((step, index) => {
          const isCompleted = step.id < currentStep;
          const isCurrent = step.id === currentStep;

          return (
            <div key={step.id} className="flex flex-col items-center relative z-10 group min-w-[60px]">
              {/* Connector Line */}
              {index !== 0 && (
                <div
                  className={`absolute top-3.5 right-[50%] w-[200%] h-0.5 -z-10
                   ${step.id <= currentStep ? 'bg-indigo-600' : 'bg-slate-200'}`}
                />
              )}

              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors
                ${isCompleted ? 'bg-indigo-600 text-white' :
                    isCurrent ? 'bg-white border-2 border-indigo-600 text-indigo-600' :
                      'bg-white border-2 border-slate-200 text-slate-300'}
                `}
              >
                {isCompleted ? <Check size={14} /> : step.id}
              </div>

              <span className={`text-[10px] uppercase tracking-wider font-bold mt-2
                ${isCurrent ? 'text-indigo-600' : isCompleted ? 'text-slate-700' : 'text-slate-400'}`}>
                {step.shortTitle || step.title}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// --- STEPS ---

const Step1ConnectQBO = ({ data, updateData }) => {
  const [loading, setLoading] = useState(false);

  const handleConnect = () => {
    setLoading(true);
    setTimeout(() => {
      updateData({
        qboConnected: true,
        qboCompanyName: 'Targon LLC',
        qboCurrency: 'USD'
      });
      setLoading(false);
    }, 1500);
  };

  if (data.qboConnected) {
    return (
      <Card className="p-8 text-center max-w-2xl mx-auto">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Check size={32} className="text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Connected to QuickBooks</h2>
        <div className="bg-slate-50 rounded-lg p-4 inline-block text-left mb-6 border border-slate-200">
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <span className="text-slate-500">Company:</span>
            <span className="font-semibold text-slate-900">{data.qboCompanyName}</span>
            <span className="text-slate-500">Home Currency:</span>
            <span className="font-semibold text-slate-900">{data.qboCurrency}</span>
          </div>
        </div>
        <div>
          <Button variant="danger" onClick={() => updateData({ qboConnected: false })}>Disconnect</Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-8 max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Database size={32} className="text-slate-500" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Connect QuickBooks</h2>
        <p className="text-slate-600">
          Plutus needs access to your QuickBooks Online account to read your Chart of Accounts,
          process supplier bills, and post COGS journal entries.
        </p>
      </div>

      <div className="flex justify-center">
        <Button
          onClick={handleConnect}
          disabled={loading}
          className="w-full sm:w-auto min-w-[200px]"
        >
          {loading ? 'Connecting...' : 'Connect to QuickBooks'}
        </Button>
      </div>
    </Card>
  );
};

const Step2VerifyLMB = ({ data, updateData }) => {
  return (
    <Card className="p-6 max-w-3xl mx-auto">
      <div className="mb-6 border-l-4 border-amber-500 pl-4 bg-amber-50 p-4 rounded-r-lg">
        <h3 className="font-bold text-amber-900 flex items-center gap-2">
          <AlertCircle size={20} />
          Prerequisite Required
        </h3>
        <p className="text-amber-800 mt-1 text-sm">
          Plutus works alongside Link My Books. You must complete the LMB Accounts & Taxes Setup Wizard BEFORE continuing.
        </p>
      </div>
      <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-1 w-5 h-5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
            checked={data.lmbVerified}
            onChange={(e) => updateData({ lmbVerified: e.target.checked })}
          />
          <span className="text-slate-900 font-medium">
            I have completed the LMB Accounts & Taxes Wizard for all my Amazon connections
          </span>
        </label>
      </div>
    </Card>
  );
};

const Step3BrandSetup = ({ data, updateData }) => {
  const [newBrandName, setNewBrandName] = useState('');
  const [newMarketplace, setNewMarketplace] = useState(MARKETPLACES[0].id);

  const addBrand = () => {
    if (!newBrandName.trim()) return;
    const market = MARKETPLACES.find(m => m.id === newMarketplace);
    const newBrand = {
      id: Date.now().toString(),
      name: newBrandName,
      marketplace: market.id,
      marketplaceName: market.name,
      currency: market.currency
    };
    updateData({ brands: [...data.brands, newBrand] });
    setNewBrandName('');
  };

  const removeBrand = (id) => {
    updateData({ brands: data.brands.filter(b => b.id !== id) });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Card className="p-6">
        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 bg-indigo-50 rounded-lg">
            <Briefcase className="text-indigo-600" size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Brand Setup</h3>
            <p className="text-slate-600 text-sm mt-1">
              Brands let you track P&L separately for different product lines or marketplaces.
              Plutus will create sub-accounts for each brand defined here.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {data.brands.map((brand) => (
            <div key={brand.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div>
                <h4 className="font-bold text-slate-900">{brand.name}</h4>
                <div className="flex items-center gap-3 text-sm text-slate-500 mt-1">
                  <span>{brand.marketplaceName}</span>
                  <span>•</span>
                  <span>{brand.currency}</span>
                </div>
              </div>
              <Button variant="ghost" onClick={() => removeBrand(brand.id)} className="text-red-600 hover:text-red-700 hover:bg-red-50">
                <Trash2 size={18} />
              </Button>
            </div>
          ))}

          {data.brands.length === 0 && (
            <div className="text-center py-8 text-slate-500 italic bg-slate-50 rounded-lg border border-dashed border-slate-300">
              No brands added yet. Add one below.
            </div>
          )}
        </div>
      </Card>

      <Card className="p-6">
        <h4 className="font-semibold text-slate-900 mb-4">Add New Brand</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <label className="block text-xs font-medium text-slate-500 mb-1">Brand Name *</label>
            <input
              type="text"
              value={newBrandName}
              onChange={(e) => setNewBrandName(e.target.value)}
              placeholder="e.g. US-Dust Sheets"
              className="w-full rounded-lg border-slate-300 focus:border-indigo-500 focus:ring-indigo-500"
            />
          </div>
          <div className="md:col-span-1">
            <label className="block text-xs font-medium text-slate-500 mb-1">Marketplace *</label>
            <select
              value={newMarketplace}
              onChange={(e) => setNewMarketplace(e.target.value)}
              className="w-full rounded-lg border-slate-300 focus:border-indigo-500 focus:ring-indigo-500"
            >
              {MARKETPLACES.map(m => (
                <option key={m.id} value={m.id}>{m.name} ({m.currency})</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-1 flex items-end">
            <Button onClick={addBrand} disabled={!newBrandName.trim()} className="w-full" icon={Plus}>Add Brand</Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

const Step4AccountSetup = ({ data, updateData }) => {
  const [mappedParents, setMappedParents] = useState(data.parentMapping || {});
  const [creatingSubs, setCreatingSubs] = useState(false);

  useEffect(() => {
    if (Object.keys(mappedParents).length === 0) {
      const initialMap = {};
      REQUIRED_PARENTS.forEach(rp => {
        const match = MOCK_QBO_COA.find(a => a.name.toLowerCase() === rp.defaultName.toLowerCase());
        initialMap[rp.key] = match ? match.id : 'CREATE_NEW';
      });
      setMappedParents(initialMap);
    }
  }, []);

  const handleParentChange = (key, value) => {
    setMappedParents(prev => ({ ...prev, [key]: value }));
  };

  const createSubAccounts = () => {
    setCreatingSubs(true);
    updateData({ parentMapping: mappedParents });
    setTimeout(() => {
      updateData({ subAccountsCreated: true });
      setCreatingSubs(false);
    }, 2000);
  };

  const getSubAccountsByGroup = (brand) => {
    return {
      assets: [
        { name: `Inv Manufacturing - ${brand.name}`, type: 'Asset' },
        { name: `Inv Freight - ${brand.name}`, type: 'Asset' },
        { name: `Inv Duty - ${brand.name}`, type: 'Asset' },
        { name: `Inv Mfg Accessories - ${brand.name}`, type: 'Asset' },
      ],
      cogsAuto: [
        { name: `Manufacturing - ${brand.name}`, type: 'COGS' },
        { name: `Freight - ${brand.name}`, type: 'COGS' },
        { name: `Duty - ${brand.name}`, type: 'COGS' },
        { name: `Mfg Accessories - ${brand.name}`, type: 'COGS' },
        { name: `Inventory Shrinkage - ${brand.name}`, type: 'COGS' },
      ],
      cogsManual: [
        { name: `Land Freight - ${brand.name}`, type: 'COGS' },
        { name: `Storage 3PL - ${brand.name}`, type: 'COGS' },
      ],
      lmbTargets: [
        { name: `Amazon Sales - ${brand.name}`, type: 'Income' },
        { name: `Amazon Refunds - ${brand.name}`, type: 'Income' },
        { name: `Amazon FBA Fees - ${brand.name}`, type: 'COGS' },
        { name: `Amazon Seller Fees - ${brand.name}`, type: 'COGS' },
        { name: `Amazon Storage Fees - ${brand.name}`, type: 'COGS' },
        { name: `Amazon Advertising Costs - ${brand.name}`, type: 'COGS' },
        { name: `Amazon Promotions - ${brand.name}`, type: 'COGS' },
        { name: `Amazon FBA Inventory Reimbursement - ${brand.name}`, type: 'Income' },
      ]
    };
  };

  if (data.subAccountsCreated) {
    return (
      <Card className="p-8 text-center max-w-2xl mx-auto">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Check size={32} className="text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Accounts Created Successfully</h2>
        <p className="text-slate-600 mb-6">
          Plutus has configured your Chart of Accounts. All necessary sub-accounts are ready.
        </p>
        <div className="bg-slate-50 p-4 rounded-lg inline-block text-sm text-slate-500">
          <p>Total sub-accounts created: <strong>{data.brands.length * 19}</strong></p>
        </div>
      </Card>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Parent Account Mapping Section */}
      <Card className="p-6">
        <div className="mb-6">
          <h3 className="text-lg font-bold text-slate-900">Map Parent Accounts</h3>
          <p className="text-sm text-slate-600 mt-1">
            Plutus creates sub-accounts under these parents. Please select the correct parent account from your QBO.
            If the account doesn't exist, select "Create New".
          </p>
        </div>

        <div className="space-y-6">
          {['Asset', 'COGS', 'Income'].map(type => (
            <div key={type} className="border-t border-slate-100 pt-4 first:pt-0">
              <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">{type} Accounts</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {REQUIRED_PARENTS.filter(rp => rp.type === type).map((rp) => (
                  <div key={rp.key}>
                    <label className="block text-xs font-medium text-slate-700 mb-1">{rp.label}</label>
                    <select
                      className="w-full rounded-md border-slate-300 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                      value={mappedParents[rp.key] || 'CREATE_NEW'}
                      onChange={(e) => handleParentChange(rp.key, e.target.value)}
                    >
                      <option value="CREATE_NEW" className="font-semibold text-indigo-600">
                        [+] Create New: "{rp.defaultName}"
                      </option>
                      {MOCK_QBO_COA.filter(a => a.type === rp.type || (rp.type === 'COGS' && a.type === 'Expense')).map(a => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Sub Accounts Section - WITH VISUAL GROUPING */}
      <Card className="p-6">
        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 bg-indigo-50 rounded-lg">
            <CreditCard className="text-indigo-600" size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Review Sub-Accounts</h3>
            <p className="text-slate-600 text-sm mt-1">
              Plutus will create these sub-accounts. The responsibility split is shown below.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {data.brands.map(brand => {
            const groups = getSubAccountsByGroup(brand);
            return (
              <div key={brand.id} className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-slate-100 p-3 border-b border-slate-200 font-semibold text-slate-700">
                  {brand.name}
                </div>
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">

                  {/* Left Column: Plutus Managed */}
                  <div className="space-y-4">
                    <div>
                      <h5 className="text-xs font-bold text-indigo-600 uppercase mb-2 flex items-center gap-1">
                        <RefreshCw size={12} /> Inventory Assets (Plutus)
                      </h5>
                      <ul className="text-xs space-y-1 text-slate-600">
                        {groups.assets.map((a, i) => <li key={i}>{a.name}</li>)}
                      </ul>
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-indigo-600 uppercase mb-2 flex items-center gap-1">
                        <RefreshCw size={12} /> COGS - Automated (Plutus)
                      </h5>
                      <ul className="text-xs space-y-1 text-slate-600">
                        {groups.cogsAuto.map((a, i) => <li key={i}>{a.name}</li>)}
                      </ul>
                    </div>
                  </div>

                  {/* Right Column: Manual + LMB */}
                  <div className="space-y-4">
                    <div>
                      <h5 className="text-xs font-bold text-amber-600 uppercase mb-2 flex items-center gap-1">
                        <FileText size={12} /> COGS - Manual Entry
                      </h5>
                      <ul className="text-xs space-y-1 text-slate-600">
                        {groups.cogsManual.map((a, i) => <li key={i}>{a.name}</li>)}
                      </ul>
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-emerald-600 uppercase mb-2 flex items-center gap-1">
                        <ExternalLink size={12} /> LMB Targets (Revenue/Fees)
                      </h5>
                      <ul className="text-xs space-y-1 text-slate-600">
                        {groups.lmbTargets.map((a, i) => <li key={i}>{a.name}</li>)}
                      </ul>
                    </div>
                  </div>

                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-8 pt-6 border-t border-slate-200 flex flex-col items-center">
          <Button onClick={createSubAccounts} disabled={creatingSubs} className="w-full sm:w-auto min-w-[250px]">
            {creatingSubs ? 'Creating Accounts in QBO...' : 'Confirm & Create Accounts'}
          </Button>
        </div>
      </Card>
    </div>
  );
};

const Step5SkuSetup = ({ data, updateData }) => {
  const [showModal, setShowModal] = useState(false);
  const [newSku, setNewSku] = useState({ sku: '', name: '', brandId: '', asin: '' });

  const handleAddSku = () => {
    if (!newSku.sku || !newSku.brandId) return;
    updateData({ skus: [...data.skus, { ...newSku, id: Date.now().toString() }] });
    setNewSku({ sku: '', name: '', brandId: '', asin: '' });
    setShowModal(false);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <Card className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-lg font-bold text-slate-900">SKU Setup</h3>
            <p className="text-sm text-slate-600">Assign your product SKUs to brands.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" icon={Upload}>Bulk Import</Button>
            <Button icon={Plus} onClick={() => setShowModal(true)}>Add SKU</Button>
          </div>
        </div>

        <div className="mb-4 bg-blue-50 text-blue-800 p-3 rounded-lg text-sm flex items-start gap-2">
          <AlertCircle size={16} className="mt-0.5" />
          <p>You do not need to enter costs here. Plutus calculates unit costs automatically from your supplier bills.</p>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 font-medium">
              <tr>
                <th className="p-3 border-b">SKU</th>
                <th className="p-3 border-b">Product Name</th>
                <th className="p-3 border-b">Brand</th>
                <th className="p-3 border-b">ASIN</th>
                <th className="p-3 border-b text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.skus.length === 0 ? (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-slate-500 italic">No SKUs added yet.</td>
                </tr>
              ) : (
                data.skus.map(sku => {
                  const brand = data.brands.find(b => b.id === sku.brandId);
                  return (
                    <tr key={sku.id} className="hover:bg-slate-50">
                      <td className="p-3 border-b font-medium">{sku.sku}</td>
                      <td className="p-3 border-b">{sku.name}</td>
                      <td className="p-3 border-b"><Badge>{brand?.name || 'Unknown'}</Badge></td>
                      <td className="p-3 border-b text-slate-500">{sku.asin || '-'}</td>
                      <td className="p-3 border-b text-right">
                        <button onClick={() => updateData({ skus: data.skus.filter(s => s.id !== sku.id) })} className="text-red-500 hover:text-red-700">
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-4 text-sm text-slate-500 text-right">Total: {data.skus.length} SKUs</div>
      </Card>

      {/* Simple Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md p-6">
            <h3 className="text-lg font-bold mb-4">Add SKU</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">SKU *</label>
                <input
                  type="text"
                  value={newSku.sku}
                  onChange={e => setNewSku({ ...newSku, sku: e.target.value })}
                  className="w-full rounded-lg border-slate-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Product Name</label>
                <input
                  type="text"
                  value={newSku.name}
                  onChange={e => setNewSku({ ...newSku, name: e.target.value })}
                  className="w-full rounded-lg border-slate-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Brand *</label>
                <select
                  value={newSku.brandId}
                  onChange={e => setNewSku({ ...newSku, brandId: e.target.value })}
                  className="w-full rounded-lg border-slate-300"
                >
                  <option value="">Select Brand...</option>
                  {data.brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">ASIN (Optional)</label>
                <input
                  type="text"
                  value={newSku.asin}
                  onChange={e => setNewSku({ ...newSku, asin: e.target.value })}
                  className="w-full rounded-lg border-slate-300"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="secondary" onClick={() => setShowModal(false)} className="flex-1">Cancel</Button>
                <Button onClick={handleAddSku} disabled={!newSku.sku || !newSku.brandId} className="flex-1">Save SKU</Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

const Step6LmbGroups = ({ data, updateData }) => {
  return (
    <Card className="p-6 max-w-3xl mx-auto">
      <div className="mb-6 bg-slate-50 border border-slate-200 p-4 rounded-lg flex items-start gap-3">
        <ExternalLink className="text-slate-500 mt-1" size={20} />
        <div>
          <h3 className="font-bold text-slate-900">External Configuration Required</h3>
          <p className="text-sm text-slate-600 mt-1">
            This step is completed in <strong>Link My Books</strong>, not Plutus.
            You need to create Product Groups in LMB and map them to the brand sub-accounts we just created.
          </p>
        </div>
      </div>

      <div className="space-y-6 mb-8">
        <h4 className="font-semibold text-slate-900 border-b pb-2">Checklist for EACH LMB Connection:</h4>

        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600 shrink-0">1</div>
            <div>
              <p className="font-medium text-slate-900 text-sm">Create Product Group</p>
              <p className="text-xs text-slate-500">Name it exactly like your brand (e.g., "US-Dust Sheets")</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600 shrink-0">2</div>
            <div>
              <p className="font-medium text-slate-900 text-sm">Map Accounts</p>
              <p className="text-xs text-slate-500">Select the specific brand sub-accounts (e.g., "Amazon Sales - US-Dust Sheets")</p>
              <div className="mt-2 p-2 bg-red-50 text-red-800 text-xs rounded font-medium inline-block">
                ⚠️ Important: Set COGS to OFF in LMB. Plutus handles COGS.
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600 shrink-0">3</div>
            <div>
              <p className="font-medium text-slate-900 text-sm">Assign SKUs</p>
              <p className="text-xs text-slate-500">Add the correct SKUs to the group.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3 bg-slate-50 p-4 rounded-lg border border-slate-200">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={data.lmbGroupsDone.groups}
            onChange={e => updateData({ lmbGroupsDone: { ...data.lmbGroupsDone, groups: e.target.checked } })}
            className="w-4 h-4 text-indigo-600 rounded"
          />
          <span className="text-sm font-medium">I have created Product Groups for all my brands</span>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={data.lmbGroupsDone.skus}
            onChange={e => updateData({ lmbGroupsDone: { ...data.lmbGroupsDone, skus: e.target.checked } })}
            className="w-4 h-4 text-indigo-600 rounded"
          />
          <span className="text-sm font-medium">I have assigned all SKUs to their Product Groups</span>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={data.lmbGroupsDone.cogsOff}
            onChange={e => updateData({ lmbGroupsDone: { ...data.lmbGroupsDone, cogsOff: e.target.checked } })}
            className="w-4 h-4 text-indigo-600 rounded"
          />
          <span className="text-sm font-medium">I have set COGS to OFF in LMB</span>
        </label>
      </div>
    </Card>
  );
};

const Step7BillEntry = ({ data, updateData }) => {
  return (
    <Card className="p-6 max-w-3xl mx-auto">
      <div className="flex items-start gap-4 mb-6">
        <div className="p-3 bg-indigo-50 rounded-lg">
          <FileText className="text-indigo-600" size={24} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-900">Bill Entry Guidelines</h3>
          <p className="text-slate-600 text-sm mt-1">
            Plutus links supplier bills (Mfg, Freight, Duty) together using the PO Number.
          </p>
        </div>
      </div>

      <div className="bg-slate-900 text-slate-200 p-6 rounded-lg font-mono text-sm mb-6 shadow-sm">
        <div className="text-slate-400 mb-2">// REQUIRED FORMAT FOR BILL MEMO</div>
        <div className="text-xl font-bold text-white mb-2">PO: PO-2026-001</div>
        <ul className="text-xs space-y-1 text-slate-400 list-disc list-inside">
          <li>Start with "PO: " (including the space)</li>
          <li>Follow with your PO number</li>
          <li>Keep exactly this format - no extra text</li>
        </ul>
      </div>

      <div className="bg-white border border-slate-200 p-4 rounded-lg mb-8">
        <h4 className="font-bold text-slate-900 text-sm mb-2">Example: Manufacturing Bill</h4>
        <div className="text-sm text-slate-600 space-y-1">
          <p>1. Create Bill in QBO</p>
          <p>2. Vendor: Shenzhen Manufacturing Co</p>
          <p>3. <strong>Memo: PO: PO-2026-001</strong></p>
          <p>4. Account: <span className="font-mono text-xs bg-slate-100 p-1 rounded">Inv Manufacturing - US-Dust Sheets</span></p>
        </div>
      </div>

      <label className="flex items-center gap-3 cursor-pointer p-4 bg-slate-50 rounded-lg border border-slate-200">
        <input
          type="checkbox"
          checked={data.billEntryAck}
          onChange={e => updateData({ billEntryAck: e.target.checked })}
          className="w-5 h-5 text-indigo-600 rounded"
        />
        <span className="text-slate-900 font-medium">
          I understand how to enter bills with the PO memo format
        </span>
      </label>
    </Card>
  );
};

const Step8CatchUp = ({ data, updateData }) => {
  return (
    <Card className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="mb-4">
        <h3 className="text-lg font-bold text-slate-900">Historical Catch-Up</h3>
        <p className="text-sm text-slate-600">
          Plutus maintains a strict audit trail. Every inventory movement must be linked to a source document.
          No arbitrary opening balances are allowed.
        </p>
      </div>

      <div className="grid gap-4">
        {/* Option 1: Just Starting */}
        <label className={`block p-4 border rounded-lg cursor-pointer transition-all ${data.catchUpMode === 'none' ? 'border-indigo-600 ring-1 ring-indigo-600 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300'}`}>
          <div className="flex items-center gap-3">
            <input
              type="radio"
              name="catchup"
              value="none"
              checked={data.catchUpMode === 'none'}
              onChange={e => updateData({ catchUpMode: e.target.value })}
              className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <span className="block font-bold text-slate-900">I'm just starting (no historical data)</span>
              <span className="block text-sm text-slate-500">Plutus will process settlements as they come. No catch-up needed.</span>
            </div>
          </div>
        </label>

        {/* Option 2: Specific Date */}
        <label className={`block p-4 border rounded-lg cursor-pointer transition-all ${data.catchUpMode === 'specific' ? 'border-indigo-600 ring-1 ring-indigo-600 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300'}`}>
          <div className="flex items-center gap-3">
            <input
              type="radio"
              name="catchup"
              value="specific"
              checked={data.catchUpMode === 'specific'}
              onChange={e => updateData({ catchUpMode: e.target.value })}
              className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <span className="block font-bold text-slate-900">Catch up from a specific date</span>
              <span className="block text-sm text-slate-500">Requires an opening inventory snapshot (Amazon report + Valuation).</span>
            </div>
          </div>
        </label>

        {/* Option 3: Full History */}
        <label className={`block p-4 border rounded-lg cursor-pointer transition-all ${data.catchUpMode === 'full' ? 'border-indigo-600 ring-1 ring-indigo-600 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300'}`}>
          <div className="flex items-center gap-3">
            <input
              type="radio"
              name="catchup"
              value="full"
              checked={data.catchUpMode === 'full'}
              onChange={e => updateData({ catchUpMode: e.target.value })}
              className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <span className="block font-bold text-slate-900">Catch up from the beginning</span>
              <span className="block text-sm text-slate-500">Process ALL historical bills and settlements. Most accurate, but more work.</span>
            </div>
          </div>
        </label>
      </div>

      {/* Conditional UI for Specific Date */}
      {data.catchUpMode === 'specific' && (
        <div className="mt-6 border-t border-slate-200 pt-6 animate-in fade-in slide-in-from-top-4">
          <h4 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
            <FileSpreadsheet size={18} /> Opening Inventory Snapshot
          </h4>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Start Date</label>
              <input
                type="date"
                value={data.catchUpDate}
                onChange={e => updateData({ catchUpDate: e.target.value })}
                className="rounded-lg border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-lg">
              <p className="text-sm font-medium mb-2">1. Upload Amazon Inventory Report</p>
              <input type="file" className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" />
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-lg">
              <p className="text-sm font-medium mb-2">2. Valuation Source</p>
              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <input type="radio" name="valSource" className="text-indigo-600" />
                  <span className="text-sm">Compute from historical bills in QBO</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="valSource" className="text-indigo-600" />
                  <span className="text-sm">Use accountant's valuation (Upload Excel)</span>
                </label>
              </div>
            </div>

            <div className="bg-amber-50 p-3 rounded text-xs text-amber-800 border border-amber-100">
              ⚠️ <strong>Initialization JE Required:</strong> Your QBO inventory sub-accounts are at $0. Plutus will help you create an opening journal entry to prevent negative balances.
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

const Step9Review = ({ data, onComplete }) => {
  return (
    <Card className="p-8 max-w-2xl mx-auto text-center">
      <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
        <Check size={40} className="text-white" />
      </div>

      <h2 className="text-3xl font-bold text-slate-900 mb-2">Setup Almost Complete!</h2>
      <p className="text-slate-600 mb-8">
        You've configured Plutus successfully. Review your setup below before finishing.
      </p>

      <div className="text-left bg-slate-50 rounded-xl p-6 border border-slate-200 shadow-sm mb-8 space-y-4">
        <ReviewItem label="QuickBooks" value={`Connected to ${data.qboCompanyName}`} />
        <ReviewItem label="LMB Setup" value="Acknowledged" />
        <ReviewItem label="Brands Configured" value={data.brands.map(b => b.name).join(', ')} />
        <ReviewItem label="Accounts Created" value={`${data.brands.length * 19} Sub-Accounts`} />
        <ReviewItem label="SKUs Added" value={`${data.skus.length} SKUs`} />
        <ReviewItem label="Catch-Up Mode" value={data.catchUpMode === 'none' ? 'Just Starting' : data.catchUpMode === 'specific' ? `From ${data.catchUpDate}` : 'Full History'} />
      </div>

      <Button onClick={onComplete} className="w-full py-3 text-lg">
        Complete Setup
      </Button>
    </Card>
  );
};

const ReviewItem = ({ label, value }) => (
  <div className="flex justify-between items-center text-sm border-b border-slate-200 last:border-0 pb-2 last:pb-0">
    <span className="text-slate-500 font-medium">{label}</span>
    <span className="text-slate-900 font-bold">{value}</span>
  </div>
);

// --- MAIN WIZARD COMPONENT ---

export default function PlutusSetupWizard() {
  const [step, setStep] = useState(1);
  const [completed, setCompleted] = useState(false);

  // Wizard State
  const [data, setData] = useState({
    // Step 1
    qboConnected: false,
    qboCompanyName: '',
    qboCurrency: '',
    // Step 2
    lmbVerified: false,
    // Step 3
    brands: [
      // Pre-filling typical user data for demo purposes, usually starts empty
      { id: '1', name: 'US-Dust Sheets', marketplace: 'amazon.com', marketplaceName: 'Amazon.com', currency: 'USD' },
      { id: '2', name: 'UK-Dust Sheets', marketplace: 'amazon.co.uk', marketplaceName: 'Amazon.co.uk', currency: 'GBP' }
    ],
    // Step 4
    parentMapping: {}, // New: stores user selected parent IDs
    subAccountsCreated: false,
    // Step 5
    skus: [],
    // Step 6
    lmbGroupsDone: { groups: false, skus: false, cogsOff: false },
    // Step 7
    billEntryAck: false,
    // Step 8
    catchUpMode: 'none', // none, specific, full
    catchUpDate: '',
  });

  const updateData = (newData) => {
    setData(prev => ({ ...prev, ...newData }));
  };

  const steps = [
    { id: 1, title: 'Connect QBO', shortTitle: 'Connect' },
    { id: 2, title: 'Verify LMB', shortTitle: 'LMB Base' },
    { id: 3, title: 'Brands', shortTitle: 'Brands' },
    { id: 4, title: 'Accounts', shortTitle: 'Accounts' },
    { id: 5, title: 'SKUs', shortTitle: 'SKUs' },
    { id: 6, title: 'LMB Groups', shortTitle: 'LMB Grps' },
    { id: 7, title: 'Bill Entry', shortTitle: 'Bills' },
    { id: 8, title: 'Catch-Up', shortTitle: 'Catch-Up' },
    { id: 9, title: 'Review', shortTitle: 'Finish' },
  ];

  // Validation Logic
  const canGoNext = () => {
    if (step === 1) return data.qboConnected;
    if (step === 2) return data.lmbVerified;
    if (step === 3) return data.brands.length > 0;
    if (step === 4) return data.subAccountsCreated;
    if (step === 5) return data.skus.length > 0;
    if (step === 6) return data.lmbGroupsDone.groups && data.lmbGroupsDone.skus && data.lmbGroupsDone.cogsOff;
    if (step === 7) return data.billEntryAck;
    if (step === 8) {
      if (data.catchUpMode === 'none' || data.catchUpMode === 'full') return true;
      if (data.catchUpMode === 'specific') return !!data.catchUpDate;
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (canGoNext()) setStep(prev => prev + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(prev => prev - 1);
  };

  if (completed) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="p-12 text-center max-w-lg">
          <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Check size={48} className="text-green-600" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-4">Setup Complete</h1>
          <p className="text-slate-600 mb-8">
            You are now ready to start using Plutus. Please proceed to the dashboard to view your analytics or upload your first settlement.
          </p>
          <Button onClick={() => window.location.reload()} className="w-full">Go to Dashboard</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col">
      {/* Top Navigation Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold">P</div>
            <span className="font-bold text-xl tracking-tight text-slate-900">Plutus Setup</span>
          </div>
          <div className="text-sm font-medium text-slate-500">
            <span className="hidden sm:inline">Step {step}: </span>
            <span className="text-slate-900 font-semibold">{steps[step - 1].title}</span>
          </div>
        </div>
        {/* Timeline Component */}
        <Timeline steps={steps} currentStep={step} />
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl mx-auto w-full p-4 md:p-8">
        <div className="mb-8">
          {step === 1 && <Step1ConnectQBO data={data} updateData={updateData} />}
          {step === 2 && <Step2VerifyLMB data={data} updateData={updateData} />}
          {step === 3 && <Step3BrandSetup data={data} updateData={updateData} />}
          {step === 4 && <Step4AccountSetup data={data} updateData={updateData} />}
          {step === 5 && <Step5SkuSetup data={data} updateData={updateData} />}
          {step === 6 && <Step6LmbGroups data={data} updateData={updateData} />}
          {step === 7 && <Step7BillEntry data={data} updateData={updateData} />}
          {step === 8 && <Step8CatchUp data={data} updateData={updateData} />}
          {step === 9 && <Step9Review data={data} onComplete={() => setCompleted(true)} />}
        </div>
      </main>

      {/* Footer Actions */}
      <footer className="bg-white border-t border-slate-200 p-4 sticky bottom-0 z-10">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <Button
            variant="secondary"
            onClick={handleBack}
            disabled={step === 1}
            icon={ChevronLeft}
          >
            Back
          </Button>

          {step < 9 && (
            <Button
              onClick={handleNext}
              disabled={!canGoNext()}
              className="px-8"
            >
              Next <ChevronRight size={18} className="ml-2" />
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}mport React, { useState, useEffect } from 'react';
import {
  Check,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  Database,
  Briefcase,
  CreditCard,
  FileText,
  Upload,
  Plus,
  Trash2,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  FileSpreadsheet,
  Search
} from 'lucide-react';

// --- MOCK DATA & CONSTANTS ---

const MARKETPLACES = [
  { id: 'amazon.com', name: 'Amazon.com', currency: 'USD' },
  { id: 'amazon.co.uk', name: 'Amazon.co.uk', currency: 'GBP' },
  { id: 'amazon.ca', name: 'Amazon.ca', currency: 'CAD' },
  { id: 'amazon.de', name: 'Amazon.de', currency: 'EUR' },
];

// Mock Chart of Accounts from QBO
const MOCK_QBO_COA = [
  { id: '101', name: 'Inventory Asset', type: 'Asset' },
  { id: '501', name: 'Cost of Goods Sold', type: 'COGS' },
  { id: '502', name: 'Manufacturing Costs', type: 'COGS' },
  { id: '503', name: 'Freight & Delivery', type: 'COGS' },
  { id: '401', name: 'Sales of Product Income', type: 'Income' },
  { id: '402', name: 'Amazon Sales', type: 'Income' },
  { id: '403', name: 'Amazon Refunds', type: 'Income' },
  { id: '601', name: 'Amazon FBA Fees', type: 'COGS' },
  { id: '602', name: 'Amazon Advertising Costs', type: 'Expense' },
];

// Configuration for required Parent Accounts - Matches "Master Checklist" in Plan
const REQUIRED_PARENTS = [
  // Plutus Core (Inventory/COGS)
  { key: 'inventoryAsset', label: 'Inventory Asset Parent', type: 'Asset', defaultName: 'Inventory Asset' },
  { key: 'manufacturing', label: 'Manufacturing COGS Parent', type: 'COGS', defaultName: 'Manufacturing' },
  { key: 'freightDuty', label: 'Freight & Duty COGS Parent', type: 'COGS', defaultName: 'Freight & Custom Duty' },
  { key: 'landFreight', label: 'Land Freight COGS Parent', type: 'COGS', defaultName: 'Land Freight' },
  { key: 'storage3pl', label: 'Storage 3PL COGS Parent', type: 'COGS', defaultName: 'Storage 3PL' },
  { key: 'mfgAccessories', label: 'Mfg Accessories COGS Parent', type: 'COGS', defaultName: 'Mfg Accessories' },
  { key: 'shrinkage', label: 'Inventory Shrinkage Parent', type: 'COGS', defaultName: 'Inventory Shrinkage' },

  // LMB Targets (Revenue/Fees) - Plutus creates sub-accounts here for LMB to use
  { key: 'amzSales', label: 'Amazon Sales Parent', type: 'Income', defaultName: 'Amazon Sales' },
  { key: 'amzRefunds', label: 'Amazon Refunds Parent', type: 'Income', defaultName: 'Amazon Refunds' },
  { key: 'amzFbaFees', label: 'Amazon FBA Fees Parent', type: 'COGS', defaultName: 'Amazon FBA Fees' },
  { key: 'amzSellerFees', label: 'Amazon Seller Fees Parent', type: 'COGS', defaultName: 'Amazon Seller Fees' },
  { key: 'amzStorageFees', label: 'Amazon Storage Fees Parent', type: 'COGS', defaultName: 'Amazon Storage Fees' },
  { key: 'amzAds', label: 'Amazon Advertising Parent', type: 'COGS', defaultName: 'Amazon Advertising Costs' },
  { key: 'amzPromos', label: 'Amazon Promotions Parent', type: 'COGS', defaultName: 'Amazon Promotions' },
  { key: 'amzReimb', label: 'FBA Inv. Reimbursement Parent', type: 'Income', defaultName: 'Amazon FBA Inventory Reimbursement' },
];

// --- COMPONENTS ---

const Card = ({ children, className = "" }) => (
  <div className={`bg-white rounded-xl border border-slate-200 shadow-sm ${className}`}>
    {children}
  </div>
);

const Button = ({ children, onClick, variant = "primary", disabled = false, icon: Icon, className = "" }) => {
  const baseStyle = "inline-flex items-center justify-center px-4 py-2 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500",
    secondary: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 focus:ring-slate-400",
    danger: "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 focus:ring-red-400",
    ghost: "text-slate-600 hover:bg-slate-100"
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyle} ${variants[variant]} ${className}`}
    >
      {Icon && <Icon size={18} className="mr-2" />}
      {children}
    </button>
  );
};

const Badge = ({ children, variant = "neutral" }) => {
  const variants = {
    success: "bg-emerald-100 text-emerald-800",
    error: "bg-red-100 text-red-800",
    neutral: "bg-slate-100 text-slate-800",
    warning: "bg-amber-100 text-amber-800",
    info: "bg-blue-100 text-blue-800",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variants[variant]}`}>
      {children}
    </span>
  );
};

// --- TIMELINE COMPONENT ---
const Timeline = ({ steps, currentStep }) => {
  return (
    <div className="w-full bg-white border-b border-slate-200 py-4 px-4 overflow-x-auto">
      <div className="max-w-5xl mx-auto flex items-center justify-between min-w-[768px]">
        {steps.map((step, index) => {
          const isCompleted = step.id < currentStep;
          const isCurrent = step.id === currentStep;

          return (
            <div key={step.id} className="flex flex-col items-center relative z-10 group min-w-[60px]">
              {/* Connector Line */}
              {index !== 0 && (
                <div
                  className={`absolute top-3.5 right-[50%] w-[200%] h-0.5 -z-10
                   ${step.id <= currentStep ? 'bg-indigo-600' : 'bg-slate-200'}`}
                />
              )}

              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors
                ${isCompleted ? 'bg-indigo-600 text-white' :
                    isCurrent ? 'bg-white border-2 border-indigo-600 text-indigo-600' :
                      'bg-white border-2 border-slate-200 text-slate-300'}
                `}
              >
                {isCompleted ? <Check size={14} /> : step.id}
              </div>

              <span className={`text-[10px] uppercase tracking-wider font-bold mt-2
                ${isCurrent ? 'text-indigo-600' : isCompleted ? 'text-slate-700' : 'text-slate-400'}`}>
                {step.shortTitle || step.title}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// --- STEPS ---

const Step1ConnectQBO = ({ data, updateData }) => {
  const [loading, setLoading] = useState(false);

  const handleConnect = () => {
    setLoading(true);
    setTimeout(() => {
      updateData({
        qboConnected: true,
        qboCompanyName: 'Targon LLC',
        qboCurrency: 'USD'
      });
      setLoading(false);
    }, 1500);
  };

  if (data.qboConnected) {
    return (
      <Card className="p-8 text-center max-w-2xl mx-auto">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Check size={32} className="text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Connected to QuickBooks</h2>
        <div className="bg-slate-50 rounded-lg p-4 inline-block text-left mb-6 border border-slate-200">
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <span className="text-slate-500">Company:</span>
            <span className="font-semibold text-slate-900">{data.qboCompanyName}</span>
            <span className="text-slate-500">Home Currency:</span>
            <span className="font-semibold text-slate-900">{data.qboCurrency}</span>
          </div>
        </div>
        <div>
          <Button variant="danger" onClick={() => updateData({ qboConnected: false })}>Disconnect</Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-8 max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Database size={32} className="text-slate-500" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Connect QuickBooks</h2>
        <p className="text-slate-600">
          Plutus needs access to your QuickBooks Online account to read your Chart of Accounts,
          process supplier bills, and post COGS journal entries.
        </p>
      </div>

      <div className="flex justify-center">
        <Button
          onClick={handleConnect}
          disabled={loading}
          className="w-full sm:w-auto min-w-[200px]"
        >
          {loading ? 'Connecting...' : 'Connect to QuickBooks'}
        </Button>
      </div>
    </Card>
  );
};

const Step2VerifyLMB = ({ data, updateData }) => {
  return (
    <Card className="p-6 max-w-3xl mx-auto">
      <div className="mb-6 border-l-4 border-amber-500 pl-4 bg-amber-50 p-4 rounded-r-lg">
        <h3 className="font-bold text-amber-900 flex items-center gap-2">
          <AlertCircle size={20} />
          Prerequisite Required
        </h3>
        <p className="text-amber-800 mt-1 text-sm">
          Plutus works alongside Link My Books. You must complete the LMB Accounts & Taxes Setup Wizard BEFORE continuing.
        </p>
      </div>
      <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-1 w-5 h-5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
            checked={data.lmbVerified}
            onChange={(e) => updateData({ lmbVerified: e.target.checked })}
          />
          <span className="text-slate-900 font-medium">
            I have completed the LMB Accounts & Taxes Wizard for all my Amazon connections
          </span>
        </label>
      </div>
    </Card>
  );
};

const Step3BrandSetup = ({ data, updateData }) => {
  const [newBrandName, setNewBrandName] = useState('');
  const [newMarketplace, setNewMarketplace] = useState(MARKETPLACES[0].id);

  const addBrand = () => {
    if (!newBrandName.trim()) return;
    const market = MARKETPLACES.find(m => m.id === newMarketplace);
    const newBrand = {
      id: Date.now().toString(),
      name: newBrandName,
      marketplace: market.id,
      marketplaceName: market.name,
      currency: market.currency
    };
    updateData({ brands: [...data.brands, newBrand] });
    setNewBrandName('');
  };

  const removeBrand = (id) => {
    updateData({ brands: data.brands.filter(b => b.id !== id) });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Card className="p-6">
        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 bg-indigo-50 rounded-lg">
            <Briefcase className="text-indigo-600" size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Brand Setup</h3>
            <p className="text-slate-600 text-sm mt-1">
              Brands let you track P&L separately for different product lines or marketplaces.
              Plutus will create sub-accounts for each brand defined here.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {data.brands.map((brand) => (
            <div key={brand.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div>
                <h4 className="font-bold text-slate-900">{brand.name}</h4>
                <div className="flex items-center gap-3 text-sm text-slate-500 mt-1">
                  <span>{brand.marketplaceName}</span>
                  <span>•</span>
                  <span>{brand.currency}</span>
                </div>
              </div>
              <Button variant="ghost" onClick={() => removeBrand(brand.id)} className="text-red-600 hover:text-red-700 hover:bg-red-50">
                <Trash2 size={18} />
              </Button>
            </div>
          ))}

          {data.brands.length === 0 && (
            <div className="text-center py-8 text-slate-500 italic bg-slate-50 rounded-lg border border-dashed border-slate-300">
              No brands added yet. Add one below.
            </div>
          )}
        </div>
      </Card>

      <Card className="p-6">
        <h4 className="font-semibold text-slate-900 mb-4">Add New Brand</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <label className="block text-xs font-medium text-slate-500 mb-1">Brand Name *</label>
            <input
              type="text"
              value={newBrandName}
              onChange={(e) => setNewBrandName(e.target.value)}
              placeholder="e.g. US-Dust Sheets"
              className="w-full rounded-lg border-slate-300 focus:border-indigo-500 focus:ring-indigo-500"
            />
          </div>
          <div className="md:col-span-1">
            <label className="block text-xs font-medium text-slate-500 mb-1">Marketplace *</label>
            <select
              value={newMarketplace}
              onChange={(e) => setNewMarketplace(e.target.value)}
              className="w-full rounded-lg border-slate-300 focus:border-indigo-500 focus:ring-indigo-500"
            >
              {MARKETPLACES.map(m => (
                <option key={m.id} value={m.id}>{m.name} ({m.currency})</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-1 flex items-end">
            <Button onClick={addBrand} disabled={!newBrandName.trim()} className="w-full" icon={Plus}>Add Brand</Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

const Step4AccountSetup = ({ data, updateData }) => {
  const [mappedParents, setMappedParents] = useState(data.parentMapping || {});
  const [creatingSubs, setCreatingSubs] = useState(false);

  useEffect(() => {
    if (Object.keys(mappedParents).length === 0) {
      const initialMap = {};
      REQUIRED_PARENTS.forEach(rp => {
        const match = MOCK_QBO_COA.find(a => a.name.toLowerCase() === rp.defaultName.toLowerCase());
        initialMap[rp.key] = match ? match.id : 'CREATE_NEW';
      });
      setMappedParents(initialMap);
    }
  }, []);

  const handleParentChange = (key, value) => {
    setMappedParents(prev => ({ ...prev, [key]: value }));
  };

  const createSubAccounts = () => {
    setCreatingSubs(true);
    updateData({ parentMapping: mappedParents });
    setTimeout(() => {
      updateData({ subAccountsCreated: true });
      setCreatingSubs(false);
    }, 2000);
  };

  const getSubAccountsByGroup = (brand) => {
    return {
      assets: [
        { name: `Inv Manufacturing - ${brand.name}`, type: 'Asset' },
        { name: `Inv Freight - ${brand.name}`, type: 'Asset' },
        { name: `Inv Duty - ${brand.name}`, type: 'Asset' },
        { name: `Inv Mfg Accessories - ${brand.name}`, type: 'Asset' },
      ],
      cogsAuto: [
        { name: `Manufacturing - ${brand.name}`, type: 'COGS' },
        { name: `Freight - ${brand.name}`, type: 'COGS' },
        { name: `Duty - ${brand.name}`, type: 'COGS' },
        { name: `Mfg Accessories - ${brand.name}`, type: 'COGS' },
        { name: `Inventory Shrinkage - ${brand.name}`, type: 'COGS' },
      ],
      cogsManual: [
        { name: `Land Freight - ${brand.name}`, type: 'COGS' },
        { name: `Storage 3PL - ${brand.name}`, type: 'COGS' },
      ],
      lmbTargets: [
        { name: `Amazon Sales - ${brand.name}`, type: 'Income' },
        { name: `Amazon Refunds - ${brand.name}`, type: 'Income' },
        { name: `Amazon FBA Fees - ${brand.name}`, type: 'COGS' },
        { name: `Amazon Seller Fees - ${brand.name}`, type: 'COGS' },
        { name: `Amazon Storage Fees - ${brand.name}`, type: 'COGS' },
        { name: `Amazon Advertising Costs - ${brand.name}`, type: 'COGS' },
        { name: `Amazon Promotions - ${brand.name}`, type: 'COGS' },
        { name: `Amazon FBA Inventory Reimbursement - ${brand.name}`, type: 'Income' },
      ]
    };
  };

  if (data.subAccountsCreated) {
    return (
      <Card className="p-8 text-center max-w-2xl mx-auto">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Check size={32} className="text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Accounts Created Successfully</h2>
        <p className="text-slate-600 mb-6">
          Plutus has configured your Chart of Accounts. All necessary sub-accounts are ready.
        </p>
        <div className="bg-slate-50 p-4 rounded-lg inline-block text-sm text-slate-500">
          <p>Total sub-accounts created: <strong>{data.brands.length * 19}</strong></p>
        </div>
      </Card>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Parent Account Mapping Section */}
      <Card className="p-6">
        <div className="mb-6">
          <h3 className="text-lg font-bold text-slate-900">Map Parent Accounts</h3>
          <p className="text-sm text-slate-600 mt-1">
            Plutus creates sub-accounts under these parents. Please select the correct parent account from your QBO.
            If the account doesn't exist, select "Create New".
          </p>
        </div>

        <div className="space-y-6">
          {['Asset', 'COGS', 'Income'].map(type => (
            <div key={type} className="border-t border-slate-100 pt-4 first:pt-0">
              <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">{type} Accounts</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {REQUIRED_PARENTS.filter(rp => rp.type === type).map((rp) => (
                  <div key={rp.key}>
                    <label className="block text-xs font-medium text-slate-700 mb-1">{rp.label}</label>
                    <select
                      className="w-full rounded-md border-slate-300 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                      value={mappedParents[rp.key] || 'CREATE_NEW'}
                      onChange={(e) => handleParentChange(rp.key, e.target.value)}
                    >
                      <option value="CREATE_NEW" className="font-semibold text-indigo-600">
                        [+] Create New: "{rp.defaultName}"
                      </option>
                      {MOCK_QBO_COA.filter(a => a.type === rp.type || (rp.type === 'COGS' && a.type === 'Expense')).map(a => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Sub Accounts Section - WITH VISUAL GROUPING */}
      <Card className="p-6">
        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 bg-indigo-50 rounded-lg">
            <CreditCard className="text-indigo-600" size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Review Sub-Accounts</h3>
            <p className="text-slate-600 text-sm mt-1">
              Plutus will create these sub-accounts. The responsibility split is shown below.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {data.brands.map(brand => {
            const groups = getSubAccountsByGroup(brand);
            return (
              <div key={brand.id} className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-slate-100 p-3 border-b border-slate-200 font-semibold text-slate-700">
                  {brand.name}
                </div>
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">

                  {/* Left Column: Plutus Managed */}
                  <div className="space-y-4">
                    <div>
                      <h5 className="text-xs font-bold text-indigo-600 uppercase mb-2 flex items-center gap-1">
                        <RefreshCw size={12} /> Inventory Assets (Plutus)
                      </h5>
                      <ul className="text-xs space-y-1 text-slate-600">
                        {groups.assets.map((a, i) => <li key={i}>{a.name}</li>)}
                      </ul>
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-indigo-600 uppercase mb-2 flex items-center gap-1">
                        <RefreshCw size={12} /> COGS - Automated (Plutus)
                      </h5>
                      <ul className="text-xs space-y-1 text-slate-600">
                        {groups.cogsAuto.map((a, i) => <li key={i}>{a.name}</li>)}
                      </ul>
                    </div>
                  </div>

                  {/* Right Column: Manual + LMB */}
                  <div className="space-y-4">
                    <div>
                      <h5 className="text-xs font-bold text-amber-600 uppercase mb-2 flex items-center gap-1">
                        <FileText size={12} /> COGS - Manual Entry
                      </h5>
                      <ul className="text-xs space-y-1 text-slate-600">
                        {groups.cogsManual.map((a, i) => <li key={i}>{a.name}</li>)}
                      </ul>
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-emerald-600 uppercase mb-2 flex items-center gap-1">
                        <ExternalLink size={12} /> LMB Targets (Revenue/Fees)
                      </h5>
                      <ul className="text-xs space-y-1 text-slate-600">
                        {groups.lmbTargets.map((a, i) => <li key={i}>{a.name}</li>)}
                      </ul>
                    </div>
                  </div>

                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-8 pt-6 border-t border-slate-200 flex flex-col items-center">
          <Button onClick={createSubAccounts} disabled={creatingSubs} className="w-full sm:w-auto min-w-[250px]">
            {creatingSubs ? 'Creating Accounts in QBO...' : 'Confirm & Create Accounts'}
          </Button>
        </div>
      </Card>
    </div>
  );
};

const Step5SkuSetup = ({ data, updateData }) => {
  const [showModal, setShowModal] = useState(false);
  const [newSku, setNewSku] = useState({ sku: '', name: '', brandId: '', asin: '' });

  const handleAddSku = () => {
    if (!newSku.sku || !newSku.brandId) return;
    updateData({ skus: [...data.skus, { ...newSku, id: Date.now().toString() }] });
    setNewSku({ sku: '', name: '', brandId: '', asin: '' });
    setShowModal(false);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <Card className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-lg font-bold text-slate-900">SKU Setup</h3>
            <p className="text-sm text-slate-600">Assign your product SKUs to brands.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" icon={Upload}>Bulk Import</Button>
            <Button icon={Plus} onClick={() => setShowModal(true)}>Add SKU</Button>
          </div>
        </div>

        <div className="mb-4 bg-blue-50 text-blue-800 p-3 rounded-lg text-sm flex items-start gap-2">
          <AlertCircle size={16} className="mt-0.5" />
          <p>You do not need to enter costs here. Plutus calculates unit costs automatically from your supplier bills.</p>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 font-medium">
              <tr>
                <th className="p-3 border-b">SKU</th>
                <th className="p-3 border-b">Product Name</th>
                <th className="p-3 border-b">Brand</th>
                <th className="p-3 border-b">ASIN</th>
                <th className="p-3 border-b text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.skus.length === 0 ? (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-slate-500 italic">No SKUs added yet.</td>
                </tr>
              ) : (
                data.skus.map(sku => {
                  const brand = data.brands.find(b => b.id === sku.brandId);
                  return (
                    <tr key={sku.id} className="hover:bg-slate-50">
                      <td className="p-3 border-b font-medium">{sku.sku}</td>
                      <td className="p-3 border-b">{sku.name}</td>
                      <td className="p-3 border-b"><Badge>{brand?.name || 'Unknown'}</Badge></td>
                      <td className="p-3 border-b text-slate-500">{sku.asin || '-'}</td>
                      <td className="p-3 border-b text-right">
                        <button onClick={() => updateData({ skus: data.skus.filter(s => s.id !== sku.id) })} className="text-red-500 hover:text-red-700">
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-4 text-sm text-slate-500 text-right">Total: {data.skus.length} SKUs</div>
      </Card>

      {/* Simple Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md p-6">
            <h3 className="text-lg font-bold mb-4">Add SKU</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">SKU *</label>
                <input
                  type="text"
                  value={newSku.sku}
                  onChange={e => setNewSku({ ...newSku, sku: e.target.value })}
                  className="w-full rounded-lg border-slate-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Product Name</label>
                <input
                  type="text"
                  value={newSku.name}
                  onChange={e => setNewSku({ ...newSku, name: e.target.value })}
                  className="w-full rounded-lg border-slate-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Brand *</label>
                <select
                  value={newSku.brandId}
                  onChange={e => setNewSku({ ...newSku, brandId: e.target.value })}
                  className="w-full rounded-lg border-slate-300"
                >
                  <option value="">Select Brand...</option>
                  {data.brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">ASIN (Optional)</label>
                <input
                  type="text"
                  value={newSku.asin}
                  onChange={e => setNewSku({ ...newSku, asin: e.target.value })}
                  className="w-full rounded-lg border-slate-300"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="secondary" onClick={() => setShowModal(false)} className="flex-1">Cancel</Button>
                <Button onClick={handleAddSku} disabled={!newSku.sku || !newSku.brandId} className="flex-1">Save SKU</Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

const Step6LmbGroups = ({ data, updateData }) => {
  return (
    <Card className="p-6 max-w-3xl mx-auto">
      <div className="mb-6 bg-slate-50 border border-slate-200 p-4 rounded-lg flex items-start gap-3">
        <ExternalLink className="text-slate-500 mt-1" size={20} />
        <div>
          <h3 className="font-bold text-slate-900">External Configuration Required</h3>
          <p className="text-sm text-slate-600 mt-1">
            This step is completed in <strong>Link My Books</strong>, not Plutus.
            You need to create Product Groups in LMB and map them to the brand sub-accounts we just created.
          </p>
        </div>
      </div>

      <div className="space-y-6 mb-8">
        <h4 className="font-semibold text-slate-900 border-b pb-2">Checklist for EACH LMB Connection:</h4>

        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600 shrink-0">1</div>
            <div>
              <p className="font-medium text-slate-900 text-sm">Create Product Group</p>
              <p className="text-xs text-slate-500">Name it exactly like your brand (e.g., "US-Dust Sheets")</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600 shrink-0">2</div>
            <div>
              <p className="font-medium text-slate-900 text-sm">Map Accounts</p>
              <p className="text-xs text-slate-500">Select the specific brand sub-accounts (e.g., "Amazon Sales - US-Dust Sheets")</p>
              <div className="mt-2 p-2 bg-red-50 text-red-800 text-xs rounded font-medium inline-block">
                ⚠️ Important: Set COGS to OFF in LMB. Plutus handles COGS.
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600 shrink-0">3</div>
            <div>
              <p className="font-medium text-slate-900 text-sm">Assign SKUs</p>
              <p className="text-xs text-slate-500">Add the correct SKUs to the group.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3 bg-slate-50 p-4 rounded-lg border border-slate-200">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={data.lmbGroupsDone.groups}
            onChange={e => updateData({ lmbGroupsDone: { ...data.lmbGroupsDone, groups: e.target.checked } })}
            className="w-4 h-4 text-indigo-600 rounded"
          />
          <span className="text-sm font-medium">I have created Product Groups for all my brands</span>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={data.lmbGroupsDone.skus}
            onChange={e => updateData({ lmbGroupsDone: { ...data.lmbGroupsDone, skus: e.target.checked } })}
            className="w-4 h-4 text-indigo-600 rounded"
          />
          <span className="text-sm font-medium">I have assigned all SKUs to their Product Groups</span>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={data.lmbGroupsDone.cogsOff}
            onChange={e => updateData({ lmbGroupsDone: { ...data.lmbGroupsDone, cogsOff: e.target.checked } })}
            className="w-4 h-4 text-indigo-600 rounded"
          />
          <span className="text-sm font-medium">I have set COGS to OFF in LMB</span>
        </label>
      </div>
    </Card>
  );
};

const Step7BillEntry = ({ data, updateData }) => {
  return (
    <Card className="p-6 max-w-3xl mx-auto">
      <div className="flex items-start gap-4 mb-6">
        <div className="p-3 bg-indigo-50 rounded-lg">
          <FileText className="text-indigo-600" size={24} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-900">Bill Entry Guidelines</h3>
          <p className="text-slate-600 text-sm mt-1">
            Plutus links supplier bills (Mfg, Freight, Duty) together using the PO Number.
          </p>
        </div>
      </div>

      <div className="bg-slate-900 text-slate-200 p-6 rounded-lg font-mono text-sm mb-6 shadow-sm">
        <div className="text-slate-400 mb-2">// REQUIRED FORMAT FOR BILL MEMO</div>
        <div className="text-xl font-bold text-white mb-2">PO: PO-2026-001</div>
        <ul className="text-xs space-y-1 text-slate-400 list-disc list-inside">
          <li>Start with "PO: " (including the space)</li>
          <li>Follow with your PO number</li>
          <li>Keep exactly this format - no extra text</li>
        </ul>
      </div>

      <div className="bg-white border border-slate-200 p-4 rounded-lg mb-8">
        <h4 className="font-bold text-slate-900 text-sm mb-2">Example: Manufacturing Bill</h4>
        <div className="text-sm text-slate-600 space-y-1">
          <p>1. Create Bill in QBO</p>
          <p>2. Vendor: Shenzhen Manufacturing Co</p>
          <p>3. <strong>Memo: PO: PO-2026-001</strong></p>
          <p>4. Account: <span className="font-mono text-xs bg-slate-100 p-1 rounded">Inv Manufacturing - US-Dust Sheets</span></p>
        </div>
      </div>

      <label className="flex items-center gap-3 cursor-pointer p-4 bg-slate-50 rounded-lg border border-slate-200">
        <input
          type="checkbox"
          checked={data.billEntryAck}
          onChange={e => updateData({ billEntryAck: e.target.checked })}
          className="w-5 h-5 text-indigo-600 rounded"
        />
        <span className="text-slate-900 font-medium">
          I understand how to enter bills with the PO memo format
        </span>
      </label>
    </Card>
  );
};

const Step8CatchUp = ({ data, updateData }) => {
  return (
    <Card className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="mb-4">
        <h3 className="text-lg font-bold text-slate-900">Historical Catch-Up</h3>
        <p className="text-sm text-slate-600">
          Plutus maintains a strict audit trail. Every inventory movement must be linked to a source document.
          No arbitrary opening balances are allowed.
        </p>
      </div>

      <div className="grid gap-4">
        {/* Option 1: Just Starting */}
        <label className={`block p-4 border rounded-lg cursor-pointer transition-all ${data.catchUpMode === 'none' ? 'border-indigo-600 ring-1 ring-indigo-600 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300'}`}>
          <div className="flex items-center gap-3">
            <input
              type="radio"
              name="catchup"
              value="none"
              checked={data.catchUpMode === 'none'}
              onChange={e => updateData({ catchUpMode: e.target.value })}
              className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <span className="block font-bold text-slate-900">I'm just starting (no historical data)</span>
              <span className="block text-sm text-slate-500">Plutus will process settlements as they come. No catch-up needed.</span>
            </div>
          </div>
        </label>

        {/* Option 2: Specific Date */}
        <label className={`block p-4 border rounded-lg cursor-pointer transition-all ${data.catchUpMode === 'specific' ? 'border-indigo-600 ring-1 ring-indigo-600 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300'}`}>
          <div className="flex items-center gap-3">
            <input
              type="radio"
              name="catchup"
              value="specific"
              checked={data.catchUpMode === 'specific'}
              onChange={e => updateData({ catchUpMode: e.target.value })}
              className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <span className="block font-bold text-slate-900">Catch up from a specific date</span>
              <span className="block text-sm text-slate-500">Requires an opening inventory snapshot (Amazon report + Valuation).</span>
            </div>
          </div>
        </label>

        {/* Option 3: Full History */}
        <label className={`block p-4 border rounded-lg cursor-pointer transition-all ${data.catchUpMode === 'full' ? 'border-indigo-600 ring-1 ring-indigo-600 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300'}`}>
          <div className="flex items-center gap-3">
            <input
              type="radio"
              name="catchup"
              value="full"
              checked={data.catchUpMode === 'full'}
              onChange={e => updateData({ catchUpMode: e.target.value })}
              className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <span className="block font-bold text-slate-900">Catch up from the beginning</span>
              <span className="block text-sm text-slate-500">Process ALL historical bills and settlements. Most accurate, but more work.</span>
            </div>
          </div>
        </label>
      </div>

      {/* Conditional UI for Specific Date */}
      {data.catchUpMode === 'specific' && (
        <div className="mt-6 border-t border-slate-200 pt-6 animate-in fade-in slide-in-from-top-4">
          <h4 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
            <FileSpreadsheet size={18} /> Opening Inventory Snapshot
          </h4>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Start Date</label>
              <input
                type="date"
                value={data.catchUpDate}
                onChange={e => updateData({ catchUpDate: e.target.value })}
                className="rounded-lg border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-lg">
              <p className="text-sm font-medium mb-2">1. Upload Amazon Inventory Report</p>
              <input type="file" className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" />
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-lg">
              <p className="text-sm font-medium mb-2">2. Valuation Source</p>
              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <input type="radio" name="valSource" className="text-indigo-600" />
                  <span className="text-sm">Compute from historical bills in QBO</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="valSource" className="text-indigo-600" />
                  <span className="text-sm">Use accountant's valuation (Upload Excel)</span>
                </label>
              </div>
            </div>

            <div className="bg-amber-50 p-3 rounded text-xs text-amber-800 border border-amber-100">
              ⚠️ <strong>Initialization JE Required:</strong> Your QBO inventory sub-accounts are at $0. Plutus will help you create an opening journal entry to prevent negative balances.
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

const Step9Review = ({ data, onComplete }) => {
  return (
    <Card className="p-8 max-w-2xl mx-auto text-center">
      <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
        <Check size={40} className="text-white" />
      </div>

      <h2 className="text-3xl font-bold text-slate-900 mb-2">Setup Almost Complete!</h2>
      <p className="text-slate-600 mb-8">
        You've configured Plutus successfully. Review your setup below before finishing.
      </p>

      <div className="text-left bg-slate-50 rounded-xl p-6 border border-slate-200 shadow-sm mb-8 space-y-4">
        <ReviewItem label="QuickBooks" value={`Connected to ${data.qboCompanyName}`} />
        <ReviewItem label="LMB Setup" value="Acknowledged" />
        <ReviewItem label="Brands Configured" value={data.brands.map(b => b.name).join(', ')} />
        <ReviewItem label="Accounts Created" value={`${data.brands.length * 19} Sub-Accounts`} />
        <ReviewItem label="SKUs Added" value={`${data.skus.length} SKUs`} />
        <ReviewItem label="Catch-Up Mode" value={data.catchUpMode === 'none' ? 'Just Starting' : data.catchUpMode === 'specific' ? `From ${data.catchUpDate}` : 'Full History'} />
      </div>

      <Button onClick={onComplete} className="w-full py-3 text-lg">
        Complete Setup
      </Button>
    </Card>
  );
};

const ReviewItem = ({ label, value }) => (
  <div className="flex justify-between items-center text-sm border-b border-slate-200 last:border-0 pb-2 last:pb-0">
    <span className="text-slate-500 font-medium">{label}</span>
    <span className="text-slate-900 font-bold">{value}</span>
  </div>
);

// --- MAIN WIZARD COMPONENT ---

export default function PlutusSetupWizard() {
  const [step, setStep] = useState(1);
  const [completed, setCompleted] = useState(false);

  // Wizard State
  const [data, setData] = useState({
    // Step 1
    qboConnected: false,
    qboCompanyName: '',
    qboCurrency: '',
    // Step 2
    lmbVerified: false,
    // Step 3
    brands: [
      // Pre-filling typical user data for demo purposes, usually starts empty
      { id: '1', name: 'US-Dust Sheets', marketplace: 'amazon.com', marketplaceName: 'Amazon.com', currency: 'USD' },
      { id: '2', name: 'UK-Dust Sheets', marketplace: 'amazon.co.uk', marketplaceName: 'Amazon.co.uk', currency: 'GBP' }
    ],
    // Step 4
    parentMapping: {}, // New: stores user selected parent IDs
    subAccountsCreated: false,
    // Step 5
    skus: [],
    // Step 6
    lmbGroupsDone: { groups: false, skus: false, cogsOff: false },
    // Step 7
    billEntryAck: false,
    // Step 8
    catchUpMode: 'none', // none, specific, full
    catchUpDate: '',
  });

  const updateData = (newData) => {
    setData(prev => ({ ...prev, ...newData }));
  };

  const steps = [
    { id: 1, title: 'Connect QBO', shortTitle: 'Connect' },
    { id: 2, title: 'Verify LMB', shortTitle: 'LMB Base' },
    { id: 3, title: 'Brands', shortTitle: 'Brands' },
    { id: 4, title: 'Accounts', shortTitle: 'Accounts' },
    { id: 5, title: 'SKUs', shortTitle: 'SKUs' },
    { id: 6, title: 'LMB Groups', shortTitle: 'LMB Grps' },
    { id: 7, title: 'Bill Entry', shortTitle: 'Bills' },
    { id: 8, title: 'Catch-Up', shortTitle: 'Catch-Up' },
    { id: 9, title: 'Review', shortTitle: 'Finish' },
  ];

  // Validation Logic
  const canGoNext = () => {
    if (step === 1) return data.qboConnected;
    if (step === 2) return data.lmbVerified;
    if (step === 3) return data.brands.length > 0;
    if (step === 4) return data.subAccountsCreated;
    if (step === 5) return data.skus.length > 0;
    if (step === 6) return data.lmbGroupsDone.groups && data.lmbGroupsDone.skus && data.lmbGroupsDone.cogsOff;
    if (step === 7) return data.billEntryAck;
    if (step === 8) {
      if (data.catchUpMode === 'none' || data.catchUpMode === 'full') return true;
      if (data.catchUpMode === 'specific') return !!data.catchUpDate;
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (canGoNext()) setStep(prev => prev + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(prev => prev - 1);
  };

  if (completed) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="p-12 text-center max-w-lg">
          <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Check size={48} className="text-green-600" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-4">Setup Complete</h1>
          <p className="text-slate-600 mb-8">
            You are now ready to start using Plutus. Please proceed to the dashboard to view your analytics or upload your first settlement.
          </p>
          <Button onClick={() => window.location.reload()} className="w-full">Go to Dashboard</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col">
      {/* Top Navigation Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold">P</div>
            <span className="font-bold text-xl tracking-tight text-slate-900">Plutus Setup</span>
          </div>
          <div className="text-sm font-medium text-slate-500">
            <span className="hidden sm:inline">Step {step}: </span>
            <span className="text-slate-900 font-semibold">{steps[step - 1].title}</span>
          </div>
        </div>
        {/* Timeline Component */}
        <Timeline steps={steps} currentStep={step} />
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl mx-auto w-full p-4 md:p-8">
        <div className="mb-8">
          {step === 1 && <Step1ConnectQBO data={data} updateData={updateData} />}
          {step === 2 && <Step2VerifyLMB data={data} updateData={updateData} />}
          {step === 3 && <Step3BrandSetup data={data} updateData={updateData} />}
          {step === 4 && <Step4AccountSetup data={data} updateData={updateData} />}
          {step === 5 && <Step5SkuSetup data={data} updateData={updateData} />}
          {step === 6 && <Step6LmbGroups data={data} updateData={updateData} />}
          {step === 7 && <Step7BillEntry data={data} updateData={updateData} />}
          {step === 8 && <Step8CatchUp data={data} updateData={updateData} />}
          {step === 9 && <Step9Review data={data} onComplete={() => setCompleted(true)} />}
        </div>
      </main>

      {/* Footer Actions */}
      <footer className="bg-white border-t border-slate-200 p-4 sticky bottom-0 z-10">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <Button
            variant="secondary"
            onClick={handleBack}
            disabled={step === 1}
            icon={ChevronLeft}
          >
            Back
          </Button>

          {step < 9 && (
            <Button
              onClick={handleNext}
              disabled={!canGoNext()}
              className="px-8"
            >
              Next <ChevronRight size={18} className="ml-2" />
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}
