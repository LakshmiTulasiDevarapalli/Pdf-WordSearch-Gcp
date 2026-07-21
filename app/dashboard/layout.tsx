import { IdleSessionProvider } from "@/components/IdleSessionProvider"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  // loginPath defaults to "/login" - matches the app's actual sign-in form
  return <IdleSessionProvider>{children}</IdleSessionProvider>
}