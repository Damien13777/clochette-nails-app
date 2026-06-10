/**
 * Types partagés du module facturation. Les shapes JSON (sellerSnapshot,
 * lines, payments) stockées dans Invoice sont définies ici — toute évolution
 * doit rester rétro-compatible (les factures émises sont immuables).
 */

export type InvoiceLine = {
  label: string;
  quantity: number;
  unitCents: number;
  totalCents: number;
};

export type InvoicePayment = {
  label: string;
  amountCents: number;
};

export type SellerSnapshot = {
  headerName: string;
  legalOwner: string | null;
  address: string | null;
  siret: string | null;
  contactEmail: string;
  contactPhone: string | null;
  vatMention: string;
  legalFooter: string | null;
  logoUrl: string | null;
  vatEnabled: boolean;
  vatRate: number;
};

export type InvoicePdfData = {
  number: string;
  docType: "INVOICE" | "CREDIT_NOTE";
  issuedAt: Date;
  serviceDate: Date | null;
  seller: SellerSnapshot;
  logoPng: Buffer | null;
  customerName: string;
  customerEmail: string;
  lines: InvoiceLine[];
  payments: InvoicePayment[];
  totalCents: number;
  parentNumber: string | null;
};
