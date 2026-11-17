import { KeyRound, LockKeyhole, LogOut, Plus, Server, ShieldCheck, Users } from 'lucide-react'
import type { HostSnapshot } from '../api'
import { permissionLevels } from '../../shared/access-control'

export function AccessView({
  hosts,
  onAction,
  onLogout,
}: {
  hosts: HostSnapshot[]
  onAction: (message: string) => void
  onLogout: () => void
}) {
  return (
    <>
      <div className="page-head">
        <div>
            <h1>凭据与权限</h1>
          <p className="page-sub">单管理员模式 · SSH 私钥仅由服务端持有</p>
        </div>
        <div className="page-head-actions">
          <button className="button button-secondary" type="button" onClick={onLogout}>
            <LogOut size={14} aria-hidden="true" />退出登录
          </button>
        </div>
      </div>

      <div className="access-grid">
        <section className="panel" aria-labelledby="identity-title">
          <div className="panel-head">
            <div>
              <div className="section-title">
                <h2 id="identity-title">当前身份</h2>
                <span className="count">SESSION</span>
              </div>
              <p>工作区访问状态</p>
            </div>
            <span className="perm-chip"><i aria-hidden="true" />OWNER</span>
          </div>
          <div className="identity-card">
            <span className="profile-avatar">OW</span>
            <span>
              <b>Owner</b>
              <small>本机部署 · 仅内网可达</small>
            </span>
            <span className="live-chip"><i aria-hidden="true" />已登录</span>
          </div>
          <div className="facts-list">
            <div><span>已登记主机</span><b>{hosts.length} 台</b></div>
            <div><span>SSH 凭据</span><b>服务端只读挂载</b></div>
            <div><span>口令校验</span><b>SHA-256 恒定时间比较</b></div>
            <div><span>审计</span><b>全部操作留痕</b></div>
          </div>
        </section>

        <section className="panel" aria-labelledby="credential-title">
          <div className="panel-head">
            <div>
              <div className="section-title">
                <h2 id="credential-title">凭据关联</h2>
                <span className="count">NO SECRETS IN UI</span>
              </div>
              <p>凭据永不进入浏览器</p>
            </div>
            <button className="icon-button" type="button" aria-label="添加凭据" onClick={() => onAction('多凭据管理待开放，当前为单密钥模式')}>
              <Plus size={16} aria-hidden="true" />
            </button>
          </div>

          {hosts.map((host) => (
            <div className="cred-row" key={host.hostId}>
              <span className="identity-glyph" style={{ inlineSize: 28, blockSize: 28 }} aria-hidden="true"><Server size={14} /></span>
              <span>
                <b>{host.label}</b>
                <small>{host.address} · {host.fingerprint.slice(0, 22)}…</small>
              </span>
              <span className="cred-state">已固定</span>
            </div>
          ))}
          {hosts.length === 0 && <div className="term-empty" style={{ minBlockSize: 140 }}><KeyRound size={20} aria-hidden="true" /><span>暂无主机</span></div>}

          <p className="callout" style={{ marginTop: 12 }}>
            <LockKeyhole size={13} aria-hidden="true" />
            <span>私钥通过只读挂载注入后端容器；浏览器与前端资源均不含任何密钥材料。</span>
          </p>
        </section>

        <section className="panel" style={{ gridColumn: '1 / -1' }} aria-labelledby="permissions-title">
          <div className="panel-head">
            <div>
              <div className="section-title">
                <h2 id="permissions-title">权限级别</h2>
                <span className="count">PREVIEW</span>
              </div>
              <p>Connect / View / Edit / Manage · 按主机与资源分别授权</p>
            </div>
            <Users size={17} aria-hidden="true" className="muted-icon" />
          </div>
          <div className="perm-table-wrap" role="region" aria-label="权限级别说明" tabIndex={0}>
            <table className="perm-table">
              <caption className="sr-only">Berth 的四个权限级别及其计划授权范围</caption>
              <thead>
                <tr><th scope="col">级别</th><th scope="col">计划授权范围</th></tr>
              </thead>
              <tbody>
                {permissionLevels.map((level) => (
                  <tr key={level.id}>
                    <th scope="row">
                      <span className="perm-role">
                        <span className={`perm-mark mark-${level.id}`} aria-hidden="true" />
                        {level.label}
                      </span>
                    </th>
                    <td>{level.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="callout">
            <ShieldCheck size={13} aria-hidden="true" />
            <span>当前为单管理员会话，四级权限尚未按资源强制执行；策略模块已有 17 项单元测试覆盖。</span>
          </p>
        </section>
      </div>
    </>
  )
}
