import { Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, api } from "../services/api.js";
import { getErrorMessage } from "../utils/validation.js";
import ConfirmDialog from "./ConfirmDialog.jsx";
import ErrorState from "./ErrorState.jsx";
import LoadingState from "./LoadingState.jsx";
import { Button } from "./ui/button.jsx";
import { Input } from "./ui/input.jsx";

export default function McpTokens() {
  const navigate = useNavigate();
  const [state, setState] = useState({ status: "loading", error: "", items: [] });
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [newToken, setNewToken] = useState("");
  const [copied, setCopied] = useState(false);
  const [pendingRevoke, setPendingRevoke] = useState(null);
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState("");

  const handle401 = useCallback(
    (error) => {
      if (error instanceof ApiError && error.status === 401) {
        navigate("/login", {
          replace: true,
          state: { notice: "Please log in again to manage MCP tokens." },
        });
        return true;
      }
      return false;
    },
    [navigate],
  );

  const load = useCallback(async () => {
    setState((current) => ({ ...current, status: "loading", error: "" }));
    try {
      const data = await api.getMcpTokens();
      setState({ status: "ready", error: "", items: data.items ?? [] });
    } catch (error) {
      if (handle401(error)) return;
      setState({ status: "error", error: getErrorMessage(error, "Tokens could not be loaded."), items: [] });
    }
  }, [handle401]);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  async function handleCreate(event) {
    event.preventDefault();
    setCreating(true);
    setCreateError("");
    setNewToken("");
    setCopied(false);
    try {
      const created = await api.createMcpToken(label.trim() || undefined);
      setNewToken(created.token);
      setLabel("");
      await load();
    } catch (error) {
      if (handle401(error)) return;
      setCreateError(getErrorMessage(error, "Token could not be created."));
    } finally {
      setCreating(false);
    }
  }

  async function copyToken() {
    try {
      await navigator.clipboard.writeText(newToken);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function confirmRevoke() {
    if (!pendingRevoke) return;
    setRevoking(true);
    setRevokeError("");
    try {
      await api.revokeMcpToken(pendingRevoke.id);
      setPendingRevoke(null);
      await load();
    } catch (error) {
      if (handle401(error)) return;
      setRevokeError(getErrorMessage(error, "Token could not be revoked."));
    } finally {
      setRevoking(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="mcp-tokens-title">
      <div className="panel-header">
        <div>
          <h2 id="mcp-tokens-title">MCP Access</h2>
          <p>Personal tokens for MCP clients (Claude Code, Cursor, Codex). Each grants full access to your data.</p>
        </div>
      </div>

      <form className="settings-form" onSubmit={handleCreate}>
        <label className="form-field">
          <span>
            <KeyRound size={16} aria-hidden="true" />
            Token name (optional)
          </span>
          <Input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="e.g. Claude Code laptop"
            maxLength={80}
            disabled={creating}
          />
        </label>
        {createError ? <p className="form-error" role="alert">{createError}</p> : null}
        <div className="form-actions">
          <Button type="submit" disabled={creating}>
            <Plus size={18} aria-hidden="true" />
            {creating ? "Generating" : "Generate token"}
          </Button>
        </div>
      </form>

      {newToken ? (
        <div className="rounded-md border border-dashed p-3" role="status">
          <p className="success-message">Copy this token now — it is shown only once.</p>
          <code className="readonly-value block break-all">{newToken}</code>
          <div className="form-actions">
            <Button type="button" variant="outline" onClick={copyToken}>
              <Copy size={18} aria-hidden="true" />
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      ) : null}

      {state.status === "loading" ? (
        <LoadingState title="Loading tokens" message="Fetching your MCP tokens." />
      ) : null}
      {state.status === "error" ? (
        <ErrorState title="Tokens unavailable" message={state.error} actionLabel="Retry" onRetry={load} />
      ) : null}
      {state.status === "ready" && state.items.length === 0 ? (
        <p className="field-hint">No tokens yet. Generate one to connect an MCP client.</p>
      ) : null}
      {state.status === "ready" && state.items.length > 0 ? (
        <ul className="grid gap-2">
          {state.items.map((token) => (
            <li key={token.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div className="grid gap-1">
                <strong>{token.label || "Unnamed token"}</strong>
                <span className="field-hint">
                  Created {token.createdAt}
                  {token.lastUsedAt ? ` · last used ${token.lastUsedAt}` : " · never used"}
                </span>
              </div>
              <Button type="button" variant="destructive" onClick={() => setPendingRevoke(token)}>
                <Trash2 size={18} aria-hidden="true" />
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <ConfirmDialog
        open={Boolean(pendingRevoke)}
        title="Revoke token?"
        message={`This immediately disables "${pendingRevoke?.label || "Unnamed token"}". Any client using it stops working.`}
        confirmLabel="Revoke"
        error={revokeError}
        isBusy={revoking}
        onCancel={() => {
          setPendingRevoke(null);
          setRevokeError("");
        }}
        onConfirm={confirmRevoke}
      />
    </section>
  );
}
