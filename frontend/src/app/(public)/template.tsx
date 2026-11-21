/** Dirender ulang setiap pindah halaman → memicu transisi masuk yang halus. */
export default function PublicTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
