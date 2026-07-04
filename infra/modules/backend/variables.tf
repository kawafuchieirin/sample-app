variable "name_prefix" {
  description = "リソース名のプレフィックス（環境名を含める）"
  type        = string
}

variable "source_dir" {
  description = "Lambda にパッケージする Python ソースのディレクトリ (backend/src)"
  type        = string
}

variable "table_name" {
  description = "アクセス対象の DynamoDB テーブル名"
  type        = string
}

variable "table_arn" {
  description = "アクセス対象の DynamoDB テーブル ARN"
  type        = string
}

variable "stage_name" {
  description = "API Gateway のステージ名"
  type        = string
  default     = "$default"
}

variable "endpoint_url" {
  description = "boto3 が使う AWS エンドポイント URL。LocalStack 用。空なら通常の AWS。"
  type        = string
  default     = ""
}

variable "cors_allow_origins" {
  description = "CORS で許可するオリジン"
  type        = list(string)
  default     = ["*"]
}

variable "log_retention_days" {
  description = "CloudWatch Logs の保持日数"
  type        = number
  default     = 14
}

variable "tags" {
  description = "リソースに付与するタグ"
  type        = map(string)
  default     = {}
}
