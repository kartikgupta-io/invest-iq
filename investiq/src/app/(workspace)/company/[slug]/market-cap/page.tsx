import { FinancialsPage } from "@/components/company/financials-page";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <FinancialsPage slug={slug} metric="market-cap" />;
}