"use client";
import { useEffect, useState, type CSSProperties } from "react";
import {
  CreditCard,
  Headset,
  MessagesSquare,
  ShoppingBag,
  Truck,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

// Brand tokens, taken from `tokens` in marketing-landing-figma.tsx.
const brand = {
  cta: "#5E4BCE",
  stroke: "#816EF7",
  divider: "rgba(129, 110, 247, 0.4)",
  soft: "#F3F1FF",
  glow: "#EAE8FF",
};

// Same channel list and assets as `heroChannels` in the landing page.
const channels: Array<{ label: string; src?: string; headset?: boolean }> = [
  { label: "Facebook", src: "/brand/facebook.svg" },
  { label: "Messenger", src: "/brand/messenger.svg" },
  { label: "Viber", src: "/brand/viber.svg" },
  { label: "Telegram", src: "/brand/telegram.svg" },
  { label: "TikTok", src: "/brand/tiktok.svg" },
  { label: "Website Chat", headset: true },
];

// Card colours reuse the sales-cycle step palette (Create Order, Payment,
// Delivery) plus the brand purple for Customers.
type OrbitCard = {
  title: string;
  detail: string;
  icon: LucideIcon;
  borderColor: string;
  accentBackground: string;
  accentColor: string;
  position: string;
  delay: string;
  live?: (tick: number) => string;
};

const cards: OrbitCard[] = [
  {
    title: "Orders",
    detail: "24 new today",
    icon: ShoppingBag,
    borderColor: "rgba(189, 84, 9, 0.5)",
    accentBackground: "rgba(189, 84, 9, 0.15)",
    accentColor: "#BD5409",
    position: "sm:left-0 sm:top-[7%]",
    delay: "0s",
  },
  {
    title: "Payments",
    detail: "18 of 24 paid",
    icon: CreditCard,
    borderColor: "rgba(28, 49, 116, 0.5)",
    accentBackground: "#EEF2FF",
    accentColor: "#1C3174",
    position: "sm:right-0 sm:top-[7%]",
    delay: "-1.5s",
  },
  {
    title: "Delivery",
    detail: "6 out for delivery",
    icon: Truck,
    borderColor: "rgba(21, 134, 99, 0.5)",
    accentBackground: "rgba(21, 134, 99, 0.15)",
    accentColor: "#158663",
    position: "sm:left-0 sm:bottom-[7%]",
    delay: "-3s",
  },
  {
    title: "Customers",
    detail: "+9 new this week",
    icon: UsersRound,
    borderColor: "rgba(129, 110, 247, 0.5)",
    accentBackground: brand.soft,
    accentColor: brand.cta,
    position: "sm:right-0 sm:bottom-[7%]",
    delay: "-4.5s",
  },
];

// All geometry is in cqw (1% of the orbit square's width), so the whole
// composition scales with its container without a JS resize handler.
const INNER_R = 27;
const OUTER_R = 46;
const CHANNEL_SIZE = 11;

const css = `
@keyframes zy-spin{to{transform:rotate(360deg)}}
@keyframes zy-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes zy-pulse{0%{transform:scale(1);opacity:.35}100%{transform:scale(1.45);opacity:0}}
.zy-spin{animation:zy-spin var(--zy-dur,60s) linear infinite}
.zy-rev{animation-direction:reverse}
.zy-counter{animation:zy-spin var(--zy-dur,60s) linear infinite reverse}
.zy-float{animation:zy-float 6s ease-in-out infinite;animation-delay:var(--zy-delay,0s)}
.zy-pulse{animation:zy-pulse 3s ease-out infinite}
.zy-root:hover .zy-spin,.zy-root:hover .zy-counter{animation-play-state:paused}
@keyframes zy-bump{0%{transform:translateY(5px);opacity:0}60%{transform:translateY(-1px);opacity:1}100%{transform:translateY(0)}}
@keyframes zy-ping{0%{transform:scale(1);opacity:.7}100%{transform:scale(2.6);opacity:0}}
.zy-bump{display:inline-block;animation:zy-bump .45s ease-out}
.zy-ping{animation:zy-ping 1.2s ease-out 1}
@keyframes zy-in{from{opacity:0;scale:.6}to{opacity:1;scale:1}}
.zy-in{animation:zy-in .7s cubic-bezier(.2,.8,.2,1) both;animation-delay:var(--zy-in-delay,0s)}
.zy-card-enter{animation:
  zy-in .7s cubic-bezier(.2,.8,.2,1) both var(--zy-in-delay,0s),
  zy-float 6s ease-in-out infinite var(--zy-delay,0s)}
.zy-chip img,.zy-chip svg{transition:transform .25s ease}
.zy-chip:hover img,.zy-chip:hover svg{transform:scale(1.2) rotate(-6deg)}
.zy-card-hover{transition:box-shadow .25s ease}
.zy-card-hover:hover{box-shadow:0 8px 18px rgba(94,75,206,.25)}
@media (prefers-reduced-motion:reduce){
  .zy-spin,.zy-counter,.zy-float,.zy-pulse,.zy-bump,.zy-ping,.zy-in,.zy-card-enter,.zy-march{animation:none}

}
`;

function Ring({
  radius,
  duration,
  reverse,
  color,
}: {
  radius: number;
  duration: string;
  reverse?: boolean;
  color: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`zy-spin absolute left-1/2 top-1/2 rounded-full border-[2.5px] border-dotted ${
        reverse ? "zy-rev" : ""
      }`}
      style={
        {
          "--zy-dur": duration,
          width: `${radius * 2}cqw`,
          height: `${radius * 2}cqw`,
          margin: `-${radius}cqw 0 0 -${radius}cqw`,
          borderColor: color,
        } as CSSProperties
      }
    />
  );
}

