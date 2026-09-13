"use client"

import type { ReactNode } from "react"

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { cn } from "@/lib/utils"

export type MarketingFaqItem = {
  question: string
  answer: ReactNode
}

export function MarketingFaqAccordion({
  items,
  defaultValue,
  className,
  onItemToggle,
}: {
  items: MarketingFaqItem[]
  defaultValue?: string
  className?: string
  onItemToggle?: (value: string) => void
}) {
  const initialValue = defaultValue ?? (items[0] ? `item-0` : undefined)

  return (
    <Accordion
      type="single"
      collapsible
      defaultValue={initialValue}
      className={cn("grid gap-4", className)}
      onValueChange={(value) => {
        if (value) onItemToggle?.(value)
      }}
    >
      {items.map((item, index) => (
        <AccordionItem key={item.question} value={`item-${index}`} className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
          <AccordionTrigger className="w-full items-center rounded-[22px] px-5 py-4 text-base font-semibold text-slate-950 hover:no-underline focus-visible:ring-indigo-200 data-[state=open]:rounded-b-none data-[state=open]:bg-indigo-50/60 data-[state=open]:text-indigo-800 [&>svg]:size-5 [&>svg]:text-slate-500">
            <span className="pr-4">{item.question}</span>
          </AccordionTrigger>
          <AccordionContent className="px-5 pb-5 text-sm leading-7 text-slate-600">
            {item.answer}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}
