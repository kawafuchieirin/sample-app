variable "region" {
  description = "AWS リージョン"
  type        = string
  default     = "ap-northeast-1"
}

variable "project" {
  description = "プロジェクト名（リソース名のプレフィックス）"
  type        = string
  default     = "taskapp"
}

variable "github_repo" {
  description = "OIDC を許可する GitHub リポジトリ (owner/repo)"
  type        = string
  default     = "kawafuchieirin/sample-app"
}

variable "create_oidc_provider" {
  description = <<-EOT
    GitHub OIDC プロバイダを新規作成するか。
    同一アカウントで既に token.actions.githubusercontent.com のプロバイダが存在する場合は
    false にして既存のものを参照する（重複作成はエラーになるため）。
  EOT
  type        = bool
  default     = true
}

variable "allowed_subjects" {
  description = <<-EOT
    ロールの引き受けを許可する OIDC の sub クレーム。
    deploy.yml は environment: production を使うため sub は
    'repo:<owner>/<repo>:environment:production' になる。念のため main ブランチ ref も許可。
  EOT
  type        = list(string)
  default     = null # null の場合は github_repo から自動生成する
}