// A bright head with a fading tail, travelling around a ring.
function TravellingDot({
  radius,
  duration,
  size,
  color,
  reverse,
}: {
  radius: number;
  duration: string;
  size: number;
  color: string;
  reverse?: boolean;
}) {
  const trail = [0, 1, 2, 3, 4];
  const dir = reverse ? 1 : -1;
  return (
    <div
      aria-hidden="true"
      className={`zy-spin absolute left-1/2 top-1/2 h-0 w-0 ${
        reverse ? "zy-rev" : ""
      }`}
      style={{ "--zy-dur": duration } as CSSProperties}
    >
      {trail.map((k) => {
        const s = size * (1 - k * 0.14);
        return (
          <span
            key={k}
            className="absolute left-0 top-0 rounded-full"
            style={{
              width: `${s}cqw`,
              height: `${s}cqw`,
              margin: `-${s / 2}cqw 0 0 -${s / 2}cqw`,
              backgroundColor: color,
              opacity: k === 0 ? 1 : 0.5 - k * 0.09,
              boxShadow:
                k === 0
                  ? `0 0 0 ${size * 0.3}cqw rgba(94, 75, 206, 0.18)`
                  : "none",
              transform: `rotate(${dir * k * 7}deg) translateX(${radius}cqw)`,
            }}
          />
        );
      })}
    </div>
  );
}
function useTick(ms = 4000, max = 10) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setTick((t) => (t + 1) % max), ms);
    return () => clearInterval(id);
  }, [ms, max]);
  return tick;
}
function FloatingCard({
  card,
  tick,
  index,
}: {
  card: OrbitCard;
  tick: number;
  index: number;
}) {
  const Icon = card.icon;
  const detail = card.live ? card.live(tick) : card.detail;

  return (
    <div
      className={`zy-card-enter zy-card-hover zy-float flex min-w-0 items-center gap-2 rounded-[10px] border bg-[#FCFDFF] p-3 shadow-[0_2px_2px_rgba(0,0,0,0.25)] sm:absolute sm:w-[29%] ${card.position}`}
      style={
        {
          borderColor: card.borderColor,
          "--zy-delay": card.delay,
          "--zy-in-delay": `${0.8 + index * 0.15}s`,
        } as CSSProperties
      }
    >
      <span
        className="relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
        style={{
          backgroundColor: card.accentBackground,
          color: card.accentColor,
        }}
      >
        {card.live && (
          <span
            key={detail}
            aria-hidden="true"
            className="zy-ping absolute inset-0 rounded-full"
            style={{ backgroundColor: card.accentColor, opacity: 0.4 }}
          />
        )}
        <Icon className="relative h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-[12px] font-bold leading-[15px] text-black">
          {card.title}
        </span>
        <span className="mt-0.5 block truncate text-[10px] font-medium leading-[12px] text-[rgba(0,0,0,0.6)]">
          <span key={detail} className="zy-bump">
            {detail}
          </span>
        </span>
      </span>
    </div>
  );
}

