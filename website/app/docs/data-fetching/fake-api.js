// A pretend API for the data-fetching demos: answers after a delay, can be told to fail,
// and honours the abort signal `resource()` passes, as a real fetch would.
const PEOPLE = [
  { name: "Ada Lovelace", role: "Analyst", joined: 1843 },
  { name: "Grace Hopper", role: "Compiler author", joined: 1952 },
  { name: "Alan Turing", role: "Theorist", joined: 1936 },
  { name: "Katherine Johnson", role: "Mathematician", joined: 1953 },
];

export function fakeRequest(make, { delay = 700, fail = false, signal } = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => (fail ? reject(new Error("The server answered 503 (simulated)")) : resolve(make())), delay);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
}

export const person = (id) => ({ id, ...PEOPLE[(id - 1) % PEOPLE.length] });
export const activity = (id) => [`Signed in`, `Edited profile #${id}`, `Starred a repository`].map((what, i) => `${what} · ${i + 1}h ago`);
