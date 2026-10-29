/**
 * Illustrated scenes in the TIGERIS palette (decision: illustrated SVG instead of photography).
 * Purely decorative: every scene is aria-hidden and carries no data. Towers are generic forms, not
 * reproductions of specific landmarks.
 */
import type { SectorKey } from '@tigeris/shared';
import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

const SAND = '#e6d6b4';
const SAND_DARK = '#cdb791';
const STONE = '#d9c39a';
const STONE_DARK = '#b99c69';
const EMERALD = '#2f6b55';
const EMERALD_DARK = '#1d4a3a';
const GOLD = '#b8924f';
const TEAL = '#5aa3a3';

/** Deterministic pseudo-random so scenes render identically on every load. */
function rand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function Palm({
  x,
  y,
  s = 1,
  color = EMERALD_DARK,
  opacity = 0.9,
}: {
  x: number;
  y: number;
  s?: number;
  color?: string;
  opacity?: number;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill={color} opacity={opacity}>
      <path d="M-1.6 0 C-1 -20 -2 -40 -4 -60 L0 -60 C1 -40 1.2 -20 1.6 0 Z" />
      <g transform="translate(-2 -60)">
        <path d="M0 0 C-10 -10 -24 -10 -34 -2 C-22 -5 -12 -4 0 2 Z" />
        <path d="M0 0 C10 -10 24 -10 34 -2 C22 -5 12 -4 0 2 Z" />
        <path d="M0 0 C-5 -12 -15 -19 -26 -19 C-16 -14 -8 -8 0 2 Z" />
        <path d="M0 0 C5 -12 15 -19 26 -19 C16 -14 8 -8 0 2 Z" />
        <path d="M0 0 C-12 -1 -22 5 -28 15 C-19 8 -9 5 0 3 Z" />
        <path d="M0 0 C12 -1 22 5 28 15 C19 8 9 5 0 3 Z" />
        <path d="M0 0 C-1 -10 1 -18 4 -24 C3 -15 2 -8 1 1 Z" />
      </g>
    </g>
  );
}

function Tower({
  x,
  base,
  w,
  h,
  fill = STONE,
  variant = 'flat',
}: {
  x: number;
  base: number;
  w: number;
  h: number;
  fill?: string;
  variant?: 'flat' | 'arch' | 'spire' | 'step' | 'slant';
}) {
  const top = base - h;
  const windows: ReactNode[] = [];
  for (let yy = top + 10; yy < base - 6; yy += 9) {
    windows.push(
      <line
        key={yy}
        x1={x + 3}
        y1={yy}
        x2={x + w - 3}
        y2={yy}
        stroke="#fff"
        strokeOpacity="0.28"
        strokeWidth="0.8"
      />,
    );
  }
  return (
    <g>
      {variant === 'arch' ? (
        <path
          d={`M${x} ${base} L${x} ${top} L${x + w * 0.3} ${top} Q${x + w / 2} ${top + h * 0.22} ${x + w * 0.7} ${top} L${x + w} ${top} L${x + w} ${base} Z`}
          fill={fill}
        />
      ) : variant === 'spire' ? (
        <>
          <path
            d={`M${x} ${base} L${x + w * 0.15} ${top} L${x + w * 0.85} ${top} L${x + w} ${base} Z`}
            fill={fill}
          />
          <line x1={x + w / 2} y1={top} x2={x + w / 2} y2={top - h * 0.25} stroke={fill} strokeWidth="2" />
        </>
      ) : variant === 'step' ? (
        <path
          d={`M${x} ${base} L${x} ${top + h * 0.3} L${x + w * 0.2} ${top + h * 0.3} L${x + w * 0.2} ${top + h * 0.12} L${x + w * 0.4} ${top + h * 0.12} L${x + w * 0.4} ${top} L${x + w * 0.6} ${top} L${x + w * 0.6} ${top + h * 0.12} L${x + w * 0.8} ${top + h * 0.12} L${x + w * 0.8} ${top + h * 0.3} L${x + w} ${top + h * 0.3} L${x + w} ${base} Z`}
          fill={fill}
        />
      ) : variant === 'slant' ? (
        <path d={`M${x} ${base} L${x} ${top + h * 0.15} L${x + w} ${top} L${x + w} ${base} Z`} fill={fill} />
      ) : (
        <rect x={x} y={top} width={w} height={h} fill={fill} />
      )}
      <rect x={x + w - w * 0.22} y={top + 4} width={w * 0.22} height={h - 4} fill="#fff" opacity="0.12" />
      {windows}
    </g>
  );
}

