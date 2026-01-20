// QBO OAuth Token
export interface QboToken {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  expiresAt: Date;
  realmId: string;
}

// QBO Company Info
export interface QboCompanyInfo {
  CompanyName: string;
  LegalName?: string;
  Country?: string;
  FiscalYearStartMonth?: string;
  CompanyAddr?: {
    Country?: string;
  };
  // QBO returns the home currency in the MetaData or via Preferences
  // However, the easiest place to get it is from the Preferences endpoint or CompanyCurrency
  // For simplicity, we'll add subscription level from the Preferences API
}

// QBO Subscription info from Preferences
export interface QboPreferences {
  AccountingInfoPrefs?: {
    BookCloseDate?: string;
    ClassTrackingPerTxnLine?: boolean;
    ClassTrackingPerTxn?: boolean;
    DepositToAccountsEnabled?: boolean;
    TrackDepartments?: boolean;
  };
  CurrencyPrefs?: {
    HomeCurrency?: {
      value: string;
      name?: string;
    };
    MultiCurrencyEnabled?: boolean;
  };
  ProductAndServicesPrefs?: {
    ForSales?: boolean;
    ForPurchase?: boolean;
    QuantityWithPriceAndRate?: boolean;
    QuantityOnHand?: boolean;
  };
}

// QBO Account
export interface QboAccount {
  Id: string;
  Name: string;
  FullyQualifiedName?: string;
  AccountType: string;
  AccountSubType?: string;
  Classification?: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';
  CurrentBalance?: number;
  Active: boolean;
}

// QBO Query Response (base interface)
export interface QboQueryResponseBase {
  QueryResponse: {
    startPosition?: number;
    maxResults?: number;
    totalCount?: number;
  };
  time: string;
}

// QBO Company Info Query Response
export interface QboCompanyInfoResponse extends QboQueryResponseBase {
  QueryResponse: QboQueryResponseBase['QueryResponse'] & {
    CompanyInfo?: QboCompanyInfo[];
  };
}

// QBO Account Query Response
export interface QboAccountResponse extends QboQueryResponseBase {
  QueryResponse: QboQueryResponseBase['QueryResponse'] & {
    Account?: QboAccount[];
  };
}

// QBO Invoice Query Response
export interface QboInvoiceResponse extends QboQueryResponseBase {
  QueryResponse: QboQueryResponseBase['QueryResponse'] & {
    Invoice?: QboInvoice[];
  };
}

// QBO Bill Query Response
export interface QboBillResponse extends QboQueryResponseBase {
  QueryResponse: QboQueryResponseBase['QueryResponse'] & {
    Bill?: QboBill[];
  };
}

// QBO Invoice
export interface QboInvoice {
  Id: string;
  DocNumber?: string;
  TxnDate: string;
  DueDate?: string;
  TotalAmt: number;
  Balance?: number;
  CustomerRef?: {
    value: string;
    name: string;
  };
  Line?: QboLine[];
}

// QBO Bill
export interface QboBill {
  Id: string;
  DocNumber?: string;
  TxnDate: string;
  DueDate?: string;
  TotalAmt: number;
  Balance?: number;
  VendorRef?: {
    value: string;
    name: string;
  };
  Line?: QboLine[];
}

// QBO Line Item
export interface QboLine {
  Id?: string;
  LineNum?: number;
  Description?: string;
  Amount: number;
  DetailType: string;
  AccountBasedExpenseLineDetail?: {
    AccountRef: {
      value: string;
      name: string;
    };
  };
  SalesItemLineDetail?: {
    ItemRef?: {
      value: string;
      name: string;
    };
    Qty?: number;
    UnitPrice?: number;
  };
}

// Connection status for UI
export interface QboConnectionStatus {
  connected: boolean;
  realmId?: string;
  companyName?: string;
  homeCurrency?: string;
  subscription?: string;
  lastSyncAt?: Date;
  error?: string;
}
