"use client";

import {
  FormEvent,
  KeyboardEvent,
  ClipboardEvent,
  Suspense,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Shield, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  getApiErrorMessage,
  getStoredSession,
  requestEmailVerification,
  storeSession,
  verifyEmailWithOtp,
  validateRealEmail,
  checkEmailExists,
} from "@/lib/api";

const OTP_LENGTH = 6;

function parseExpiry(value?: string | null) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const session = getStoredSession();
  // Additive prefill for senders without a session (e.g. paid plan
  // registration linking here with ?email=). A stored session (trial flow)
  // always takes precedence, so trial behavior is unchanged.
  const queryEmail = searchParams.get("email")?.trim() || "";
  const queryCode =
    searchParams.get("code")?.replace(/\D/g, "").slice(0, OTP_LENGTH) || "";
  const initialEmail =
    session?.user.email ||
    (queryEmail && validateRealEmail(queryEmail).valid === true
      ? queryEmail
      : "");
  const [email, setEmail] = useState(initialEmail);
  const [isEditingEmail, setIsEditingEmail] = useState(!initialEmail);
  const [otpDigits, setOtpDigits] = useState<string[]>(
    queryCode.length === OTP_LENGTH ? queryCode.split("") : Array(OTP_LENGTH).fill(""),
  );
  const autoSubmitRef = useRef(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [otpInvalid, setOtpInvalid] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const [otpExpiresAt, setOtpExpiresAt] = useState(
    parseExpiry(session?.emailVerificationExpiresAt),
  );
  const [now, setNow] = useState(() => Date.now());
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (!otpExpiresAt) return;
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [otpExpiresAt]);

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [resending, setResending] = useState(false);
  const [emailValidationError, setEmailValidationError] = useState("");
  const [emailChecking, setEmailChecking] = useState(false);

  const otp = otpDigits.join("");
  const hasError = otpInvalid;
  const secondsUntilExpiry = otpExpiresAt
    ? Math.max(0, Math.ceil((otpExpiresAt - now) / 1000))
    : null;
  const otpExpired = secondsUntilExpiry !== null && secondsUntilExpiry <= 0;

  const flagOtpError = () => {
    setOtpInvalid(false);
    setShakeKey((k) => k + 1);
    requestAnimationFrame(() => {
      setOtpInvalid(true);
      window.setTimeout(() => setOtpInvalid(false), 550);
    });
  };

  const clearOtpError = () => {
    if (otpInvalid) setOtpInvalid(false);
    if (error) setError("");
  };

  const focusIndex = (index: number) => {
    inputRefs.current[index]?.focus();
    inputRefs.current[index]?.select();
  };

  const handleDigitChange = (index: number, rawValue: string) => {
    const digit = rawValue.replace(/\D/g, "").slice(-1);
    clearOtpError();
    setOtpDigits((previous) => {
      const next = [...previous];
      next[index] = digit;
      return next;
    });
    if (digit && index < OTP_LENGTH - 1) {
      focusIndex(index + 1);
    }
  };

  const handleInput = () => {
    clearOtpError();
  };

  const handleKeyDown = (
    index: number,
    event: KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === "Backspace" && !otpDigits[index] && index > 0) {
      focusIndex(index - 1);
    }
    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      focusIndex(index - 1);
    }
    if (event.key === "ArrowRight" && index < OTP_LENGTH - 1) {
      event.preventDefault();
      focusIndex(index + 1);
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, OTP_LENGTH);
    if (!pasted) return;
    event.preventDefault();
    const next = Array(OTP_LENGTH).fill("");
    pasted.split("").forEach((char, i) => {
      next[i] = char;
    });
    setOtpDigits(next);
    focusIndex(Math.min(pasted.length, OTP_LENGTH - 1));
  };

  const submitOtp = async (nextOtp: string) => {
    setSaving(true);
    setError("");
    try {
      const result = await verifyEmailWithOtp(email.trim(), nextOtp);
      storeSession(result);
      router.push("/workspace");
    } catch (requestError) {
      setError(
        getApiErrorMessage(requestError, "Unable to verify this email."),
      );
      flagOtpError();
      setOtpDigits(Array(OTP_LENGTH).fill(""));
      focusIndex(0);
    } finally {
      setSaving(false);
    }
  };

  const handleEmailBlur = async () => {
    if (!email.trim()) return;
    const realResult = validateRealEmail(email.trim());
    if (realResult.valid === false) {
      setEmailValidationError(realResult.message);
      return;
    }
    setEmailChecking(true);
    try {
      const checkResult = await checkEmailExists(email.trim());
      if (checkResult.exists) {
        setEmailValidationError(checkResult.message);
      }
    } catch {
      setEmailValidationError("Unable to verify email. Please try again.");
    } finally {
      setEmailChecking(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim()) {
      setError("Enter your email address.");
      return;
    }
    const realResult = validateRealEmail(email.trim());
    if (realResult.valid === false) {
      setEmailValidationError(realResult.message);
      setError(realResult.message);
      return;
    }
    if (otp.length !== OTP_LENGTH) {
      setError("Enter the 6-digit code from your email.");
      flagOtpError();
      return;
    }
    if (otpExpired) {
      setError("This code has expired. Resend a new code to continue.");
      return;
    }
    await submitOtp(otp);
  };

  const resend = async () => {
    if (!email.trim()) {
      setError("Enter your email address.");
      return;
    }
    const realResult = validateRealEmail(email.trim());
    if (realResult.valid === false) {
      setEmailValidationError(realResult.message);
      return;
    }
    if (secondsUntilExpiry !== null && secondsUntilExpiry > 0) return;
    setResending(true);
    setError("");
    try {
      const result = await requestEmailVerification(email.trim());
      const nextExpiry = parseExpiry(result.expiresAt);
      setOtpExpiresAt(nextExpiry);
      setNow(Date.now());
      setOtpDigits(Array(OTP_LENGTH).fill(""));
    } catch (requestError) {
      setError(
        getApiErrorMessage(requestError, "Unable to request verification."),
      );
    } finally {
      setResending(false);
    }
  };

  const confirmEmail = () => {
    if (!email.trim()) {
      setError("Enter your email address.");
      return;
    }
    const realResult = validateRealEmail(email.trim());
    if (realResult.valid === false) {
      setEmailValidationError(realResult.message);
      return;
    }
    setError("");
    setIsEditingEmail(false);
  };

  // One-click verify from the OTP email (?email=&code=): the code is already
  // prefilled above; attempt a single auto-submit when an email is present.
  // Expired/invalid codes fall back to manual entry via the existing errors.
  useEffect(() => {
    if (queryCode.length !== OTP_LENGTH) return;
    if (isEditingEmail) return;
    if (autoSubmitRef.current) return;
    autoSubmitRef.current = true;
    void submitOtp(queryCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">
          Enter verification code
        </h1>
        {isEditingEmail ? (
          <div className="mt-4 space-y-3 text-left">
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onBlur={handleEmailBlur}
              placeholder="Enter your email"
              autoFocus
              className={emailValidationError ? "border-red-500" : ""}
            />
            {emailChecking ? (
              <p className="text-xs text-indigo-600 flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Checking email...
              </p>
            ) : null}
            {emailValidationError ? (
              <p className="text-xs text-red-600">{emailValidationError}</p>
            ) : null}
            <div className="flex gap-2">
              <Button
                type="button"
                className="flex-1 bg-[#5E4BCE] text-white hover:bg-[#4e3dc0]"
                onClick={confirmEmail}
              >
                Confirm
              </Button>
              {session?.user.email ? (
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setEmail(session.user.email);
                    setIsEditingEmail(false);
                    setError("");
                  }}
                >
                  Cancel
                </Button>
              ) : null}
            </div>
            {!session?.user.email ? (
              <Link
                href="/login"
                className="block text-center text-sm font-medium text-[#5E4BCE] hover:underline"
              >
                Back to sign in
              </Link>
            ) : null}
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm text-slate-600">
              We sent a 6-digit code to{" "}
              <span className="font-medium text-slate-900">
                {email || "your email"}
              </span>
            </p>
            <Link
              href="/login"
              className="mt-1 inline-block text-sm font-medium text-[#5E4BCE] hover:underline"
            >
              Back to sign in
            </Link>
          </>
        )}
      </div>

      {!isEditingEmail ? (
        <form className="mt-6 space-y-4" onSubmit={submit}>
          <div
            key={shakeKey}
            className={cn(
              "flex justify-center gap-2",
              hasError && "animate-shake",
            )}
          >
            {otpDigits.map((digit, index) => (
              <input
                key={index}
                id={`otp-${index}`}
                ref={(el) => {
                  inputRefs.current[index] = el;
                }}
                inputMode="numeric"
                autoComplete={index === 0 ? "one-time-code" : "off"}
                maxLength={1}
                value={digit}
                onChange={(event) =>
                  handleDigitChange(index, event.target.value)
                }
                onInput={handleInput}
                onKeyDown={(event) => handleKeyDown(index, event)}
                onPaste={handlePaste}
                onFocus={() => setActiveIndex(index)}
                onBlur={() =>
                  setActiveIndex((current) =>
                    current === index ? null : current,
                  )
                }
                aria-invalid={hasError}
                className={cn(
                  "h-12 w-12 rounded-lg border text-center text-lg font-semibold text-slate-950 outline-none transition-colors duration-200 ease-out",
                  hasError
                    ? "border-red-500 ring-2 ring-red-500/20 focus:border-red-500"
                    : activeIndex === index
                      ? "border-[#5E4BCE] ring-2 ring-[#5E4BCE]/20"
                      : digit
                        ? "border-[#5E4BCE]/40"
                        : "border-gray-200 border-slate-200 focus:border-[#5E4BCE]",
                )}
              />
            ))}
          </div>

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <Button
            type="submit"
            className="w-full bg-[#5E4BCE] text-white hover:bg-[#4e3dc0]"
            disabled={saving || otpExpired}
          >
            {saving ? "Verifying..." : "Verify email"}
          </Button>

          <div className="text-center text-sm">
            <p
              className={cn(
                "text-center text-xs",
                otpExpired ? "text-red-600" : "text-slate-500",
              )}
            >
              {otpExpired ? "This code has expired. Resend a new code." : ""}
            </p>
            <button
              type="button"
              onClick={resend}
              disabled={
                resending ||
                (secondsUntilExpiry !== null && secondsUntilExpiry > 0)
              }
              className="mt-1 font-medium hover:underline disabled:pointer-events-none disabled:opacity-50"
            >
              {resending ? (
                "Sending..."
              ) : secondsUntilExpiry !== null && secondsUntilExpiry > 0 ? (
                <>
                  Code expires in{" "}
                  <span className="text-red-500">
                    {Math.floor(secondsUntilExpiry / 60)}:
                    {String(secondsUntilExpiry % 60).padStart(2, "0")}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-[#5E4BCE]">Resend Code</span>
                </>
              )}
            </button>
          </div>

          <div className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
              <Shield className="h-4 w-4 text-slate-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Security tip
              </p>
              <p className="text-sm text-slate-600">
                Never share your verification code with anyone.
              </p>
            </div>
          </div>
        </form>
      ) : null}
    </section>
  );
}

export default function VerifyEmailPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-slate-950">
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center">
            Loading...
          </div>
        }
      >
        <VerifyEmailForm />
      </Suspense>
    </main>
  );
}
