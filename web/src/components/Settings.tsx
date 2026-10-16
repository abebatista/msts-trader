import { useEffect, useState } from "react";
import { api } from "../api";
import type { SchwabStatus, StudioSettings } from "../types";

/** Notification settings & Schwab 7-day OAuth refresh. Secrets (webhook URL,
 *  Telegram token, Schwab app secret) are write-only: the server keeps them in
 *  the OS keychain (or headless keychain file) and only reports whether they're set. */
export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<StudioSettings | null>(null);
  const [url, setUrl] = useState("");
  const [tgToken, setTgToken] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api<StudioSettings>("/settings").then(setS).catch((e) => setMsg({ ok: false, text: e.message }));
  }, []);

  const put = async (body: Record<string, unknown>, label: string) => {
    setBusy(label);
    setMsg(null);
    try {
      setS(await api<StudioSettings>("/settings", { method: "PUT", body }));
      setMsg({ ok: true, text: "Saved" });
      return true;
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
      return false;
    } finally {
      setBusy(null);
    }
  };

  const saveSecrets = async () => {
    const body: Record<string, unknown> = {};
    if (url.trim()) body.notify_url = url.trim();
    if (tgToken.trim()) body.telegram_token = tgToken.trim();
    if (await put(body, "secrets")) {
      setUrl("");
      setTgToken("");
    }
  };

  const test = async () => {
    setBusy("test");
    setMsg(null);
    try {
      const r = await api<{ sent: string[]; failed: string[] }>("/settings/test", { body: {} });
      setMsg({ ok: !r.failed.length, text: `Sent via ${r.sent.join(", ") || "nothing"}${r.failed.length ? ` · failed: ${r.failed.join(", ")}` : ""}` });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal wide" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <h3>Notifications</h3>
        {!s ? (
          <p className="muted small">Loading…</p>
        ) : (
          <>
            <p className="muted small">
              Studio messages you after strategy runs: what was bought and sold, or why a run failed. Secrets are stored in your OS keychain and never shown again.
            </p>
            <div className="form-grid">
              <label>
                Webhook URL <span className="muted small">(Discord, Slack, or any JSON webhook)</span>
                <input
                  type="password"
                  autoComplete="off"
                  value={url}
                  placeholder={s.has_notify_url ? "set ✓ (type to replace)" : "https://discord.com/api/webhooks/…"}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </label>
              <label>
                Telegram bot token
                <input
                  type="password"
                  autoComplete="off"
                  value={tgToken}
                  placeholder={s.has_telegram_token ? "set ✓ (type to replace)" : "123456:ABC…"}
                  onChange={(e) => setTgToken(e.target.value)}
                />
              </label>
              <label>
                Telegram chat id
                <input value={s.telegram_chat_id} onChange={(e) => setS({ ...s, telegram_chat_id: e.target.value })} onBlur={() => put({ telegram_chat_id: s.telegram_chat_id }, "chat")} />
              </label>
              <label>
                Notify after
                <select value={s.notify_on} onChange={(e) => put({ notify_on: e.target.value }, "on")}>
                  <option value="live">live runs and errors</option>
                  <option value="all">every run, including previews</option>
                  <option value="off">never</option>
                </select>
              </label>
              <label className="check">
                <input type="checkbox" checked={s.weekly_digest} onChange={(e) => put({ weekly_digest: e.target.checked }, "digest")} />
                Weekly digest of funded strategies (capital, value, P&amp;L, last run): Fridays after the close
              </label>
            </div>
            <div className="btn-row">
              <button className="btn primary" disabled={!!busy || (!url.trim() && !tgToken.trim())} onClick={saveSecrets}>
                {busy === "secrets" ? "Saving…" : "Save secrets"}
              </button>
              <button className="btn" disabled={!!busy || !(s.has_notify_url || (s.has_telegram_token && s.telegram_chat_id))} onClick={test}>
                {busy === "test" ? "Sending…" : "Send test"}
              </button>
              {s.has_notify_url && (
                <button className="btn ghost small" disabled={!!busy} onClick={() => put({ notify_url: "" }, "clear")}>
                  Remove webhook
                </button>
              )}
              {s.has_telegram_token && (
                <button className="btn ghost small" disabled={!!busy} onClick={() => put({ telegram_token: "" }, "clear")}>
                  Remove Telegram token
                </button>
              )}
            </div>
          </>
        )}
        {msg && <div className={`alert ${msg.ok ? "ok" : "error"} small`}>{msg.text}</div>}

        <hr style={{ border: "none", borderTop: "1px solid var(--border, #2a2f3a)", margin: "18px 0" }} />
        <SchwabOAuthSection />

        <div className="btn-row end">
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function formatDuration(sec: number | null): string {
  if (sec == null) return "";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  return d > 0 ? `${d}d ${h}h` : `${h}h`;
}

function SchwabOAuthSection() {
  const [st, setSt] = useState<SchwabStatus | null>(null);
  const [editCreds, setEditCreds] = useState(false);
  const [appKey, setAppKey] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [callbackUrl, setCallbackUrl] = useState("https://127.0.0.1:8182");
  const [account, setAccount] = useState("");
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [redirectUrl, setRedirectUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api<SchwabStatus>("/brokers/schwab")
      .then((res) => {
        setSt(res);
        setCallbackUrl(res.callback_url || "https://127.0.0.1:8182");
        setEditCreds(!res.has_creds);
      })
      .catch(() => undefined);
  }, []);

  const startAuth = async () => {
    setBusy("start");
    setMsg(null);
    try {
      const r = await api<{ authorization_url: string; callback_url: string }>("/brokers/schwab/auth/start", {
        body: {
          app_key: appKey.trim() || null,
          app_secret: appSecret.trim() || null,
          callback_url: callbackUrl.trim() || null,
          account: account.trim() || null,
        },
      });
      setAuthUrl(r.authorization_url);
      setCallbackUrl(r.callback_url);
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const completeAuth = async () => {
    setBusy("complete");
    setMsg(null);
    try {
      const r = await api<SchwabStatus & { account_id: string; nav: string }>("/brokers/schwab/auth/complete", {
        body: { redirect_url: redirectUrl.trim() },
      });
      setSt(r);
      setAuthUrl(null);
      setRedirectUrl("");
      setAppKey("");
      setAppSecret("");
      setEditCreds(false);
      setMsg({
        ok: true,
        text: `Schwab authorized ✓ · account ${r.account_id} · NAV $${Number(r.nav).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section>
      <div className="section-head">
        <h3>Schwab OAuth (7-day token)</h3>
        {st && (
          <span className={`pill ${st.has_token && !st.expired ? "pill-live" : ""}`}>
            {!st.sdk_installed
              ? "schwab-py not installed"
              : st.has_token && !st.expired
                ? `valid · ${formatDuration(st.expires_in_seconds)} left`
                : st.expired
                  ? "token expired"
                  : "no token"}
          </span>
        )}
      </div>
      <p className="muted small">
        Schwab refresh tokens expire every 7 days. Authorize in your own browser and paste the redirect URL back here — no browser or GUI is needed on the server or VPS container.
      </p>
      {st && !st.sdk_installed ? (
        <p className="muted small">
          Install the Schwab extra on the server: <code>pip install &quot;msts-trader[schwab]&quot;</code>
        </p>
      ) : (
        <>
          {st?.has_creds && !editCreds ? (
            <p className="small">
              Using stored Schwab app credentials (callback <code>{st.callback_url}</code>).{" "}
              <button type="button" className="btn ghost small" onClick={() => setEditCreds(true)}>
                Change app credentials
              </button>
            </p>
          ) : (
            <div className="form-grid">
              <label>
                Schwab app key
                <input
                  type="password"
                  autoComplete="off"
                  value={appKey}
                  placeholder={st?.has_creds ? "stored ✓ (leave blank to keep)" : "App key from developer.schwab.com"}
                  onChange={(e) => setAppKey(e.target.value)}
                />
              </label>
              <label>
                Schwab app secret
                <input
                  type="password"
                  autoComplete="off"
                  value={appSecret}
                  placeholder={st?.has_creds ? "stored ✓ (leave blank to keep)" : "App secret"}
                  onChange={(e) => setAppSecret(e.target.value)}
                />
              </label>
              <label>
                Callback URL <span className="muted small">(must match registered callback character-for-character)</span>
                <input value={callbackUrl} onChange={(e) => setCallbackUrl(e.target.value)} placeholder="https://127.0.0.1:8182" />
              </label>
              <label>
                Default account <span className="muted small">(optional: number, last-4, or hash)</span>
                <input value={account} onChange={(e) => setAccount(e.target.value)} placeholder={st?.account_hash ? "stored ✓" : "first linked account"} />
              </label>
            </div>
          )}

          <div className="btn-row" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="btn"
              disabled={!!busy || (!st?.has_creds && (!appKey.trim() || !appSecret.trim()))}
              onClick={startAuth}
            >
              {busy === "start" ? "Generating…" : authUrl ? "Regenerate login link" : "1. Generate Schwab login link"}
            </button>
            {authUrl && (
              <a className="btn primary" href={authUrl} target="_blank" rel="noreferrer">
                2. Open Schwab login ↗
              </a>
            )}
          </div>

          {authUrl && (
            <div className="form-grid" style={{ marginTop: 10 }}>
              <label>
                3. After approving on schwab.com, your browser redirects to <code>{callbackUrl}/?code=…</code> (it may say &quot;site can&apos;t be reached&quot; — that&apos;s normal). Copy the full address-bar URL and paste it here:
                <div className="btn-row">
                  <input
                    value={redirectUrl}
                    placeholder={`${callbackUrl}/?code=…&session=…`}
                    onChange={(e) => setRedirectUrl(e.target.value)}
                  />
                  <button type="button" className="btn primary" disabled={!!busy || !redirectUrl.trim()} onClick={completeAuth}>
                    {busy === "complete" ? "Verifying…" : "Complete login"}
                  </button>
                </div>
              </label>
            </div>
          )}
        </>
      )}
      {msg && <div className={`alert ${msg.ok ? "ok" : "error"} small`}>{msg.text}</div>}
    </section>
  );
}

/** Inline tag chips with add/remove; suggestions from the whole library. */
export function TagEditor({ tags, onChange, suggestions }: { tags: string[]; onChange: (t: string[]) => void; suggestions: string[] }) {
  const [text, setText] = useState("");
  const add = () => {
    const t = text.trim().replace(/\s+/g, " ").slice(0, 40);
    if (t && !tags.some((x) => x.toLowerCase() === t.toLowerCase())) onChange([...tags, t]);
    setText("");
  };
  return (
    <div className="tag-editor">
      {tags.map((t) => (
        <span className="tag-chip" key={t}>
          {t}
          <button aria-label={`Remove tag ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))}>
            ×
          </button>
        </span>
      ))}
      <input
        className="tag-input"
        list="tag-suggestions"
        value={text}
        placeholder="+ tag"
        aria-label="Add tag"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={() => text.trim() && add()}
      />
      <datalist id="tag-suggestions">
        {suggestions
          .filter((s) => !tags.includes(s))
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
    </div>
  );
}
