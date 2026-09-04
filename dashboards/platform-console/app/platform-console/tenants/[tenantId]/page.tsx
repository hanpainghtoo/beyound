import { redirect } from "next/navigation"

export default async function TenantDetailRedirectPage({
  params,
}: {
  params: Promise<{ tenantId: string }>
}) {
  const { tenantId } = await params
  redirect(`/platform-console/merchants/${tenantId}`)
}
