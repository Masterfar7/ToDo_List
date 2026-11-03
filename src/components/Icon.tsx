type Name =
  | 'grid'
  | 'clock'
  | 'check'
  | 'plus'
  | 'arrow'
  | 'cloud'
  | 'device'
  | 'spark'
  | 'edit'
  | 'close'
  | 'trash';
const paths: Record<Name, string> = {
  edit: 'm15 4 5 5M4 20l5-1L21 7a2.1 2.1 0 0 0-5-3L4 16z',
  close: 'm6 6 12 12M18 6 6 18',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  clock: 'M12 8v5l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  check: 'm5 12 4 4L19 6',
  plus: 'M12 5v14M5 12h14',
  arrow: 'M5 12h14m-5-5 5 5-5 5',
  cloud: 'M6 18a4 4 0 0 1-1-7.87 7 7 0 0 1 13.5-1.58A4.75 4.75 0 0 1 18 18H6',
  device: 'M3 4h18v13H3z M8 21h8 M12 17v4',
  spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z',
};
export function Icon({ name, className = '' }: { name: Name; className?: string }) {
  return (
    <svg
      className={`icon ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
