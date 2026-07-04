variable "name_prefix" {
  description = "リソース名のプレフィックス（環境名を含める）"
  type        = string
}

variable "source_dir" {
  description = "Lambda にパッケージする Python ソースのディレクトリ (api/src)"
  type        = string
}

variable "table_name" {
  description = "参照する DynamoDB テーブル名"
  type        = string
}

variable "table_arn" {
  description = "参照する DynamoDB テーブル ARN（読み取り専用）"
  type        = string
}

variable "api_id" {
  description = "ルートを追加する既存 HTTP API の ID"
  type        = string
}

variable "api_execution_arn" {
  description = "既存 HTTP API の execution ARN（Lambda 実行許可に使用）"
  type        = string
}

variable "route_key" {
  description = "追加するルート"
  type        = string
  default     = "GET /stats"
}

variable "endpoint_url" {
  description = "boto3 が使う AWS エンドポイント URL。LocalStack 用。空なら通常の AWS。"
  type        = string
  default     = ""
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
