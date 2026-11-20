import { FinancialStatements } from "@/components/company/financial-statements";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <FinancialStatements slug={slug} />;
}