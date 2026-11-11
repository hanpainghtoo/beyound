import type { Metadata } from 'next'
import Script from 'next/script'
import { cookies } from 'next/headers'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { ThemeRouteController } from '@/components/theme-route-controller'
import { Toaster } from '@/components/ui/sonner'
import { I18nProvider } from '@/components/providers/i18n-provider'
import {
  LOCALE_HTML_ATTRIBUTE,
  LOCALE_STORAGE_KEY,
  SOURCE_LOCALE,
  loadTranslations,
  resolveLocale,
} from '@/i18n_translation/translation'
import { resolvePublicSiteUrl } from '../../shared/server-public-site-url-config'
import './globals.css'

function compactRuntimeConfig(config: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(config).filter(([, value]) => value?.trim()))
}

export function generateMetadata(): Metadata {
  const publicSiteUrl = resolvePublicSiteUrl(process.env)

  return {
    metadataBase: publicSiteUrl ? new URL(publicSiteUrl) : undefined,
    title: {
      default: 'ZayOS',
      template: 'ZayOS - %s',
    },
    description: 'ZayOS powers the platform console for internal SaaS operations and the commerce workspace for tenant teams.',
    keywords: ['ZayOS', 'Platform Console', 'Commerce Workspace', 'Conversational Commerce', 'Tenant Operations'],
    icons: {
      icon: '/zayos-mark-light.png',
      shortcut: '/zayos-mark-light.png',
      apple: '/zayos-mark-light.png',
    },
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Locale is resolved on the server from a readable cookie so the first
  // server-rendered markup is already in the visitor's language. This is what
  // prevents a Myanmar -> English flash and keeps hydration consistent.
  const localeCookie = (await cookies()).get(LOCALE_STORAGE_KEY)?.value
  const locale = resolveLocale(localeCookie)
  // The English catalog is the source of every API-authored sentence, so it is
  // loaded alongside the active locale and handed to the provider. That is what
  // lets plan names, summaries and CTA labels resolve during SSR and hydration
  // instead of flipping to English after the page has already painted.
  const [resource, sourceResource] = await Promise.all([
    loadTranslations(locale),
    loadTranslations(SOURCE_LOCALE),
  ])

  const gaId = process.env.GA_ID
  const gtmId = process.env.GTM_ID
  const publicRuntimeConfig = compactRuntimeConfig({
    billingBankAccount: process.env.BILLING_BANK_ACCOUNT,
    billingKbzpayNumber: process.env.BILLING_KBZPAY_NUMBER,
    billingWavepayNumber: process.env.BILLING_WAVEPAY_NUMBER,
    contactEmail: process.env.CONTACT_EMAIL || process.env.ZAYOS_CONTACT_EMAIL,
    metaAppId: process.env.META_APP_ID,
    platformConsoleUrl: process.env.PLATFORM_CONSOLE_URL,
    socketBaseUrl: process.env.WS_BASE_URL,
    tiktokClientKey: process.env.TIKTOK_CLIENT_KEY,
  })
  const runtimeConfigScript = `window.__ZAYOS_PUBLIC_CONFIG__=${JSON.stringify(publicRuntimeConfig).replace(/</g, "\\u003c")};`

  // suppressHydrationWarning stays because the inline theme script in <head>
  // toggles the `dark` class on <html> before React hydrates. The fonts use
  // next/font's recommended pattern: the variables are applied as classes
  // here and referenced via var(--font-geist-sans) / var(--font-geist-mono)
  // in globals.css.
  // The locale script mirrors a localStorage preference into the cookie for
  // the NEXT request. localStorage is written first by the provider, so this
  // only matters on a hard refresh where the cookie was cleared but the
  // visitor's stored preference survived.
  return (
    <html
      lang={locale}
      data-locale={locale}
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function() {
  try {
    var key = ${JSON.stringify(LOCALE_STORAGE_KEY)};
    var attr = ${JSON.stringify(LOCALE_HTML_ATTRIBUTE)};
    var cookie = document.cookie.split("; ").find(function(row) {
      return row.indexOf(key + "=") === 0;
    });
    if (!cookie) {
      var stored = window.localStorage.getItem(key);
      if (stored === "my" || stored === "en") {
        document.cookie = key + "=" + stored + "; path=/; max-age=31536000; samesite=lax";
        document.documentElement.setAttribute("lang", stored);
        document.documentElement.setAttribute(attr, stored);
      }
    }
  } catch (error) {}
})();
            `,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function() {
  try {
    var isWorkspaceRoute = window.location.pathname.startsWith("/workspace");
    var storedTheme = window.localStorage.getItem("zayos-commerce-theme");
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var theme = isWorkspaceRoute
      ? (storedTheme === "dark" || storedTheme === "light" ? storedTheme : (prefersDark ? "dark" : "light"))
      : "light";
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
    document.documentElement.setAttribute("data-theme", theme);
  } catch (error) {}
})();
            `,
          }}
        />
        <script dangerouslySetInnerHTML={{ __html: runtimeConfigScript }} />
        {gtmId ? (
          <Script id="gtm-script" strategy="afterInteractive">
            {`
              (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start': new Date().getTime(),event:'gtm.js'});
              var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';
              j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
              })(window,document,'script','dataLayer','${gtmId}');
            `}
          </Script>
        ) : null}
        {gaId ? (
          <>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} strategy="afterInteractive" />
            <Script id="ga-script" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${gaId}');
              `}
            </Script>
          </>
        ) : null}
      </head>
      <body>
        <I18nProvider
          initialLocale={locale}
          initialResource={resource}
          initialSourceResource={sourceResource}
        >
          <ThemeRouteController />
          <Toaster />
          {children}
        </I18nProvider>
      </body>
    </html>
  )
}
