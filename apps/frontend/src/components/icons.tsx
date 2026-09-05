type P = { size?: number; className?: string };

function base(size?: number, className?: string) {
  return {
    width: size ?? 17,
    height: size ?? 17,
    viewBox: "0 0 24 24",
    className: className ? `ic ${className}` : "ic",
  } as const;
}

export const IconPlus = (p: P) => (
  <svg {...base(p.size, p.className)}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconHome = (p: P) => (
  <svg {...base(p.size, p.className)}><path d="M3.5 10.5L12 4l8.5 6.5" /><path d="M6 9.5V20h12V9.5" /><path d="M10 20v-6h4v6" /></svg>
);
export const IconChat = (p: P) => (
  <svg {...base(p.size, p.className)}><path d="M21 12a8 8 0 0 1-8 8H7l-4 3v-8a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z" /></svg>
);
export const IconSpark = (p: P) => (
  <svg {...base(p.size, p.className)}><path d="M12 3l2.5 5.2L20 9l-4 3.9 1 5.6-5-2.6-5 2.6 1-5.6L4 9l5.5-.8z" /></svg>
);
export const IconUsers = (p: P) => (
  <svg {...base(p.size, p.className)}><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5" /><circle cx="17" cy="9" r="2.5" /><path d="M17.5 14.4c2 .6 3.5 2.3 3.5 4.4" /></svg>
);
export const IconClock = (p: P) => (
  <svg {...base(p.size, p.className)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>
);
export const IconFolder = (p: P) => (
  <svg {...base(p.size, p.className)}><path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4l2 2.5h8A1.5 1.5 0 0 1 20.5 9v8.5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z" /></svg>
);
export const IconGear = (p: P) => (
  <svg {...base(p.size, p.className)}><circle cx="12" cy="12" r="3.2" /><path d="M12 2.8l1.3 2.6 2.9.4 2.1 2.1-.4 2.9 2.6 1.3-2.6 1.3.4 2.9-2.1 2.1-2.9-.4-1.3 2.6-1.3-2.6-2.9.4-2.1-2.1.4-2.9L2.8 12l2.6-1.3-.4-2.9 2.1-2.1 2.9.4z" /></svg>
);
export const IconSend = (p: P) => (
  <svg {...base(p.size, p.className)}><path d="M12 19V5M5 12l7-7 7 7" /></svg>
);
export const IconSearch = (p: P) => (
  <svg {...base(p.size, p.className)}><circle cx="11" cy="11" r="6" /><path d="M20 20l-4-4" /></svg>
);
export const IconCheck = (p: P) => (
  <svg {...base(p.size, p.className)} style={{ strokeWidth: 3 }}><path d="M5 12l4 4 10-10" /></svg>
);
export const IconDoc = (p: P) => (
  <svg {...base(p.size, p.className)}><path d="M6 3h8l4 4v14H6zM14 3v4h4" /></svg>
);
export const IconDown = (p: P) => (
  <svg {...base(p.size, p.className)}><path d="M19 9l-7 7-7-7" /></svg>
);
export const IconChevR = (p: P) => (
  <svg {...base(p.size, p.className)}><path d="M9 6l6 6-6 6" /></svg>
);
export const IconRefresh = (p: P) => (
  <svg {...base(p.size, p.className)}><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M6.1 8A7 7 0 0 1 18 6l2 2M18 16a7 7 0 0 1-12 2l-2-2" /></svg>
);
export const IconStop = (p: P) => (
  <svg {...base(p.size, p.className)}><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
);
export const IconFiles = (p: P) => (
  <svg {...base(p.size, p.className)}><path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M13 3v6h6" /></svg>
);
export const IconArrowUp = (p: P) => (
  <svg {...base(p.size, p.className)}><path d="M12 19V5M5 12l7-7 7 7" /></svg>
);
export const IconLink = (p: P) => (
  <svg {...base(p.size, p.className)}><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5" /><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5" /></svg>
);
