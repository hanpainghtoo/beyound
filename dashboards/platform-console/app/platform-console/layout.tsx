import { PlatformConsoleLayout as ConsoleShellLayout } from "@/components/platform-console-shell";

export default function PlatformConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ConsoleShellLayout>{children}</ConsoleShellLayout>;
}
