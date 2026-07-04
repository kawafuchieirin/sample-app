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

variable "frontend_bucket_name" {
  description = "フロントエンド用 S3 バケット名（グローバル一意にすること）"
  type        = string
}
