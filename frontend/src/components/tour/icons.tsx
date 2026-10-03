import type { SVGProps } from 'react';

/** Line icons drawn with SVG, so that they look the same on every phone (the Unicode glyphs they replace do not). Decorative: the button carries the label. */
const base = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: false } as const;
type Props = SVGProps<SVGSVGElement>;

export const PinIcon = (props: Props) => <svg {...base} {...props}><path d="M12 21s-6.5-5.7-6.5-11a6.5 6.5 0 0 1 13 0c0 5.3-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.3" /></svg>;
export const ListIcon = (props: Props) => <svg {...base} {...props}><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" strokeWidth="2.6" /></svg>;
export const FrameIcon = (props: Props) => <svg {...base} {...props}><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="m4 17 5-5 4 4 3-3 4 4" /></svg>;
export const ChevronDownIcon = (props: Props) => <svg {...base} {...props}><path d="m6 9 6 6 6-6" /></svg>;
export const ChevronLeftIcon = (props: Props) => <svg {...base} {...props}><path d="m15 6-6 6 6 6" /></svg>;
export const ChevronRightIcon = (props: Props) => <svg {...base} {...props}><path d="m9 6 6 6-6 6" /></svg>;
/** A circular arrow with 15 inside it, the way players draw "back 15 seconds" and "forward 15 seconds". */
export const SkipBackIcon = (props: Props) => <svg {...base} width={28} height={28} {...props}><path d="M5 12a7.5 7.5 0 1 0 2.4-5.5" /><path d="M5 4.5v4h4" /><text x="12" y="15.2" fontSize="7" textAnchor="middle" fill="currentColor" stroke="none">15</text></svg>;
export const SkipForwardIcon = (props: Props) => <svg {...base} width={28} height={28} {...props}><path d="M19 12a7.5 7.5 0 1 1-2.4-5.5" /><path d="M19 4.5v4h-4" /><text x="12" y="15.2" fontSize="7" textAnchor="middle" fill="currentColor" stroke="none">15</text></svg>;