function Crane({ x, base, h, color = GOLD }: { x: number; base: number; h: number; color?: string }) {
  const top = base - h;
  return (
    <g stroke={color} strokeWidth="1.6" fill="none">
      <line x1={x} y1={base} x2={x} y2={top} />
      <line x1={x + 4} y1={base} x2={x + 4} y2={top} />
      {Array.from({ length: Math.floor(h / 10) }, (_, i) => (
        <line key={i} x1={x} y1={base - i * 10} x2={x + 4} y2={base - i * 10 - 10} strokeWidth="0.8" />
      ))}
      <line x1={x - 22} y1={top + 4} x2={x + 62} y2={top + 4} />
      <line x1={x + 2} y1={top - 8} x2={x - 22} y2={top + 4} strokeWidth="0.8" />
      <line x1={x + 2} y1={top - 8} x2={x + 62} y2={top + 4} strokeWidth="0.8" />
      <line x1={x + 46} y1={top + 4} x2={x + 46} y2={top + 26} strokeWidth="0.8" />
      <rect x={x + 43} y={top + 26} width="6" height="5" fill={color} />
    </g>
  );
}

function Ship({
  x,
  y,
  w,
  kind = 'container',
}: {
  x: number;
  y: number;
  w: number;
  kind?: 'container' | 'tanker';
}) {
  const colors = ['#2f6b55', '#b8924f', '#5aa3a3', '#a2392e', '#cdb791'];
  const r = rand(Math.round(x * 7 + y));
  return (
    <g>
      <path
        d={`M${x} ${y} L${x + w} ${y} L${x + w - w * 0.08} ${y + w * 0.11} L${x + w * 0.04} ${y + w * 0.11} Z`}
        fill={EMERALD_DARK}
      />
      <rect x={x + w * 0.78} y={y - w * 0.12} width={w * 0.1} height={w * 0.12} fill="#f3efe5" />
      {kind === 'container'
        ? Array.from({ length: 9 }, (_, i) =>
            Array.from({ length: 2 }, (_, j) => (
              <rect
                key={`${i}-${j}`}
                x={x + w * 0.1 + i * w * 0.07}
                y={y - (j + 1) * w * 0.045}
                width={w * 0.065}
                height={w * 0.042}
                fill={colors[Math.floor(r() * colors.length)]}
              />
            )),
          )
        : [0, 1, 2, 3].map((i) => (
            <ellipse
              key={i}
              cx={x + w * 0.18 + i * w * 0.15}
              cy={y - 2}
              rx={w * 0.06}
              ry={w * 0.025}
              fill="#f3efe5"
              stroke={STONE_DARK}
            />
          ))}
      <path
        d={`M${x - 20} ${y + w * 0.13} Q${x + w / 2} ${y + w * 0.16} ${x + w + 30} ${y + w * 0.13}`}
        stroke="#fff"
        strokeOpacity="0.7"
        fill="none"
      />
    </g>
  );
}

function Pylon({ x, base, h }: { x: number; base: number; h: number }) {
  const top = base - h;
  return (
    <g stroke={EMERALD} strokeWidth="1.3" fill="none">
      <path d={`M${x - h * 0.18} ${base} L${x} ${top} L${x + h * 0.18} ${base}`} />
      <line x1={x - h * 0.3} y1={top + h * 0.18} x2={x + h * 0.3} y2={top + h * 0.18} />
      <line x1={x - h * 0.22} y1={top + h * 0.34} x2={x + h * 0.22} y2={top + h * 0.34} />
      {[0.5, 0.7, 0.85].map((f) => (
        <line
          key={f}
          x1={x - h * 0.18 * f}
          y1={top + h * f}
          x2={x + h * 0.18 * f}
          y2={top + h * f}
          strokeWidth="0.8"
        />
      ))}
    </g>
  );
}

function Factory({ x, base, w }: { x: number; base: number; w: number }) {
  const teeth = 5;
  const tw = w / teeth;
  let d = `M${x} ${base} L${x} ${base - 26}`;
  for (let i = 0; i < teeth; i++) d += ` L${x + i * tw + tw} ${base - 40} L${x + i * tw + tw} ${base - 26}`;
  d += ` L${x + w} ${base} Z`;
  return (
    <g>
      <path d={d} fill="#efe6d2" stroke={STONE_DARK} strokeWidth="0.8" />
      <rect x={x + w * 0.15} y={base - 18} width={w * 0.7} height="6" fill={EMERALD} opacity="0.7" />
      <rect x={x + w + 6} y={base - 70} width="7" height="70" fill={STONE} />
      <rect x={x + w + 18} y={base - 58} width="6" height="58" fill={STONE} />
    </g>
  );
}

