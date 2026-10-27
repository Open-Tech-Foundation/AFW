import { signal } from "@preact/signals"
import styles from "./SignupForm.module.css"

export default function SignupForm() {
  const username = signal("")
  const email = signal("")
  const password = signal("")
  const status = signal("")

  onMount(() => {
    console.log("SignupForm mounted")
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!username || !email || !password) {
      status = "❌ Please fill in all fields"
      return
    }

    status = "⏳ Creating your account..."

    setTimeout(() => {
      status = `✅ Welcome aboard, ${username}!`
      console.log({ username, email, password })
    }, 2000)
  }

  return (
    <div class={styles.card}>
      <h2 class={`${styles.title} green`}>Join AFW</h2>
      <p class={styles.subtitle}>Experience the future of zero-VDOM apps</p>

      <form onsubmit={handleSubmit}>
        <div class={styles.formGroup}>
          <label class={styles.label}>Username</label>
          <input
            class={styles.input}
            type="text"
            placeholder="johndoe"
            value={username}
            oninput={(e) => username = e.target.value}
          />
        </div>

        <div class={styles.formGroup}>
          <label class={styles.label}>Email Address</label>
          <input
            class={styles.input}
            type="email"
            placeholder="john@example.com"
            value={email}
            oninput={(e) => email = e.target.value}
          />
        </div>

        <div class={styles.formGroup}>
          <label class={styles.label}>Password</label>
          <input
            class={styles.input}
            type="password"
            placeholder="••••••••"
            value={password}
            oninput={(e) => password = e.target.value}
          />
        </div>

        <button type="submit" class={styles.button}>Create Account</button>
      </form>

      <div class={styles.statusMsg}>
        {status}
      </div>
    </div>
  )
}
