import { ErrorBoundary, Pending, resource } from '@opentf/afw';

// Each run waits for the test to settle it: window.__settle(value) / window.__fail(message).
const controlled = () => new Promise((resolve, reject) => {
  window.__settle = resolve;
  window.__fail = (message) => reject(new Error(message));
});

function Bio() {
  const bio = resource(controlled);
  return <p data-testid="bio">{bio.data}</p>;
}

export default function PendingDemo() {
  const user = resource(() => new Promise((resolve) => (window.__user = resolve)));
  window.__refetchUser = () => user.refetch();
  return (
    <ErrorBoundary fallback={(error, retry) => <button type="button" data-testid="retry" onclick={retry}>{error.message}</button>}>
      <Pending fallback={<p data-testid="skeleton">Loading…</p>} refreshing={<p data-testid="updating">Updating…</p>}>
        <h1 data-testid="name">{user.data?.name}</h1>
        <Bio />
      </Pending>
    </ErrorBoundary>
  );
}