function Tanks({ x, base }: { x: number; base: number }) {
  return (
    <g>
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect
            x={x + i * 30}
            y={base - 26}
            width="24"
            height="26"
            fill="#f3efe5"
            stroke={STONE_DARK}
            strokeWidth="0.8"
          />
          <ellipse
            cx={x + i * 30 + 12}
            cy={base - 26}
            rx="12"
            ry="3.5"
            fill="#fff"
            stroke={STONE_DARK}
            strokeWidth="0.8"
          />
        </g>
      ))}
    </g>
  );
}

function Containers({ x, base }: { x: number; base: number }) {
  const colors = ['#2f6b55', '#b8924f', '#5aa3a3', '#cdb791', '#a2392e'];
  const r = rand(x);
  return (
    <g>
      {Array.from({ length: 6 }, (_, i) =>
        Array.from({ length: 3 }, (_, j) => (
          <rect
            key={`${i}-${j}`}
            x={x + i * 16}
            y={base - (j + 1) * 9}
            width="15"
            height="8.4"
            fill={colors[Math.floor(r() * 5)]}
          />
        )),
      )}
    </g>
  );
}

function Domes({ x, base }: { x: number; base: number }) {
  return (
    <g>
      {[0, 1].map((i) => (
        <path
          key={i}
          d={`M${x + i * 46} ${base} A20 20 0 0 1 ${x + i * 46 + 40} ${base} Z`}
          fill="#f3efe5"
          stroke={STONE_DARK}
          strokeWidth="0.8"
        />
      ))}
      <rect x={x + 96} y={base - 46} width="8" height="46" fill={STONE} />
      <ellipse cx={x + 100} cy={base - 50} rx="13" ry="7" fill={TEAL} opacity="0.8" />
    </g>
  );
}

function Columns({ x, base }: { x: number; base: number }) {
  return (
    <g fill="#f3efe5" stroke={STONE_DARK} strokeWidth="0.8">
      <path d={`M${x - 6} ${base - 52} L${x + 51} ${base - 70} L${x + 108} ${base - 52} Z`} />
      <rect x={x - 6} y={base - 52} width="114" height="6" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={i} x={x + 2 + i * 18} y={base - 46} width="8" height="40" />
      ))}
      <rect x={x - 10} y={base - 6} width="122" height="6" />
    </g>
  );
}

function Shield({ x, base }: { x: number; base: number }) {
  return (
    <path
      d={`M${x} ${base - 80} L${x + 34} ${base - 92} L${x + 68} ${base - 80} L${x + 68} ${base - 50} Q${x + 68} ${base - 20} ${x + 34} ${base - 6} Q${x} ${base - 20} ${x} ${base - 50} Z`}
      fill="none"
      stroke={GOLD}
      strokeWidth="2"
    />
  );
}

function Backdrop({ id, w, h }: { id: string; w: number; h: number }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fbf7ee" stopOpacity="0" />
          <stop offset="1" stopColor="#f1e5cb" />
        </linearGradient>
        <linearGradient id={`${id}-fade`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="white" stopOpacity="0" />
          <stop offset="0.25" stopColor="white" stopOpacity="1" />
        </linearGradient>
        <mask id={`${id}-mask`}>
          <rect width={w} height={h} fill={`url(#${id}-fade)`} />
        </mask>
      </defs>
      <rect width={w} height={h} fill={`url(#${id}-sky)`} />
      <path
        d={`M0 ${h - 52} L${w * 0.12} ${h - 92} L${w * 0.22} ${h - 70} L${w * 0.35} ${h - 110} L${w * 0.48} ${h - 74} L${w * 0.62} ${h - 100} L${w * 0.78} ${h - 66} L${w * 0.9} ${h - 88} L${w} ${h - 60} L${w} ${h} L0 ${h} Z`}
        fill={SAND}
        opacity="0.6"
      />
    </>
  );
}

