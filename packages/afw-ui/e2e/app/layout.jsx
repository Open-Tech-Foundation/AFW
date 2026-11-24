// A plain wrapper: pages bring their own landmarks (the app shell has its <main>).
export default function Layout({ children }) {
  return <div>{children}</div>;
}
