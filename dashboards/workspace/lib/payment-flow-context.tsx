"use client"

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react"
import { generatePaymentReference } from "@/lib/payment-methods"

export type PaymentStep = 1 | 2 | 3 | 4

export const PAYMENT_STEPS = [
  { number: 1, label: "Company Info" },
  { number: 2, label: "Personal Info" },
  { number: 3, label: "Payment & Receipt" },
  { number: 4, label: "Confirmation" },
] as const

export type PlanDetails = {
  id: string
  name: string
  price: string
  billingInterval: string
  currency: string
}

type PaymentFlowData = {
  planId: string | null
  planDetails: PlanDetails | null
  paymentReference: string
  userId: string | null
  email: string | null
  fullName: string | null
  paymentMethod: string | null
}

type PaymentFlowContextType = {
  currentStep: PaymentStep
  data: PaymentFlowData
  setStep: (step: PaymentStep) => void
  setPlanId: (planId: string) => void
  setPlanDetails: (details: PlanDetails) => void
  setUserData: (userId: string, email: string, fullName: string) => void
  setPaymentMethod: (method: string) => void
}

const PaymentFlowContext = createContext<PaymentFlowContextType | null>(null)

export function PaymentFlowProvider({ children }: { children: ReactNode }) {
  const [currentStep, setCurrentStep] = useState<PaymentStep>(1)
  const [data, setData] = useState<PaymentFlowData>({
    planId: null,
    planDetails: null,
    paymentReference: generatePaymentReference(),
    userId: null,
    email: null,
    fullName: null,
    paymentMethod: null,
  })

  const setStep = useCallback((step: PaymentStep) => {
    setCurrentStep(step)
  }, [])

  const setPlanId = useCallback((planId: string) => {
    setData((prev) => ({ ...prev, planId }))
  }, [])

  const setPlanDetails = useCallback((details: PlanDetails) => {
    setData((prev) => ({ ...prev, planDetails: details }))
  }, [])

  const setUserData = useCallback((userId: string, email: string, fullName: string) => {
    setData((prev) => ({ ...prev, userId, email, fullName }))
  }, [])

  const setPaymentMethod = useCallback((method: string) => {
    setData((prev) => ({ ...prev, paymentMethod: method }))
  }, [])

  const value = useMemo(() => ({
    currentStep,
    data,
    setStep,
    setPlanId,
    setPlanDetails,
    setUserData,
    setPaymentMethod,
  }), [currentStep, data, setStep, setPlanId, setPlanDetails, setUserData, setPaymentMethod])

  return (
    <PaymentFlowContext.Provider value={value}>
      {children}
    </PaymentFlowContext.Provider>
  )
}

export function usePaymentFlow() {
  const context = useContext(PaymentFlowContext)
  if (!context) {
    throw new Error("usePaymentFlow must be used within a PaymentFlowProvider")
  }
  return context
}
