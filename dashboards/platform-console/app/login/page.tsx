"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowRight, CheckCircle2, Eye, EyeOff, Lock, Mail, ShieldCheck, Activity, Building2 } from 'lucide-react';
import { clearSession, login } from "@/lib/api";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("reason") === "session-expired") {
      setError("Your session has expired. Please sign in again.");
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const session = await login(email, password);
      if (session.user.type !== "platform_admin") {
        clearSession();
        setError("Please sign in with a platform admin account.");
        setIsLoading(false);
        return;
      }

      const nextPath = new URLSearchParams(window.location.search).get("next");
      router.push(nextPath?.startsWith("/platform-console") ? nextPath : "/platform-console");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Login failed");
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,.14),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,.10),transparent_24%),linear-gradient(180deg,#06101b,#07111d)] px-4 py-6 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-[1280px] flex-col">
        <header className="flex items-center justify-between">
          <Link href="/login" className="flex items-center gap-3" aria-label="ZayOS Platform Console">
            <img src="/zayos-mark-light.png" alt="" className="h-9 w-9 object-contain" />
            <div>
              <p className="text-sm font-semibold text-white">ZayOS</p>
              <p className="text-[11px] uppercase tracking-[0.18em] text-sky-200">Platform Console</p>
            </div>
          </Link>
          <div className="hidden rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-300 md:block">
            Internal operator access
          </div>
        </header>

        <section className="grid flex-1 items-center gap-8 py-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)]">
          <div className="order-2 space-y-6 lg:order-none">
            <div>
              <p className="inline-flex rounded-full border border-sky-400/20 bg-sky-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-200">
                Platform control
              </p>
              <h1 className="mt-6 max-w-3xl text-4xl font-bold leading-tight text-white sm:text-5xl lg:text-6xl">
                Monitor merchants, incidents, billing posture, and platform trust from one console.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
                This surface is for platform operators only. Review tenant health, coordinate support, manage plans, and keep operational risk visible before it becomes customer-facing.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {[
                { icon: ShieldCheck, title: "Access boundary", detail: "Tenant sessions are rejected. Platform roles stay isolated here." },
                { icon: Building2, title: "Merchant control", detail: "Inspect onboarding, channel posture, usage, and billing across tenants." },
                { icon: Activity, title: "Operational trust", detail: "Keep incidents, payment issues, and support follow-up in one operating view." },
              ].map(({ icon: Icon, title, detail }) => (
                <div key={title} className="rounded-lg border border-white/10 bg-white/5 p-4 shadow-[0_18px_60px_rgba(2,6,23,0.24)] backdrop-blur">
                  <span className="inline-flex rounded-2xl bg-sky-500/15 p-2.5 text-sky-200">
                    <Icon className="h-5 w-5" />
                  </span>
                  <p className="mt-4 text-sm font-semibold text-white">{title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{detail}</p>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-white/10 bg-white/5 p-5 shadow-[0_18px_60px_rgba(2,6,23,0.24)] backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200">Operator workflow</p>
              <div className="mt-4 space-y-3">
                {[
                  "Review platform overview and merchants needing action",
                  "Inspect conversation, sales-order, delivery, and support signals",
                  "Adjust plans, settings, and internal follow-up before issues spread",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3 rounded-2xl bg-slate-950/40 px-4 py-3 text-sm text-slate-200">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <Card className="order-first border-white/10 bg-white/[0.06] text-white shadow-[0_28px_100px_rgba(2,6,23,0.46)] backdrop-blur lg:order-none">
            <CardHeader className="space-y-4">
              <div className="mx-auto mb-2 flex h-20 w-full items-center justify-center">
                <img src="/zayos-logo-light.png" alt="ZayOS" className="h-full w-full object-contain" />
              </div>
              <div className="text-center">
                <CardTitle className="text-2xl font-bold text-white">Platform Console Sign In</CardTitle>
                <CardDescription className="mt-2 text-slate-300">
                  Secure access for authorized ZayOS platform operators.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-6">
                {error && (
                  <div className="rounded-md border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                    {error}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium text-slate-200">
                    Email Address
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="Enter your admin email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-11 border-white/10 bg-slate-950/40 pl-10 text-white"
                      disabled={isLoading}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-medium text-slate-200">
                    Password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-11 border-white/10 bg-slate-950/40 pl-10 pr-10 text-white"
                      disabled={isLoading}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-sky-200"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="remember"
                      checked={rememberMe}
                      onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                    />
                    <Label htmlFor="remember" className="text-sm text-slate-300">
                      Remember me
                    </Label>
                  </div>
                  <Link href="/forgot-password" className="text-sm text-sky-300 hover:text-sky-200">
                    Forgot password?
                  </Link>
                </div>

                <Button
                  type="submit"
                  className="h-11 w-full bg-sky-500 font-medium text-slate-950 hover:bg-sky-400"
                  disabled={isLoading}
                >
                  {isLoading ? "Signing in..." : "Sign In to Platform Console"}
                  {!isLoading ? <ArrowRight className="ml-2 h-4 w-4" /> : null}
                </Button>
              </form>

              <div className="mt-6 text-center">
                <p className="text-sm text-slate-400">
                  Access issue? Contact{" "}
                  <a href="mailto:platform-support@kme.com.mm" className="text-sky-300 hover:text-sky-200">
                    platform-support@kme.com.mm
                  </a>
                </p>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
