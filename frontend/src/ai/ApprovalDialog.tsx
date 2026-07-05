import type { PendingApproval } from "./useAssistant";
import type { ApprovalDecision } from "./protocol";

interface Props {
  approval: PendingApproval;
  onRespond: (id: string, decision: ApprovalDecision) => void;
}

/** 破壊的操作（削除など）の承認を求めるダイアログ。 */
export function ApprovalDialog({ approval, onRespond }: Props) {
  return (
    <div className="ai-approval-backdrop" role="dialog" aria-modal="true" aria-label="操作の承認">
      <div className="ai-approval">
        <p className="ai-approval-title">⚠ AI が操作の承認を求めています</p>
        <p className="ai-approval-tool">
          ツール: <code>{approval.tool}</code>
        </p>
        {approval.params !== undefined && approval.params !== null && (
          <pre className="ai-approval-params">{JSON.stringify(approval.params, null, 2)}</pre>
        )}
        <div className="ai-approval-actions">
          <button type="button" className="ai-btn-deny" onClick={() => onRespond(approval.id, "denied")}>
            拒否
          </button>
          <button type="button" className="ai-btn-approve" onClick={() => onRespond(approval.id, "approved")}>
            承認して実行
          </button>
        </div>
      </div>
    </div>
  );
}
