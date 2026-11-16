import { useState, type FormEvent } from 'react'
import { KeyRound, Network } from 'lucide-react'
import { api } from '../api'

export function LoginView({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await api.login(password)
      setPassword('')
      onLogin()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '登录失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-shell">
      <form className="login-card" method="post" onSubmit={submit} aria-labelledby="login-title">
        <span className="brand-mark login-mark" aria-hidden="true"><Network size={18} strokeWidth={2.2} /></span>
        <p className="eyebrow">PRIVATE WORKSPACE</p>
        <h1 id="login-title">Yard</h1>

        <div className="field">
          <label htmlFor="login-password">管理口令</label>
          <input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'login-error' : undefined}
            onChange={(event) => setPassword(event.currentTarget.value)}
            autoFocus
          />
          {error
            ? <p id="login-error" className="form-error" role="alert">{error}</p>
            : <span className="field-hint">会话有效期 8 小时，仅限内网</span>}
        </div>

        <button className="button button-primary login-submit" type="submit" disabled={busy}>
          <KeyRound size={15} aria-hidden="true" />
          {busy ? '验证中…' : '登录'}
        </button>
      </form>
    </div>
  )
}
