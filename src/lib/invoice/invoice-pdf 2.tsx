/**
 * Template PDF facture/avoir — @react-pdf/renderer, A4.
 * Conformité : numéro, dates, vendeur (EI + SIRET), cliente, décompte
 * détaillé, total TTC, mention TVA (ou colonnes HT/TVA/TTC si vatEnabled,
 * dérivées du vatRate snapshoté), mentions légales libres en pied.
 */

import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { InvoicePdfData } from "./types";

const INK = "#1a1a1a";
const MUTED = "#6b6b6b";
const LINE = "#d9d4cc";
const ACCENT = "#6d5a8f";

const s = StyleSheet.create({
  page: { padding: 48, fontSize: 9, fontFamily: "Helvetica", color: INK },
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 28 },
  logo: { height: 42, objectFit: "contain", alignSelf: "flex-start", marginBottom: 10 },
  headerName: { fontSize: 15, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  sellerLine: { fontSize: 8, color: MUTED, lineHeight: 1.5 },
  docBox: { alignItems: "flex-end" },
  docTitle: { fontSize: 16, fontFamily: "Helvetica-Bold", color: ACCENT, marginBottom: 4 },
  docMeta: { fontSize: 9, color: MUTED, lineHeight: 1.6, textAlign: "right" },
  customerBox: {
    alignSelf: "flex-end",
    minWidth: 200,
    border: `1pt solid ${LINE}`,
    borderRadius: 4,
    padding: 10,
    marginBottom: 24,
  },
  customerLabel: { fontSize: 7, color: MUTED, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  table: { marginBottom: 16 },
  thRow: { flexDirection: "row", borderBottom: `1pt solid ${INK}`, paddingBottom: 5, marginBottom: 2 },
  tdRow: { flexDirection: "row", borderBottom: `0.5pt solid ${LINE}`, paddingVertical: 6 },
  th: { fontSize: 7, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.8, color: MUTED },
  colLabel: { flex: 5 },
  colQty: { flex: 1, textAlign: "right" },
  colNum: { flex: 2, textAlign: "right" },
  totalRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 10 },
  totalBox: { backgroundColor: "#f4f1ea", borderRadius: 4, padding: 12, minWidth: 200 },
  totalLine: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  totalLabel: { fontSize: 8, color: MUTED },
  totalValue: { fontSize: 8 },
  totalMain: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  payTitle: { fontSize: 7, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 1, color: MUTED, marginTop: 20, marginBottom: 6 },
  payRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, borderBottom: `0.5pt solid ${LINE}`, maxWidth: 280 },
  vatMention: { fontSize: 8, color: MUTED, marginTop: 18, fontFamily: "Helvetica-Oblique" },
  creditRef: { fontSize: 9, color: ACCENT, marginBottom: 14 },
  footer: {
    position: "absolute",
    bottom: 36,
    left: 48,
    right: 48,
    borderTop: `0.5pt solid ${LINE}`,
    paddingTop: 8,
  },
  footerText: { fontSize: 6.5, color: MUTED, lineHeight: 1.5, textAlign: "center" },
});

function euros(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}

function dateFr(d: Date): string {
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Paris",
  });
}