/** Banner illustration for a sector command centre header (right-aligned, fades to the left). */
export function SectorBanner({ sector, className }: { sector: SectorKey; className?: string }) {
  const id = useId().replace(/:/g, '');
  const W = 640;
  const H = 200;
  const base = H - 30;
  const skyline = (seed: number, from: number, to: number, fill = STONE) => {
    const r = rand(seed);
    const out: ReactNode[] = [];
    const variants = ['flat', 'arch', 'spire', 'step', 'slant'] as const;
    for (let x = from; x < to;) {
      const w = 14 + r() * 18;
      const h = 40 + r() * 90;
      out.push(
        <Tower
          key={x}
          x={x}
          base={base}
          w={w}
          h={h}
          fill={fill}
          variant={variants[Math.floor(r() * variants.length)]!}
        />,
      );
      x += w + 4 + r() * 6;
    }
    return out;
  };
  const scene: Record<SectorKey, ReactNode> = {
    energy: (
      <>
        {skyline(3, 220, 340, SAND_DARK)}
        <Tanks x={370} base={base} />
        <rect x={470} y={base - 90} width="6" height="90" fill={STONE_DARK} />
        <path d={`M473 ${base - 90} q-6 -14 0 -22 q6 10 0 22`} fill={GOLD} />
        <rect x={488} y={base - 64} width="10" height="64" fill={STONE} />
        <Ship x={330} y={base + 8} w={210} kind="tanker" />
        <Palm x={600} y={base} s={0.9} />
      </>
    ),
    utilities: (
      <>
        {skyline(5, 210, 330, SAND_DARK)}
        <Pylon x={360} base={base} h={110} />
        <Pylon x={450} base={base} h={96} />
        <path
          d={`M300 ${base - 92} Q405 ${base - 70} 510 ${base - 80}`}
          stroke={EMERALD}
          strokeWidth="0.8"
          fill="none"
        />
        <Domes x={470} base={base} />
        <Palm x={612} y={base} s={0.85} />
      </>
    ),
    capital: (
      <>
        {skyline(11, 220, 600)}
        <Palm x={250} y={base} s={0.9} />
        <Palm x={590} y={base} s={1} />
      </>
    ),
    supply_chain: (
      <>
        <Crane x={300} base={base} h={110} />
        <Crane x={380} base={base} h={96} color={EMERALD} />
        <Containers x={410} base={base} />
        <Ship x={260} y={base + 6} w={250} />
        <Palm x={600} y={base} s={0.9} />
      </>
    ),
    banking: (
      <>
        {skyline(17, 360, 600)}
        <Columns x={230} base={base} />
        <Palm x={612} y={base} s={0.85} />
      </>
    ),
    manufacturing: (
      <>
        <Factory x={250} base={base} w={150} />
        <Tanks x={450} base={base} />
        <Palm x={590} y={base} s={0.9} />
      </>
    ),
    real_estate: (
      <>
        {skyline(23, 260, 470)}
        <Crane x={300} base={base - 60} h={70} />
        <Crane x={420} base={base - 40} h={80} color={EMERALD} />
        <Palm x={520} y={base} s={0.9} />
        <Palm x={590} y={base} s={1.05} />
      </>
    ),
    insurance: (
      <>
        {skyline(29, 330, 600)}
        <Shield x={240} base={base} />
        <Palm x={612} y={base} s={0.85} />
      </>
    ),
  };
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMaxYMax slice"
      className={cn('pointer-events-none', className)}
      aria-hidden
    >
      <g mask={`url(#${id}-mask)`}>
        <Backdrop id={id} w={W} h={H} />
        <g stroke={GOLD} strokeOpacity="0.3" fill="none">
          <circle cx={W - 80} cy={H + 40} r="150" />
          <circle cx={W - 80} cy={H + 40} r="200" />
        </g>
        {scene[sector]}
        <rect x="0" y={base} width={W} height={H - base} fill={SAND} opacity="0.75" />
      </g>
    </svg>
  );
}

