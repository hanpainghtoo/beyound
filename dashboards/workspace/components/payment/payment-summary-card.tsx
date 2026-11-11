"use client"

import { Badge } from "@/components/ui/badge"

type PaymentSummaryCardProps = {
  paymentReference: string
  planName: string
  billingPeriod: string
  amount: string
}

export function PaymentSummaryCard({
  paymentReference,
  planName,
  billingPeriod,
  amount,
}: PaymentSummaryCardProps) {
  return (
    <div className="rounded-[28px] border border-slate-200/80 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
        <h3 className="text-lg font-semibold text-slate-900">
          Payment Summary ({paymentReference})
        </h3>
        <Badge variant="secondary" className="bg-indigo-50 text-indigo-700 hover:bg-indigo-50">
          Subscription Plan
        </Badge>
      </div>

      {/* Plan Details */}
      <div className="px-6 py-5">
        <div className="flex items-start justify-between">
          <div>
            <h4 className="text-xl font-bold text-slate-950">{planName}</h4>
            <p className="mt-1 text-sm text-slate-500">
              Billed monthly ({billingPeriod})
            </p>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold text-slate-950">{amount}</p>
            <p className="text-sm text-slate-500">per month</p>
          </div>
        </div>
      </div>

      {/* Total Amount */}
      <div className="mx-6 mb-6 rounded-2xl bg-gradient-to-r from-indigo-500 to-blue-500 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-bold text-white">Total Amount</p>
            <p className="text-sm text-white/80">Tax Included</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-white">{amount}</p>
            <p className="text-sm text-white/80">per month</p>
          </div>
        </div>
      </div>
    </div>
  )
}
