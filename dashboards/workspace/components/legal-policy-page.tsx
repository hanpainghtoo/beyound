import { MarketingShell } from "@/components/marketing-shell"
import { cn } from "@/lib/utils"
import type { PublicLegalPolicy } from "@/lib/public-legal-policies"

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(value))
}

type PolicySection = {
  heading?: string
  paragraphs: string[]
}

// Parses the policy's plain-text content (blocks separated by blank lines)
// into sections. A short single-line block is treated as a section heading;
// longer blocks become body paragraphs attached to the current section.
// A leading block that just repeats the page title is dropped.
function parsePolicySections(content: string, title: string): PolicySection[] {
  const blocks = content
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)

  const sections: PolicySection[] = []
  const titleLower = title.toLowerCase()

  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean)
    const isHeading = lines.length === 1 && lines[0].length <= 70 && !/[.!?:]$/.test(lines[0])

    if (sections.length === 0 && isHeading && lines[0].toLowerCase().includes(titleLower)) {
      continue
    }

    if (isHeading) {
      sections.push({ heading: lines[0], paragraphs: [] })
    } else {
      if (sections.length === 0) {
        sections.push({ paragraphs: [] })
      }
      sections[sections.length - 1].paragraphs.push(block.replace(/\n/g, " "))
    }
  }
  return sections
}

export function LegalPolicyPage({ fallbackTitle, policy, error }: { fallbackTitle: string; policy?: PublicLegalPolicy; error?: string }) {
  const title = policy?.title || fallbackTitle
  const sections = policy ? parsePolicySections(policy.content, title) : []
  const contactEmails = Array.from(
    new Set(
      [policy?.supportEmail, policy?.legalEmail].filter(
        (email): email is string => Boolean(email?.trim()),
      ),
    ),
  )
  const displayedContactEmails = contactEmails.length > 0 ? contactEmails : ["support@kme.com.mm"]

  return (
    <MarketingShell footerVariant="compact" background="flat">
      <section className="mx-auto max-w-[915px] px-5 pb-20 pt-10 sm:px-8 lg:pt-14">
        <h1 className="text-[32px] font-bold leading-tight text-black">{title}</h1>
        {policy ? (
          <>
            <p className="mt-3 text-base text-black">Last Updated: {formatDate(policy.effectiveAt)}</p>
            <div className="mt-6">
              {sections.map((section, index) => (
                <div key={index} className="border-b border-black/25 py-7">
                  {section.heading ? <h2 className="text-2xl font-bold text-black">{section.heading}</h2> : null}
                  {section.paragraphs.map((paragraph, pIndex) => (
                    <p key={pIndex} className={cn("text-lg leading-relaxed text-black", section.heading && "mt-3")}>
                      {paragraph}
                    </p>
                  ))}
                </div>
              ))}
              <div className="border-b border-black/25 py-7">
                <h2 className="text-2xl font-bold text-black">Contact Us</h2>
                <p className="mt-3 text-lg leading-relaxed text-black">
                  If you have any questions about this policy or how we handle your information, please contact us at{" "}
                  {displayedContactEmails.map((email, index) => (
                    <span key={email}>
                      {index > 0 ? ", " : null}
                      <a href={`mailto:${email}`} className="underline">{email}</a>
                    </span>
                  ))}
                  .
                </p>
              </div>
            </div>
          </>
        ) : (
          <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm leading-6 text-amber-900">
            {error || "The requested legal policy is not published yet."}
          </div>
        )}
      </section>
    </MarketingShell>
  )
}