/** Sign-in hero: Gulf city skyline at golden hour with gold arcs and mashrabiya walls. */
export function SkylineHero({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  const W = 1000;
  const H = 640;
  const base = 470;
  const r = rand(7);
  const far: ReactNode[] = [];
  for (let x = 40; x < 980;) {
    const w = 12 + r() * 20;
    const h = 40 + r() * 110;
    far.push(<rect key={x} x={x} y={base - h} width={w} height={h} fill="#e8dcc2" />);
    x += w + 2 + r() * 8;
  }
  const mid: [number, number, number, 'flat' | 'arch' | 'spire' | 'step' | 'slant'][] = [
    [90, 36, 250, 'spire'],
    [150, 30, 170, 'flat'],
    [205, 28, 200, 'step'],
    [262, 40, 150, 'flat'],
    [330, 54, 300, 'arch'],
    [410, 30, 190, 'slant'],
    [455, 26, 230, 'spire'],
    [500, 34, 160, 'flat'],
    [560, 30, 200, 'step'],
    [610, 44, 140, 'flat'],
    [690, 28, 210, 'spire'],
    [740, 36, 170, 'slant'],
    [800, 30, 120, 'flat'],
    [860, 24, 190, 'step'],
  ];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" className={className} aria-hidden>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fbf8f0" />
          <stop offset="0.6" stopColor="#f6ead2" />
          <stop offset="1" stopColor="#efdcb6" />
        </linearGradient>
        <radialGradient id={`${id}-sun`} cx="0.62" cy="0.62" r="0.45">
          <stop offset="0" stopColor="#fff6dc" stopOpacity="1" />
          <stop offset="1" stopColor="#fff6dc" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-tower`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e2cfa8" />
          <stop offset="1" stopColor="#c9b086" />
        </linearGradient>
        <linearGradient id={`${id}-haze`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fbf7ee" stopOpacity="0" />
          <stop offset="1" stopColor="#fbf7ee" stopOpacity="0.85" />
        </linearGradient>
        <pattern id={`${id}-lattice`} width="14" height="14" patternUnits="userSpaceOnUse">
          <path d="M7 0 L14 7 L7 14 L0 7 Z" fill="none" stroke="#c9b086" strokeWidth="1.2" />
          <circle cx="7" cy="7" r="1.6" fill="#c9b086" />
        </pattern>
      </defs>
      <rect width={W} height={H} fill={`url(#${id}-sky)`} />
      <rect width={W} height={H} fill={`url(#${id}-sun)`} />
      <g stroke={GOLD} strokeOpacity="0.35" fill="none">
        <circle cx="820" cy="760" r="320" />
        <circle cx="820" cy="760" r="420" />
        <circle cx="820" cy="760" r="520" />
        <line x1="900" y1="0" x2="900" y2={H} strokeOpacity="0.2" />
        <line x1="940" y1="0" x2="940" y2={H} strokeOpacity="0.2" />
      </g>
      <g opacity="0.75">{far}</g>
      <rect x="0" y={base - 160} width={W} height="160" fill={`url(#${id}-haze)`} />
      {mid.map(([x, w, h, v]) => (
        <Tower key={x} x={x} base={base} w={w} h={h} fill={`url(#${id}-tower)`} variant={v} />
      ))}
      <rect x="0" y={base} width={W} height={H - base} fill="#efe2c6" />
      <rect x="0" y={base - 6} width={W} height="12" fill="#e6d4ae" />
      <g>
        <rect x="-10" y="400" width="200" height="240" fill="#eadcbf" />
        <rect x="-10" y="400" width="200" height="240" fill={`url(#${id}-lattice)`} opacity="0.65" />
        <rect x="-10" y="392" width="210" height="10" fill="#dcc9a2" />
        <rect x="830" y="380" width="190" height="260" fill="#eadcbf" />
        <rect x="830" y="380" width="190" height="260" fill={`url(#${id}-lattice)`} opacity="0.65" />
        <rect x="820" y="372" width="200" height="10" fill="#dcc9a2" />
      </g>
      <Palm x={150} y={470} s={1.9} />
      <Palm x={60} y={520} s={2.4} />
      <Palm x={880} y={470} s={2} />
      <Palm x={960} y={520} s={2.5} />
      <path d={`M0 ${H - 40} Q${W / 2} ${H - 70} ${W} ${H - 40} L${W} ${H} L0 ${H} Z`} fill="#f7f0e0" />
    </svg>
  );
}

/** Sidebar foot: dunes, palms and a fading lattice. */
export function SidebarLandscape({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 260 220" preserveAspectRatio="xMidYMax slice" className={className} aria-hidden>
      <defs>
        <linearGradient id={`${id}-fade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f3efe5" stopOpacity="1" />
          <stop offset="0.5" stopColor="#f3efe5" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g stroke={GOLD} strokeOpacity="0.35" fill="none">
        {[0, 1, 2, 3].map((i) => (
          <path
            key={i}
            d={`M${-20 + i * 40} 110 L${20 + i * 40} 70 L${60 + i * 40} 110 L${20 + i * 40} 150 Z`}
          />
        ))}
      </g>
      <path d="M0 150 Q60 120 130 140 T260 130 L260 220 L0 220 Z" fill="#e8d8b5" />
      <path d="M0 175 Q80 150 160 170 T260 165 L260 220 L0 220 Z" fill="#dcc59a" />
      <Palm x={40} y={180} s={0.75} />
      <Palm x={78} y={186} s={0.6} />
      <Palm x={200} y={176} s={0.7} opacity={0.8} />
      <rect width="260" height="220" fill={`url(#${id}-fade)`} />
    </svg>
  );
}