export function HeroOrbit({ className = "" }: { className?: string }) {
  const tick = useTick();

  return (
    <div
      role="group"
      aria-label="ZayOS connects your chat channels to orders, payments, deliveries and customers"
      className={`zy-root relative mx-auto w-full max-w-[560px] lg:max-w-[max(380px,min(560px,calc(100svh_-_320px)))] ${className}`}
    >
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <div
        className="relative aspect-square w-full"
        style={{ containerType: "inline-size" }}
      >
        {/* Soft brand glow behind the rings */}
        <div
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#EAE8FF] blur-[50px]"
          style={{ width: "62cqw", height: "62cqw" }}
        />

        {/* Rotating dashed rings (opposite directions, very slow) */}
        <Ring
          radius={OUTER_R}
          duration="120s"
          reverse
          color="rgba(129, 110, 247, 0.4)"
        />
        <Ring radius={INNER_R} duration="80s" color={brand.divider} />

        {/* Dots travelling along the loop */}
        <TravellingDot
          radius={INNER_R}
          duration="14s"
          size={2.5}
          color={brand.cta}
        />
        <TravellingDot
          radius={OUTER_R}
          duration="26s"
          size={2}
          color={brand.stroke}
          reverse
        />
        {/* Channels orbit the hub and stay upright via a counter-rotation */}
        <div
          className="zy-spin absolute left-1/2 top-1/2 h-0 w-0"
          style={{ "--zy-dur": "60s" } as CSSProperties}
        >
          {channels.map((channel, i) => {
            const angle = -90 + i * (360 / channels.length);
            return (
              <div
                key={channel.label}
                className="absolute left-0 top-0"
                style={{
                  transform: `rotate(${angle}deg) translateX(${INNER_R}cqw)`,
                }}
              >
                <div style={{ transform: `rotate(${-angle}deg)` }}>
                  <span
                    role="img"
                    aria-label={channel.label}
                    className="zy-counter flex items-center justify-center rounded-full border border-[rgba(129,110,247,0.4)] bg-white shadow-[0_2px_2px_rgba(0,0,0,0.25)]"
                    style={
                      {
                        "--zy-dur": "60s",
                        width: `${CHANNEL_SIZE}cqw`,
                        height: `${CHANNEL_SIZE}cqw`,
                        margin: `-${CHANNEL_SIZE / 2}cqw 0 0 -${CHANNEL_SIZE / 2}cqw`,
                      } as CSSProperties
                    }
                  >
                    {channel.headset ? (
                      <Headset
                        style={{
                          width: "6.5cqw",
                          height: "6.5cqw",
                          color: brand.cta,
                        }}
                      />
                    ) : (
                      <img
                        src={channel.src}
                        alt=""
                        style={{ width: "6.5cqw", height: "6.5cqw" }}
                        className="object-contain"
                      />
                    )}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Hub */}
        <div
          className="absolute left-1/2 top-1/2"
          style={{
            width: "24cqw",
            height: "24cqw",
            margin: "-12cqw 0 0 -12cqw",
          }}
        >
          <span
            aria-hidden="true"
            className="zy-pulse absolute inset-0 rounded-full"
            style={{ backgroundColor: brand.cta }}
          />
          <div
            className="relative flex h-full w-full flex-col items-center justify-center rounded-full text-white shadow-[0_4px_4px_rgba(0,0,0,0.25)]"
            style={{ backgroundColor: brand.cta }}
          >
            <MessagesSquare
              style={{ width: "7cqw", height: "7cqw" }}
              aria-hidden="true"
            />
            <span
              className="font-bold leading-none"
              style={{ fontSize: "3.6cqw", marginTop: "1cqw" }}
            >
              ZayOS
            </span>
          </div>
        </div>
      </div>

      {/* Floating cards: corners on sm+, 2x2 grid under the orbit on mobile */}
      <div className="mt-5 grid grid-cols-2 gap-2.5 sm:pointer-events-none sm:absolute sm:inset-0 sm:mt-0 sm:block">
        {cards.map((card, i) => (
          <FloatingCard key={card.title} card={card} tick={tick} index={i} />
        ))}
      </div>
    </div>
  );
}