export async function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  const isCreditNote = data.docType === "CREDIT_NOTE";
  const vat = data.seller.vatEnabled;
  const rate = data.seller.vatRate;
  const ht = (ttc: number) => Math.round(ttc / (1 + rate / 100));
  const totalHt = ht(data.totalCents);

  const doc = (
    <Document title={data.number} author={data.seller.headerName}>
      <Page size="A4" style={s.page}>
        <View style={s.headerRow}>
          <View style={{ maxWidth: 280 }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- Image react-pdf (primitive PDF, pas de prop alt) */}
            {data.logoPng ? <Image src={data.logoPng} style={s.logo} /> : null}
            <Text style={s.headerName}>{data.seller.headerName}</Text>
            {data.seller.legalOwner ? <Text style={s.sellerLine}>{data.seller.legalOwner}</Text> : null}
            {data.seller.address
              ? data.seller.address.split("\n").map((l, i) => (
                  <Text key={i} style={s.sellerLine}>
                    {l}
                  </Text>
                ))
              : null}
            {data.seller.siret ? <Text style={s.sellerLine}>SIRET : {data.seller.siret}</Text> : null}
            <Text style={s.sellerLine}>
              {data.seller.contactEmail}
              {data.seller.contactPhone ? ` · ${data.seller.contactPhone}` : ""}
            </Text>
          </View>
          <View style={s.docBox}>
            <Text style={s.docTitle}>{isCreditNote ? "AVOIR" : "FACTURE"}</Text>
            <Text style={s.docMeta}>N° {data.number}</Text>
            <Text style={s.docMeta}>Émise le {dateFr(data.issuedAt)}</Text>
            {data.serviceDate ? <Text style={s.docMeta}>Prestation du {dateFr(data.serviceDate)}</Text> : null}
          </View>
        </View>

        <View style={s.customerBox}>
          <Text style={s.customerLabel}>{isCreditNote ? "Avoir établi pour" : "Facturé à"}</Text>
          <Text>{data.customerName}</Text>
          <Text style={s.sellerLine}>{data.customerEmail}</Text>
        </View>

        {isCreditNote && data.parentNumber ? (
          <Text style={s.creditRef}>
            Annule (partiellement ou totalement) la facture {data.parentNumber}.
          </Text>
        ) : null}

        <View style={s.table}>
          <View style={s.thRow}>
            <Text style={[s.th, s.colLabel]}>Désignation</Text>
            <Text style={[s.th, s.colQty]}>Qté</Text>
            <Text style={[s.th, s.colNum]}>{vat ? "PU HT" : "PU TTC"}</Text>
            {vat ? <Text style={[s.th, s.colNum]}>TVA</Text> : null}
            <Text style={[s.th, s.colNum]}>Total TTC</Text>
          </View>
          {data.lines.map((l, i) => (
            <View key={i} style={s.tdRow}>
              <Text style={s.colLabel}>{l.label}</Text>
              <Text style={s.colQty}>{l.quantity}</Text>
              <Text style={s.colNum}>{euros(vat ? ht(l.unitCents) : l.unitCents)}</Text>
              {vat ? <Text style={s.colNum}>{rate.toLocaleString("fr-FR")} %</Text> : null}
              <Text style={s.colNum}>{euros(l.totalCents)}</Text>
            </View>
          ))}
        </View>

        <View style={s.totalRow}>
          <View style={s.totalBox}>
            {vat ? (
              <>
                <View style={s.totalLine}>
                  <Text style={s.totalLabel}>Total HT</Text>
                  <Text style={s.totalValue}>{euros(totalHt)}</Text>
                </View>
                <View style={s.totalLine}>
                  <Text style={s.totalLabel}>TVA ({rate.toLocaleString("fr-FR")} %)</Text>
                  <Text style={s.totalValue}>{euros(data.totalCents - totalHt)}</Text>
                </View>
              </>
            ) : null}
            <View style={s.totalLine}>
              <Text style={s.totalMain}>{isCreditNote ? "Total remboursé" : "Total TTC"}</Text>
              <Text style={s.totalMain}>{euros(data.totalCents)}</Text>
            </View>
          </View>
        </View>

        <Text style={s.payTitle}>{isCreditNote ? "Remboursement" : "Règlements"}</Text>
        {data.payments.map((p, i) => (
          <View key={i} style={s.payRow}>
            <Text>{p.label}</Text>
            <Text>{euros(p.amountCents)}</Text>
          </View>
        ))}

        {!vat ? <Text style={s.vatMention}>{data.seller.vatMention}</Text> : null}

        <View style={s.footer} fixed>
          {data.seller.legalFooter
            ? data.seller.legalFooter.split("\n").map((l, i) => (
                <Text key={i} style={s.footerText}>
                  {l}
                </Text>
              ))
            : null}
        </View>
      </Page>
    </Document>
  );

  return Buffer.from(await renderToBuffer(doc));
}
