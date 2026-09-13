"use client"

import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { PAYMENT_STEPS, type PaymentStep } from "@/lib/payment-flow-context"

export function PaymentStepper({ currentStep }: { currentStep: PaymentStep }) {
  return (
    <div className="w-full">
      {/* Desktop: Horizontal */}
      <div className="hidden sm:flex items-center justify-between">
        {PAYMENT_STEPS.map((step, index) => {
          const isCompleted = currentStep > step.number
          const isActive = currentStep === step.number

          return (
            <div key={step.number} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold transition-colors",
                    isCompleted && "bg-indigo-600 text-white",
                    isActive && "bg-indigo-600 text-white ring-4 ring-indigo-100",
                    !isCompleted && !isActive && "bg-slate-200 text-slate-500"
                  )}
                >
                  {isCompleted ? <Check className="h-5 w-5" /> : step.number}
                </div>
                <span
                  className={cn(
                    "mt-2 text-xs font-medium text-center max-w-[80px]",
                    isActive ? "text-indigo-600" : isCompleted ? "text-slate-900" : "text-slate-400"
                  )}
                >
                  {step.label}
                </span>
              </div>
              {index < PAYMENT_STEPS.length - 1 && (
                <div
                  className={cn(
                    "h-0.5 flex-1 mx-3 mt-[-20px]",
                    isCompleted ? "bg-indigo-600" : "bg-slate-200"
                  )}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Mobile: Vertical */}
      <div className="flex sm:hidden flex-col gap-4">
        {PAYMENT_STEPS.map((step, index) => {
          const isCompleted = currentStep > step.number
          const isActive = currentStep === step.number

          return (
            <div key={step.number} className="flex items-center gap-3">
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                  isCompleted && "bg-indigo-600 text-white",
                  isActive && "bg-indigo-600 text-white ring-4 ring-indigo-100",
                  !isCompleted && !isActive && "bg-slate-200 text-slate-500"
                )}
              >
                {isCompleted ? <Check className="h-5 w-5" /> : step.number}
              </div>
              <span
                className={cn(
                  "text-sm font-medium",
                  isActive ? "text-indigo-600" : isCompleted ? "text-slate-900" : "text-slate-400"
                )}
              >
                {step.label}
              </span>
              {index < PAYMENT_STEPS.length - 1 && (
                <div
                  className={cn(
                    "absolute left-[19px] top-[40px] h-4 w-0.5",
                    isCompleted ? "bg-indigo-600" : "bg-slate-200"
                  )}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
