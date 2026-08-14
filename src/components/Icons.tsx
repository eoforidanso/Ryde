import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;

const base = (props: P) => ({
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  width: 20,
  height: 20,
  ...props,
});

export const IconSearch = (p: P) => (
  <svg {...base(p)}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
);

export const IconPin = (p: P) => (
  <svg {...base(p)}><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" /><circle cx="12" cy="10" r="2.6" /></svg>
);

export const IconClock = (p: P) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 1.8" /></svg>
);

export const IconStar = (p: P) => (
  <svg {...base(p)}><path d="m12 3.6 2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 17l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8Z" /></svg>
);

export const IconStarFilled = (p: P) => (
  <svg {...base(p)} fill="currentColor" stroke="none"><path d="m12 3.6 2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 17l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8Z" /></svg>
);

export const IconWallet = (p: P) => (
  <svg {...base(p)}><path d="M3.5 8.5A2.5 2.5 0 0 1 6 6h11a2 2 0 0 1 2 2v1" /><rect x="3.5" y="8.5" width="17" height="10.5" rx="2.5" /><circle cx="16" cy="14" r="1.2" fill="currentColor" stroke="none" /></svg>
);

export const IconUser = (p: P) => (
  <svg {...base(p)}><circle cx="12" cy="8.5" r="3.6" /><path d="M4.8 20a7.4 7.4 0 0 1 14.4 0" /></svg>
);

export const IconCar = (p: P) => (
  <svg {...base(p)}><path d="M4 16.5v2a1 1 0 0 0 1 1h1.6a1 1 0 0 0 1-1v-2M15.4 16.5v2a1 1 0 0 0 1 1H18a1 1 0 0 0 1-1v-2" /><path d="M3.6 16.5h15.8v-4.2l-1.6-4.1A2 2 0 0 0 15.9 7H7.1a2 2 0 0 0-1.9 1.2l-1.6 4.1Z" /><path d="M4 12.4h15.4" /><circle cx="7.2" cy="14.4" r=".9" fill="currentColor" stroke="none" /><circle cx="15.8" cy="14.4" r=".9" fill="currentColor" stroke="none" /></svg>
);

export const IconBike = (p: P) => (
  <svg {...base(p)}><circle cx="5.6" cy="16.4" r="3.4" /><circle cx="18.4" cy="16.4" r="3.4" /><path d="M5.6 16.4 9.4 9h4.2l3 7.4M9.4 9 8 6.2h2.9M13.6 9h3.2" /></svg>
);

export const IconVan = (p: P) => (
  <svg {...base(p)}><path d="M3 16.6V9.4A1.4 1.4 0 0 1 4.4 8h9.2l4.2 3.4H20a1 1 0 0 1 1 1v4.2Z" /><path d="M13.6 8v3.4" /><circle cx="7.6" cy="16.8" r="2.2" /><circle cx="16.6" cy="16.8" r="2.2" /></svg>
);

export const IconTricycle = (p: P) => (
  <svg {...base(p)}><circle cx="5" cy="17" r="2.8" /><circle cx="18.6" cy="17" r="2.4" /><circle cx="12.6" cy="17" r="2.4" /><path d="M5 17 8.6 8h3.8v6M12.4 10.4h5.4l1.4 4.4" /></svg>
);

export const IconShield = (p: P) => (
  <svg {...base(p)}><path d="M12 21c4.4-1.9 7-5.2 7-9.4V6.3L12 3.5 5 6.3v5.3c0 4.2 2.6 7.5 7 9.4Z" /><path d="m9.2 11.9 2 2 3.6-3.8" /></svg>
);

export const IconPhone = (p: P) => (
  <svg {...base(p)}><path d="M7.4 4h-2A1.4 1.4 0 0 0 4 5.5C4 13.4 10.6 20 18.5 20A1.4 1.4 0 0 0 20 18.6v-2a1 1 0 0 0-.8-1l-3-.6a1 1 0 0 0-1 .4l-.9 1.3a11.6 11.6 0 0 1-4.9-5l1.3-.8a1 1 0 0 0 .4-1.1l-.6-2.9a1 1 0 0 0-1-.8Z" /></svg>
);

