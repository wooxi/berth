import { useState, type FormEvent } from 'react'
import { api } from '../api'
import { BerthMark } from '../components/BerthMark'
import { Spinner } from '../components/common'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'

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
    <div className="grid h-full grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(420px,1fr)]">
      {/* 左：品牌展示（宽屏） */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-primary p-12 text-primary-foreground lg:flex">
        <div className="flex items-center gap-3">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <rect x="0.75" y="0.75" width="30.5" height="30.5" rx="9" className="stroke-primary-foreground" strokeWidth="1.5" />
            <path d="M9.5 21.6V14.2c0-1.05.85-1.9 1.9-1.9h9.2c1.05 0 1.9.85 1.9 1.9v7.4" className="stroke-primary-foreground" strokeWidth="2" strokeLinecap="round" />
            <circle cx="16" cy="19.4" r="2.2" className="fill-primary-foreground" />
          </svg>
          <span className="text-xl font-semibold tracking-tight">Berth</span>
        </div>
        <div>
          <h2 className="max-w-md text-4xl leading-tight font-semibold tracking-tight">服务器控制台</h2>
        </div>
        <p className="font-mono text-xs opacity-60">SSH · SFTP · Docker</p>
      </section>

      {/* 右：登录表单 */}
      <div className="grid place-items-center p-6">
        <form className="w-full max-w-sm" method="post" onSubmit={submit} aria-labelledby="login-title">
          <BerthMark size={36} className="lg:hidden" />
          <h1 id="login-title" className="mt-4 text-2xl font-semibold tracking-tight lg:mt-0">登录 Berth</h1>

          <div className="mt-8 grid gap-2">
            <label htmlFor="login-password" className="text-[13px] font-medium">口令</label>
            <Input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              autoFocus
              value={password}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'login-error' : undefined}
              onChange={(event) => setPassword(event.currentTarget.value)}
              className="h-10"
            />
            {error && <p id="login-error" role="alert" className="text-xs text-destructive">{error}</p>}
          </div>

          <Button type="submit" className="mt-6 h-10 w-full" disabled={busy}>
            {busy && <Spinner />}
            {busy ? '验证中…' : '进入'}
          </Button>
        </form>
      </div>
    </div>
  )
}
