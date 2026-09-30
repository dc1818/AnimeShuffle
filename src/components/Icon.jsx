/** Shared inline icons keep the interface consistent without loading an icon font. */
const paths = {
  shuffle: "m3 5 4 0 10 14h4m-4-4 4 4-4 4M3 19h4l3-4m4-6 3-4h4m-4-4 4 4-4 4",
  bookmark: "M6 3h12v18l-6-4-6 4Z",
  thumbUp: "M7 10h-4v11h4m0-11 5-8c3 0 2 5 2 7h5q3 0 2 3l-2 7q0 2-3 2H7Z",
  thumbDown: "M7 14H3V3h4m0 11 5 8c3 0 2-5 2-7h5q3 0 2-3l-2-7q0-2-3-2H7Z",
  ban: "M5 5l14 14M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  info: "M12 11v6m0-10v1M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  close: "m6 6 12 12M6 18 18 6",
  chevron: "m9 5 7 7-7 7",
  skip: "m5 4 12 8-12 8ZM20 4v16",
  undo: "M3 10h10a7 7 0 0 1 0 14M3 10l6-6M3 10l6 6",
  link: "m10 14 4-4m-6 6-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 12a4 4 0 0 0 6 0l5-5a4 4 0 0 0-6-6l-1 1",
  settings:
    "M12 3v3m0 12v3M3 12h3m12 0h3M5 5l3 3m8 8 3 3M5 19l3-3m8-8 3-3M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0",
  compass: "m16 8-3 5-5 3 3-5ZM22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  image: "M3 3h18v18H3Zm0 14 5-5 5 5 4-4 4 4M7 7h1",
  external: "M14 3h7v7m0-7L10 14M10 3H3v18h18v-7",
  refresh: "M20 7a9 9 0 1 0 1 9M20 2v6h-6",
};
export function Icon({ name }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[name] || paths.shuffle} />
    </svg>
  );
}