export const IconChat = (p: P) => (
  <svg {...base(p)}><path d="M20 12.4c0 3.8-3.6 6.9-8 6.9a9.4 9.4 0 0 1-2.6-.4L4.6 20.5l1.2-3.4A6.5 6.5 0 0 1 4 12.4c0-3.8 3.6-6.9 8-6.9s8 3.1 8 6.9Z" /></svg>
);

export const IconX = (p: P) => (
  <svg {...base(p)}><path d="m6.5 6.5 11 11M17.5 6.5l-11 11" /></svg>
);

export const IconChevron = (p: P) => (
  <svg {...base(p)}><path d="m9.5 5.5 7 6.5-7 6.5" /></svg>
);

export const IconBack = (p: P) => (
  <svg {...base(p)}><path d="M19 12H5M11 5.5 4.5 12l6.5 6.5" /></svg>
);

export const IconHome = (p: P) => (
  <svg {...base(p)}><path d="M4 10.6 12 4l8 6.6V19a1.4 1.4 0 0 1-1.4 1.4H5.4A1.4 1.4 0 0 1 4 19Z" /><path d="M9.6 20.4v-6h4.8v6" /></svg>
);

export const IconBriefcase = (p: P) => (
  <svg {...base(p)}><rect x="3.4" y="7.6" width="17.2" height="12" rx="2" /><path d="M9 7.6V6a1.6 1.6 0 0 1 1.6-1.6h2.8A1.6 1.6 0 0 1 15 6v1.6M3.4 12.6h17.2" /></svg>
);

export const IconPlus = (p: P) => (
  <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>
);

export const IconShare = (p: P) => (
  <svg {...base(p)}><circle cx="17.5" cy="6" r="2.6" /><circle cx="6.5" cy="12" r="2.6" /><circle cx="17.5" cy="18" r="2.6" /><path d="m8.8 10.8 6.4-3.5M8.8 13.2l6.4 3.5" /></svg>
);

export const IconRoute = (p: P) => (
  <svg {...base(p)}><circle cx="6" cy="6.5" r="2.4" /><circle cx="18" cy="17.5" r="2.4" /><path d="M8.4 6.5h5.1a3.4 3.4 0 0 1 0 6.8h-3a3.4 3.4 0 0 0 0 4.2h5.1" /></svg>
);

export const IconReceipt = (p: P) => (
  <svg {...base(p)}><path d="M6 3.5h12v17l-2.4-1.6-2.4 1.6-2.4-1.6L8.4 20.5 6 18.9Z" /><path d="M9.2 8.6h5.6M9.2 12.4h5.6" /></svg>
);

export const IconLightning = (p: P) => (
  <svg {...base(p)}><path d="M13.4 3 5.8 13.4h5.1L10.6 21l7.6-10.4h-5.1Z" /></svg>
);

export const IconAlert = (p: P) => (
  <svg {...base(p)}><path d="M12 4.2 21 19.4H3Z" /><path d="M12 10v4M12 16.6h.01" /></svg>
);

export const IconPackage = (p: P) => (
  <svg {...base(p)}><path d="M20 8.2 12 4 4 8.2v7.6L12 20l8-4.2Z" /><path d="M4 8.2 12 12.5l8-4.3M12 12.5V20" /></svg>
);

export const IconCalendar = (p: P) => (
  <svg {...base(p)}><rect x="3.6" y="5.4" width="16.8" height="15" rx="2.2" /><path d="M3.6 10h16.8M8.4 3.5v3.6M15.6 3.5v3.6" /></svg>
);

export const IconUsers = (p: P) => (
  <svg {...base(p)}><circle cx="9.4" cy="8.4" r="3.2" /><path d="M3.6 19.4a5.8 5.8 0 0 1 11.6 0" /><path d="M16 5.6a3.2 3.2 0 0 1 0 5.6M17.4 14.4a5.8 5.8 0 0 1 3 5" /></svg>
);
