interface HeaderProps {
  total: number;
  assigned: number;
  pending: number;
  saving: boolean;
  onSave: () => void;
}

export function Header({ total, assigned, pending, saving, onSave }: HeaderProps) {
  return (
    <header className="bg-linear-to-br from-bg-secondary to-bg-tertiary border-b border-border px-8 py-3.5 flex items-center justify-between sticky top-0 z-100">
      <h1 className="text-[17px] font-semibold bg-linear-to-br from-accent-blue to-accent-purple bg-clip-text text-transparent flex items-center gap-2">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 200 200"
          width="24"
          height="24"
          className="shrink-0"
          aria-labelledby="spectral-logo-title"
        >
          <title id="spectral-logo-title">Spectral Curiosity</title>
          <defs>
            <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#00f2fe" />
              <stop offset="100%" stopColor="#2af598" />
            </linearGradient>
          </defs>
          <g stroke="url(#logoGrad)" strokeLinecap="round" strokeLinejoin="round" fill="none">
            <path
              d="M 100 20 L 100 28 M 180 100 L 172 100 M 100 180 L 100 172 M 20 100 L 28 100"
              strokeWidth="4"
            />
            <path
              d="M 43 43 L 49 49 M 157 43 L 151 49 M 43 157 L 49 151 M 157 157 L 151 151"
              strokeWidth="3"
            />
            <circle cx="100" cy="100" r="75" strokeWidth="4" />
            <circle cx="100" cy="100" r="45" strokeWidth="8" />
          </g>
          <polygon points="125,20 95,105 125,105 75,185 105,100 75,100" fill="url(#logoGrad)" />
        </svg>
        Spectral Curiosity
      </h1>
      <div className="flex gap-3 items-center">
        <span className="text-xs text-text-secondary tabular-nums">
          {total} total · {assigned} assigned · {pending} pending
        </span>
        <button
          type="button"
          className="px-4 py-1.5 border-none rounded-md text-[13px] font-medium cursor-pointer transition-all duration-150 font-sans bg-linear-to-br from-[#238636] to-[#2ea043] text-white hover:from-[#2ea043] hover:to-accent-green disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={pending === 0 || saving}
          onClick={onSave}
        >
          {saving ? "Saving..." : "💾 Save Changes"}
        </button>
      </div>
    </header>
  );
}
