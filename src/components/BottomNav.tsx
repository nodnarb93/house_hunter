import { NavLink } from 'react-router-dom'

function HomeIcon(props: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden
    >
      <path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
    </svg>
  )
}

function HuntsIcon(props: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden
    >
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v10h14V10" />
      <path d="M9 20v-6h6v6" />
    </svg>
  )
}

function SettingsIcon(props: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  )
}

const tabs = [
  { key: 'dashboard', to: '/dashboard', label: 'Dashboard', Icon: HomeIcon },
  { key: 'hunts', to: '/hunts', label: 'House Hunts', Icon: HuntsIcon },
  { key: 'settings', to: '/settings', label: 'Settings', Icon: SettingsIcon },
] as const

function tabClass({ isActive }: { isActive: boolean }) {
  return `flex flex-1 flex-col items-center gap-0.5 px-2 py-2 text-xs ${
    isActive ? 'text-white' : 'text-zinc-400'
  }`
}

export default function BottomNav() {
  return (
    <nav
      data-testid="bottom-nav"
      aria-label="Mobile navigation"
      className="fixed bottom-0 inset-x-0 z-30 flex border-t border-white/10 bg-zinc-900 pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {tabs.map(({ key, to, label, Icon }) => (
        <NavLink
          key={key}
          to={to}
          data-testid={`bottom-nav-tab-${key}`}
          className={tabClass}
        >
          {({ isActive }) => (
            <>
              <Icon className={`h-5 w-5 ${isActive ? 'text-white' : 'text-zinc-400'}`} />
              <span>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
